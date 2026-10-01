import assert from 'node:assert/strict';
import test from 'node:test';

import { leftoverBonus, recipeFoodIds } from '../lib/leftovers.ts';
import { proposeMeals } from '../lib/meal-planning.ts';
import type { Recipe, RecipeIngredient } from '../lib/model.ts';
import { estimateLeftovers } from '../lib/week-shopping.ts';

const weekStart = '2026-08-31';

function recipe(id: string, lines: Array<[string, string, string]>): Recipe {
  return {
    id,
    shareId: `local:${id}`,
    name: id,
    description: '',
    minutes: 20,
    servings: 2,
    tags: [],
    steps: [],
    imageCell: 0,
    ingredients: lines.map(([amount, unit, name]): RecipeIngredient => ({
      amount,
      unit,
      name,
    })),
  };
}

test('schätzt verderbliche Reste aus aufgerundeten Kaufmengen', () => {
  const pasta = recipe('pasta', [
    ['1,25', 'Stück', 'Zucchini'],
    ['230', 'g', 'Feta'],
    ['150', 'g', 'Reis'],
    ['1', 'Prise', 'Salz'],
  ]);
  const leftovers = estimateLeftovers(
    {
      recipes: [pasta],
      plan: [
        {
          date: weekStart,
          meals: [{ slot: 'Abendessen', recipeId: 'pasta', servings: 2 }],
        },
      ],
      shopping: [],
      pantry: {},
      foodAliases: {},
    },
    weekStart,
  );
  assert.deepEqual(
    leftovers.map((entry) => [entry.foodId, entry.label]),
    [
      ['feta', 'ca. 170 g Feta'],
      ['zucchini', '¾ Zucchini'],
    ],
  );
});

test('bewertet Rezepte nach verwertbaren Resten, jeden Rest nur einmal', () => {
  const zucchini = recipe('zucchini-pfanne', [['1', 'Stück', 'Zucchini']]);
  const plain = recipe('nudeln', [['200', 'g', 'Nudeln']]);
  const leftovers = new Set(['zucchini']);
  assert.deepEqual(leftoverBonus(zucchini, leftovers, {}), {
    score: 3,
    foods: ['zucchini'],
  });
  assert.deepEqual(leftoverBonus(plain, leftovers, {}), {
    score: 0,
    foods: [],
  });
  assert.deepEqual([...recipeFoodIds(zucchini, {})], ['zucchini']);
});

test('„Woche füllen“ bevorzugt Rezepte, die Reste verwerten', () => {
  const zucchini = recipe('zucchini-pfanne', [['1', 'Stück', 'Zucchini']]);
  const plain = recipe('nudeln', [['200', 'g', 'Nudeln']]);
  const proposals = proposeMeals({
    recipes: [plain, zucchini],
    plan: [],
    targets: [
      { date: '2026-09-01', slot: 'Abendessen' },
      { date: '2026-09-02', slot: 'Abendessen' },
    ],
    random: () => 0,
    bonus: (candidate, claimed) => {
      const result = leftoverBonus(
        candidate,
        new Set(['zucchini'].filter((id) => !claimed.has(id))),
        {},
      );
      return { score: result.score, claims: result.foods };
    },
  });
  assert.deepEqual(
    proposals.map((entry) => entry.recipeId),
    ['zucchini-pfanne', 'nudeln'],
  );
});

test('lässt lange haltbare Zutaten weg und sortiert nach Verschwendung', () => {
  const dish = recipe('mix', [
    ['0,5', 'Stück', 'Zwiebel'],
    ['10', 'g', 'Ingwer'],
    ['0,5', 'Stück', 'Zitrone'],
    ['50', 'g', 'Feta'],
    ['0,75', 'Stück', 'Zucchini'],
  ]);
  const leftovers = estimateLeftovers(
    {
      recipes: [dish],
      plan: [
        {
          date: weekStart,
          meals: [{ slot: 'Abendessen', recipeId: 'mix', servings: 2 }],
        },
      ],
      shopping: [],
      pantry: {},
      foodAliases: {},
    },
    weekStart,
  );
  assert.deepEqual(
    leftovers.map((entry) => entry.foodId),
    ['feta', 'zucchini'],
  );
});
