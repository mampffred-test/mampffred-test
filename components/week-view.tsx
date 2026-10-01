/* oxlint-disable next/no-img-element */
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CookingPot,
  History,
  Clock3,
  Leaf,
  Plus,
  Settings,
  ShoppingCart,
  Sparkles,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import {
  addLocalDays,
  parseLocalDate,
  startOfLocalWeek,
  todayLocal,
} from '@/lib/local-date';
import {
  freeSlots,
  plannedMealAt,
  rankRecipesForSlot,
  recipesForSlot,
  seededRandom,
  slotForTime,
  weekDates,
} from '@/lib/meal-planning';
import { getEnabledMealSlots, visibleMealPlan } from '@/lib/meal-slots';
import type {
  AppData,
  MealSlot,
  PlannedDay,
  PlannedMeal,
  Recipe,
} from '@/lib/model';
import {
  aggregateNutritionDay,
  aggregateNutritionWeek,
  proteinDailyGoal,
  suggestRecipesForWeek,
} from '@/lib/nutrition';
import { useRecipeNutrition } from './nutrition-context';
import { visibleRecipeTags } from '@/lib/recipe-filter';
import { IconButton } from './icon-button';
import {
  MealSlotIcon,
  isoWeekNumber,
  longDate,
  monthShort,
  shortDate,
  slotShortLabel,
  useHorizontalSwipe,
  weekLabel,
  weekdayLabel,
} from './plan-ui';
import { RecipeImage, assetUrl } from './recipe-image';

function ProgressRing({ value, total }: { value: number; total: number }) {
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const share = total ? Math.min(1, value / total) : 0;
  return (
    <span className="wk-ring" aria-hidden="true">
      <svg viewBox="0 0 56 56">
        <circle className="wk-ring-track" cx="28" cy="28" r={radius} />
        <circle
          className="wk-ring-value"
          cx="28"
          cy="28"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - share)}
        />
      </svg>
      <strong>{value}</strong>
    </span>
  );
}

type DayMeal = { slot: MealSlot; meal?: PlannedMeal; recipe?: Recipe };

function dayMeals(
  data: AppData,
  plan: PlannedDay[],
  date: string,
  slots: MealSlot[],
): DayMeal[] {
  return slots.map((slot) => {
    const meal = plannedMealAt(plan, date, slot);
    return {
      slot,
      meal,
      recipe: data.recipes.find((recipe) => recipe.id === meal?.recipeId),
    };
  });
}

/** An empty day opens the main meal; the planner can still switch it. */
const mainSlot = (slots: MealSlot[]) =>
  slots.includes('Abendessen') ? 'Abendessen' : slots[slots.length - 1];

/**
 * One card, one tap target: planned days open the day sheet with all
 * actions, empty upcoming days go straight to planning.
 */
