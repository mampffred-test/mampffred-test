import type { MealSlot, PlannedDay, PlannedMeal, Recipe } from './model.ts';
import { ALL_MEAL_SLOTS } from './meal-slots.ts';
import { addLocalDays, parseLocalDate } from './local-date.ts';

/** Minutes after midnight at which the next meal slot becomes the focus. */
const SLOT_FOCUS_UNTIL: Record<MealSlot, number> = {
  Frühstück: 10 * 60 + 30,
  Mittagessen: 15 * 60,
  Abendessen: 24 * 60,
};

/** The meal a person most likely thinks about at this time of day. */
export function slotForTime(now: Date, slots: readonly MealSlot[]): MealSlot {
  const enabled = ALL_MEAL_SLOTS.filter((slot) => slots.includes(slot));
  if (!enabled.length) return 'Abendessen';
  const minutes = now.getHours() * 60 + now.getMinutes();
  const byTime =
    ALL_MEAL_SLOTS.find((slot) => minutes < SLOT_FOCUS_UNTIL[slot]) ??
    'Abendessen';
  const index = ALL_MEAL_SLOTS.indexOf(byTime);
  return (
    enabled.find((slot) => ALL_MEAL_SLOTS.indexOf(slot) >= index) ??
    enabled[enabled.length - 1]
  );
}

export function plannedMealAt(
  plan: readonly PlannedDay[],
  date: string,
  slot: MealSlot,
): PlannedMeal | undefined {
  return plan
    .find((day) => day.date === date)
    ?.meals.find((meal) => meal.slot === slot);
}

export function weekDates(weekStart: string) {
  return Array.from({ length: 7 }, (_, index) =>
    addLocalDays(weekStart, index),
  );
}

export type FreeSlot = { date: string; slot: MealSlot };

/** Empty slots in chronological order, never before `from`. */
export function freeSlots(
  plan: readonly PlannedDay[],
  dates: readonly string[],
  slots: readonly MealSlot[],
  from?: string,
): FreeSlot[] {
  const ordered = ALL_MEAL_SLOTS.filter((slot) => slots.includes(slot));
  return dates
    .filter((date) => !from || date >= from)
    .flatMap((date) =>
      ordered
        .filter((slot) => !plannedMealAt(plan, date, slot))
        .map((slot) => ({ date, slot })),
    );
}

/** Servings the person usually plans, so suggestions match their household. */
export function preferredServings(
  plan: readonly PlannedDay[],
  fallback: number,
) {
  const counts = new Map<number, number>();
  for (const day of plan.slice(-28))
    for (const meal of day.meals)
      counts.set(meal.servings, (counts.get(meal.servings) ?? 0) + 1);
  let best = fallback;
  let bestCount = 0;
  for (const [servings, count] of counts)
    if (count > bestCount || (count === bestCount && servings < best)) {
      best = servings;
      bestCount = count;
    }
  return Math.min(1_000, Math.max(1, Math.round(best)));
}

const normalizeTag = (tag: string) => tag.trim().toLocaleLowerCase('de-DE');
const isBreakfastRecipe = (recipe: Recipe) =>
  recipe.tags.some((tag) => normalizeTag(tag) === 'frühstück');

/**
 * Recipes that fit a slot: breakfast stays breakfast, dinners stay dinners.
 * Without breakfast recipes nothing is suggested; a casserole at 7 am would
 * cost more trust than an empty slot.
 */
export function recipesForSlot(recipes: readonly Recipe[], slot: MealSlot) {
  return recipes.filter(
    (recipe) => isBreakfastRecipe(recipe) === (slot === 'Frühstück'),
  );
}

const DAY_MS = 86_400_000;

/**
 * Candidates for a slot, best first. Favorites rank higher; recipes planned
 * close to the date rank lower so the week stays varied. `random` only breaks
 * near-ties, which keeps suggestions fresh without feeling arbitrary.
 */
/** Extra points for a recipe, e.g. for using up leftovers. */
export type RecipeBonus = (
  recipe: Recipe,
  claimed: ReadonlySet<string>,
) => { score: number; claims: string[] };

