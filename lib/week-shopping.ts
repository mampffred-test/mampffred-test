import {
  catalogFoodById,
  foldFoodName,
  foodDisplayLabel,
  foodGrams,
  matchCatalogFoodsDetailed,
  packGrams,
  type AisleId,
  type CatalogFood,
} from './food-catalog.ts';
import { parseIngredientLine, splitIngredientName } from './ingredient-text.ts';
import { addLocalDays, parseLocalDate } from './local-date.ts';
import { getEnabledMealSlots } from './meal-slots.ts';
import type {
  AppData,
  MealSlot,
  Recipe,
  RecipeIngredient,
  ShoppingItem,
} from './model.ts';
import type { Leftover } from './leftovers.ts';
import { formatQuantity, quantityValue } from './quantity.ts';
import { classifyShoppingName } from './shopping-category.ts';
import { canonicalUnit, unitLabel, VOLUME_ML, type UnitKey } from './units.ts';

type WeekShoppingInput = Pick<AppData, 'plan' | 'recipes' | 'shopping'> &
  Partial<Pick<AppData, 'enabledMealSlots' | 'pantry' | 'foodAliases'>>;

export type WeekShoppingOptions = {
  /** First local date (inclusive) whose meals are bought for. */
  from?: string;
  /** Last local date (inclusive). */
  to?: string;
};

export type WeekShoppingPreview = {
  weekStart: string;
  plannedMealCount: number;
  contributingMealCount: number;
  generatedItemCount: number;
  addedItemCount: number;
  updatedItemCount: number;
  unchangedItemCount: number;
  removedItemCount: number;
  preservedCheckedCount: number;
  preservedOtherItemCount: number;
  missingRecipeCount: number;
  skippedIngredientCount: number;
  /** Never bought, e.g. water. */
  excludedIngredientCount: number;
  /** Marked as "always at home" and therefore left out. */
  hiddenPantryCount: number;
  pantryCheckCount: number;
  reviewItemCount: number;
  overflowItemCount: number;
};

export type WeekShoppingResult = {
  shopping: ShoppingItem[];
  preview: WeekShoppingPreview;
};

type Source = { date: string; slot: MealSlot; recipeId: string };

type Contribution = {
  /** Amount in the recipe unit, already scaled. */
  amount: number;
  unit: UnitKey | '';
  unitText: string;
  grams?: number;
};

type Group = {
  groupKey: string;
  food?: CatalogFood;
  name: string;
  contributions: Contribution[];
  sources: Source[];
  recipeNames: string[];
  optional: boolean;
  /** Some recipe left the amount open ("etwas Öl"). */
  unspecified: boolean;
  /** Amounts Mampffred cannot convert, kept as written ("1 Ecke"). */
  extras: string[];
  /** Store aisle of a related catalog food for items kept by name. */
  aisle?: AisleId;
};

const MAX_ITEMS = 10_000;

function stableHash(value: string) {
  let left = 0x811c9dc5;
  let right = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    left = Math.imul(left ^ code, 0x01000193);
    right = Math.imul(right ^ code, 0x85ebca6b);
  }
  return `${(left >>> 0).toString(36)}${(right >>> 0).toString(36)}`;
}

function generatedId(weekStart: string, groupKey: string, used: Set<string>) {
  const base = `week-${weekStart}-${stableHash(groupKey)}`;
  let id = base;
  let suffix = 2;
  while (used.has(id)) {
    id = `${base}-${suffix}`;
    suffix += 1;
  }
  used.add(id);
  return id;
}

/** JSON with sorted object keys, so field order never counts as a change. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`,
      )
      .join(',')}}`;
  return JSON.stringify(value);
}

function legacyGroupKey(name: string) {
  const parsed = parseIngredientLine(name);
  // Keep the note: "(TK)" decides between fresh and frozen spinach.
  const match = matchCatalogFoodsDetailed(
    parsed.note ? `${parsed.name} (${parsed.note})` : parsed.name,
  );
  const food = match.approximate ? undefined : match.foods[0];
  return food ? `food:${food.id}` : `text:${foldFoodName(parsed.name)}`;
}

function sourceKey(source: Source) {
  return `${source.date}\0${source.slot}\0${source.recipeId}`;
}

/** Resolves the catalog foods an ingredient stands for. */
export function ingredientFoods(
  ingredient: Pick<RecipeIngredient, 'name' | 'foodLink'>,
  foodAliases: Record<string, string> = {},
): { foods: CatalogFood[]; approximate: boolean } {
  if (ingredient.foodLink?.kind === 'catalog') {
    const linked = catalogFoodById(ingredient.foodLink.foodId);
    if (linked) return { foods: [linked], approximate: false };
  }
  const learned = foodAliases[foldFoodName(ingredient.name)];
  if (learned?.startsWith('mf:')) {
    const food = catalogFoodById(learned);
    if (food) return { foods: [food], approximate: false };
  }
  return matchCatalogFoodsDetailed(ingredient.name);
}

