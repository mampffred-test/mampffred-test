import type { MealSlot, PlannedDay } from './model.ts';

export const ALL_MEAL_SLOTS: MealSlot[] = [
  'Frühstück',
  'Mittagessen',
  'Abendessen',
];

export function getEnabledMealSlots(data: {
  enabledMealSlots?: MealSlot[];
}): MealSlot[] {
  const selected = ALL_MEAL_SLOTS.filter((slot) =>
    data.enabledMealSlots?.includes(slot),
  );
  return selected.length ? selected : [...ALL_MEAL_SLOTS];
}

export function visibleMealPlan(data: {
  plan: PlannedDay[];
  enabledMealSlots?: MealSlot[];
}): PlannedDay[] {
  const slots = getEnabledMealSlots(data);
  return data.plan.map((day) => ({
    ...day,
    meals: day.meals.filter((meal) => slots.includes(meal.slot)),
  }));
}