function DayCard({
  data,
  plan,
  date,
  today,
  slots,
  imageUrls,
  index,
  onOpenDay,
  onAdd,
}: {
  data: AppData;
  plan: PlannedDay[];
  date: string;
  today: string;
  slots: MealSlot[];
  imageUrls: Record<string, string>;
  index: number;
  onOpenDay: (date: string) => void;
  onAdd: (date: string, slot: MealSlot) => void;
}) {
  const day = parseLocalDate(date);
  const isPast = date < today;
  const meals = dayMeals(data, plan, date, slots);
  const planned = meals.filter((entry) => entry.recipe && entry.meal);
  const missing = meals.filter((entry) => !entry.recipe);
  const multi = slots.length > 1;
  const weekend = day.getDay() === 0 || day.getDay() === 6;
  const opensPlanner = !planned.length && !isPast;
  return (
    <button
      type="button"
      className={`wk-day ${isPast ? 'is-past' : ''} ${planned.length ? '' : 'is-empty'} ${weekend ? 'is-weekend' : ''}`}
      style={{ '--wk-index': index } as React.CSSProperties}
      onClick={() =>
        opensPlanner ? onAdd(date, mainSlot(slots)) : onOpenDay(date)
      }
      aria-label={`${longDate.format(day)}: ${
        planned.length
          ? `${planned.map((entry) => entry.recipe!.name).join(', ')}. Tag öffnen`
          : isPast
            ? 'nichts geplant. Tag öffnen'
            : 'Mahlzeit planen'
      }`}
    >
      <span className="wk-date" aria-hidden="true">
        <small>{weekdayLabel(day)}</small>
        <strong>{day.getDate()}.</strong>
        <small>{monthShort.format(day)}</small>
      </span>
      <span className="wk-day-body" aria-hidden="true">
        {planned.map(({ slot, meal, recipe }) => (
          <span className="wk-meal" key={slot}>
            <RecipeImage
              recipe={recipe!}
              imageUrls={imageUrls}
              className="wk-thumb"
              thumbnail
              cover
            />
            <span className="wk-meal-copy">
              <strong>{recipe!.name}</strong>
              <small>
                {multi && <span className="wk-slot-chip">{slot}</span>}
                <span>
                  <Users size={13} /> {meal!.servings}
                </span>
                <span>
                  <Clock3 size={13} /> {recipe!.minutes} Min.
                </span>
              </small>
            </span>
          </span>
        ))}
        {!planned.length && (
          <span className="wk-meal is-empty">
            <span className="wk-empty-icon">
              {multi ? (
                <CookingPot size={18} />
              ) : (
                <MealSlotIcon slot={slots[0]} />
              )}
            </span>
            <span className="wk-meal-copy">
              <strong>
                {isPast ? 'Nichts geplant' : 'Noch nichts geplant'}
              </strong>
            </span>
          </span>
        )}
        {planned.length > 0 && missing.length > 0 && !isPast && (
          <span className="wk-missing">
            <Plus size={13} />
            {missing.map((entry) => slotShortLabel[entry.slot]).join(', ')} noch
            frei
          </span>
        )}
      </span>
      <span
        className={`wk-day-action ${opensPlanner ? 'is-add' : ''}`}
        aria-hidden="true"
      >
        {opensPlanner ? <Plus size={18} /> : <ChevronRight size={18} />}
      </span>
    </button>
  );
}

/** Today as a photo banner: the week's anchor, recognisable at a glance. */
function TodayBanner({
  data,
  plan,
  date,
  now,
  slots,
  imageUrls,
  onOpenDay,
  onAdd,
}: {
  data: AppData;
  plan: PlannedDay[];
  date: string;
  now: Date;
  slots: MealSlot[];
  imageUrls: Record<string, string>;
  onOpenDay: (date: string) => void;
  onAdd: (date: string, slot: MealSlot) => void;
}) {
  const day = parseLocalDate(date);
  const meals = dayMeals(data, plan, date, slots);
  const planned = meals.filter((entry) => entry.recipe && entry.meal);
  const missing = meals.filter((entry) => !entry.recipe);
  const timeSlot = slotForTime(now, slots);
  const featured =
    planned.find((entry) => entry.slot === timeSlot) ?? planned[0];
  const others = planned.filter((entry) => entry !== featured);
  return (
    <button
      type="button"
      className={`wk-today ${featured ? 'has-photo' : 'is-empty'}`}
      aria-current="date"
      onClick={() =>
        featured ? onOpenDay(date) : onAdd(date, mainSlot(slots))
      }
      aria-label={`Heute, ${longDate.format(day)}: ${
        featured
          ? `${planned.map((entry) => entry.recipe!.name).join(', ')}. Tag öffnen`
          : 'Mahlzeit planen'
      }`}
    >
      {featured ? (
        <RecipeImage
          recipe={featured.recipe!}
          imageUrls={imageUrls}
          className="wk-today-photo"
          cover
          eager
        />
      ) : (
        <span className="wk-today-pattern" aria-hidden="true" />
      )}
      <span className="wk-today-shade" aria-hidden="true" />
      <span className="wk-today-copy" aria-hidden="true">
        <span className="wk-today-chip">
          Heute · {weekdayLabel(day)} {day.getDate()}.
        </span>
        {featured ? (
          <>
            <strong>{featured.recipe!.name}</strong>
            <small>
              <span>
                <MealSlotIcon slot={featured.slot} size={14} /> {featured.slot}
              </span>
              <span>
                <Users size={14} /> {featured.meal!.servings}
              </span>
              <span>
                <Clock3 size={14} /> {featured.recipe!.minutes} Min.
              </span>
            </small>
            {(others.length > 0 || missing.length > 0) && (
              <span className="wk-today-more">
                {others.map((entry) => (
                  <em key={entry.slot}>
                    {slotShortLabel[entry.slot]}: {entry.recipe!.name}
                  </em>
                ))}
                {missing.length > 0 && (
                  <em>
                    <Plus size={12} />{' '}
                    {missing
                      .map((entry) => slotShortLabel[entry.slot])
                      .join(', ')}{' '}
                    frei
                  </em>
                )}
              </span>
            )}
          </>
        ) : (
          <>
            <strong>Heute noch leer</strong>
            <small>Tippe hier und plane in wenigen Sekunden.</small>
          </>
        )}
      </span>
      <span className="wk-today-action" aria-hidden="true">
        {featured ? <ChevronRight size={20} /> : <Plus size={22} />}
      </span>
    </button>
  );
}