// ---------------------------------------------------------------------------
// Purchasable quantities

const SIZELESS_PACK_UNITS = new Set<UnitKey>([
  'knolle',
  'kopf',
  'stange',
  'bund',
  'topf',
  'rolle',
  'wuerfel',
  'stueck',
]);

function roundUp(value: number, step: number) {
  return Math.ceil(value / step - 1e-9) * step;
}

export function formatGrams(grams: number) {
  if (grams >= 1_000)
    return `${formatQuantity(grams / 1_000, { fractions: false, maximumFractionDigits: 1 })} kg`;
  return `${Math.round(grams)} g`;
}

function looseWeight(grams: number) {
  const step = grams <= 50 ? 5 : grams <= 250 ? 10 : grams <= 1_000 ? 50 : 100;
  return roundUp(grams, step);
}

export type PurchaseQuantity = {
  text: string;
  /** Number of pieces/packs, used for singular/plural names. */
  count: number;
  leftoverGrams: number;
};

/** Rounds a need in grams up to what can actually be bought. */
export function purchaseQuantity(
  food: CatalogFood,
  grams: number,
): PurchaseQuantity {
  const sell = food.sell;
  if (sell === 'piece' && food.g?.stueck) {
    const count = Math.max(1, Math.ceil(grams / food.g.stueck - 0.15));
    return {
      text: String(count),
      count,
      leftoverGrams: Math.max(0, count * food.g.stueck - grams),
    };
  }
  if (sell && typeof sell === 'object') {
    const pack = packGrams(food);
    if (pack) {
      const count = Math.max(1, Math.ceil(grams / pack - 0.05));
      const unit = unitLabel(sell.unit, count);
      const size = sell.pieces
        ? `${sell.pieces} Stück`
        : sell.ml
          ? `${sell.ml >= 1_000 ? `${formatQuantity(sell.ml / 1_000)} l` : `${sell.ml} ml`}`
          : formatGrams(pack);
      const text = SIZELESS_PACK_UNITS.has(sell.unit)
        ? `${count} ${unit}`
        : count === 1
          ? `1 ${unit} (${size})`
          : `${count} ${unit} à ${size}`;
      return {
        text,
        count,
        leftoverGrams: Math.max(0, count * pack - grams),
      };
    }
  }
  const rounded = looseWeight(grams);
  return {
    text: formatGrams(rounded),
    count: 2,
    leftoverGrams: rounded - grams,
  };
}

// ---------------------------------------------------------------------------
// Need and provenance

function sameWeightUnits(food: CatalogFood | undefined, units: UnitKey[]) {
  if (!food) return false;
  const weights = units.map((unit) => food.g?.[unit]);
  return weights.every((weight) => weight && weight === weights[0]);
}

function needText(group: Group) {
  const counted = group.contributions;
  if (!counted.length) return undefined;
  const units = [
    ...new Set(counted.map((entry) => entry.unit || 'stueck')),
  ] as UnitKey[];
  const total = counted.reduce((sum, entry) => sum + entry.amount, 0);
  if (units.length === 1 || sameWeightUnits(group.food, units)) {
    // "4 Stück Knoblauchzehen" and "1 Zehe Knoblauch": say "Zehen".
    const unit = (counted.find((entry) => entry.unit && entry.unit !== 'stueck')
      ?.unit || 'stueck') as UnitKey;
    if (unit === 'g' || unit === 'kg')
      return formatGrams(unit === 'kg' ? total * 1_000 : total);
    if (unit === 'ml' || unit === 'l')
      return `${formatQuantity(unit === 'l' ? total * 1_000 : total, { fractions: false })} ml`;
    return `${formatQuantity(total)} ${unitLabel(unit, total)}`;
  }
  if (units.every((unit) => VOLUME_ML[unit])) {
    const millilitres = counted.reduce(
      (sum, entry) =>
        sum + entry.amount * (VOLUME_ML[entry.unit as UnitKey] ?? 0),
      0,
    );
    return `ca. ${Math.round(millilitres)} ml`;
  }
  const grams = counted.reduce((sum, entry) => sum + (entry.grams ?? 0), 0);
  if (counted.every((entry) => entry.grams !== undefined))
    return `ca. ${formatGrams(grams)}`;
  return undefined;
}

