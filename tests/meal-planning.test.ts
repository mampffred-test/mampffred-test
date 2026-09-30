import assert from 'node:assert/strict';
import test from 'node:test';
import { createEmptyData, migrateAppData, seedRecipes } from '../lib/model.ts';
import type { PlannedDay, Recipe } from '../lib/model.ts';
import {
  applyPlanChanges,
  freeSlots,
  plannedMealAt,
  preferredServings,
  proposeMeals,
  rankRecipesForSlot,
  recipesForSlot,
  revertPlanChanges,
  seededRandom,
  slotForTime,
  weekDates,
} from '../lib/meal-planning.ts';

const at = (hours: number, minutes = 0) =>
  new Date(2026, 8, 29, hours, minutes);
const recipe = (id: string, patch: Partial<Recipe> = {}): Recipe => ({
  ...seedRecipes[1],
  id,
  shareId: `local:${id}`,
  name: id,
  tags: [],
  ...patch,
});

test('Tageszeit wählt die passende aktivierte Mahlzeit', () => {
  const all = ['Frühstück', 'Mittagessen', 'Abendessen'] as const;
  assert.equal(slotForTime(at(7), all), 'Frühstück');
  assert.equal(slotForTime(at(10, 29), all), 'Frühstück');
  assert.equal(slotForTime(at(10, 30), all), 'Mittagessen');
  assert.equal(slotForTime(at(15), all), 'Abendessen');
  assert.equal(slotForTime(at(23, 59), all), 'Abendessen');
  assert.equal(slotForTime(at(7), ['Abendessen']), 'Abendessen');
  assert.equal(
    slotForTime(at(7), ['Mittagessen', 'Abendessen']),
    'Mittagessen',
  );
  // Late in the day with only breakfast enabled, keep showing breakfast.
  assert.equal(slotForTime(at(20), ['Frühstück']), 'Frühstück');
});

test('freie Plätze beachten Reihenfolge, Startdatum und belegte Slots', () => {
  const plan: PlannedDay[] = [
    {
      date: '2026-09-29',
      meals: [{ slot: 'Abendessen', recipeId: 'a', servings: 2 }],
    },
  ];
  const dates = weekDates('2026-09-28');
  assert.equal(dates.length, 7);
  assert.equal(dates[6], '2026-10-04');
  const free = freeSlots(
    plan,
    dates,
    ['Abendessen', 'Mittagessen'],
    '2026-09-29',
  );
  assert.deepEqual(free.slice(0, 3), [
    { date: '2026-09-29', slot: 'Mittagessen' },
    { date: '2026-09-30', slot: 'Mittagessen' },
    { date: '2026-09-30', slot: 'Abendessen' },
  ]);
  assert.equal(free.length, 11);
});

test('übliche Portionenzahl folgt dem bisherigen Plan', () => {
  assert.equal(preferredServings([], 4), 4);
  const plan: PlannedDay[] = [
    {
      date: '2026-09-01',
      meals: [{ slot: 'Abendessen', recipeId: 'a', servings: 2 }],
    },
    {
      date: '2026-09-02',
      meals: [{ slot: 'Abendessen', recipeId: 'a', servings: 2 }],
    },
    {
      date: '2026-09-03',
      meals: [{ slot: 'Abendessen', recipeId: 'a', servings: 5 }],
    },
  ];
  assert.equal(preferredServings(plan, 4), 2);
});

test('Frühstück bleibt Frühstück und Hauptgerichte bleiben Hauptgerichte', () => {
  const recipes = [
    recipe('porridge', { tags: ['Frühstück'] }),
    recipe('curry', { minutes: 40 }),
    recipe('toast', { minutes: 10 }),
  ];
  assert.deepEqual(
    recipesForSlot(recipes, 'Frühstück').map((entry) => entry.id),
    ['porridge'],
  );
  assert.deepEqual(
    recipesForSlot(recipes, 'Abendessen').map((entry) => entry.id),
    ['curry', 'toast'],
  );
  // Without breakfast recipes, breakfast gets no suggestion at all.
  assert.deepEqual(recipesForSlot(recipes.slice(1), 'Frühstück'), []);
});

test('kürzlich geplante Rezepte rutschen nach hinten, Favoriten nach vorn', () => {
  const recipes = [
    recipe('recent'),
    recipe('favorite', { favorite: true }),
    recipe('plain'),
  ];
  const plan: PlannedDay[] = [
    {
      date: '2026-09-28',
      meals: [{ slot: 'Abendessen', recipeId: 'recent', servings: 2 }],
    },
  ];
  const ranked = rankRecipesForSlot({
    recipes,
    plan,
    date: '2026-09-30',
    slot: 'Abendessen',
    random: () => 0,
  });
  assert.deepEqual(
    ranked.map((entry) => entry.id),
    ['favorite', 'plain', 'recent'],
  );
});

