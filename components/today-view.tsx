/* oxlint-disable next/no-img-element, jsx-a11y/prefer-tag-over-role */
import {
  BookOpen,
  CalendarDays,
  ChevronRight,
  Clock3,
  CloudAlert,
  Plus,
  RefreshCw,
  Dumbbell,
  Settings,
  ShieldCheck,
  Shuffle,
  Trash2,
  Users,
  Utensils,
} from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { getBackupReminder } from '@/lib/backup-reminder';
import { addLocalDays, parseLocalDate, todayLocal } from '@/lib/local-date';
import {
  plannedMealAt,
  rankRecipesForSlot,
  seededRandom,
  slotForTime,
} from '@/lib/meal-planning';
import { getEnabledMealSlots, visibleMealPlan } from '@/lib/meal-slots';
import type { AppData, MealSlot, PlannedDay, Recipe } from '@/lib/model';
import { visibleRecipeTags } from '@/lib/recipe-filter';
import { aggregateNutritionDay, proteinDailyGoal } from '@/lib/nutrition';
import { useRecipeNutrition } from './nutrition-context';
import { IconButton } from './icon-button';
import {
  MealSlotIcon,
  TagIcon,
  clockTime,
  longDate,
  portions,
  shortDate,
  slotShortLabel,
} from './plan-ui';
import { RecipeImage, assetUrl } from './recipe-image';

/** One carousel page, including the gap to the next panel. */
function pageWidth(carousel: HTMLElement) {
  const panel = carousel.firstElementChild as HTMLElement | null;
  return (
    (panel?.offsetWidth ?? carousel.clientWidth) +
    (parseFloat(getComputedStyle(carousel).columnGap) || 0)
  );
}

function greeting(now: Date) {
  const hour = now.getHours();
  if (hour < 11) return { text: 'Guten Morgen!', icon: '☀️' };
  if (hour < 18) return { text: 'Guten Tag!', icon: '🌿' };
  return { text: 'Guten Abend!', icon: '🌙' };
}

/** Standard recipes alone are restorable; anything else deserves a backup. */
function hasPersonalData(data: AppData) {
  return (
    data.plan.length > 0 ||
    data.shopping.length > 0 ||
    data.recipes.some((recipe) => !recipe.shareId.startsWith('sample-'))
  );
}

function BackupNotice({
  data,
  now,
  placement,
  onBackup,
}: {
  data: AppData;
  now: Date;
  /** Alerts belong on top; a calm confirmation belongs at the end. */
  placement: 'top' | 'bottom';
  onBackup: () => void;
}) {
  const reminder = getBackupReminder(data.lastBackup, now);
  const lastBackup = data.lastBackup ? new Date(data.lastBackup) : undefined;
  if (reminder.kind === 'recent' && lastBackup) {
    if (placement !== 'bottom') return null;
    const day =
      todayLocal(lastBackup) === todayLocal(now)
        ? 'heute'
        : shortDate.format(lastBackup);
    return (
      <button type="button" className="td-backup-ok" onClick={onBackup}>
        <ShieldCheck size={16} aria-hidden="true" />
        <span>
          Gesichert {day}, {clockTime.format(lastBackup)} Uhr
        </span>
        <em>Neue Sicherung</em>
      </button>
    );
  }
  if (placement !== 'top') return null;
  if (reminder.kind === 'missing' && !hasPersonalData(data)) return null;
  return (
    <button
      type="button"
      className={`td-backup-alert is-${reminder.kind}`}
      onClick={onBackup}
    >
      <span className="td-backup-icon" aria-hidden="true">
        <CloudAlert size={24} />
      </span>
      <span className="td-backup-copy">
        <strong>
          {reminder.kind === 'stale'
            ? `Zuletzt gesichert: vor ${reminder.ageDays} Tagen`
            : 'Noch keine Sicherung'}
        </strong>
        <small>
          {reminder.kind === 'stale'
            ? 'Lade jetzt eine neue Sicherungsdatei auf dein Gerät.'
            : 'Eine Sicherungsdatei schützt deine Rezepte und Pläne.'}
        </small>
      </span>
      <span className="td-backup-mascot" aria-hidden="true">
        <img
          src={assetUrl('assets/mampffred-mascot-small.png')}
          alt=""
          width={58}
          height={64}
          decoding="async"
        />
      </span>
      <ChevronRight size={18} aria-hidden="true" className="td-chevron" />
    </button>
  );
}