function provenance(group: Group) {
  return group.recipeNames.length === 1
    ? `für ${group.recipeNames[0]}`
    : `für ${group.recipeNames.length} Rezepte`;
}

function describeGroup(group: Group) {
  const food = group.food;
  const contributions = group.contributions;
  const need = needText(group);
  let quantity: string | undefined;
  let count = 1;
  let leftoverGrams = 0;
  if (food && contributions.length) {
    const grams = contributions.every((entry) => entry.grams !== undefined)
      ? contributions.reduce((sum, entry) => sum + (entry.grams ?? 0), 0)
      : undefined;
    if (grams !== undefined && grams > 0 && (food.sell || grams)) {
      const purchase = purchaseQuantity(food, grams);
      quantity = purchase.text;
      count = purchase.count;
      leftoverGrams = purchase.leftoverGrams;
    } else if (need) quantity = need;
  } else if (!food && contributions.length && need) quantity = need;
  if (!quantity && group.extras.length) quantity = group.extras.join(' + ');
  const name = food
    ? food.sell === 'piece'
      ? foodDisplayLabel(food, count)
      : (food.plural ?? food.name)
    : group.name;
  const sellUnit =
    food?.sell === 'piece'
      ? 'stueck'
      : typeof food?.sell === 'object'
        ? food.sell.unit
        : undefined;
  const total = contributions.reduce((sum, entry) => sum + entry.amount, 0);
  const boughtAsWritten =
    sellUnit !== undefined &&
    contributions.length > 0 &&
    contributions.every((entry) => (entry.unit || 'stueck') === sellUnit) &&
    Math.abs(total - count) < 1e-9;
  const measured = [need, ...group.extras].filter(Boolean).join(' + ');
  const needWithRest =
    measured && group.unspecified ? `${measured} + etwas` : measured;
  const needLabel =
    needWithRest && needWithRest !== quantity && !boughtAsWritten
      ? `${needWithRest} `
      : '';
  const detail = `${needLabel}${provenance(group)}`;
  return { name, quantity, need: needLabel.trim(), detail, leftoverGrams };
}

// ---------------------------------------------------------------------------
// Collection

/** Records amounts that cannot be summed, so nothing silently disappears. */
function noteAmount(
  group: Group,
  amount: number | undefined,
  unitKey: UnitKey | '' | undefined,
  ingredient: Pick<RecipeIngredient, 'amount' | 'unit'>,
) {
  const unit = ingredient.unit.trim();
  if (amount !== undefined && unitKey === undefined)
    group.extras.push(`${formatQuantity(amount)} ${unit}`.trim());
  else if (amount === undefined && /\d/.test(ingredient.amount))
    group.extras.push(`${ingredient.amount.trim()} ${unit}`.trim());
  else if (amount === undefined) group.unspecified = true;
}

