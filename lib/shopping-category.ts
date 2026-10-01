import { matchCatalogFood, type AisleId } from './food-catalog.ts';
import { parseIngredientLine } from './ingredient-text.ts';

/**
 * Store aisle for a free shopping text such as "950 g Cherrytomaten" or
 * "Hafermilch". Unknown items return undefined so the caller decides.
 */
export function classifyShoppingName(name: string): AisleId | undefined {
  const parsed = parseIngredientLine(name);
  return matchCatalogFood(parsed.name)?.aisle ?? matchCatalogFood(name)?.aisle;
}