export function rankRecipesForSlot({
  recipes,
  plan,
  date,
  slot,
  exclude = [],
  random = Math.random,
  bonus,
  claimed = new Set(),
}: {
  recipes: readonly Recipe[];
  plan: readonly PlannedDay[];
  date: string;
  slot: MealSlot;
  exclude?: readonly string[];
  random?: () => number;
  bonus?: RecipeBonus;
  claimed?: ReadonlySet<string>;
}): Recipe[] {
  const target = parseLocalDate(date).getTime();
  const excluded = new Set(exclude);
  const lastUse = new Map<string, number>();
  for (const day of plan) {
    const distance = Math.abs(parseLocalDate(day.date).getTime() - target);
    const days = Math.round(distance / DAY_MS);
    if (days > 21) continue;
    for (const meal of day.meals) {
      const known = lastUse.get(meal.recipeId);
      if (known === undefined || days < known) lastUse.set(meal.recipeId, days);
    }
  }
  return recipesForSlot(recipes, slot)
    .filter((recipe) => !excluded.has(recipe.id))
    .map((recipe) => {
      const used = lastUse.get(recipe.id);
      const recency = used === undefined ? 0 : used <= 6 ? -6 : -2;
      const score =
        (recipe.favorite ? 2 : 0) +
        recency +
        (bonus?.(recipe, claimed).score ?? 0) +
        random() * 2.5;
      return { recipe, score };
    })
    .sort((left, right) => right.score - left.score)
    .map((entry) => entry.recipe);
}

export type PlanProposal = FreeSlot & { recipeId: string };

/** One distinct suggestion per free slot, skipping slots without a fit. */
export function proposeMeals({
  recipes,
  plan,
  targets,
  random = Math.random,
  bonus,
}: {
  recipes: readonly Recipe[];
  plan: readonly PlannedDay[];
  targets: readonly FreeSlot[];
  random?: () => number;
  bonus?: RecipeBonus;
}): PlanProposal[] {
  const used: string[] = [];
  const proposals: PlanProposal[] = [];
  // A leftover is used up by the first recipe that takes it.
  const claimed = new Set<string>();
  for (const target of targets) {
    const ranked = rankRecipesForSlot({
      recipes,
      plan,
      ...target,
      exclude: used,
      random,
      bonus,
      claimed,
    });
    // Small collections may need to repeat a recipe rather than leave gaps.
    const recipe =
      ranked[0] ?? rankRecipesForSlot({ recipes, plan, ...target, random })[0];
    if (!recipe) continue;
    for (const claim of bonus?.(recipe, claimed).claims ?? [])
      claimed.add(claim);
    used.push(recipe.id);
    proposals.push({ ...target, recipeId: recipe.id });
  }
  return proposals;
}

export type PlanChange = {
  date: string;
  slot: MealSlot;
  before?: PlannedMeal;
  after?: PlannedMeal;
};

const sameMeal = (left?: PlannedMeal, right?: PlannedMeal) =>
  left?.recipeId === right?.recipeId &&
  left?.servings === right?.servings &&
  left?.trackedServings === right?.trackedServings;

function setMeal(
  plan: readonly PlannedDay[],
  date: string,
  slot: MealSlot,
  meal: PlannedMeal | undefined,
): PlannedDay[] {
  const existing = plan.find((day) => day.date === date);
  const meals = [
    ...(existing?.meals ?? []).filter((entry) => entry.slot !== slot),
    ...(meal ? [meal] : []),
  ];
  const others = plan.filter((day) => day.date !== date);
  return (meals.length ? [...others, { date, meals }] : others).sort(
    (left, right) => left.date.localeCompare(right.date),
  );
}

/** Applies meal changes and records what is needed to revert them. */
export function applyPlanChanges(
  plan: readonly PlannedDay[],
  changes: ReadonlyArray<{
    date: string;
    slot: MealSlot;
    meal?: PlannedMeal;
  }>,
): { plan: PlannedDay[]; changes: PlanChange[] } {
  let next = [...plan];
  const recorded: PlanChange[] = [];
  for (const change of changes) {
    const before = plannedMealAt(next, change.date, change.slot);
    const after = change.meal
      ? { ...change.meal, slot: change.slot }
      : undefined;
    if (sameMeal(before, after)) continue;
    next = setMeal(next, change.date, change.slot, after);
    recorded.push({ date: change.date, slot: change.slot, before, after });
  }
  return { plan: next, changes: recorded };
}

/**
 * Reverts recorded changes. Slots edited again in the meantime are left alone,
 * so undo never overwrites a newer decision.
 */
export function revertPlanChanges(
  plan: readonly PlannedDay[],
  changes: readonly PlanChange[],
  existingRecipeIds?: ReadonlySet<string>,
): PlannedDay[] {
  let next = [...plan];
  for (const change of [...changes].reverse()) {
    const current = plannedMealAt(next, change.date, change.slot);
    if (!sameMeal(current, change.after)) continue;
    // A recipe deleted since then cannot be planned again.
    if (
      change.before &&
      existingRecipeIds &&
      !existingRecipeIds.has(change.before.recipeId)
    )
      continue;
    next = setMeal(next, change.date, change.slot, change.before);
  }
  return next;
}

/** Deterministic pseudo-random numbers, so suggestions stay put between renders. */
export function seededRandom(seed: string) {
  let state = 2_166_136_261;
  for (const char of seed)
    state = Math.imul(state ^ char.charCodeAt(0), 16_777_619);
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}