function SlotSwitch({
  slots,
  active,
  planned,
  switchRef,
  onChange,
}: {
  slots: MealSlot[];
  active: MealSlot;
  planned: ReadonlySet<MealSlot>;
  switchRef: React.Ref<HTMLDivElement>;
  onChange: (slot: MealSlot) => void;
}) {
  return (
    <div
      ref={switchRef}
      className="td-slots"
      role="group"
      aria-label="Mahlzeit auswählen"
      style={
        {
          '--slot-count': slots.length,
          '--slot-pos': slots.indexOf(active),
        } as React.CSSProperties
      }
    >
      <span className="td-slot-indicator" aria-hidden="true" />
      {slots.map((slot) => (
        <button
          type="button"
          key={slot}
          className={slot === active ? 'is-active' : ''}
          aria-pressed={slot === active}
          aria-label={`${slot}${planned.has(slot) ? ', geplant' : ', noch frei'}`}
          onClick={() => onChange(slot)}
        >
          <MealSlotIcon slot={slot} size={18} />
          <span>{slotShortLabel[slot]}</span>
          {planned.has(slot) && <i aria-hidden="true" />}
        </button>
      ))}
    </div>
  );
}

function PlannedHero({
  slot,
  recipe,
  servings,
  imageUrls,
  onOpen,
  onSwap,
  onRemove,
}: {
  slot: MealSlot;
  recipe: Recipe;
  servings: number;
  imageUrls: Record<string, string>;
  onOpen: () => void;
  onSwap: () => void;
  onRemove: () => void;
}) {
  const tag = visibleRecipeTags(recipe)[0];
  return (
    <article className="td-hero">
      <button
        type="button"
        className="td-hero-media"
        onClick={onOpen}
        aria-label={`Rezept ansehen: ${recipe.name}`}
      >
        <RecipeImage
          recipe={recipe}
          imageUrls={imageUrls}
          className="td-hero-image"
          cover
          eager
        />
        <span className="td-hero-badge">
          <MealSlotIcon slot={slot} size={15} />
          {slot}
        </span>
      </button>
      <div className="td-hero-body">
        <svg
          className="td-wave"
          viewBox="0 0 400 36"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path d="M0 36V20C70 2 150 2 215 16s130 16 185-6v26Z" />
        </svg>
        <h2>{recipe.name}</h2>
        <div className="td-hero-meta">
          <span>
            <Users size={16} aria-hidden="true" /> {portions(servings)}
          </span>
          <span>
            <Clock3 size={16} aria-hidden="true" /> {recipe.minutes} Min.
          </span>
          {tag && (
            <span className="td-tag">
              <TagIcon tag={tag} /> {tag}
            </span>
          )}
        </div>
        <button type="button" className="td-primary" onClick={onOpen}>
          <Utensils size={19} aria-hidden="true" />
          <span>Rezept ansehen</span>
          <ChevronRight size={19} aria-hidden="true" />
        </button>
        <div className="td-hero-actions">
          <button type="button" onClick={onSwap}>
            <RefreshCw size={17} aria-hidden="true" /> Tauschen
          </button>
          <button type="button" className="is-danger" onClick={onRemove}>
            <Trash2 size={17} aria-hidden="true" /> Entfernen
          </button>
        </div>
      </div>
    </article>
  );
}

const sceneLines = [
  'Hunger!',
  'Was gibt’s denn heute?',
  'Mmh … wie wäre das?',
  'Noch eine Idee?',
];

/**
 * Mampffred waits at the table in front of an empty plate (illustration with
 * transparent background, 60 KB). Tapping him serves another suggestion.
 */
function EmptyPlateScene({
  line,
  onTap,
}: {
  line: number;
  onTap?: () => void;
}) {
  return (
    <button
      type="button"
      className="td-scene"
      onClick={onTap}
      disabled={!onTap}
      aria-label="Mampffred antippen für eine andere Idee"
    >
      <span className="td-scene-glow" aria-hidden="true" />
      <span className="td-scene-sparkles" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </span>
      <span className="td-scene-art" key={`art-${line}`} aria-hidden="true">
        <img
          src={assetUrl('assets/mampffred-empty-plate.webp')}
          alt=""
          width={900}
          height={600}
          decoding="async"
        />
      </span>
      <span className="td-scene-bubble" key={`bubble-${line}`}>
        {sceneLines[line % sceneLines.length]}
      </span>
    </button>
  );
}