/** Mo–So at a glance: full, partly planned or open. */
function WeekDots({
  data,
  plan,
  dates,
  today,
  slots,
}: {
  data: AppData;
  plan: PlannedDay[];
  dates: string[];
  today: string;
  slots: MealSlot[];
}) {
  return (
    <span className="wk-dots" aria-hidden="true">
      {dates.map((date) => {
        const count = dayMeals(data, plan, date, slots).filter(
          (entry) => entry.recipe,
        ).length;
        const state =
          count === slots.length ? 'is-full' : count ? 'is-partial' : '';
        return (
          <span
            key={date}
            className={`${state} ${date === today ? 'is-today' : ''}`}
          >
            <i />
            <small>{weekdayLabel(parseLocalDate(date)).slice(0, 2)}</small>
          </span>
        );
      })}
    </span>
  );
}

function WeekNutrition({
  data,
  weekStart,
  today,
  onNutritionSetup,
  onDismissNutrition,
  onEditRecipes,
  onOpenRecipe,
  plannedMealCount,
}: {
  data: AppData;
  weekStart: string;
  today: string;
  onNutritionSetup: () => void;
  onDismissNutrition: () => void;
  onEditRecipes: (recipes: Recipe[]) => void;
  onOpenRecipe: (recipe: Recipe) => void;
  plannedMealCount: number;
}) {
  const nutritionOf = useRecipeNutrition();
  if (!data.nutritionSettings.enabled) {
    if (!plannedMealCount || data.nutritionSettings.promptDismissed)
      return null;
    return (
      <section className="nutrition-card nutrition-opt-in wk-card">
        <div>
          <strong>Wie viel Protein steckt in deinem Plan?</strong>
          <p>
            Mampffred schätzt es aus deinen Zutaten – nur auf deinem Gerät. Eine
            grobe Planungshilfe, keine medizinische Bewertung.
          </p>
        </div>
        <div className="nutrition-opt-in-actions">
          <button type="button" onClick={onNutritionSetup}>
            Einschalten
          </button>
          <button type="button" onClick={onDismissNutrition}>
            Nicht jetzt
          </button>
        </div>
      </section>
    );
  }
  const weeklyNutrition = aggregateNutritionWeek(data, weekStart, nutritionOf);
  const protein = weeklyNutrition.nutrients.proteinG;
  const goal = proteinDailyGoal(data.nutritionSettings);
  const days = weekDates(weekStart).map((date) => {
    const day = aggregateNutritionDay(data, date, nutritionOf);
    return { date, meals: day.mealCount, protein: day.nutrients.proteinG };
  });
  const plannedDays = days.filter((day) => day.meals > 0);
  const completeDays = plannedDays.filter((day) => day.protein.value !== null);
  const average = completeDays.length
    ? completeDays.reduce((sum, day) => sum + (day.protein.value ?? 0), 0) /
      completeDays.length
    : undefined;
  const scaleMax = Math.max(
    goal ?? 0,
    ...completeDays.map((day) => day.protein.value ?? 0),
    1,
  );
  const suggestions =
    addLocalDays(weekStart, 6) < today
      ? []
      : suggestRecipesForWeek(data, weeklyNutrition, 3, nutritionOf).flatMap(
          (suggestion) => {
            const recipe = data.recipes.find(
              (item) => item.id === suggestion.recipeId,
            );
            return recipe ? [{ recipe, suggestion }] : [];
          },
        );
  const missingProteinRecipes = [
    ...new Map(
      weekDates(weekStart)
        .flatMap(
          (date) =>
            visibleMealPlan(data).find((day) => day.date === date)?.meals ?? [],
        )
        .flatMap((meal) => {
          const recipe = data.recipes.find((item) => item.id === meal.recipeId);
          return recipe && !nutritionOf(recipe)?.wholeRecipe.proteinG
            ? [[recipe.id, recipe] as const]
            : [];
        }),
    ).values(),
  ];
  const portions = data.nutritionSettings.defaultTrackedServings;
  return (
    <section
      className="wk-card nutrition-card"
      aria-labelledby="protein-plan-title"
    >
      <div className="nutrition-heading">
        <div>
          <strong id="protein-plan-title">Protein pro Tag</strong>
          <small>
            Für dich · {portions === 1 ? '1 Portion' : `${portions} Portionen`}{' '}
            je Mahlzeit
          </small>
        </div>
        <button type="button" onClick={onNutritionSetup}>
          Anpassen
        </button>
      </div>
      {protein.totalMeals === 0 ? (
        <p>Noch keine Mahlzeiten geplant.</p>
      ) : (
        <>
          <ol className="protein-days" aria-label="Protein je Tag">
            {days.map((day) => {
              const value = day.protein.value;
              const reached =
                goal !== undefined && value !== null && value >= goal;
              return (
                <li
                  key={day.date}
                  className={`${day.date === today ? 'is-today' : ''} ${reached ? 'is-reached' : ''}`}
                  aria-label={`${weekdayLabel(parseLocalDate(day.date))}: ${
                    day.meals === 0
                      ? 'nichts geplant'
                      : value === null
                        ? 'noch nicht einschätzbar'
                        : `ca. ${Math.round(value)} g`
                  }`}
                >
                  <span className="protein-bar" aria-hidden="true">
                    {goal !== undefined && (
                      <span
                        className="protein-goal-line"
                        style={{ bottom: `${(goal / scaleMax) * 100}%` }}
                      />
                    )}
                    <i
                      style={{
                        transform: `scaleY(${value === null ? 0 : Math.min(1, value / scaleMax)})`,
                      }}
                    />
                  </span>
                  <b aria-hidden="true">
                    {day.meals === 0
                      ? '–'
                      : value === null
                        ? '?'
                        : Math.round(value)}
                  </b>
                  <small aria-hidden="true">
                    {weekdayLabel(parseLocalDate(day.date)).slice(0, 2)}
                  </small>
                </li>
              );
            })}
          </ol>
          {average !== undefined ? (
            <p>
              Ø ca. <strong>{Math.round(average)} g</strong> an{' '}
              {completeDays.length === 1
                ? 'einem geplanten Tag'
                : `${completeDays.length} geplanten Tagen`}
              {goal !== undefined ? (
                <>
                  {' '}
                  · dein Ziel: <strong>{Math.round(goal)} g</strong>
                </>
              ) : (
                '. Lege unter „Anpassen“ ein Tagesziel fest.'
              )}
            </p>
          ) : null}
          {missingProteinRecipes.length > 0 && (
            <>
              <p>
                {missingProteinRecipes.length === 1
                  ? `„${missingProteinRecipes[0].name}“ ist noch nicht einschätzbar.`
                  : `${missingProteinRecipes.length} geplante Rezepte sind noch nicht einschätzbar.`}
              </p>
              <button
                type="button"
                className="nutrition-missing-action"
                onClick={() => onEditRecipes(missingProteinRecipes)}
              >
                Zutaten zuordnen
              </button>
            </>
          )}
        </>
      )}
      {suggestions.length > 0 && (
        <div className="nutrition-suggestions">
          <strong>Rezepte mit passend viel Protein</strong>
          {suggestions.map(({ recipe, suggestion }) => (
            <button
              type="button"
              key={recipe.id}
              onClick={() => onOpenRecipe(recipe)}
            >
              <span>{recipe.name}</span>
              <small>
                ca. {Math.round(suggestion.contributionPerServing)} g pro
                Portion ·{' '}
                {suggestion.quality === 'estimated'
                  ? 'aus Zutaten geschätzt'
                  : 'eigene Angabe'}
              </small>
              <ChevronRight size={17} />
            </button>
          ))}
        </div>
      )}
      <small className="nutrition-disclaimer">
        Nur geplante Mahlzeiten. Snacks, Getränke und Ungeplantes fehlen – eine
        grobe Planungshilfe, keine Ernährungsberatung.
      </small>
    </section>
  );
}

