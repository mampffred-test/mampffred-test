import { addLocalDays, parseLocalDate } from './local-date.ts';
import type { AppData, MealSlot, Recipe, ShoppingItem } from './model.ts';

type WeekShoppingInput = Pick<AppData, 'plan' | 'recipes' | 'shopping'>;

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
  reviewItemCount: number;
  overflowItemCount: number;
};

export type WeekShoppingResult = {
  shopping: ShoppingItem[];
  preview: WeekShoppingPreview;
};

type Source = {
  date: string;
  slot: MealSlot;
  recipeId: string;
};

type DesiredGroup = {
  groupKey: string;
  ingredientName: string;
  amountLabel: string;
  unitLabel: string;
  numericAmount?: number;
  fingerprint: string;
  sources: Source[];
  recipeNames: string[];
};

const numberFormatter = new Intl.NumberFormat('de-DE', {
  maximumFractionDigits: 3,
});

function normalize(value: string) {
  return value
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('de-DE');
}

function parseAmount(value: string) {
  const trimmed = value.trim();
  const normalized = /^\d{1,3}(?:\.\d{3})+$/.test(trimmed)
    ? trimmed.replaceAll('.', '')
    : trimmed.replace(',', '.');
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(normalized)) return undefined;
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount >= 0 && amount <= 10_000_000
    ? amount
    : undefined;
}

function canonicalUnit(unit: string) {
  const normalized = normalize(unit).replace(/\.$/, '');
  if (normalized === 'g' || normalized === 'gramm')
    return { key: 'g', label: 'g', factor: 1 };
  if (normalized === 'kg' || normalized === 'kilogramm')
    return { key: 'g', label: 'g', factor: 1_000 };
  if (normalized === 'ml' || normalized === 'milliliter')
    return { key: 'ml', label: 'ml', factor: 1 };
  if (normalized === 'l' || normalized === 'liter')
    return { key: 'ml', label: 'ml', factor: 1_000 };
  return { key: normalized || 'ohne-einheit', label: unit.trim(), factor: 1 };
}