function EmptyHero({
  slot,
  suggestion,
  imageUrls,
  shuffle,
  onShuffle,
  onPlanSuggestion,
  onOpenSuggestion,
  onChoose,
}: {
  slot: MealSlot;
  suggestion?: Recipe;
  imageUrls: Record<string, string>;
  shuffle: number;
  onShuffle: () => void;
  onPlanSuggestion: (recipe: Recipe) => void;
  onOpenSuggestion: (recipe: Recipe) => void;
  onChoose: () => void;
}) {
  return (
    <article className="td-hero is-empty">
      <EmptyPlateScene
        line={shuffle}
        onTap={suggestion ? onShuffle : undefined}
      />
      <div className="td-hero-body">
        <svg
          className="td-wave"
          viewBox="0 0 400 36"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path d="M0 36V20C70 2 150 2 215 16s130 16 185-6v26Z" />
        </svg>
        <h2>Noch kein {slot} geplant</h2>
        {suggestion ? (
          <>
            <p>Mampffreds Vorschlag für dich:</p>
            <div className="td-suggestion" key={suggestion.id}>
              <button
                type="button"
                className="td-suggestion-main"
                onClick={() => onOpenSuggestion(suggestion)}
                aria-label={`Vorschlag ansehen: ${suggestion.name}`}
              >
                <RecipeImage
                  recipe={suggestion}
                  imageUrls={imageUrls}
                  className="td-suggestion-image"
                  thumbnail
                  cover
                />
                <span>
                  <strong>{suggestion.name}</strong>
                  <small>
                    <Clock3 size={13} aria-hidden="true" /> {suggestion.minutes}{' '}
                    Min.
                    {suggestion.favorite ? ' · Favorit' : ''}
                  </small>
                </span>
              </button>
              <button
                type="button"
                className="td-shuffle"
                onClick={onShuffle}
                aria-label="Anderen Vorschlag zeigen"
              >
                <Shuffle size={19} key={shuffle} />
              </button>
            </div>
            <button
              type="button"
              className="td-primary"
              onClick={() => onPlanSuggestion(suggestion)}
            >
              <Plus size={19} aria-hidden="true" />
              <span>Vorschlag einplanen</span>
              <ChevronRight size={19} aria-hidden="true" />
            </button>
            <button type="button" className="td-secondary" onClick={onChoose}>
              <BookOpen size={17} aria-hidden="true" /> Selbst aus Rezepten
              wählen
            </button>
          </>
        ) : (
          <>
            <p>
              {slot === 'Frühstück'
                ? 'Für Vorschläge braucht Mampffred Rezepte mit dem Stichwort „Frühstück“.'
                : 'Wähle ein Rezept aus deiner Sammlung.'}
            </p>
            <button type="button" className="td-primary" onClick={onChoose}>
              <Plus size={19} aria-hidden="true" />
              <span>Mahlzeit auswählen</span>
              <ChevronRight size={19} aria-hidden="true" />
            </button>
          </>
        )}
      </div>
    </article>
  );
}

function SlotPanel({
  data,
  plan,
  today,
  slot,
  active,
  imageUrls,
  onRecipe,
  onPlan,
  onRemove,
  onPlanSuggestion,
}: {
  data: AppData;
  plan: PlannedDay[];
  today: string;
  slot: MealSlot;
  active: boolean;
  imageUrls: Record<string, string>;
  onRecipe: (recipe: Recipe) => void;
  onPlan: (slot: MealSlot, date: string) => void;
  onRemove: (slot: MealSlot, date: string) => void;
  onPlanSuggestion: (slot: MealSlot, date: string, recipe: Recipe) => void;
}) {
  const [shuffle, setShuffle] = useState(0);
  const meal = plannedMealAt(plan, today, slot);
  const recipe = data.recipes.find((entry) => entry.id === meal?.recipeId);
  const suggestions = useMemo(
    () =>
      recipe
        ? []
        : rankRecipesForSlot({
            recipes: data.recipes,
            plan: data.plan,
            date: today,
            slot,
            random: seededRandom(`${today}|${slot}`),
          }),
    [recipe, data.recipes, data.plan, today, slot],
  );
  const suggestion = suggestions.length
    ? suggestions[shuffle % suggestions.length]
    : undefined;
  return (
    <section
      className={`td-panel ${active ? 'is-active' : ''}`}
      aria-label={slot}
      aria-hidden={!active || undefined}
      inert={!active || undefined}
    >
      {recipe && meal ? (
        <PlannedHero
          slot={slot}
          recipe={recipe}
          servings={meal.servings}
          imageUrls={imageUrls}
          onOpen={() => onRecipe(recipe)}
          onSwap={() => onPlan(slot, today)}
          onRemove={() => onRemove(slot, today)}
        />
      ) : (
        <EmptyHero
          slot={slot}
          suggestion={suggestion}
          imageUrls={imageUrls}
          shuffle={shuffle}
          onShuffle={() => setShuffle((value) => value + 1)}
          onPlanSuggestion={(entry) => onPlanSuggestion(slot, today, entry)}
          onOpenSuggestion={onRecipe}
          onChoose={() => onPlan(slot, today)}
        />
      )}
    </section>
  );
}

