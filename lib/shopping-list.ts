import {
  AISLES,
  aisleLabel,
  foldFoodName,
  matchCatalogFood,
  type AisleId,
} from './food-catalog.ts';
import { parseIngredientLine } from './ingredient-text.ts';
import type { AppData, Recipe, ShoppingItem } from './model.ts';
import { classifyShoppingName } from './shopping-category.ts';
import { reconcileWeekShopping } from './week-shopping.ts';

/** A free-text entry like "2 l Hafermilch" as a structured item. */
export function createManualItem(text: string, id: string): ShoppingItem {
  const parsed = parseIngredientLine(text.trim());
  const name = (parsed.name || text.trim()).slice(0, 500);
  const food = matchCatalogFood(name);
  // "3 Zwiebeln" reads best without the implied "Stück".
  const writtenUnit =
    parsed.unit === 'Stück' && !/\bst(?:ü|ue|u)ck|\bstk/i.test(text)
      ? ''
      : parsed.unit;
  const quantity = parsed.amount
    ? [parsed.amount, writtenUnit].filter(Boolean).join(' ')
    : undefined;
  return {
    id,
    name,
    ...(quantity ? { quantity } : {}),
    ...(food ? { foodId: food.id } : {}),
    category: food?.aisle ?? classifyShoppingName(text) ?? 'sonstiges',
    checked: false,
    origin: { kind: 'manual' },
  };
}

function sameThing(left: ShoppingItem, right: ShoppingItem) {
  if (left.foodId && right.foodId) return left.foodId === right.foodId;
  return foldFoodName(left.name) === foldFoodName(right.name);
}

/** An open item for the same food, so the person can add to it instead. */
export function findDuplicate(
  shopping: readonly ShoppingItem[],
  candidate: ShoppingItem,
) {
  return shopping.find(
    (entry) =>
      !entry.checked &&
      entry.id !== candidate.id &&
      sameThing(entry, candidate),
  );
}

/** Items for one recipe, built with the same rules as the week list. */
export function recipeShoppingItems(
  input: Pick<AppData, 'pantry' | 'foodAliases'>,
  recipe: Recipe,
  servings: number,
  createId: (index: number) => string,
): ShoppingItem[] {
  const anchor = '2000-01-03';
  const result = reconcileWeekShopping(
    {
      recipes: [recipe],
      plan: [
        {
          date: anchor,
          meals: [{ slot: 'Abendessen', recipeId: recipe.id, servings }],
        },
      ],
      shopping: [],
      enabledMealSlots: ['Abendessen'],
      pantry: input.pantry,
      foodAliases: input.foodAliases,
    },
    anchor,
  );
  return [...result.shopping]
    .sort((left, right) => left.name.localeCompare(right.name, 'de-DE'))
    .map((item, index): ShoppingItem => ({
      ...item,
      id: createId(index),
      origin: { kind: 'recipe', recipeId: recipe.id },
    }));
}

/** Own order first, then every remaining aisle in the default order. */
export function completeAisleOrder(order: readonly AisleId[] = []): AisleId[] {
  const known = AISLES.map((aisle) => aisle.id);
  const own = order.filter((id) => known.includes(id));
  return [...new Set([...own, ...known])];
}

export type ShoppingGroups = {
  sections: Array<{ aisle: AisleId; items: ShoppingItem[] }>;
  /** "Vorrat prüfen": usually at home, shown collapsed. */
  pantry: ShoppingItem[];
};

function byOpenThenName(left: ShoppingItem, right: ShoppingItem) {
  return (
    Number(left.checked) - Number(right.checked) ||
    left.name.localeCompare(right.name, 'de-DE')
  );
}

/** Store walk order; open items first so the list shrinks while shopping. */
export function groupShoppingItems(
  items: readonly ShoppingItem[],
  order: readonly AisleId[] = AISLES.map((aisle) => aisle.id),
): ShoppingGroups {
  const pantry = items
    .filter((entry) => entry.pantryCheck)
    .sort(byOpenThenName);
  const regular = items.filter((entry) => !entry.pantryCheck);
  const sections = order.flatMap((aisle) => {
    const sectionItems = regular
      .filter((entry) => entry.category === aisle)
      .sort(byOpenThenName);
    return sectionItems.length ? [{ aisle, items: sectionItems }] : [];
  });
  return { sections, pantry };
}

function line(entry: ShoppingItem) {
  return `☐ ${entry.name}${entry.quantity ? ` – ${entry.quantity}` : ''}${
    entry.optional ? ' (optional)' : ''
  }`;
}

/** Plain text for messengers; only open items. */
export function formatShoppingListText(
  items: readonly ShoppingItem[],
  title: string,
  order?: readonly AisleId[],
) {
  const open = items.filter((entry) => !entry.checked);
  const groups = groupShoppingItems(open, order);
  const blocks = groups.sections.map(
    (section) =>
      `${aisleLabel(section.aisle)}\n${section.items.map(line).join('\n')}`,
  );
  if (groups.pantry.length)
    blocks.push(`Vorrat prüfen\n${groups.pantry.map(line).join('\n')}`);
  return [title, ...blocks].join('\n\n');
}