function roundedAmount(value: number) {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

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

function classifyIngredient(name: string): ShoppingItem['category'] {
  const normalized = normalize(name);
  if (/brot|brötchen|baguette|toast/.test(normalized)) return 'Backwaren';
  if (/milch|käse|feta|mozzarella|sahne|joghurt|butter/.test(normalized))
    return 'Kühlregal';
  if (/reis|nudel|pasta|linse|mehl|öl|gewürz|brühe|kokosmilch/.test(normalized))
    return 'Vorrat';
  if (
    /paprika|zucchini|tomate|zwiebel|kartoffel|kürbis|beere|obst|gemüse|basilikum/.test(
      normalized,
    )
  )
    return 'Gemüse & Obst';
  return 'Sonstiges';
}

function sourceKey(source: Source) {
  return `${source.date}\0${source.slot}\0${source.recipeId}`;
}

function sourceSort(left: Source, right: Source) {
  return sourceKey(left).localeCompare(sourceKey(right), 'de-DE');
}

function addSource(group: DesiredGroup, source: Source, recipe: Recipe) {
  if (!group.sources.some((entry) => sourceKey(entry) === sourceKey(source)))
    group.sources.push(source);
  if (!group.recipeNames.includes(recipe.name))
    group.recipeNames.push(recipe.name);
}

function desiredGroups(input: WeekShoppingInput, weekStart: string) {
  const dates = new Set(
    Array.from({ length: 7 }, (_, index) => addLocalDays(weekStart, index)),
  );
  const recipes = new Map(input.recipes.map((recipe) => [recipe.id, recipe]));
  const groups = new Map<string, DesiredGroup>();
  let plannedMealCount = 0;
  let contributingMealCount = 0;
  let missingRecipeCount = 0;
  let skippedIngredientCount = 0;

  for (const day of input.plan) {
    if (!dates.has(day.date)) continue;
    for (const meal of day.meals) {
      plannedMealCount += 1;
      const recipe = recipes.get(meal.recipeId);
      if (!recipe) {
        missingRecipeCount += 1;
        continue;
      }
      if (
        !Number.isFinite(meal.servings) ||
        meal.servings <= 0 ||
        !Number.isFinite(recipe.servings) ||
        recipe.servings <= 0
      ) {
        skippedIngredientCount += recipe.ingredients.length;
        continue;
      }
      contributingMealCount += 1;
      const scale = meal.servings / recipe.servings;
      const source = { date: day.date, slot: meal.slot, recipeId: recipe.id };
      const textOccurrences = new Map<string, number>();

      recipe.ingredients.forEach((ingredient) => {
        const ingredientName = ingredient.name.trim();
        if (!ingredientName) {
          skippedIngredientCount += 1;
          return;
        }
        const normalizedName = normalize(ingredientName);
        const parsedAmount = parseAmount(ingredient.amount);
        const unit = canonicalUnit(ingredient.unit);

        if (parsedAmount === undefined) {
          const amountLabel = ingredient.amount.trim();
          const groupBase = [
            normalizedName,
            'text',
            normalize(amountLabel),
            unit.key,
            sourceKey(source),
          ].join('\0');
          const occurrence = textOccurrences.get(groupBase) ?? 0;
          textOccurrences.set(groupBase, occurrence + 1);
          const groupKey = `text:${stableHash(groupBase)}:${occurrence}`;
          groups.set(groupKey, {
            groupKey,
            ingredientName,
            amountLabel,
            unitLabel: ingredient.unit.trim(),
            fingerprint: `text:${stableHash(
              `${normalize(amountLabel)}\0${unit.key}`,
            )}`,
            sources: [source],
            recipeNames: [recipe.name],
          });
          return;
        }

        const groupKey = `number:${stableHash(
          `${normalizedName}\0${unit.key}`,
        )}`;
        const contribution = roundedAmount(parsedAmount * unit.factor * scale);
        if (!Number.isFinite(contribution) || contribution > 1_000_000_000) {
          skippedIngredientCount += 1;
          return;
        }
        const existing = groups.get(groupKey);
        if (existing) {
          const combinedAmount = roundedAmount(
            (existing.numericAmount ?? 0) + contribution,
          );
          if (
            !Number.isFinite(combinedAmount) ||
            combinedAmount > 1_000_000_000
          ) {
            skippedIngredientCount += 1;
            return;
          }
          existing.numericAmount = combinedAmount;
          existing.amountLabel = numberFormatter.format(existing.numericAmount);
          existing.fingerprint = `number:${stableHash(
            `${existing.numericAmount}\0${unit.key}`,
          )}`;
          addSource(existing, source, recipe);
          return;
        }
        groups.set(groupKey, {
          groupKey,
          ingredientName,
          amountLabel: numberFormatter.format(contribution),
          unitLabel: unit.label,
          numericAmount: contribution,
          fingerprint: `number:${stableHash(`${contribution}\0${unit.key}`)}`,
          sources: [source],
          recipeNames: [recipe.name],
        });
      });
    }
  }

  return {
    groups: [...groups.values()]
      .map((group) => ({
        ...group,
        sources: [...group.sources].sort(sourceSort),
        recipeNames: [...group.recipeNames].sort((left, right) =>
          left.localeCompare(right, 'de-DE'),
        ),
      }))
      .sort((left, right) =>
        left.groupKey.localeCompare(right.groupKey, 'de-DE'),
      ),
    plannedMealCount,
    contributingMealCount,
    missingRecipeCount,
    skippedIngredientCount,
  };
}

/**
 * Reconciles the generated items for one week without mutating the input.
 * Manually added, recipe-generated and other-week items are preserved verbatim.
 */
export function reconcileWeekShopping(
  input: WeekShoppingInput,
  weekStart: string,
): WeekShoppingResult {
  parseLocalDate(weekStart);
  const desired = desiredGroups(input, weekStart);
  const targetItems = input.shopping.filter(
    (item) =>
      item.origin.kind === 'week' && item.origin.weekStart === weekStart,
  );
  const preserved = input.shopping.filter(
    (item) =>
      item.origin.kind !== 'week' || item.origin.weekStart !== weekStart,
  );
  const existingByGroup = new Map<string, ShoppingItem>();
  for (const item of targetItems) {
    if (
      item.origin.kind === 'week' &&
      !existingByGroup.has(item.origin.groupKey)
    )
      existingByGroup.set(item.origin.groupKey, item);
  }

  const usedIds = new Set(input.shopping.map((item) => item.id));
  let addedItemCount = 0;
  let updatedItemCount = 0;
  let unchangedItemCount = 0;
  let preservedCheckedCount = 0;
  const matchedIds = new Set<string>();

  const generated = desired.groups.map((group) => {
    const existing = existingByGroup.get(group.groupKey);
    const name = [group.amountLabel, group.unitLabel, group.ingredientName]
      .filter(Boolean)
      .join(' ')
      .slice(0, 5_000);
    const source = group.recipeNames.join(', ').slice(0, 5_000);
    if (!existing || existing.origin.kind !== 'week') {
      addedItemCount += 1;
      return {
        id: generatedId(weekStart, group.groupKey, usedIds),
        name,
        category: classifyIngredient(group.ingredientName),
        checked: false,
        source,
        origin: {
          kind: 'week' as const,
          weekStart,
          groupKey: group.groupKey,
          sources: group.sources,
          fingerprint: group.fingerprint,
        },
      } satisfies ShoppingItem;
    }

    matchedIds.add(existing.id);
    usedIds.add(existing.id);
    if (existing.checked) preservedCheckedCount += 1;
    const amountChanged = existing.origin.fingerprint !== group.fingerprint;
    const sourcesChanged =
      JSON.stringify(existing.origin.sources) !== JSON.stringify(group.sources);
    const changed =
      amountChanged ||
      sourcesChanged ||
      existing.name !== name ||
      existing.source !== source;
    if (changed) updatedItemCount += 1;
    else unchangedItemCount += 1;
    const needsReview = existing.needsReview || amountChanged;
    return {
      ...existing,
      name,
      source,
      ...(needsReview ? { needsReview: true } : {}),
      origin: {
        kind: 'week' as const,
        weekStart,
        groupKey: group.groupKey,
        sources: group.sources,
        fingerprint: group.fingerprint,
      },
    } satisfies ShoppingItem;
  });

  const removedItemCount = targetItems.filter(
    (item) => !matchedIds.has(item.id),
  ).length;
  const overflowItemCount = Math.max(
    0,
    preserved.length + generated.length - 10_000,
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
      reviewItemCount: generated.filter((item) => item.needsReview).length,
      overflowItemCount,
    },
  };
}