function TomorrowPreview({
  data,
  date,
  slots,
  imageUrls,
  onRecipe,
  onPlan,
  onOpenWeek,
}: {
  data: AppData;
  date: string;
  slots: MealSlot[];
  imageUrls: Record<string, string>;
  onRecipe: (recipe: Recipe) => void;
  onPlan: (slot: MealSlot, date: string) => void;
  onOpenWeek: () => void;
}) {
  const plan = visibleMealPlan(data);
  return (
    <section className="td-next" aria-labelledby="td-next-title">
      <div className="td-next-heading">
        <h2 id="td-next-title">
          Morgen <small>{longDate.format(parseLocalDate(date))}</small>
        </h2>
        <button type="button" onClick={onOpenWeek}>
          <CalendarDays size={16} aria-hidden="true" /> Woche
        </button>
      </div>
      <div className="td-next-list">
        {slots.map((slot) => {
          const meal = plannedMealAt(plan, date, slot);
          const recipe = data.recipes.find(
            (entry) => entry.id === meal?.recipeId,
          );
          return recipe && meal ? (
            <button
              type="button"
              key={slot}
              className="td-next-row"
              onClick={() => onRecipe(recipe)}
            >
              <RecipeImage
                recipe={recipe}
                imageUrls={imageUrls}
                className="td-next-image"
                thumbnail
                cover
              />
              <span>
                <small>{slot}</small>
                <strong>{recipe.name}</strong>
              </span>
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              key={slot}
              className="td-next-row is-empty"
              onClick={() => onPlan(slot, date)}
            >
              <span className="td-next-empty-icon" aria-hidden="true">
                <MealSlotIcon slot={slot} size={18} />
              </span>
              <span>
                <small>{slot}</small>
                <strong>Noch frei</strong>
              </span>
              <span className="td-next-plus" aria-hidden="true">
                <Plus size={17} />
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** Planned protein for today, for the person (not the whole household). */
function TodayProtein({ data, today }: { data: AppData; today: string }) {
  const nutritionOf = useRecipeNutrition();
  const settings = data.nutritionSettings;
  if (!settings.enabled || !settings.automaticEstimates) return null;
  const day = aggregateNutritionDay(data, today, nutritionOf);
  if (!day.mealCount) return null;
  const protein = day.nutrients.proteinG;
  const goal = proteinDailyGoal(settings);
  const value = protein.value;
  const share = value !== null && goal ? Math.min(1, value / goal) : 0;
  return (
    <section className="td-protein" aria-label="Protein heute">
      <span className="td-protein-icon" aria-hidden="true">
        <Dumbbell size={18} />
      </span>
      <div>
        <strong>
          {value === null
            ? 'Protein heute noch offen'
            : `ca. ${Math.round(value)} g Protein heute`}
        </strong>
        <small>
          {value === null
            ? 'Für eine Mahlzeit fehlen noch Angaben.'
            : goal
              ? value >= goal
                ? `Dein Ziel von ${Math.round(goal)} g ist mit dem Plan erreicht.`
                : `Noch ca. ${Math.round(goal - value)} g bis zu deinem Ziel von ${Math.round(goal)} g.`
              : `Aus ${day.mealCount === 1 ? 'einer geplanten Mahlzeit' : `${day.mealCount} geplanten Mahlzeiten`}.`}
        </small>
        {goal && value !== null ? (
          <span className="td-protein-bar" aria-hidden="true">
            <i style={{ transform: `scaleX(${share})` }} />
          </span>
        ) : null}
      </div>
    </section>
  );
}

export function TodayView({
  data,
  now,
  imageUrls,
  onRecipe,
  onSettings,
  onBackup,
  onPlan,
  onRemove,
  onPlanSuggestion,
  onOpenWeek,
  onAddRecipe,
  onAddSamples,
}: {
  data: AppData;
  now: Date;
  imageUrls: Record<string, string>;
  onRecipe: (recipe: Recipe) => void;
  onSettings: () => void;
  onBackup: () => void;
  onPlan: (slot: MealSlot, date: string) => void;
  onRemove: (slot: MealSlot, date: string) => void;
  onPlanSuggestion: (slot: MealSlot, date: string, recipe: Recipe) => void;
  onOpenWeek: () => void;
  onAddRecipe: () => void;
  onAddSamples: () => void;
}) {
  const slots = getEnabledMealSlots(data);
  const plan = visibleMealPlan(data);
  const today = todayLocal(now);
  const tomorrow = addLocalDays(today, 1);
  const timeSlot = slotForTime(now, slots);
  const [active, setActive] = useState(timeSlot);
  const slot = slots.includes(active) ? active : timeSlot;
  const carouselRef = useRef<HTMLDivElement>(null);
  const switchRef = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  const { text, icon } = greeting(now);
  const plannedSlots = new Set(
    slots.filter((entry) => plannedMealAt(plan, today, entry)),
  );
  const hasRecipes = data.recipes.length > 0;
  const slotKey = slots.join('|');

  // Open on the meal that fits the time of day, without animation.
  useLayoutEffect(() => {
    const carousel = carouselRef.current;
    if (!carousel) return;
    carousel.scrollLeft =
      slotKey.split('|').indexOf(slot) * pageWidth(carousel);
    // Only when the carousel appears or the enabled meals change.
    // oxlint-disable-next-line react/exhaustive-deps
  }, [slotKey, hasRecipes]);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  function onCarouselScroll() {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const carousel = carouselRef.current;
      if (!carousel) return;
      const position = carousel.scrollLeft / pageWidth(carousel);
      // The pill follows the finger continuously, like a native tab bar.
      switchRef.current?.style.setProperty('--slot-pos', String(position));
      const next = slots[Math.round(position)];
      if (next && next !== slot) setActive(next);
    });
  }
  function selectSlot(next: MealSlot) {
    const carousel = carouselRef.current;
    if (!carousel) return;
    carousel.scrollTo({
      left: slots.indexOf(next) * pageWidth(carousel),
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth',
    });
  }

  return (
    <div className="screen-content td-view">
      <header className="td-header">
        <div>
          <h1>
            {text}{' '}
            <span className="td-greeting-icon" aria-hidden="true">
              {icon}
            </span>
          </h1>
          <p>{longDate.format(now)}</p>
        </div>
        <IconButton label="Einstellungen öffnen" onClick={onSettings}>
          <Settings size={23} />
        </IconButton>
      </header>

      <BackupNotice data={data} now={now} placement="top" onBackup={onBackup} />

      {!hasRecipes ? (
        <div className="td-hero is-empty td-first-run">
          <img
            className="td-first-mascot"
            src={assetUrl('assets/mampffred-mascot-small.png')}
            width={150}
            height={164}
            alt="Mampffred, der Brokkoli-Koch"
          />
          <div className="td-hero-body">
            <h2>Deine Rezeptsammlung ist noch leer.</h2>
            <p>
              Lege dein erstes Rezept an oder probiere unverbindlich unsere
              Beispiele aus.
            </p>
            <button type="button" className="td-primary" onClick={onAddRecipe}>
              <Plus size={19} aria-hidden="true" />
              <span>Erstes Rezept anlegen</span>
              <ChevronRight size={19} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="td-secondary"
              onClick={onAddSamples}
            >
              Beispielrezepte ausprobieren
            </button>
          </div>
        </div>
      ) : (
        <>
          {slots.length > 1 && (
            <>
              <SlotSwitch
                slots={slots}
                active={slot}
                planned={plannedSlots}
                switchRef={switchRef}
                onChange={selectSlot}
              />
              <p className="td-slot-summary" aria-live="polite">
                {plannedSlots.size === slots.length
                  ? 'Alle Mahlzeiten für heute stehen fest.'
                  : `${plannedSlots.size} von ${slots.length} Mahlzeiten für heute geplant`}
              </p>
            </>
          )}
          <div
            ref={carouselRef}
            className={`td-carousel ${slots.length > 1 ? 'is-swipeable' : ''}`}
            onScroll={slots.length > 1 ? onCarouselScroll : undefined}
          >
            {slots.map((entry) => (
              <SlotPanel
                key={entry}
                data={data}
                plan={plan}
                today={today}
                slot={entry}
                active={entry === slot}
                imageUrls={imageUrls}
                onRecipe={onRecipe}
                onPlan={onPlan}
                onRemove={onRemove}
                onPlanSuggestion={onPlanSuggestion}
              />
            ))}
          </div>
          <TodayProtein data={data} today={today} />
          <TomorrowPreview
            data={data}
            date={tomorrow}
            slots={slots}
            imageUrls={imageUrls}
            onRecipe={onRecipe}
            onPlan={onPlan}
            onOpenWeek={onOpenWeek}
          />
        </>
      )}
      <BackupNotice
        data={data}
        now={now}
        placement="bottom"
        onBackup={onBackup}
      />
    </div>
  );
}