test('Vorschläge sind verschieden und lassen unpassende Slots aus', () => {
  const recipes = [recipe('a'), recipe('b'), recipe('c')];
  const targets = [
    { date: '2026-09-29', slot: 'Frühstück' as const },
    { date: '2026-09-29', slot: 'Abendessen' as const },
    { date: '2026-09-30', slot: 'Abendessen' as const },
    { date: '2026-10-01', slot: 'Abendessen' as const },
  ];
  const proposals = proposeMeals({
    recipes: recipes.map((entry) => ({ ...entry, minutes: 40 })),
    plan: [],
    targets,
    random: () => 0.5,
  });
  assert.equal(proposals.length, 3);
  assert.equal(new Set(proposals.map((entry) => entry.recipeId)).size, 3);
  assert.ok(proposals.every((entry) => entry.slot === 'Abendessen'));
  // With fewer recipes than slots, recipes repeat instead of leaving gaps.
  const repeated = proposeMeals({
    recipes: [recipe('solo', { minutes: 40 })],
    plan: [],
    targets: targets.slice(1),
  });
  assert.equal(repeated.length, 3);
});

test('Planänderungen lassen sich rückgängig machen, ohne Neueres zu überschreiben', () => {
  const plan: PlannedDay[] = [
    {
      date: '2026-09-29',
      meals: [{ slot: 'Abendessen', recipeId: 'a', servings: 2 }],
    },
  ];
  const applied = applyPlanChanges(plan, [
    { date: '2026-09-29', slot: 'Abendessen' },
    {
      date: '2026-09-30',
      slot: 'Abendessen',
      meal: { slot: 'Abendessen', recipeId: 'b', servings: 2 },
    },
    // Unchanged entries are not recorded.
    { date: '2026-10-01', slot: 'Abendessen' },
  ]);
  assert.equal(applied.changes.length, 2);
  assert.deepEqual(
    applied.plan.map((day) => day.date),
    ['2026-09-30'],
  );

  assert.deepEqual(revertPlanChanges(applied.plan, applied.changes), plan);

  const editedAgain = applyPlanChanges(applied.plan, [
    {
      date: '2026-09-30',
      slot: 'Abendessen',
      meal: { slot: 'Abendessen', recipeId: 'c', servings: 3 },
    },
  ]).plan;
  const reverted = revertPlanChanges(editedAgain, applied.changes);
  assert.equal(
    plannedMealAt(reverted, '2026-09-30', 'Abendessen')?.recipeId,
    'c',
  );
  assert.equal(
    plannedMealAt(reverted, '2026-09-29', 'Abendessen')?.recipeId,
    'a',
  );

  // Deleted recipes are not planned again by undo.
  const withoutA = revertPlanChanges(
    applied.plan,
    applied.changes,
    new Set(['b']),
  );
  assert.equal(plannedMealAt(withoutA, '2026-09-29', 'Abendessen'), undefined);
});

test('angewendete Vorschläge bleiben gültige, speicherbare App-Daten', () => {
  const data = createEmptyData();
  data.recipes = [recipe('a'), recipe('b')];
  const proposals = proposeMeals({
    recipes: data.recipes,
    plan: data.plan,
    targets: freeSlots(data.plan, weekDates('2026-09-28'), ['Abendessen']),
  });
  const { plan } = applyPlanChanges(
    data.plan,
    proposals.map((entry) => ({
      ...entry,
      meal: {
        slot: entry.slot,
        recipeId: entry.recipeId,
        servings: 2,
        trackedServings: 1,
      },
    })),
  );
  const migrated = migrateAppData({ ...data, plan });
  assert.equal(migrated.plan.length, 7);
  assert.deepEqual(
    migrated.plan.map((day) => day.date),
    migrated.plan.map((day) => day.date).toSorted(),
  );
});

test('Vorschläge bleiben für denselben Tag stabil', () => {
  const first = seededRandom('2026-09-29|Abendessen');
  const second = seededRandom('2026-09-29|Abendessen');
  const values = [first(), first(), first()];
  assert.deepEqual(values, [second(), second(), second()]);
  assert.ok(values.every((value) => value >= 0 && value < 1));
  assert.notEqual(seededRandom('2026-09-30|Abendessen')(), values[0]);
});