function desiredGroups(
  input: WeekShoppingInput,
  weekStart: string,
  options: WeekShoppingOptions,
) {
  const dates = new Set(
    Array.from({ length: 7 }, (_, index) =>
      addLocalDays(weekStart, index),
    ).filter(
      (date) =>
        (!options.from || date >= options.from) &&
        (!options.to || date <= options.to),
    ),
  );
  const recipes = new Map(input.recipes.map((recipe) => [recipe.id, recipe]));
  const enabledSlots = getEnabledMealSlots(input);
  const groups = new Map<string, Group>();
  const counters = {
    plannedMealCount: 0,
    contributingMealCount: 0,
    missingRecipeCount: 0,
    skippedIngredientCount: 0,
    excludedIngredientCount: 0,
  };

  const groupFor = (key: string, create: () => Group) => {
    const existing = groups.get(key);
    if (existing) return existing;
    const group = create();
    groups.set(key, group);
    return group;
  };

  const addSource = (group: Group, source: Source, recipe: Recipe) => {
    if (!group.sources.some((entry) => sourceKey(entry) === sourceKey(source)))
      group.sources.push(source);
    if (!group.recipeNames.includes(recipe.name))
      group.recipeNames.push(recipe.name);
  };

  for (const day of input.plan) {
    if (!dates.has(day.date)) continue;
    for (const meal of day.meals) {
      if (!enabledSlots.includes(meal.slot)) continue;
      counters.plannedMealCount += 1;
      const recipe = recipes.get(meal.recipeId);
      if (!recipe) {
        counters.missingRecipeCount += 1;
        continue;
      }
      if (
        !Number.isFinite(meal.servings) ||
        meal.servings <= 0 ||
        !Number.isFinite(recipe.servings) ||
        recipe.servings <= 0
      ) {
        counters.skippedIngredientCount += recipe.ingredients.length;
        continue;
      }
      counters.contributingMealCount += 1;
      const scale = meal.servings / recipe.servings;
      const source = { date: day.date, slot: meal.slot, recipeId: recipe.id };

      for (const ingredient of recipe.ingredients) {
        const rawName = ingredient.name.trim();
        if (!rawName) {
          counters.skippedIngredientCount += 1;
          continue;
        }
        const split = splitIngredientName(rawName);
        const optional = ingredient.optional ?? split.optional;
        const factor = ingredient.scaleWithServings === false ? 1 : scale;
        const value = quantityValue(ingredient.amount);
        const unitKey = canonicalUnit(ingredient.unit);
        const match = ingredientFoods(ingredient, input.foodAliases);
        // A relative found by dropping words ("Thai-Basilikum") keeps its own
        // name and is not merged; it only lends its store aisle.
        const foods = match.approximate ? [] : match.foods;
        const aisleHint = match.approximate ? match.foods[0]?.aisle : undefined;
        const amount =
          value !== undefined && Number.isFinite(value * factor)
            ? value * factor
            : undefined;

        if (foods.length) {
          for (const food of foods) {
            if (food.shopping === false) {
              counters.excludedIngredientCount += 1;
              continue;
            }
            const group = groupFor(`food:${food.id}`, () => ({
              groupKey: `food:${food.id}`,
              food,
              name: food.name,
              contributions: [],
              sources: [],
              recipeNames: [],
              optional: true,
              unspecified: false,
              extras: [],
            }));
            group.optional &&= optional;
            if (foods.length > 1) group.unspecified = true;
            else noteAmount(group, amount, unitKey, ingredient);
            addSource(group, source, recipe);
            // Lists ("Salz und Pfeffer") carry no amount per food.
            if (
              foods.length === 1 &&
              amount !== undefined &&
              unitKey !== undefined
            )
              group.contributions.push({
                amount,
                unit: unitKey,
                unitText: ingredient.unit,
                grams: foodGrams(food, amount, ingredient.unit)?.grams,
              });
          }
          continue;
        }

        const key = `text:${foldFoodName(split.name)}`;
        const group = groupFor(key, () => ({
          groupKey: key,
          name: split.name,
          ...(aisleHint ? { aisle: aisleHint } : {}),
          contributions: [],
          sources: [],
          recipeNames: [],
          optional: true,
          unspecified: false,
          extras: [],
        }));
        group.optional &&= optional;
        noteAmount(group, amount, unitKey, ingredient);
        addSource(group, source, recipe);
        if (amount !== undefined && unitKey !== undefined)
          group.contributions.push({
            amount,
            unit: unitKey,
            unitText: ingredient.unit,
          });
      }
    }
  }

  return { groups: [...groups.values()], ...counters };
}

/**
 * Reconciles the generated items for one week without mutating the input.
 * Manually added, recipe-generated and other-week items are preserved verbatim.
 */
