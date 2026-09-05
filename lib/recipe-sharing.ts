import type { Recipe } from './model.ts';
import { createEmptyData, migrateAppData } from './model.ts';
import { visibleRecipeTags } from './recipe-filter.ts';

export const MAX_SHARED_RECIPE_BYTES = 500_000;

type SharedRecipeEnvelope = {
  format: 'mampffred-recipe';
  version: 1;
  shareId: string;
  recipe: {
    name: string;
    description: string;
    minutes: number;
    servings: number;
    tags: string[];
    ingredients: Array<{ amount: string; unit: string; name: string }>;
    steps: string[];
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function serializeSharedRecipe(recipe: Recipe) {
  const envelope: SharedRecipeEnvelope = {
    format: 'mampffred-recipe',
    version: 1,
    shareId: recipe.shareId,
    recipe: {
      name: recipe.name,
      description: recipe.description,
      minutes: recipe.minutes,
      servings: recipe.servings,
      tags: visibleRecipeTags(recipe),
      ingredients: recipe.ingredients.map(({ amount, unit, name }) => ({
        amount,
        unit,
        name,
      })),
      steps: recipe.steps,
    },
  };
  return JSON.stringify(envelope, null, 2);
}

export function formatSharedRecipeText(recipe: Recipe) {
  const description = recipe.description.trim()
    ? `${recipe.description.trim()}\n\n`
    : '';
  const ingredients = recipe.ingredients
    .filter((ingredient) => ingredient.name.trim())
    .map(
      (ingredient) =>
        `- ${[ingredient.amount, ingredient.unit, ingredient.name]
          .filter(Boolean)
          .join(' ')}`,
    )
    .join('\n');
  const steps = recipe.steps
    .filter((step) => step.trim())
    .map((step, index) => `${index + 1}. ${step.trim()}`)
    .join('\n');
  return `${recipe.name}\n\n${description}${recipe.minutes} Min. · ${recipe.servings} ${recipe.servings === 1 ? 'Portion' : 'Portionen'}\n\nZutaten\n${ingredients}\n\nZubereitung\n${steps}`;
}

export async function parseSharedRecipe(contents: string): Promise<Recipe> {
  if (new TextEncoder().encode(contents).byteLength > MAX_SHARED_RECIPE_BYTES)
    throw new Error('SHARED_RECIPE_TOO_LARGE');
  const envelope: unknown = JSON.parse(contents);
  if (
    !isRecord(envelope) ||
    envelope.format !== 'mampffred-recipe' ||
    envelope.version !== 1 ||
    typeof envelope.shareId !== 'string' ||
    !isRecord(envelope.recipe)
  )
    throw new Error('INVALID_SHARED_RECIPE');
  const recipe = envelope.recipe;
  if (!Array.isArray(recipe.ingredients))
    throw new Error('INVALID_SHARED_RECIPE');

  const validated = migrateAppData({
    ...createEmptyData(),
    recipes: [
      {
        id: 'shared-recipe-preview',
        shareId: envelope.shareId,
        name: recipe.name,
        description: recipe.description,
        minutes: recipe.minutes,
        servings: recipe.servings,
        tags: recipe.tags,
        ingredients: recipe.ingredients.map((ingredient, index) => {
          if (!isRecord(ingredient)) throw new Error('INVALID_SHARED_RECIPE');
          return {
            id: `shared-ingredient-${index + 1}`,
            amount: ingredient.amount,
            unit: ingredient.unit,
            name: ingredient.name,
          };
        }),
        steps: recipe.steps,
        imageCell: 0,
      },
    ],
  }).recipes[0];
  if (!validated) throw new Error('INVALID_SHARED_RECIPE');
  const portable = { ...validated, tags: visibleRecipeTags(validated) };
  const content = JSON.parse(serializeSharedRecipe(portable)).recipe;
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(content)),
  );
  const hash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  return { ...portable, shareId: `imported:${hash}` };
}
