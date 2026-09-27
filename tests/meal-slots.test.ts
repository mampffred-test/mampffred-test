import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createEmptyData,
  migrateAppData,
  type MealSlot,
} from '../lib/model.ts';
import {
  ALL_MEAL_SLOTS,
  getEnabledMealSlots,
  visibleMealPlan,
} from '../lib/meal-slots.ts';
import { installStandardRecipes } from '../lib/standard-recipes.ts';
import { reconcileWeekShopping } from '../lib/week-shopping.ts';
import { aggregateNutritionWeek } from '../lib/nutrition.ts';

test('alte Daten aktivieren alle Mahlzeiten; Auswahl wird gespeichert und validiert', () => {
  const data = createEmptyData();
  delete data.enabledMealSlots;
  assert.deepEqual(getEnabledMealSlots(data), ALL_MEAL_SLOTS);
  assert.deepEqual(migrateAppData(data).enabledMealSlots, ALL_MEAL_SLOTS);
  data.enabledMealSlots = ['Abendessen'];
  assert.deepEqual(
    migrateAppData(JSON.parse(JSON.stringify(data))).enabledMealSlots,
    ['Abendessen'],
  );
  for (const invalid of [
    [],
    ['Snack'],
    ['Abendessen', 'Abendessen'],
    'Abendessen',
  ])
    assert.throws(
      () => migrateAppData({ ...data, enabledMealSlots: invalid }),
      /INVALID_APP_DATA/,
    );
});

test('jede Kombination filtert Planung, Nährwertzählung und Wocheneinkauf ohne gespeicherte Pläne zu löschen', () => {
  const base = installStandardRecipes(createEmptyData());
  base.plan = [
    {
      date: '2026-09-28',
      meals: ALL_MEAL_SLOTS.map((slot, i) => ({
        slot,
        recipeId: base.recipes[i].id,
        servings: 2,
      })),
    },
  ];
  const saved = structuredClone(base.plan);
  for (let mask = 1; mask < 8; mask++) {
    const slots: MealSlot[] = ALL_MEAL_SLOTS.filter((_, i) => mask & (1 << i));
    const selected = { ...base, enabledMealSlots: slots };
    assert.deepEqual(
      visibleMealPlan(selected)[0].meals.map((m) => m.slot),
      slots,
    );
    assert.equal(
      aggregateNutritionWeek(selected, '2026-09-28').mealCount,
      slots.length,
    );
    const shopping = reconcileWeekShopping(selected, '2026-09-28');
    assert.equal(shopping.preview.plannedMealCount, slots.length);
    assert.ok(
      shopping.shopping.every(
        (item) =>
          item.origin.kind !== 'week' ||
          item.origin.sources.every((source) => slots.includes(source.slot)),
      ),
    );
    assert.deepEqual(selected.plan, saved);
  }
  assert.equal(
    visibleMealPlan({ ...base, enabledMealSlots: ALL_MEAL_SLOTS })[0].meals
      .length,
    3,
  );
});