export function reconcileWeekShopping(
  input: WeekShoppingInput,
  weekStart: string,
  options: WeekShoppingOptions = {},
): WeekShoppingResult {
  parseLocalDate(weekStart);
  const desired = desiredGroups(input, weekStart, options);
  const pantry = input.pantry ?? {};
  const targetItems = input.shopping.filter(
    (item) =>
      item.origin.kind === 'week' && item.origin.weekStart === weekStart,
  );
  const preserved = input.shopping.filter(
    (item) =>
      item.origin.kind !== 'week' || item.origin.weekStart !== weekStart,
  );
  const existingByGroup = new Map<string, ShoppingItem>();
  // Items written by app versions before the catalog had other group keys;
  // they are matched by food so ticks survive the first sync after an update.
  const legacyByKey = new Map<string, ShoppingItem[]>();
  for (const item of targetItems) {
    if (item.origin.kind !== 'week') continue;
    if (!item.origin.fingerprint.startsWith('v7:')) {
      const key = legacyGroupKey(item.name);
      legacyByKey.set(key, [...(legacyByKey.get(key) ?? []), item]);
    } else if (!existingByGroup.has(item.origin.groupKey))
      existingByGroup.set(item.origin.groupKey, item);
  }

  const usedIds = new Set(input.shopping.map((item) => item.id));
  let addedItemCount = 0;
  let updatedItemCount = 0;
  let unchangedItemCount = 0;
  let preservedCheckedCount = 0;
  let hiddenPantryCount = 0;
  const matchedIds = new Set<string>();
  const generated: ShoppingItem[] = [];

  const ordered = [...desired.groups].sort((left, right) =>
    left.groupKey.localeCompare(right.groupKey, 'de-DE'),
  );
  for (const group of ordered) {
    const pantryState = group.food ? pantry[group.food.id] : undefined;
    if (pantryState === 'always') {
      hiddenPantryCount += 1;
      continue;
    }
    const sources = [...group.sources].sort((left, right) =>
      sourceKey(left).localeCompare(sourceKey(right), 'de-DE'),
    );
    const recipeNames = [...group.recipeNames].sort((left, right) =>
      left.localeCompare(right, 'de-DE'),
    );
    const description = describeGroup({ ...group, recipeNames });
    const fingerprint = `v7:${stableHash(
      // Only the amount counts: a renamed recipe is not a changed quantity.
      `${description.quantity ?? ''}\0${description.need}`,
    )}`;
    const fields = {
      name: description.name.slice(0, 500),
      ...(description.quantity
        ? { quantity: description.quantity.slice(0, 500) }
        : {}),
      detail: description.detail.slice(0, 500),
      ...(group.food ? { foodId: group.food.id } : {}),
      category:
        group.food?.aisle ??
        group.aisle ??
        classifyShoppingName(group.name) ??
        'sonstiges',
      ...(group.optional ? { optional: true } : {}),
      ...(pantryState === 'check' ? { pantryCheck: true } : {}),
      source: recipeNames.join(', ').slice(0, 5_000),
    } satisfies Partial<ShoppingItem>;
    const origin = {
      kind: 'week' as const,
      weekStart,
      groupKey: group.groupKey,
      sources,
      fingerprint,
      ...(options.from ? { from: options.from } : {}),
      ...(options.to ? { to: options.to } : {}),
    };
    const legacyItems = existingByGroup.has(group.groupKey)
      ? undefined
      : legacyByKey.get(group.groupKey);
    legacyByKey.delete(group.groupKey);
    const existing = legacyItems
      ? {
          ...legacyItems[0],
          checked: legacyItems.every((item) => item.checked),
        }
      : existingByGroup.get(group.groupKey);
    for (const item of legacyItems?.slice(1) ?? []) matchedIds.add(item.id);
    if (!existing || existing.origin.kind !== 'week') {
      addedItemCount += 1;
      generated.push({
        id: generatedId(weekStart, group.groupKey, usedIds),
        ...fields,
        checked: false,
        origin,
      });
      continue;
    }
    matchedIds.add(existing.id);
    if (existing.checked) preservedCheckedCount += 1;
    const amountChanged = existing.origin.fingerprint !== fingerprint;
    const {
      quantity: _quantity,
      detail: _detail,
      foodId: _foodId,
      optional: _optional,
      pantryCheck: _pantryCheck,
      needsReview,
      ...base
    } = existing;
    const next: ShoppingItem = {
      ...base,
      ...fields,
      // Only already bought items need a hint: open ones get the new amount.
      ...(existing.checked && (needsReview || (amountChanged && !legacyItems))
        ? { needsReview: true }
        : {}),
      origin,
    };
    if (canonicalJson(next) === canonicalJson(existing))
      unchangedItemCount += 1;
    else updatedItemCount += 1;
    generated.push(next);
  }

  const removedItemCount = targetItems.filter(
    (item) => !matchedIds.has(item.id),
  ).length;
  const overflowItemCount = Math.max(
    0,
    preserved.length + generated.length - MAX_ITEMS,
  );

  return {
    shopping: [...preserved, ...generated],
    preview: {
      weekStart,
      plannedMealCount: desired.plannedMealCount,
      contributingMealCount: desired.contributingMealCount,
      generatedItemCount: generated.length,
      addedItemCount,
      updatedItemCount,
      unchangedItemCount,
      removedItemCount,
      preservedCheckedCount,
      preservedOtherItemCount: preserved.length,
      missingRecipeCount: desired.missingRecipeCount,
      skippedIngredientCount: desired.skippedIngredientCount,
      excludedIngredientCount: desired.excludedIngredientCount,
      hiddenPantryCount,
      pantryCheckCount: generated.filter((item) => item.pantryCheck).length,
      reviewItemCount: generated.filter((item) => item.needsReview).length,
      overflowItemCount,
    },
  };
}

