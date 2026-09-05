import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  AppData,
  NutrientKey,
  NutritionGoal,
  Recipe,
} from '../lib/model.ts';
import { APP_SCHEMA_VERSION } from '../lib/model.ts';
import {
  aggregateNutritionDay,
  aggregateNutritionWeek,
  suggestRecipesForWeek,
} from '../lib/nutrition.ts';

test('eine Tagesübersicht enthält niemals Mahlzeiten anderer Tage', () => {
  const appData = data(
    [recipe('tag', 1, { proteinG: { value: 20, quality: 'declared' } })],
    [{ slot: 'Mittagessen', recipeId: 'tag', servings: 1 }],
  );
  appData.plan.push({
    date: '2026-09-08',
    meals: [{ slot: 'Mittagessen', recipeId: 'tag', servings: 1 }],
  });

  const day = aggregateNutritionDay(appData, '2026-09-07');
  assert.equal(day.mealCount, 1);
  assert.equal(day.nutrients.proteinG.value, 20);
  assert.equal(day.weekEnd, '2026-09-07');
});

function recipe(
  id: string,
  servings: number,
  nutrients: Partial<
    Record<NutrientKey, { value: number; quality: 'declared' | 'estimated' }>
  >,
): Recipe {
  return {
    id,
    shareId: `test:${id}`,
    name: id,
    description: '',
    minutes: 20,
    servings,
    tags: [],
    ingredients: [{ amount: '1', unit: 'Stück', name: 'Zutat' }],
    steps: ['Zubereiten'],
    imageCell: 0,
    nutrition: {
      wholeRecipe: Object.fromEntries(
        Object.entries(nutrients).map(([key, metric]) => [
          key,
          { ...metric, source: { kind: 'user' as const } },
        ]),
      ),
      enteredAs: 'whole-recipe',
      updatedAt: '2026-09-07T12:00:00.000Z',
    },
  };
}

function data(
  recipes: Recipe[],
  meals: AppData['plan'][number]['meals'],
  goals: NutritionGoal[] = [],
): AppData {
  return {
    schemaVersion: APP_SCHEMA_VERSION,
    recipes,
    plan: [{ date: '2026-09-07', meals }],
    shopping: [],
    onboardingDone: true,
    installedSamplePacks: [],
    nutritionSettings: {
      enabled: true,
      automaticEstimates: false,
      promptDismissed: false,
      defaultTrackedServings: 1,
      goals,
    },
    foodOverrides: {},
    customFoods: [],
    recipeDrafts: [],
  };
}

test('skaliert ganze Rezeptwerte auf geplante und erfasste Portionen', () => {
  const appData = data(
    [
      recipe('suppe', 4, {
        energyKcal: { value: 800, quality: 'declared' },
        proteinG: { value: 40, quality: 'declared' },
      }),
    ],
    [
      {
        slot: 'Abendessen',
        recipeId: 'suppe',
        servings: 3,
        trackedServings: 2,
      },
    ],
  );

  const week = aggregateNutritionWeek(appData, '2026-09-07');
  assert.equal(week.nutrients.energyKcal.value, 400);
  assert.equal(week.nutrients.proteinG.value, 20);
  assert.equal(week.nutrients.energyKcal.coverage, 1);
});

test('nutzt bei migrierten Mahlzeiten ohne Erfassungswert nur die lokale Standardportion', () => {
  const appData = data(
    [recipe('auflauf', 4, { proteinG: { value: 80, quality: 'declared' } })],
    [{ slot: 'Abendessen', recipeId: 'auflauf', servings: 4 }],
  );

  const protein = aggregateNutritionWeek(appData, '2026-09-07').nutrients
    .proteinG;
  assert.equal(protein.value, 20);
  assert.equal(protein.coverage, 1);
});