export function WeekView({
  data,
  now,
  imageUrls,
  weekStart,
  onWeekStart,
  onAdd,
  onFillWeek,
  onPlanIdea,
  onCreateShopping,
  onNutritionSetup,
  onDismissNutrition,
  onOpenRecipe,
  onEditRecipes,
  onOpenDay,
  onSettings,
}: {
  data: AppData;
  now: Date;
  imageUrls: Record<string, string>;
  weekStart: string;
  onWeekStart: (date: string) => void;
  onAdd: (date: string, slot: MealSlot) => void;
  onFillWeek: () => void;
  onPlanIdea: (recipe: Recipe) => void;
  onCreateShopping: () => void;
  onNutritionSetup: () => void;
  onDismissNutrition: () => void;
  onOpenRecipe: (recipe: Recipe) => void;
  onEditRecipes: (recipes: Recipe[]) => void;
  onOpenDay: (date: string) => void;
  onSettings: () => void;
}) {
  const slots = getEnabledMealSlots(data);
  const plan = visibleMealPlan(data);
  const today = todayLocal(now);
  const currentWeek = startOfLocalWeek(now);
  const isCurrentWeek = weekStart === currentWeek;
  const dates = weekDates(weekStart);
  const first = parseLocalDate(dates[0]);
  const last = parseLocalDate(dates[6]);
  const [motion, setMotion] = useState<'none' | 'next' | 'previous'>('none');
  const [showPast, setShowPast] = useState(false);
  // In the running week, finished days fold away so today comes first.
  const pastDates = dates.filter((date) => date < today);
  const foldPast = pastDates.length > 0 && pastDates.length < dates.length;
  const pastMealCount = pastDates.reduce(
    (total, date) =>
      total + slots.filter((slot) => plannedMealAt(plan, date, slot)).length,
    0,
  );
  const visibleDates =
    foldPast && !showPast ? dates.filter((date) => date >= today) : dates;
  const totalSlots = dates.length * slots.length;
  const plannedMealCount = dates.reduce(
    (total, date) =>
      total + slots.filter((slot) => plannedMealAt(plan, date, slot)).length,
    0,
  );
  const openSlots = freeSlots(plan, dates, slots, today);
  const fillable = openSlots.filter(
    (entry) => recipesForSlot(data.recipes, entry.slot).length > 0,
  );
  const singleSlot = slots.length === 1 ? slots[0] : undefined;

  const ideas = (() => {
    const target = fillable.at(-1);
    if (!target) return [];
    // Seeded by week so the carousel does not reshuffle on every render.
    const plannedHere = new Set(
      dates.flatMap(
        (date) =>
          plan
            .find((day) => day.date === date)
            ?.meals.map((meal) => meal.recipeId) ?? [],
      ),
    );
    return rankRecipesForSlot({
      recipes: data.recipes,
      plan: data.plan,
      date: target.date,
      slot: target.slot,
      exclude: [...plannedHere],
      random: seededRandom(weekStart),
    }).slice(0, 8);
  })();

  function goToWeek(next: string) {
    if (next === weekStart) return;
    setMotion(next > weekStart ? 'next' : 'previous');
    onWeekStart(next);
  }
  const swipe = useHorizontalSwipe((direction) =>
    goToWeek(addLocalDays(weekStart, direction === 'next' ? 7 : -7)),
  );

  return (
    <div className="screen-content wk-view">
      <header className="wk-header">
        <div>
          <h1>Deine Woche</h1>
          <p>
            {shortDate.format(first)} – {shortDate.format(last)} · KW{' '}
            {isoWeekNumber(first)}
          </p>
        </div>
        <IconButton label="Einstellungen öffnen" onClick={onSettings}>
          <Settings size={23} />
        </IconButton>
      </header>

      <nav className="wk-nav" aria-label="Woche wechseln">
        <IconButton
          label="Vorherige Woche"
          onClick={() => goToWeek(addLocalDays(weekStart, -7))}
        >
          <ChevronLeft size={21} />
        </IconButton>
        <button
          type="button"
          className="wk-nav-label"
          onClick={() => goToWeek(currentWeek)}
          disabled={isCurrentWeek}
          aria-label={
            isCurrentWeek
              ? 'Aktuelle Woche wird angezeigt'
              : 'Zur aktuellen Woche wechseln'
          }
        >
          {weekLabel(weekStart, currentWeek)}
          {!isCurrentWeek && <small>Zurück zu heute</small>}
        </button>
        <IconButton
          label="Nächste Woche"
          onClick={() => goToWeek(addLocalDays(weekStart, 7))}
        >
          <ChevronRight size={21} />
        </IconButton>
      </nav>

      <div className="wk-swipe" {...swipe}>
        <div className="wk-hero-wrap">
          {/* The sprig rests on the card corner instead of floating in the header. */}
          <span className="wk-hero-leaves" aria-hidden="true">
            <img src={assetUrl('assets/basil-card-leaves.png')} alt="" />
          </span>
          <section
            className="wk-hero"
            aria-label="Wochenfortschritt"
            key={`progress-${weekStart}`}
          >
            <span className="wk-hero-glow" aria-hidden="true" />
            <div className="wk-hero-top">
              <ProgressRing value={plannedMealCount} total={totalSlots} />
              <div className="wk-progress-copy">
                <strong>
                  {plannedMealCount} von {totalSlots}{' '}
                  {singleSlot ?? (totalSlots === 1 ? 'Mahlzeit' : 'Mahlzeiten')}{' '}
                  geplant
                </strong>
                <small>
                  {plannedMealCount === totalSlots
                    ? 'Die Woche steht. Guten Appetit!'
                    : openSlots.length
                      ? `${openSlots.length} ${openSlots.length === 1 ? 'Platz ist' : 'Plätze sind'} noch frei.`
                      : 'Alle kommenden Tage sind geplant.'}
                </small>
              </div>
            </div>
            <div className="wk-hero-bottom">
              <WeekDots
                data={data}
                plan={plan}
                dates={dates}
                today={today}
                slots={slots}
              />
              {fillable.length > 0 && (
                <button type="button" className="wk-fill" onClick={onFillWeek}>
                  <Sparkles size={16} aria-hidden="true" /> Füllen
                </button>
              )}
            </div>
          </section>
        </div>

        <div className="wk-days" data-motion={motion} key={weekStart}>
          {foldPast && (
            <button
              type="button"
              className="wk-past-toggle"
              aria-expanded={showPast}
              onClick={() => setShowPast((value) => !value)}
            >
              <History size={17} aria-hidden="true" />
              <span>
                {pastDates.length === 1
                  ? 'Gestern'
                  : `${pastDates.length} vergangene Tage`}
                <small>
                  {pastMealCount === 1
                    ? '1 Mahlzeit'
                    : `${pastMealCount} Mahlzeiten`}
                </small>
              </span>
              <em>{showPast ? 'Ausblenden' : 'Anzeigen'}</em>
              <ChevronDown size={17} aria-hidden="true" />
            </button>
          )}
          {visibleDates.map((date, index) =>
            date === today ? (
              <TodayBanner
                key={date}
                data={data}
                plan={plan}
                date={date}
                now={now}
                slots={slots}
                imageUrls={imageUrls}
                onOpenDay={onOpenDay}
                onAdd={onAdd}
              />
            ) : (
              <DayCard
                key={date}
                data={data}
                plan={plan}
                date={date}
                today={today}
                slots={slots}
                imageUrls={imageUrls}
                index={index}
                onOpenDay={onOpenDay}
                onAdd={onAdd}
              />
            ),
          )}
        </div>
      </div>

      {ideas.length > 0 && (
        <section className="wk-ideas" aria-labelledby="wk-ideas-title">
          <div className="wk-section-heading">
            <h2 id="wk-ideas-title">Ideen für diese Woche</h2>
            <small>Antippen zum Einplanen</small>
          </div>
          <div className="wk-ideas-track" data-own-swipe>
            {ideas.map((recipe) => (
              <button
                type="button"
                key={recipe.id}
                className="wk-idea"
                onClick={() => onPlanIdea(recipe)}
                aria-label={`${recipe.name} einplanen`}
              >
                <RecipeImage
                  recipe={recipe}
                  imageUrls={imageUrls}
                  className="wk-idea-image"
                  thumbnail
                  cover
                />
                <strong>{recipe.name}</strong>
                <small>
                  <Clock3 size={13} aria-hidden="true" /> {recipe.minutes} Min.
                  {visibleRecipeTags(recipe).some(
                    (tag) => tag === 'Vegetarisch' || tag === 'Vegan',
                  ) && <Leaf size={13} aria-label="vegetarisch" />}
                </small>
                <span className="wk-idea-add" aria-hidden="true">
                  <Plus size={16} />
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <WeekNutrition
        data={data}
        weekStart={weekStart}
        today={today}
        onNutritionSetup={onNutritionSetup}
        onDismissNutrition={onDismissNutrition}
        onEditRecipes={onEditRecipes}
        onOpenRecipe={onOpenRecipe}
        plannedMealCount={plannedMealCount}
      />

      {plannedMealCount > 0 ? (
        <button
          type="button"
          className="td-primary wk-shopping"
          onClick={onCreateShopping}
        >
          <ShoppingCart size={19} aria-hidden="true" />
          <span>Einkaufsliste erstellen</span>
          <ChevronRight size={19} aria-hidden="true" />
        </button>
      ) : (
        fillable.length > 0 && (
          <button
            type="button"
            className="td-primary wk-shopping"
            onClick={onFillWeek}
          >
            <CalendarDays size={19} aria-hidden="true" />
            <span>Woche planen</span>
            <ChevronRight size={19} aria-hidden="true" />
          </button>
        )
      )}
    </div>
  );
}