/** Keep for weeks once bought, so a rest is not worth planning around. */
const KEEPS_WELL = new Set([
  'zwiebel',
  'rote-zwiebel',
  'schalotte',
  'knoblauch',
  'kartoffel',
  'suesskartoffel',
  'ingwer',
  'zitrone',
  'limette',
  'orange',
  'apfel',
  'moehre',
]);

const PERISHABLE_AISLES = new Set([
  'obst-gemuese',
  'kuehlregal',
  'veggie',
  'fleisch-fisch',
  'brot',
]);

/**
 * Perishable rest after buying in whole packs/pieces for the planned meals,
 * e.g. "¾ Zucchini". Shelf-stable foods are left out; they keep anyway.
 */
export function estimateLeftovers(
  input: WeekShoppingInput,
  weekStart: string,
  options: WeekShoppingOptions = {},
): Leftover[] {
  parseLocalDate(weekStart);
  const pantry = input.pantry ?? {};
  return (
    desiredGroups(input, weekStart, options)
      .groups.flatMap((group): Leftover[] => {
        const food = group.food;
        if (
          !food ||
          !PERISHABLE_AISLES.has(food.aisle) ||
          KEEPS_WELL.has(food.id) ||
          pantry[food.id]
        )
          return [];
        if (
          !group.contributions.length ||
          group.contributions.some((entry) => entry.grams === undefined)
        )
          return [];
        const grams = group.contributions.reduce(
          (sum, entry) => sum + (entry.grams ?? 0),
          0,
        );
        if (grams <= 0) return [];
        const rest = purchaseQuantity(food, grams).leftoverGrams;
        const unit =
          food.sell === 'piece'
            ? food.g?.stueck
            : (packGrams(food) ?? undefined);
        if (!unit || rest < 30 || rest < unit * 0.25) return [];
        const pieces =
          food.sell === 'piece' ? Math.round((rest / unit) * 4) / 4 : 0;
        const label =
          food.sell === 'piece'
            ? `${formatQuantity(pieces)} ${foodDisplayLabel(food, pieces)}`
            : `ca. ${formatGrams(Math.round(rest / 10) * 10)} ${food.plural ?? food.name}`;
        return [{ foodId: food.id, grams: rest, label, share: rest / unit }];
      })
      // Most of a pack or piece left over first.
      .sort(
        (left, right) =>
          right.share - left.share || left.foodId.localeCompare(right.foodId),
      )
  );
}

/** The range the existing list for a week was built with, if any. */
export function storedShoppingRange(
  shopping: readonly ShoppingItem[],
  weekStart: string,
): WeekShoppingOptions | undefined {
  const item = shopping.find(
    (entry) =>
      entry.origin.kind === 'week' && entry.origin.weekStart === weekStart,
  );
  if (!item || item.origin.kind !== 'week') return undefined;
  const { from, to } = item.origin;
  return from || to ? { ...(from ? { from } : {}), ...(to ? { to } : {}) } : {};
}