test('interpretiert fehlende Nährwerte nie als nullwertigen Beitrag', () => {
  const appData = data(
    [
      recipe('vollständig', 2, {
        proteinG: { value: 20, quality: 'declared' },
      }),
      recipe('unbekannt', 2, {}),
    ],
    [
      { slot: 'Mittagessen', recipeId: 'vollständig', servings: 1 },
      { slot: 'Abendessen', recipeId: 'unbekannt', servings: 1 },
    ],
  );

  const protein = aggregateNutritionWeek(appData, '2026-09-07').nutrients
    .proteinG;
  assert.equal(protein.value, null);
  assert.equal(protein.coveredMeals, 1);
  assert.equal(protein.totalMeals, 2);
  assert.equal(protein.coverage, 0.5);
});

test('verwendet automatische Werte nur nach ausdrücklichem Opt-in', () => {
  const automatic = recipe('automatisch', 2, {
    proteinG: { value: 20, quality: 'estimated' },
  });
  automatic.nutrition!.wholeRecipe.proteinG!.source = {
    kind: 'dataset',
    dataset: 'BLS',
    version: '4.0',
    inputFingerprint: 'test',
    resolvedIngredients: 1,
    totalIngredients: 1,
  };
  const appData = data(
    [automatic],
    [{ slot: 'Mittagessen', recipeId: automatic.id, servings: 1 }],
  );

  assert.equal(
    aggregateNutritionWeek(appData, '2026-09-07').nutrients.proteinG.value,
    null,
  );
  appData.nutritionSettings.automaticEstimates = true;
  assert.equal(
    aggregateNutritionWeek(appData, '2026-09-07').nutrients.proteinG.value,
    10,
  );
});

test('macht ohne vollständige Daten oder belastbare Ziellücke keine Vorschläge', () => {
  const appData = data(
    [recipe('kandidat', 1, { proteinG: { value: 20, quality: 'declared' } })],
    [{ slot: 'Mittagessen', recipeId: 'fehlt', servings: 1 }],
    [
      {
        nutrient: 'proteinG',
        period: 'week',
        minimum: 60,
        enabled: true,
      },
    ],
  );
  const incompleteWeek = aggregateNutritionWeek(appData, '2026-09-07');
  assert.deepEqual(suggestRecipesForWeek(appData, incompleteWeek), []);

  const completeData = data(
    [recipe('kandidat', 1, { proteinG: { value: 58, quality: 'declared' } })],
    [{ slot: 'Mittagessen', recipeId: 'kandidat', servings: 1 }],
    [
      {
        nutrient: 'proteinG',
        period: 'week',
        minimum: 60,
        enabled: true,
      },
    ],
  );
  const marginalGap = aggregateNutritionWeek(completeData, '2026-09-07');
  assert.deepEqual(suggestRecipesForWeek(completeData, marginalGap), []);
});

test('rankt lokale Rezepte nach Ziellücken-Nähe und Datenqualität', () => {
  const current = recipe('basis', 1, {
    proteinG: { value: 20, quality: 'declared' },
  });
  const appData = data(
    [
      current,
      recipe('nah', 1, {
        proteinG: { value: 38, quality: 'declared' },
      }),
      recipe('geschaetzt', 1, {
        proteinG: { value: 40, quality: 'estimated' },
      }),
      recipe('zu-viel', 1, {
        proteinG: { value: 100, quality: 'declared' },
      }),
    ],
    [{ slot: 'Mittagessen', recipeId: 'basis', servings: 1 }],
    [
      {
        nutrient: 'proteinG',
        period: 'week',
        minimum: 60,
        enabled: true,
      },
    ],
  );

  const suggestions = suggestRecipesForWeek(
    appData,
    aggregateNutritionWeek(appData, '2026-09-07'),
    4,
  );
  assert.deepEqual(
    suggestions.map((suggestion) => suggestion.recipeId),
    ['nah', 'geschaetzt', 'zu-viel'],
  );
  assert.ok(
    suggestions.every((suggestion) => suggestion.nutrient === 'proteinG'),
  );
});
