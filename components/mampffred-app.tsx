'use client';
import { validateDataUpdate, referencedImageKeys } from '@/lib/data-updates';
import { MIN_BACKUP_PASSWORD_LENGTH } from '@/lib/backup';

/* oxlint-disable next/no-img-element, jsx-a11y/prefer-tag-over-role, react/immutability, react/refs, react/set-state-in-effect */

import {
  ArrowLeft,
  CalendarDays,
  Carrot,
  Check,
  CircleAlert,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  CloudOff,
  Container,
  CookingPot,
  Croissant,
  Download,
  EllipsisVertical,
  Heart,
  Home,
  ImagePlus,
  Info,
  Leaf,
  LoaderCircle,
  LockKeyhole,
  Milk,
  Minus,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Share2,
  ShieldCheck,
  ShoppingCart,
  ShoppingBasket,
  Sparkles,
  Trash2,
  Upload,
  Users,
  Utensils,
  X,
} from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  type BackupPreview,
  blobToDataUrl,
  dataUrlToBlob,
  decryptBackup,
  encryptBackup,
} from '@/lib/backup';
import { getBackupReminder } from '@/lib/backup-reminder';
import type {
  AppData,
  CustomFood,
  FoodOverride,
  MealSlot,
  NutritionSettings,
  Recipe,
  RecipeDraft,
  RecipeIngredient,
  ShoppingItem,
} from '@/lib/model';
import {
  calculateRecipeFromIngredients,
  customFoodToReference,
  foodDisplayName,
  ingredientOverrideKey,
  mergeCalculatedNutrition,
  preferredUnitForFood,
  searchFoodReferences,
  type FoodReference,
  type RecipeIngredientCalculation,
} from '@/lib/food-nutrition';
import {
  createEmptyData,
  createSampleRecipes,
  migrateAppData,
} from '@/lib/model';
import {
  addLocalDays,
  parseLocalDate,
  startOfLocalWeek,
  todayLocal,
} from '@/lib/local-date';
import { tabTransitionDirection, type AppTab } from '@/lib/navigation-motion';
import { shouldDismissSheet } from '@/lib/sheet-gesture';
import {
  removeShoppingItems,
  restoreShoppingItems,
  type RemovedShoppingItem,
} from '@/lib/shopping-undo';
import {
  appTabFromHistoryState,
  createAppHistoryState,
} from '@/lib/ui-history';
import {
  aggregateNutritionDay,
  aggregateNutritionWeek,
  suggestRecipesForWeek,
} from '@/lib/nutrition';
import {
  hasMeaningfulRecipeDraft,
  removeRecipeDraft,
  replaceRecipeFoodOverrides,
  upsertRecipeDraft,
} from '@/lib/recipe-drafts';
import {
  filterRecipes,
  type RecipeFilter,
  reusableRecipeTags,
  visibleRecipeTags,
} from '@/lib/recipe-filter';
import {
  MAX_SHARED_RECIPE_BYTES,
  parseSharedRecipe,
  serializeSharedRecipe,
} from '@/lib/recipe-sharing';
import {
  acquireAppWriter,
  loadData,
  loadRecipeImage,
  optimizeImage,
  queueReplaceAllData,
  queueSaveData,
} from '@/lib/storage';
import {
  reconcileWeekShopping,
  type WeekShoppingResult,
} from '@/lib/week-shopping';

type Tab = AppTab;
type SettingsPanel = 'backup' | 'nutrition' | 'foods' | 'privacy' | 'app';
type PlannerState = {
  date: string;
  slot: MealSlot;
  recipeId?: string;
  servings?: number;
  query?: string;
  filter?: RecipeFilter;
};
type PlannerResume = {
  state: PlannerState;
  backgroundRecipeId?: string;
};
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};
type EditorDraft = Omit<Recipe, 'id' | 'imageCell' | 'shareId'> & {
  id?: string;
  imageCell?: number;
  shareId?: string;
};
const localeDate = new Intl.DateTimeFormat('de-DE', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});
const shortDate = new Intl.DateTimeFormat('de-DE', {
  day: 'numeric',
  month: 'short',
});
const shortTime = new Intl.DateTimeFormat('de-DE', {
  hour: '2-digit',
  minute: '2-digit',
});
const weekday = new Intl.DateTimeFormat('de-DE', { weekday: 'short' });
const monthShort = new Intl.DateTimeFormat('de-DE', { month: 'short' });
const fromIso = parseLocalDate;
const assetUrl = (path: string) => `${import.meta.env.BASE_URL}${path}`;
const mealSlots: MealSlot[] = ['Frühstück', 'Mittagessen', 'Abendessen'];
const RecipeImageRequestContext = createContext<(key: string) => void>(
  () => undefined,
);

async function calculateWithBundledFoodData(
  recipe: Recipe,
  overrides: Record<string, FoodOverride>,
  customFoods: readonly CustomFood[] = [],
) {
  const catalogModule = await import('@/lib/bls-catalog');
  const { blsCatalog } = catalogModule;
  if (!catalogModule.BLS_MANIFEST.sourceSha256)
    throw new Error('INVALID_BLS_CATALOG');
  const calculation = calculateRecipeFromIngredients(
    recipe,
    [...customFoods.map(customFoodToReference), ...blsCatalog],
    overrides,
  );
  return {
    calculation,
    nutrition: mergeCalculatedNutrition(
      recipe.nutrition,
      calculation,
      new Date().toISOString(),
    ),
  };
}
const greeting = (now: Date) => {
  const hour = now.getHours();
  if (hour < 11) return 'Guten Morgen! ☀️';
  if (hour < 18) return 'Guten Tag! 🌿';
  return 'Guten Abend! 🌙';
};
const modalStack: HTMLElement[] = [];

function Image({
  priority,
  alt,
  ...props
}: Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'alt'> & {
  alt: string;
  priority?: boolean;
}) {
  return (
    <img {...props} alt={alt} loading={priority ? 'eager' : props.loading} />
  );
}

function RecipeImage({
  recipe,
  imageUrls,
  className = '',
}: {
  recipe: Recipe;
  imageUrls: Record<string, string>;
  className?: string;
}) {
  const requestImage = useContext(RecipeImageRequestContext);
  const placeholderRef = useRef<HTMLDivElement>(null);
  const storedImageUrl = recipe.imageKey
    ? imageUrls[recipe.imageKey]
    : undefined;
  useEffect(() => {
    if (!recipe.imageKey || storedImageUrl) return;
    const placeholder = placeholderRef.current;
    if (!placeholder || !('IntersectionObserver' in window)) {
      requestImage(recipe.imageKey);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        requestImage(recipe.imageKey!);
        observer.disconnect();
      },
      { rootMargin: '160px 0px' },
    );
    observer.observe(placeholder);
    return () => observer.disconnect();
  }, [recipe.imageKey, requestImage, storedImageUrl]);

  if (storedImageUrl)
    return (
      <img
        className={`recipe-photo ${className}`}
        src={storedImageUrl}
        alt={`Foto von ${recipe.name}`}
        loading="lazy"
        decoding="async"
      />
    );
  return (
    <div
      ref={placeholderRef}
      className={`recipe-photo recipe-sprite ${className}`}
      role="img"
      aria-label={`Foto von ${recipe.name}`}
      style={
        {
          '--cell-x': recipe.imageCell % 3,
          '--cell-y': Math.floor(recipe.imageCell / 3),
          '--recipe-sprite-url': `url("${assetUrl('assets/recipe-sprite-optimized.jpg')}")`,
        } as React.CSSProperties
      }
    />
  );
}

function IconButton({
  label,
  children,
  onClick,
  className = '',
  disabled = false,
}: {
  label: string;
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`icon-button ${className}`}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

function useModalFocus<T extends HTMLElement>(
  onClose: () => void,
  initialFocusSelector?: string,
) {
  const ref = useRef<T>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    if (!dialog) return;
    const focusable = () =>
      Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hidden);
    modalStack.push(dialog);
    const preferred = initialFocusSelector
      ? dialog.querySelector<HTMLElement>(initialFocusSelector)
      : undefined;
    (preferred ?? focusable()[0])?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (modalStack.at(-1) !== dialog) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const elements = focusable();
      if (!elements.length) return;
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      const index = modalStack.lastIndexOf(dialog);
      if (index >= 0) modalStack.splice(index, 1);
      previous?.focus();
    };
  }, [initialFocusSelector]);
  return ref;
}

function useSheetSwipeToClose(onClose: () => void) {
  const onCloseRef = useRef(onClose);
  const gestureRef = useRef<
    | {
        pointerId: number;
        startY: number;
        lastY: number;
        startedAt: number;
        sheet: HTMLElement;
      }
    | undefined
  >(undefined);
  const timerRef = useRef<number | undefined>(undefined);
  const gestureTimeoutRef = useRef<number | undefined>(undefined);
  onCloseRef.current = onClose;

  useEffect(
    () => () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      if (gestureTimeoutRef.current)
        window.clearTimeout(gestureTimeoutRef.current);
    },
    [],
  );

  function finishGesture(pointerId: number, cancelled = false) {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== pointerId) return;
    if (gestureTimeoutRef.current)
      window.clearTimeout(gestureTimeoutRef.current);
    gestureTimeoutRef.current = undefined;
    gestureRef.current = undefined;
    const distance = Math.max(0, gesture.lastY - gesture.startY);
    const shouldClose =
      !cancelled &&
      shouldDismissSheet({
        distance,
        elapsedMs: performance.now() - gesture.startedAt,
        viewportHeight: window.visualViewport?.height ?? window.innerHeight,
      });
    gesture.sheet.classList.remove('sheet-dragging');
    gesture.sheet.classList.add('sheet-snapping');
    gesture.sheet.style.setProperty(
      '--sheet-drag',
      shouldClose ? 'calc(100dvh + 40px)' : '0px',
    );
    timerRef.current = window.setTimeout(
      () => {
        gesture.sheet.classList.remove('sheet-snapping');
        gesture.sheet.style.removeProperty('--sheet-drag');
        if (shouldClose) onCloseRef.current();
      },
      shouldClose ? 210 : 280,
    );
  }

  return {
    onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
      if (event.button !== 0) return;
      const sheet = event.currentTarget.closest<HTMLElement>('.swipe-sheet');
      if (!sheet) return;
      if (timerRef.current) window.clearTimeout(timerRef.current);
      gestureRef.current = {
        pointerId: event.pointerId,
        startY: event.clientY,
        lastY: event.clientY,
        startedAt: performance.now(),
        sheet,
      };
      gestureTimeoutRef.current = window.setTimeout(
        () => finishGesture(event.pointerId, true),
        2_500,
      );
      sheet.classList.remove('sheet-snapping');
      sheet.classList.add('sheet-dragging');
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      gesture.lastY = event.clientY;
      const offset = Math.max(0, event.clientY - gesture.startY);
      gesture.sheet.style.setProperty(
        '--sheet-drag',
        `${Math.min(offset, window.innerHeight * 0.8)}px`,
      );
    },
    onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
      finishGesture(event.pointerId);
    },
    onPointerCancel(event: React.PointerEvent<HTMLDivElement>) {
      finishGesture(event.pointerId, true);
    },
    onLostPointerCapture(event: React.PointerEvent<HTMLDivElement>) {
      finishGesture(event.pointerId, true);
    },
  };
}

function useAnimatedSheetClose(onClose: () => void) {
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const onCloseRef = useRef(onClose);
  const timerRef = useRef<number | undefined>(undefined);
  onCloseRef.current = onClose;
  useEffect(
    () => () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    },
    [],
  );
  const close = useCallback(() => {
    if (closingRef.current) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      onCloseRef.current();
      return;
    }
    closingRef.current = true;
    setClosing(true);
    timerRef.current = window.setTimeout(() => onCloseRef.current(), 190);
  }, []);
  return { close, closing };
}

function Header({
  title,
  subtitle,
  back,
  action,
  leading,
}: {
  title: string;
  subtitle?: string;
  back?: () => void;
  action?: React.ReactNode;
  leading?: React.ReactNode;
}) {
  return (
    <header className="screen-header">
      {back && (
        <IconButton label="Zurück" onClick={back}>
          <ArrowLeft size={21} />
        </IconButton>
      )}
      {leading}
      <div className="screen-heading">
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action && <div className="header-action">{action}</div>}
    </header>
  );
}

function MealCard({
  slot,
  recipe,
  servings,
  imageUrls,
  onOpen,
}: {
  slot: MealSlot;
  recipe: Recipe;
  servings: number;
  imageUrls: Record<string, string>;
  onOpen: () => void;
}) {
  const tag = visibleRecipeTags(recipe)[0];
  return (
    <button className="meal-card" onClick={onOpen}>
      <div className="meal-copy">
        <span className="meal-slot">
          {slot === 'Mittagessen' ? (
            <Utensils size={17} />
          ) : (
            <CookingPot size={17} />
          )}
          {slot}
        </span>
        <strong>{recipe.name}</strong>
        <small>
          <Users size={13} /> {servings} Portionen <Clock3 size={13} />{' '}
          {recipe.minutes} Min.
        </small>
        {tag && (
          <span className="meal-tag">
            <Leaf size={13} /> {tag}
          </span>
        )}
      </div>
      <RecipeImage
        recipe={recipe}
        imageUrls={imageUrls}
        className="meal-image"
      />
      <span className="meal-chevron" aria-hidden="true">
        <ChevronRight size={19} />
      </span>
    </button>
  );
}

function TodayView({
  data,
  now,
  imageUrls,
  onRecipe,
  onSettings,
  onBackup,
  onPlan,
  onAddRecipe,
  onAddSamples,
}: {
  data: AppData;
  now: Date;
  imageUrls: Record<string, string>;
  onRecipe: (recipe: Recipe) => void;
  onSettings: () => void;
  onBackup: () => void;
  onPlan: (slot?: MealSlot) => void;
  onAddRecipe: () => void;
  onAddSamples: () => void;
}) {
  const todayIso = todayLocal(now);
  const lastBackup = data.lastBackup ? new Date(data.lastBackup) : undefined;
  const lastBackupDay = lastBackup
    ? todayLocal(lastBackup) === todayIso
      ? 'Heute'
      : shortDate.format(lastBackup)
    : undefined;
  const backupReminder = getBackupReminder(data.lastBackup, now);
  const current = data.plan.find((day) => day.date === todayIso);
  const meals =
    current?.meals
      .toSorted(
        (left, right) =>
          mealSlots.indexOf(left.slot) - mealSlots.indexOf(right.slot),
      )
      .flatMap((meal) => {
        const recipe = data.recipes.find((item) => item.id === meal.recipeId);
        return recipe ? [{ ...meal, recipe }] : [];
      }) ?? [];
  return (
    <div className="screen-content today-view">
      <Header
        title={greeting(now)}
        subtitle={localeDate.format(now)}
        leading={
          <Image
            className="header-mascot"
            src={assetUrl('assets/mampffred-mascot-small.png')}
            width={46}
            height={52}
            alt="Mampffred"
            priority
          />
        }
        action={
          <IconButton label="Einstellungen öffnen" onClick={onSettings}>
            <Settings size={22} />
          </IconButton>
        }
      />
      <section>
        <h2>Heute gibt&apos;s</h2>
        <p className="section-subtitle">
          Deine geplanten Mahlzeiten für einen genussvollen Tag.
        </p>
        {meals.length ? (
          <>
            <div className="meal-list">
              {meals.map(({ slot, recipe, servings }) => (
                <MealCard
                  key={slot}
                  slot={slot}
                  recipe={recipe}
                  servings={servings}
                  imageUrls={imageUrls}
                  onOpen={() => onRecipe(recipe)}
                />
              ))}
              {mealSlots
                .filter((slot) => !meals.some((meal) => meal.slot === slot))
                .map((slot) => (
                  <button
                    type="button"
                    className="meal-card meal-card-empty"
                    key={slot}
                    onClick={() => onPlan(slot)}
                  >
                    <span className="meal-empty-icon">
                      <Plus size={21} />
                    </span>
                    <span>
                      <small>{slot}</small>
                      <strong>Mahlzeit planen</strong>
                    </span>
                    <ChevronRight size={19} />
                  </button>
                ))}
            </div>
            <div className="today-summary" aria-label="Tagesübersicht">
              <span>
                <Utensils size={19} />
                <strong>{meals.length}</strong>
                <small>Mahlzeiten</small>
              </span>
              <span>
                <Leaf size={19} />
                <strong>{meals.length === 3 ? 'Plan steht' : 'Im Plan'}</strong>
                <small>für heute</small>
              </span>
              <span>
                <Heart size={19} />
                <strong>Lecker</strong>
                <small>Guten Appetit!</small>
              </span>
            </div>
          </>
        ) : (
          <div className="empty-state">
            <Image
              src={assetUrl('assets/mampffred-mascot-small.png')}
              width={170}
              height={200}
              alt="Mampffred, der Brokkoli-Koch"
              priority
            />
            <h2>
              {data.recipes.length
                ? 'Bei Mampffred ist noch nichts auf dem Teller.'
                : 'Deine Rezeptsammlung ist noch leer.'}
            </h2>
            <p>
              {data.recipes.length
                ? 'Plane eine Mahlzeit aus deinen Rezepten.'
                : 'Lege dein erstes Rezept an oder probiere unverbindlich unsere Beispiele aus.'}
            </p>
            <div className="empty-actions">
              <button
                className="primary-button"
                onClick={data.recipes.length ? () => onPlan() : onAddRecipe}
              >
                {data.recipes.length
                  ? 'Mahlzeit planen'
                  : 'Erstes Rezept anlegen'}
              </button>
              {data.recipes.length ? (
                <button className="secondary-button" onClick={onAddRecipe}>
                  Rezept anlegen
                </button>
              ) : (
                <button className="secondary-button" onClick={onAddSamples}>
                  Beispielrezepte ausprobieren
                </button>
              )}
            </div>
          </div>
        )}
      </section>
      <section className={`backup-card is-${backupReminder.kind}`}>
        <div className="backup-card-copy">
          <span className="backup-card-icon" aria-hidden="true">
            <ShieldCheck size={29} />
          </span>
          <span>
            <strong>{backupReminder.title}</strong>
            <small>{backupReminder.description}</small>
          </span>
        </div>
        <span className="backup-card-leaves" aria-hidden="true">
          <span className="backup-card-leaf backup-card-leaf-top">
            <img src={assetUrl('assets/backup-leaves.png')} alt="" />
          </span>
          <span className="backup-card-leaf backup-card-leaf-right">
            <img src={assetUrl('assets/backup-leaves.png')} alt="" />
          </span>
          <span className="backup-card-leaf backup-card-leaf-left">
            <img src={assetUrl('assets/backup-leaves.png')} alt="" />
          </span>
        </span>
        <button onClick={onBackup}>
          <strong>{backupReminder.buttonLabel}</strong>
          <ChevronRight size={18} />
        </button>
        <small className="backup-card-status" aria-live="polite">
          <span className="backup-card-status-icon" aria-hidden="true">
            {backupReminder.kind === 'missing' ? (
              <CircleAlert size={14} />
            ) : backupReminder.kind === 'stale' ? (
              <Clock3 size={13} />
            ) : (
              <Check size={11} strokeWidth={3} />
            )}
          </span>
          {backupReminder.kind === 'missing'
            ? 'Noch keine Sicherungsdatei erstellt'
            : lastBackup && lastBackupDay
              ? `Zuletzt gesichert: ${lastBackupDay}, ${shortTime.format(lastBackup)} Uhr`
              : 'Sicherungszeitpunkt nicht verfügbar'}
        </small>
      </section>
    </div>
  );
}

function WeekView({
  data,
  imageUrls,
  weekStart,
  onWeekStart,
  onAdd,
  onCreateShopping,
  onNutritionSetup,
  onDismissNutrition,
  onOpenRecipe,
  onEditRecipes,
  onOpenDay,
}: {
  data: AppData;
  imageUrls: Record<string, string>;
  weekStart: string;
  onWeekStart: (date: string) => void;
  onAdd: (date: string, slot: MealSlot) => void;
  onCreateShopping: () => void;
  onNutritionSetup: () => void;
  onDismissNutrition: () => void;
  onOpenRecipe: (recipe: Recipe) => void;
  onEditRecipes: (recipes: Recipe[]) => void;
  onOpenDay: (date: string) => void;
}) {
  const today = todayLocal();
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = addLocalDays(weekStart, index);
    return data.plan.find((day) => day.date === date) ?? { date, meals: [] };
  });
  const first = fromIso(days[0].date);
  const last = fromIso(days[6].date);
  const isCurrentWeek = weekStart === startOfLocalWeek();
  const defaultSelectedDate = days.some((day) => day.date === today)
    ? today
    : days[0].date;
  const selectedDate = defaultSelectedDate;
  const plannedMealCount = days.reduce(
    (total, day) => total + day.meals.length,
    0,
  );
  const selectedDay = days.find((day) => day.date === selectedDate) ?? days[0];
  const orderedDays = [
    selectedDay,
    ...days.filter((day) => day.date !== selectedDay.date),
  ];
  const selectedMeals = mealSlots.flatMap((slot) => {
    const meal = selectedDay.meals.find((entry) => entry.slot === slot);
    const recipe = data.recipes.find((entry) => entry.id === meal?.recipeId);
    return meal && recipe ? [{ meal, recipe }] : [];
  });
  const selectedServings = selectedMeals.reduce(
    (total, entry) => total + entry.meal.servings,
    0,
  );
  const weeklyNutrition = aggregateNutritionWeek(data, weekStart);
  const protein = weeklyNutrition.nutrients.proteinG;
  const proteinGoal = data.nutritionSettings.goals.find(
    (goal) =>
      goal.enabled && goal.period === 'week' && goal.nutrient === 'proteinG',
  );
  const suggestions =
    addLocalDays(weekStart, 6) < today
      ? []
      : suggestRecipesForWeek(data, weeklyNutrition).flatMap((suggestion) => {
          const recipe = data.recipes.find(
            (item) => item.id === suggestion.recipeId,
          );
          return recipe ? [{ recipe, suggestion }] : [];
        });
  const missingProteinRecipes = [
    ...new Map(
      days
        .flatMap((day) => day.meals)
        .flatMap((meal) => {
          const recipe = data.recipes.find((item) => item.id === meal.recipeId);
          return recipe && !recipe.nutrition?.wholeRecipe.proteinG
            ? [[recipe.id, recipe] as const]
            : [];
        }),
    ).values(),
  ];
  return (
    <div className="screen-content week-view">
      <header className="week-hero">
        <div className="week-hero-copy">
          <h1>Deine Woche</h1>
          <p>Dein Essensplan auf einen Blick</p>
        </div>
        <div className="week-picker">
          <IconButton
            label="Vorherige Woche"
            onClick={() => onWeekStart(addLocalDays(weekStart, -7))}
          >
            <ChevronLeft size={21} />
          </IconButton>
          <button
            type="button"
            className="week-date-pill"
            onClick={() => onWeekStart(startOfLocalWeek())}
            disabled={isCurrentWeek}
            aria-label={
              isCurrentWeek
                ? `Aktuelle Woche: ${shortDate.format(first)} bis ${shortDate.format(last)}`
                : `Zur aktuellen Woche. Angezeigt: ${shortDate.format(first)} bis ${shortDate.format(last)}`
            }
          >
            <CalendarDays size={19} aria-hidden="true" />
            <strong>
              {shortDate.format(first)} – {shortDate.format(last)}
            </strong>
          </button>
          <IconButton
            label="Nächste Woche"
            onClick={() => onWeekStart(addLocalDays(weekStart, 7))}
          >
            <ChevronRight size={21} />
          </IconButton>
        </div>
      </header>

      <nav className="week-day-strip" aria-label="Tage dieser Woche">
        {days.map((day) => {
          const date = fromIso(day.date);
          const isToday = day.date === today;
          const selected = day.date === selectedDate;
          return (
            <button
              type="button"
              className={selected ? 'is-selected' : ''}
              aria-current={isToday ? 'date' : undefined}
              aria-label={`${isToday ? 'Heute, ' : ''}${localeDate.format(date)} anzeigen`}
              key={day.date}
              onClick={() => onOpenDay(day.date)}
            >
              <span>{weekday.format(date).replace('.', '')}</span>
              <strong>{date.getDate()}</strong>
              {isToday && !selected && <i aria-hidden="true" />}
            </button>
          );
        })}
      </nav>

      <section className="week-focus-summary" aria-live="polite">
        <Image
          src={assetUrl('assets/mampffred-mascot-small.png')}
          width={58}
          height={66}
          alt="Mampffred"
        />
        <div>
          <strong>
            {selectedDay.date === today ? 'Heute: ' : ''}
            {localeDate.format(fromIso(selectedDay.date))}
          </strong>
          <span>
            {selectedMeals.length
              ? 'Dein Tagesplan auf einen Blick.'
              : 'Noch frei für deine Lieblingsgerichte.'}
          </span>
        </div>
        <dl>
          <div>
            <dt>Mahlzeiten</dt>
            <dd>{selectedMeals.length}</dd>
          </div>
          <div>
            <dt>Portionen</dt>
            <dd>{selectedServings}</dd>
          </div>
        </dl>
      </section>

      <div className="week-list">
        {orderedDays.map((day) => {
          const isToday = day.date === today;
          const isSelected = day.date === selectedDay.date;
          const date = fromIso(day.date);
          const formattedDate = localeDate.format(date);
          const meals = mealSlots.map((slot) => {
            const meal = day.meals.find((item) => item.slot === slot);
            return {
              slot,
              meal,
              recipe: data.recipes.find((item) => item.id === meal?.recipeId),
            };
          });

          if (!isSelected)
            return (
              <button
                type="button"
                className={`week-compact-day ${isToday ? 'is-today' : ''}`}
                aria-label={`${isToday ? 'Heute, ' : ''}${formattedDate} im Detail öffnen`}
                id={`week-day-${day.date}`}
                key={day.date}
                onClick={() => onOpenDay(day.date)}
              >
                <span className="compact-day-date">
                  <small>{weekday.format(date).replace('.', '')}</small>
                  <strong>{date.getDate()}</strong>
                  <small>{monthShort.format(date)}</small>
                </span>
                <span className="compact-meal-icons" aria-hidden="true">
                  {meals.map(({ slot }) => (
                    <span key={slot}>
                      {slot === 'Mittagessen' ? (
                        <Utensils size={17} />
                      ) : (
                        <CookingPot size={17} />
                      )}
                    </span>
                  ))}
                </span>
                <span className="compact-meal-names">
                  {meals
                    .map(({ recipe }) => recipe?.name ?? 'Mahlzeit planen')
                    .join(', ')}
                </span>
                <span className="compact-meal-images" aria-hidden="true">
                  {meals.map(({ slot, recipe }) =>
                    recipe ? (
                      <RecipeImage
                        key={slot}
                        recipe={recipe}
                        imageUrls={imageUrls}
                        className="week-compact-image"
                      />
                    ) : (
                      <span className="week-compact-empty" key={slot}>
                        <Plus size={17} />
                      </span>
                    ),
                  )}
                </span>
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            );

          return (
            <article
              className={`day-card is-featured ${isToday ? 'is-today' : ''}`}
              aria-current={isToday ? 'date' : undefined}
              id={`week-day-${day.date}`}
              key={day.date}
            >
              <button
                type="button"
                className="day-date"
                aria-label={`${isToday ? 'Heute, ' : ''}${formattedDate} im Detail öffnen`}
                onClick={() => onOpenDay(day.date)}
              >
                <span>{weekday.format(date).replace('.', '')}</span>
                <strong>{date.getDate()}</strong>
                <span>{monthShort.format(date)}</span>
                {isToday && <small>Heute</small>}
                <em>Guten Appetit!</em>
              </button>
              <div className="day-meals">
                {meals.map(({ slot, meal, recipe }) => (
                  <button
                    key={slot}
                    className={recipe ? 'is-planned' : 'is-empty'}
                    aria-label={
                      recipe
                        ? `${slot}: ${recipe.name}, ${meal?.servings} Portionen. Rezept öffnen`
                        : `${slot}: Mahlzeit planen`
                    }
                    onClick={() =>
                      recipe ? onOpenRecipe(recipe) : onAdd(day.date, slot)
                    }
                  >
                    <span className="week-meal-icon" aria-hidden="true">
                      {slot === 'Mittagessen' ? (
                        <Utensils size={20} />
                      ) : (
                        <CookingPot size={20} />
                      )}
                    </span>
                    <span className="week-meal-copy">
                      <small>
                        {slot}
                        {recipe ? ` · ${recipe.minutes} Min.` : ''}
                      </small>
                      <strong>{recipe?.name ?? 'Mahlzeit planen'}</strong>
                      {meal && <em>{meal.servings} Portionen</em>}
                    </span>
                    {recipe ? (
                      <RecipeImage
                        recipe={recipe}
                        imageUrls={imageUrls}
                        className="week-meal-image"
                      />
                    ) : (
                      <span className="week-empty-image" aria-hidden="true">
                        <Plus size={17} />
                      </span>
                    )}
                    <ChevronRight size={17} aria-hidden="true" />
                  </button>
                ))}
              </div>
            </article>
          );
        })}
      </div>
      <p className="week-signoff">
        <Leaf size={17} /> Gute Planung. Eine entspannte Woche.
      </p>
      {plannedMealCount > 0 &&
        !data.nutritionSettings.enabled &&
        !data.nutritionSettings.promptDismissed && (
          <section className="nutrition-card nutrition-opt-in">
            <div>
              <strong>Protein im Wochenplan einschätzen</strong>
              <p>
                Optional und nur lokal: aus Gewichtsangaben schätzen oder eigene
                Werte verwenden. Keine medizinische Bewertung.
              </p>
            </div>
            <div className="nutrition-opt-in-actions">
              <button type="button" onClick={onNutritionSetup}>
                Einrichten
              </button>
              <button type="button" onClick={onDismissNutrition}>
                Nicht jetzt
              </button>
            </div>
          </section>
        )}
      {data.nutritionSettings.enabled && (
        <section
          className="nutrition-card"
          aria-labelledby="protein-plan-title"
        >
          <div className="nutrition-heading">
            <div>
              <strong id="protein-plan-title">Protein im Plan</strong>
              <small>
                {protein.coveredMeals} von {protein.totalMeals} Mahlzeiten
                einschätzbar
              </small>
            </div>
            <button type="button" onClick={onNutritionSetup}>
              Anpassen
            </button>
          </div>
          {protein.totalMeals === 0 ? (
            <p>Noch keine Mahlzeiten geplant.</p>
          ) : protein.coverage < 1 || protein.value === null ? (
            <>
              <p>
                Für {missingProteinRecipes.length}{' '}
                {missingProteinRecipes.length === 1
                  ? 'geplantes Rezept fehlt'
                  : 'geplante Rezepte fehlen'}{' '}
                noch vollständige Nährwerte. Deshalb vergleichen wir den Plan
                noch nicht mit deinem Wochen-Planwert.
              </p>
              {missingProteinRecipes[0] && (
                <button
                  type="button"
                  className="nutrition-missing-action"
                  onClick={() => onEditRecipes(missingProteinRecipes)}
                >
                  {data.nutritionSettings.automaticEstimates
                    ? 'Zuordnungen prüfen'
                    : 'Eigene Werte ergänzen'}
                </button>
              )}
            </>
          ) : (
            <>
              <p>
                In dieser Woche sind aus deinem Plan ca.{' '}
                <strong>{Math.round(protein.value)} g</strong> Protein erfasst.
              </p>
              {proteinGoal?.minimum ? (
                protein.value < proteinGoal.minimum ? (
                  <p>
                    Bis zu deinem selbst gesetzten Wochen-Planwert sind noch ca.{' '}
                    <strong>
                      {Math.round(proteinGoal.minimum - protein.value)} g
                    </strong>{' '}
                    offen.
                  </p>
                ) : (
                  <p>
                    Aus geplanten Mahlzeiten: ca. {Math.round(protein.value)} g.
                    Dein Wochen-Planwert: {Math.round(proteinGoal.minimum)} g.
                  </p>
                )
              ) : (
                <p>Du hast noch keinen eigenen Wochen-Planwert festgelegt.</p>
              )}
            </>
          )}
          {suggestions.length > 0 && (
            <div className="nutrition-suggestions">
              <strong>Rezepte, die dazu passen könnten</strong>
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
            Berechnung mit 1 Rezeptportion je geplanter Mahlzeit. Ungeplante
            Speisen, Getränke und Snacks sind nicht enthalten.
          </small>
        </section>
      )}
      {plannedMealCount > 0 && (
        <button
          type="button"
          className="secondary-button week-shopping-action"
          onClick={onCreateShopping}
        >
          <ShoppingCart size={18} /> Einkauf für diese Woche erstellen
        </button>
      )}
    </div>
  );
}

function DayDetailSheet({
  data,
  date,
  imageUrls,
  onClose,
  onOpenRecipe,
  onPlan,
  onNutritionSetup,
  inactive = false,
}: {
  data: AppData;
  date: string;
  imageUrls: Record<string, string>;
  onClose: () => void;
  onOpenRecipe: (recipe: Recipe) => void;
  onPlan: (date: string, slot: MealSlot, recipeId?: string) => void;
  onNutritionSetup: () => void;
  inactive?: boolean;
}) {
  const sheetExit = useAnimatedSheetClose(onClose);
  const dialogRef = useModalFocus<HTMLElement>(sheetExit.close);
  const sheetSwipe = useSheetSwipeToClose(onClose);
  const plannedDay = data.plan.find((day) => day.date === date);
  const nutrition = aggregateNutritionDay(data, date);
  const nutrients = [
    ['energyKcal', 'Energie', 'kcal'],
    ['proteinG', 'Protein', 'g'],
    ['carbohydratesG', 'Kohlenhydrate', 'g'],
    ['fatG', 'Fett', 'g'],
  ] as const;
  const visibleNutrients = nutrients.flatMap(([key, label, unit]) => {
    const nutrient = nutrition.nutrients[key];
    return nutrient.value !== null && nutrient.coverage === 1
      ? [{ key, label, unit, value: Math.round(nutrient.value) }]
      : [];
  });

  return (
    <div
      className={`modal-backdrop align-end ${inactive ? 'underlay' : ''} ${sheetExit.closing ? 'sheet-backdrop-closing' : ''}`}
    >
      <section
        ref={dialogRef}
        className={`planner-sheet day-detail-sheet swipe-sheet ${sheetExit.closing ? 'sheet-closing' : ''}`}
        role="dialog"
        aria-modal={!inactive}
        aria-hidden={inactive || undefined}
        inert={inactive || undefined}
        aria-labelledby="day-detail-title"
      >
        <div className="sheet-handle" aria-hidden="true" {...sheetSwipe} />
        <div className="modal-header day-detail-header">
          <div>
            <small>Dein Tag</small>
            <h2 id="day-detail-title">{localeDate.format(fromIso(date))}</h2>
            <p>
              {plannedDay?.meals.length ?? 0}{' '}
              {(plannedDay?.meals.length ?? 0) === 1
                ? 'Mahlzeit geplant'
                : 'Mahlzeiten geplant'}
            </p>
          </div>
          <IconButton label="Schließen" onClick={sheetExit.close}>
            <X size={20} />
          </IconButton>
        </div>

        <div className="day-detail-meals">
          {mealSlots.map((slot) => {
            const meal = plannedDay?.meals.find((entry) => entry.slot === slot);
            const recipe = data.recipes.find(
              (entry) => entry.id === meal?.recipeId,
            );
            if (!meal || !recipe)
              return (
                <button
                  type="button"
                  className="day-detail-empty"
                  key={slot}
                  onClick={() => onPlan(date, slot)}
                >
                  <span>{slot}</span>
                  <strong>
                    <Plus size={17} /> Mahlzeit planen
                  </strong>
                </button>
              );
            return (
              <article className="day-detail-meal" key={slot}>
                <button
                  type="button"
                  className="day-detail-recipe"
                  onClick={() => onOpenRecipe(recipe)}
                >
                  <RecipeImage
                    recipe={recipe}
                    imageUrls={imageUrls}
                    className="day-detail-image"
                  />
                  <span>
                    <small>{slot}</small>
                    <strong>{recipe.name}</strong>
                    <small>
                      {meal.servings} Portionen · {recipe.minutes} Min.
                    </small>
                  </span>
                  <ChevronRight size={18} />
                </button>
                <button
                  type="button"
                  className="day-detail-replace"
                  onClick={() => onPlan(date, slot, recipe.id)}
                >
                  <RefreshCw size={17} /> Auswechseln
                </button>
              </article>
            );
          })}
        </div>

        <section
          className="day-nutrition"
          aria-labelledby="day-nutrition-title"
        >
          <div>
            <h3 id="day-nutrition-title">Nährwerte im Plan</h3>
            <small>Aus den geplanten Portionen</small>
          </div>
          {!data.nutritionSettings.enabled ? (
            <button type="button" onClick={onNutritionSetup}>
              Nährwert-Hinweise einrichten
            </button>
          ) : visibleNutrients.length ? (
            <div className="day-nutrition-grid">
              {visibleNutrients.map((nutrient) => (
                <div key={nutrient.key}>
                  <strong>{nutrient.value}</strong>
                  <span>{nutrient.unit}</span>
                  <small>{nutrient.label}</small>
                </div>
              ))}
            </div>
          ) : nutrition.mealCount ? (
            <p>
              Für diesen Tag fehlen noch vollständige Nährwerte. Du kannst die
              Zutatenzuordnung in den Rezepten prüfen.
            </p>
          ) : (
            <p>Plane zuerst eine Mahlzeit, um eine Übersicht zu erhalten.</p>
          )}
          <small className="nutrition-disclaimer">
            Ungeplante Speisen, Getränke und Snacks sind nicht enthalten.
          </small>
        </section>
      </section>
    </div>
  );
}

function RecipesView({
  data,
  imageUrls,
  query,
  filter,
  onQuery,
  onFilter,
  onRecipe,
  onDraft,
  onAdd,
  onAddSamples,
  onToggleFavorite,
  onImport,
}: {
  data: AppData;
  imageUrls: Record<string, string>;
  query: string;
  filter: RecipeFilter;
  onQuery: (query: string) => void;
  onFilter: (filter: RecipeFilter) => void;
  onRecipe: (recipe: Recipe) => void;
  onDraft: (draft: RecipeDraft) => void;
  onAdd: () => void;
  onAddSamples: () => void;
  onToggleFavorite: (recipe: Recipe) => void;
  onImport: (file: File) => void;
}) {
  const importFileRef = useRef<HTMLInputElement>(null);
  const filters: RecipeFilter[] = [
    'Alle',
    'Favoriten',
    'Schnell',
    'Vegetarisch',
    'Vegan',
    'Gesund',
  ];
  const deferredQuery = useDeferredValue(query);
  const recipes = useMemo(
    () => filterRecipes(data.recipes, deferredQuery, filter),
    [data.recipes, deferredQuery, filter],
  );
  return (
    <div className="screen-content recipes-view">
      <header className="library-hero">
        <div>
          <h1>Rezepte</h1>
          <p>Entdecke deine Lieblingsgerichte</p>
        </div>
        <span className="library-hero-leaves" aria-hidden="true">
          <img src={assetUrl('assets/recipes-header-leaves-v3.png')} alt="" />
        </span>
      </header>
      <IconButton
        label="Rezept hinzufügen"
        className="outlined recipes-floating-add"
        onClick={onAdd}
      >
        <Plus size={25} />
      </IconButton>
      <label className="search-field">
        <Search size={19} />
        <input
          aria-label="Rezepte suchen"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder="Name, Zutat oder Tag suchen …"
        />
      </label>
      <div className="filter-row" aria-label="Rezeptfilter">
        {filters.map((item) => (
          <button
            key={item}
            className={filter === item ? 'active' : ''}
            aria-pressed={filter === item}
            onClick={(event) => {
              onFilter(item);
              event.currentTarget.scrollIntoView({
                behavior: window.matchMedia('(prefers-reduced-motion: reduce)')
                  .matches
                  ? 'auto'
                  : 'smooth',
                block: 'nearest',
                inline: 'center',
              });
            }}
          >
            {item === 'Favoriten' && <Heart size={16} />}
            {(item === 'Schnell' || item === 'Gesund') && (
              <Sparkles size={16} />
            )}
            {(item === 'Vegetarisch' || item === 'Vegan') && <Leaf size={16} />}
            {item}
          </button>
        ))}
      </div>
      <div className="recipe-library-actions">
        <button type="button" onClick={() => importFileRef.current?.click()}>
          <span>
            <Upload size={21} />
          </span>
          <span>
            <strong>Rezeptdatei importieren</strong>
            <small>Mampffred Rezept Datei</small>
          </span>
          <ChevronRight size={19} />
        </button>
        <input
          ref={importFileRef}
          hidden
          type="file"
          accept=".mampffred-rezept,application/json"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onImport(file);
            event.currentTarget.value = '';
          }}
        />
      </div>
      <span className="sr-only" role="status" aria-live="polite">
        {recipes.length}{' '}
        {recipes.length === 1
          ? 'Rezept wird angezeigt'
          : 'Rezepte werden angezeigt'}
      </span>
      {!query && filter === 'Alle' && data.recipeDrafts.length > 0 && (
        <section className="recipe-drafts" aria-labelledby="drafts-title">
          <div>
            <h2 id="drafts-title">Entwürfe</h2>
            <small>Automatisch lokal gespeichert</small>
          </div>
          {data.recipeDrafts
            .slice()
            .sort((left, right) =>
              right.updatedAt.localeCompare(left.updatedAt),
            )
            .map((draft) => (
              <button
                key={draft.id}
                type="button"
                onClick={() => onDraft(draft)}
              >
                <span>
                  <strong>
                    {draft.name.trim() ||
                      draft.ingredients.find((ingredient) =>
                        ingredient.name.trim(),
                      )?.name ||
                      'Neues Rezept'}
                  </strong>
                  <small>Weiter bearbeiten</small>
                </span>
                <ChevronRight size={18} />
              </button>
            ))}
        </section>
      )}
      {recipes.length ? (
        <div className="recipe-grid" key={filter}>
          {recipes.map((recipe, index) => (
            <article
              className="recipe-tile"
              key={recipe.id}
              style={
                {
                  '--recipe-index': Math.min(index, 5),
                } as React.CSSProperties
              }
            >
              <button
                className="recipe-tile-main"
                onClick={() => onRecipe(recipe)}
              >
                <RecipeImage recipe={recipe} imageUrls={imageUrls} />
                <strong>{recipe.name}</strong>
                <small>
                  <Clock3 size={13} /> {recipe.minutes} Min.
                </small>
              </button>
              <button
                className={`favorite ${recipe.favorite ? 'active' : ''}`}
                aria-label={
                  recipe.favorite
                    ? 'Aus Favoriten entfernen'
                    : 'Zu Favoriten hinzufügen'
                }
                onClick={() => onToggleFavorite(recipe)}
              >
                <Heart
                  size={18}
                  fill={recipe.favorite ? 'currentColor' : 'none'}
                />
              </button>
              <div className="tile-tags">
                {visibleRecipeTags(recipe)
                  .slice(0, 2)
                  .map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="no-results">
          {data.recipes.length ? (
            <Search size={32} />
          ) : (
            <CookingPot size={32} />
          )}
          <h2>
            {data.recipes.length
              ? 'Kein Rezept gefunden'
              : 'Deine Rezeptsammlung ist noch leer'}
          </h2>
          <p>
            {data.recipes.length
              ? 'Probiere einen anderen Suchbegriff oder Filter.'
              : 'Lege dein erstes Rezept an oder starte mit Beispielen.'}
          </p>
          {!data.recipes.length && (
            <div className="empty-actions compact-actions">
              <button className="primary-button" onClick={onAdd}>
                Erstes Rezept anlegen
              </button>
              <button className="secondary-button" onClick={onAddSamples}>
                Beispielrezepte ausprobieren
              </button>
            </div>
          )}
          {data.recipes.length > 0 && (query || filter !== 'Alle') && (
            <button
              type="button"
              className="secondary-button no-results-reset"
              onClick={() => {
                onQuery('');
                onFilter('Alle');
              }}
            >
              Filter zurücksetzen
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ShoppingView({
  data,
  weekStart,
  onWeekStart,
  onChange,
  onRemove,
  onFromWeek,
}: {
  data: AppData;
  weekStart: string;
  onWeekStart: (weekStart: string) => void;
  onChange: (items: ShoppingItem[]) => void;
  onRemove: (items: ShoppingItem[]) => void;
  onFromWeek: () => void;
}) {
  const [newItem, setNewItem] = useState('');
  const categories: ShoppingItem['category'][] = [
    'Gemüse & Obst',
    'Kühlregal',
    'Vorrat',
    'Backwaren',
    'Sonstiges',
  ];
  const categoryIcons: Record<ShoppingItem['category'], React.ReactNode> = {
    'Gemüse & Obst': <Carrot size={21} />,
    Kühlregal: <Milk size={21} />,
    Vorrat: <Container size={21} />,
    Backwaren: <Croissant size={21} />,
    Sonstiges: <ShoppingBasket size={21} />,
  };
  const categoryArt: Partial<Record<ShoppingItem['category'], string>> = {
    'Gemüse & Obst': assetUrl('assets/shopping-produce-v1.png'),
    Kühlregal: assetUrl('assets/shopping-dairy-v1.png'),
    Vorrat: assetUrl('assets/shopping-pantry-v1.png'),
    Backwaren: assetUrl('assets/shopping-bakery-v1.png'),
  };
  const visibleShopping = data.shopping.filter(
    (item) =>
      item.origin.kind !== 'week' || item.origin.weekStart === weekStart,
  );
  const weekItems = visibleShopping.filter(
    (item) => item.origin.kind === 'week',
  );
  const completed = visibleShopping.filter((item) => item.checked).length;
  const percentage = visibleShopping.length
    ? Math.round((completed / visibleShopping.length) * 100)
    : 0;
  function addItem() {
    const name = newItem.trim();
    if (!name || data.shopping.length >= 10_000) return;
    onChange([
      ...data.shopping,
      {
        id: crypto.randomUUID(),
        name,
        category: 'Sonstiges',
        checked: false,
        origin: { kind: 'manual' },
      },
    ]);
    setNewItem('');
  }
  return (
    <div className="screen-content shopping-view">
      <header className="shopping-hero">
        <div>
          <h1>Einkauf</h1>
          <p>Deine Einkaufsliste für diese Woche</p>
        </div>
        <span className="shopping-hero-leaves" aria-hidden="true">
          <img src={assetUrl('assets/recipes-header-leaves-v3.png')} alt="" />
        </span>
        <details className="shopping-period-menu">
          <summary aria-label="Einkaufswoche wählen">
            <CalendarDays size={17} />
            <strong>Woche</strong>
            <ChevronDown size={17} />
          </summary>
          <div>
            <button
              type="button"
              onClick={() => onWeekStart(addLocalDays(weekStart, -7))}
            >
              <ChevronLeft size={16} /> Vorherige Woche
            </button>
            <span>
              {shortDate.format(fromIso(weekStart))} –{' '}
              {shortDate.format(fromIso(addLocalDays(weekStart, 6)))}
            </span>
            <button
              type="button"
              onClick={() => onWeekStart(addLocalDays(weekStart, 7))}
            >
              Nächste Woche <ChevronRight size={16} />
            </button>
          </div>
        </details>
      </header>
      <section className="progress-card">
        <div
          className="progress-ring"
          role="progressbar"
          aria-label="Einkauf erledigt"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percentage}
          style={
            { '--progress': `${percentage * 3.6}deg` } as React.CSSProperties
          }
        >
          <svg viewBox="0 0 44 44" aria-hidden="true">
            <circle className="progress-ring-track" cx="22" cy="22" r="18" />
            <circle
              className="progress-ring-value"
              cx="22"
              cy="22"
              r="18"
              pathLength="100"
              strokeDasharray={`${percentage} 100`}
            />
          </svg>
          <span>
            <strong>{percentage}%</strong>
            <small>
              {completed} von {visibleShopping.length}
            </small>
          </span>
        </div>
        <div>
          <strong>
            {visibleShopping.length === 0
              ? 'Bereit für deine Liste'
              : percentage === 100
                ? 'Alles erledigt!'
                : 'Fast geschafft!'}
          </strong>
          <p>
            {visibleShopping.length === 0
              ? 'Erstelle sie aus deinem Wochenplan oder ergänze eigene Artikel.'
              : `Du hast ${completed} von ${visibleShopping.length} Artikeln erledigt.`}
          </p>
          <div className="progress-track">
            <span style={{ width: `${percentage}%` }} />
          </div>
          <button
            className="shopping-plan-source"
            type="button"
            onClick={onFromWeek}
          >
            <Leaf size={20} />
            <span>
              <strong>Aus deinem aktuellen Wochenplan</strong>
              <small>
                {weekItems.length
                  ? `${weekItems.length} Zutaten aus geplanten Rezepten`
                  : 'Alle Zutaten für deine geplanten Rezepte'}
              </small>
            </span>
            <ChevronRight size={17} />
          </button>
        </div>
      </section>
      <div className="shopping-primary-actions">
        <button
          type="button"
          className="primary-button shopping-from-week"
          onClick={onFromWeek}
        >
          <CalendarDays size={18} />
          <span>
            <strong>Aus Wochenplan erstellen</strong>
            <small>Fehlende Zutaten hinzufügen</small>
          </span>
        </button>
        {completed > 0 && (
          <button
            type="button"
            className="secondary-button clear-completed"
            onClick={() =>
              onRemove(visibleShopping.filter((item) => item.checked))
            }
          >
            <Trash2 size={18} />
            <span>
              <strong>Erledigte entfernen ({completed})</strong>
              <small>Nur offene Artikel behalten</small>
            </span>
          </button>
        )}
      </div>
      <div className="shopping-groups">
        {categories.map((category) => {
          const items = visibleShopping.filter(
            (item) => item.category === category,
          );
          if (!items.length) return null;
          return (
            <details open className="shopping-group" key={category}>
              <summary>
                <span className="shopping-category-icon" aria-hidden="true">
                  {categoryIcons[category]}
                </span>
                <span className="shopping-category-copy">
                  <strong>{category}</strong>
                  <small>
                    {items.filter((item) => item.checked).length} von{' '}
                    {items.length} erledigt
                  </small>
                </span>
                {categoryArt[category] && (
                  <img
                    className="shopping-category-art"
                    src={categoryArt[category]}
                    alt=""
                    aria-hidden="true"
                  />
                )}
                <ChevronDown size={17} />
              </summary>
              {items.map((item) => (
                <div
                  className={`shopping-row ${item.checked ? 'is-complete' : ''}`}
                  key={item.id}
                >
                  <label className="shopping-check">
                    <input
                      type="checkbox"
                      aria-label={`${item.name} als ${item.checked ? 'unerledigt' : 'erledigt'} markieren`}
                      checked={item.checked}
                      onChange={() =>
                        onChange(
                          data.shopping.map((entry) =>
                            entry.id === item.id
                              ? { ...entry, checked: !entry.checked }
                              : entry,
                          ),
                        )
                      }
                    />
                    <span className={item.checked ? 'done' : ''}>
                      {item.name}
                    </span>
                  </label>
                  {item.source && <small>{item.source}</small>}
                  <IconButton
                    label={`${item.name} entfernen`}
                    onClick={() => onRemove([item])}
                  >
                    <Trash2 size={15} />
                  </IconButton>
                </div>
              ))}
            </details>
          );
        })}
      </div>
      <div className="add-item">
        <input
          aria-label="Einkaufsartikel hinzufügen"
          value={newItem}
          maxLength={500}
          onChange={(event) => setNewItem(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && addItem()}
          placeholder="Artikel hinzufügen"
        />
        <button onClick={addItem}>
          <Plus size={19} /> Hinzufügen
        </button>
      </div>
    </div>
  );
}

function MoreView({
  data,
  onOpen,
}: {
  data: AppData;
  onOpen: (panel: SettingsPanel) => void;
}) {
  const groups: Array<{
    title: string;
    items: Array<{
      panel: SettingsPanel;
      label: string;
      detail: string;
      icon: React.ReactNode;
    }>;
  }> = [
    {
      title: 'Planung & Inhalte',
      items: [
        {
          panel: 'nutrition',
          label: 'Nährwerte & Ziele',
          detail: data.nutritionSettings.enabled
            ? 'Hinweise aktiviert'
            : 'Optional einrichten',
          icon: <Info size={20} />,
        },
        {
          panel: 'foods',
          label: 'Lebensmittel',
          detail: `${data.customFoods.length} ${data.customFoods.length === 1 ? 'eigener Eintrag' : 'eigene Einträge'}`,
          icon: <Leaf size={20} />,
        },
      ],
    },
    {
      title: 'Daten',
      items: [
        {
          panel: 'backup',
          label: 'Sicherung',
          detail: data.lastBackup
            ? `Zuletzt ${shortDate.format(new Date(data.lastBackup))}`
            : 'Noch nicht gesichert',
          icon: <ShieldCheck size={20} />,
        },
        {
          panel: 'privacy',
          label: 'Datenschutz & Speicher',
          detail: 'Lokal auf diesem Gerät',
          icon: <LockKeyhole size={20} />,
        },
      ],
    },
    {
      title: 'App',
      items: [
        {
          panel: 'app',
          label: 'Installation & Darstellung',
          detail: 'Warm & frisch · Version 0.1.0',
          icon: <Settings size={20} />,
        },
      ],
    },
  ];
  return (
    <div className="screen-content more-view">
      <Header title="Mehr" subtitle="Alles an seinem Platz" />
      <section className="more-intro-card">
        <span>
          <Leaf size={27} />
        </span>
        <div>
          <strong>Dein persönlicher Begleiter</strong>
          <small>Individuell. Privat. Immer für dich da.</small>
        </div>
      </section>
      {groups.map((group) => (
        <section className="more-menu-group" key={group.title}>
          <h2>{group.title}</h2>
          <div className="more-menu">
            {group.items.map((item) => (
              <button
                type="button"
                key={item.panel}
                onClick={() => onOpen(item.panel)}
              >
                <span className="more-menu-icon">{item.icon}</span>
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.detail}</small>
                </span>
                <ChevronRight size={19} />
              </button>
            ))}
          </div>
        </section>
      ))}
      <section className="more-control-note">
        <Sparkles size={20} />
        <p>
          <strong>Du behältst die Kontrolle.</strong>
          <span>Alle Einstellungen kannst du jederzeit anpassen.</span>
        </p>
      </section>
    </div>
  );
}

function BottomNav({ tab, onTab }: { tab: Tab; onTab: (tab: Tab) => void }) {
  const items: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: 'today', label: 'Heute', icon: <Home size={21} /> },
    { id: 'week', label: 'Woche', icon: <CalendarDays size={21} /> },
    { id: 'recipes', label: 'Rezepte', icon: <Utensils size={21} /> },
    { id: 'shopping', label: 'Einkauf', icon: <ShoppingCart size={21} /> },
    { id: 'more', label: 'Mehr', icon: <EllipsisVertical size={21} /> },
  ];
  return (
    <nav className="bottom-nav" aria-label="Hauptnavigation">
      {items.map((item) => (
        <button
          key={item.id}
          className={tab === item.id ? 'active' : ''}
          aria-current={tab === item.id ? 'page' : undefined}
          onClick={() => onTab(item.id)}
        >
          {item.icon}
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}

function RecipeDetail({
  recipe,
  automaticEstimates,
  imageUrls,
  onClose,
  onEdit,
  onPlan,
  onFavorite,
  onAddToShopping,
  onShare,
  planLabel = 'Planen',
  inactive = false,
}: {
  recipe: Recipe;
  automaticEstimates: boolean;
  imageUrls: Record<string, string>;
  onClose: () => void;
  onEdit: () => void;
  onPlan: (servings: number) => void;
  onFavorite: () => void;
  onAddToShopping: (servings: number) => void;
  onShare: () => void;
  planLabel?: string;
  inactive?: boolean;
}) {
  const [servings, setServings] = useState(recipe.servings);
  useEffect(() => setServings(recipe.servings), [recipe.id, recipe.servings]);
  const dialogRef = useModalFocus<HTMLDivElement>(onClose);
  const factor = servings / recipe.servings;
  const nutritionMetrics = [
    ['energyKcal', 'kcal', 'Energie'],
    ['proteinG', 'g', 'Eiweiß'],
    ['fatG', 'g', 'Fett'],
    ['carbohydratesG', 'g', 'Kohlenhydrate'],
  ] as const;
  const visibleNutrition = nutritionMetrics.flatMap(([key, unit, label]) => {
    const metric = recipe.nutrition?.wholeRecipe[key];
    if (!metric || (metric.source.kind === 'dataset' && !automaticEstimates))
      return [];
    return [
      {
        key,
        unit,
        label,
        value: Math.round((metric.value / recipe.servings) * 10) / 10,
      },
    ];
  });
  return (
    <div className={`detail-overlay ${inactive ? 'underlay' : ''}`}>
      <div
        ref={dialogRef}
        className="detail-screen"
        role="dialog"
        aria-modal={!inactive}
        aria-hidden={inactive || undefined}
        inert={inactive || undefined}
        aria-labelledby="recipe-detail-title"
      >
        <div className="detail-topbar">
          <IconButton label="Zurück" onClick={onClose}>
            <ArrowLeft size={22} />
          </IconButton>
          <div>
            <IconButton label="Rezept teilen" onClick={onShare}>
              <Share2 size={20} />
            </IconButton>
            <IconButton
              label={
                recipe.favorite
                  ? 'Aus Favoriten entfernen'
                  : 'Zu Favoriten hinzufügen'
              }
              onClick={onFavorite}
            >
              <Heart
                size={21}
                fill={recipe.favorite ? 'currentColor' : 'none'}
              />
            </IconButton>
            <IconButton label="Rezept bearbeiten" onClick={onEdit}>
              <Pencil size={19} />
            </IconButton>
          </div>
        </div>
        <RecipeImage
          recipe={recipe}
          imageUrls={imageUrls}
          className="detail-image"
        />
        <div className="detail-body">
          <h1 id="recipe-detail-title">{recipe.name}</h1>
          <p>{recipe.description}</p>
          <div className="recipe-meta">
            <span>
              <Clock3 size={16} /> {recipe.minutes} Min.
            </span>
            <span>
              <Users size={16} /> {servings} Portionen
            </span>
            {visibleRecipeTags(recipe).map((tag) => (
              <span key={tag}>
                <Leaf size={16} /> {tag}
              </span>
            ))}
            {recipe.nutrition?.wholeRecipe.proteinG &&
              (recipe.nutrition.wholeRecipe.proteinG.source.kind !==
                'dataset' ||
                automaticEstimates) && (
                <span>
                  <Info size={16} /> ca.{' '}
                  {Math.round(
                    recipe.nutrition.wholeRecipe.proteinG.value /
                      recipe.servings,
                  )}{' '}
                  g Protein / Portion ·{' '}
                  {recipe.nutrition.wholeRecipe.proteinG.source.kind === 'user'
                    ? 'eigene Angabe'
                    : 'aus Zutaten geschätzt'}
                </span>
              )}
          </div>
          <button
            className="primary-button detail-plan-button"
            onClick={() => onPlan(servings)}
          >
            <CalendarDays size={19} /> {planLabel}
          </button>
          <div className="serving-stepper">
            <button
              aria-label="Eine Portion weniger"
              onClick={() => setServings(Math.max(1, servings - 1))}
            >
              <Minus size={18} />
            </button>
            <strong>{servings} Portionen</strong>
            <button
              aria-label="Eine Portion mehr"
              disabled={servings >= 1_000}
              onClick={() => setServings(Math.min(1_000, servings + 1))}
            >
              <Plus size={18} />
            </button>
          </div>
          <section className="recipe-section">
            <h2>Zutaten</h2>
            <div className="ingredients">
              {recipe.ingredients.map((ingredient, index) => (
                <div key={`${ingredient.name}-${index}`}>
                  <strong>
                    {Number.isFinite(Number(ingredient.amount))
                      ? Math.round(Number(ingredient.amount) * factor * 10) / 10
                      : ingredient.amount}
                  </strong>
                  <span>{ingredient.unit}</span>
                  <p>{ingredient.name}</p>
                </div>
              ))}
            </div>
            <button
              className="secondary-button add-to-shopping"
              onClick={() => onAddToShopping(servings)}
            >
              <ShoppingCart size={17} /> Zutaten zur Einkaufsliste hinzufügen
            </button>
          </section>
          {visibleNutrition.length > 0 && (
            <section
              className="recipe-nutrition-strip"
              aria-label="Nährwerte pro Portion"
            >
              <strong>Nährwerte pro Portion (ca.)</strong>
              <div>
                {visibleNutrition.map((metric) => (
                  <span key={metric.key}>
                    <strong>
                      {metric.value} {metric.unit}
                    </strong>
                    <small>{metric.label}</small>
                  </span>
                ))}
              </div>
            </section>
          )}
          <section className="recipe-section">
            <h2>Zubereitung</h2>
            <ol className="steps">
              {recipe.steps.map((step, index) => (
                <li key={`${step}-${index}`}>
                  <span>{index + 1}</span>
                  <p>{step}</p>
                </li>
              ))}
            </ol>
          </section>
          <div className="detail-actions">
            <button onClick={onEdit}>
              <Utensils size={18} /> Bearbeiten
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FoodMappingSheet({
  ingredientName,
  ingredientAmount,
  ingredientUnit,
  mode,
  currentOverride,
  onApply,
  onClose,
}: {
  ingredientName: string;
  ingredientAmount: string;
  ingredientUnit: string;
  mode: 'mapping' | 'amount';
  currentOverride?: FoodOverride;
  onApply: (override: FoodOverride | undefined) => void;
  onClose: () => void;
}) {
  const sheetExit = useAnimatedSheetClose(onClose);
  const [query, setQuery] = useState(ingredientName);
  const [candidates, setCandidates] = useState<readonly FoodReference[]>([]);
  const [searchState, setSearchState] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  );
  const [customProtein, setCustomProtein] = useState(() =>
    currentOverride?.kind === 'whole-ingredient' &&
    currentOverride.nutrients.proteinG !== undefined
      ? String(currentOverride.nutrients.proteinG)
      : '',
  );
  const dialogRef = useModalFocus<HTMLElement>(
    sheetExit.close,
    '[data-initial-focus]',
  );
  const sheetSwipe = useSheetSwipeToClose(onClose);
  const parsedProtein = Number(customProtein);
  const customProteinValid =
    customProtein.trim() !== '' &&
    Number.isFinite(parsedProtein) &&
    parsedProtein >= 0 &&
    parsedProtein <= 10_000;
  useEffect(() => {
    let cancelled = false;
    setSearchState('loading');
    const timer = window.setTimeout(() => {
      void import('@/lib/bls-catalog')
        .then(({ blsCatalog }) => {
          if (cancelled) return;
          setCandidates(searchFoodReferences(query, blsCatalog, 8));
          setSearchState('ready');
        })
        .catch(() => {
          if (!cancelled) setSearchState('error');
        });
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);
  return (
    <div
      className={`modal-backdrop ${sheetExit.closing ? 'sheet-backdrop-closing' : ''}`}
    >
      <section
        ref={dialogRef}
        className={`planner-sheet food-mapping-sheet swipe-sheet ${sheetExit.closing ? 'sheet-closing' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="food-mapping-title"
      >
        <div className="sheet-handle" aria-hidden="true" {...sheetSwipe} />
        <div className="modal-header">
          <h2 id="food-mapping-title">
            {mode === 'amount' ? 'Menge nicht umrechenbar' : 'Zutat zuordnen'}
          </h2>
          <IconButton label="Schließen" onClick={sheetExit.close}>
            <X size={20} />
          </IconButton>
        </div>
        <p>
          Im Rezept: <strong>{ingredientName}</strong>
        </p>
        {mode === 'amount' && (
          <p>
            „{ingredientAmount || '–'} {ingredientUnit}“ kann Mampffred nicht
            sicher in Gramm umrechnen. Du kannst stattdessen den Proteinwert
            dieser Zutat für das ganze Rezept eintragen.
          </p>
        )}
        <small className="mapping-scope-note">
          Deine Auswahl bleibt lokal und gilt nur für diese Zutat in diesem
          Rezept.
        </small>
        {mode === 'mapping' && (
          <label>
            Passendes Lebensmittel suchen
            <input
              data-initial-focus
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="z. B. Kokosmilch"
            />
          </label>
        )}
        {mode === 'mapping' && (
          <div className="food-candidates">
            {searchState === 'loading' && (
              <small>Lebensmittel werden gesucht …</small>
            )}
            {searchState === 'error' && (
              <small role="status">
                Die lokale Lebensmittelliste konnte nicht geladen werden.
              </small>
            )}
            {candidates.map((food) => (
              <button
                type="button"
                key={food.id}
                aria-pressed={
                  currentOverride?.kind === 'food' &&
                  currentOverride.foodId === food.id
                }
                onClick={() => onApply({ kind: 'food', foodId: food.id })}
              >
                <strong>{foodDisplayName(food)}</strong>
                <small>
                  {food.nutrientsPer100g.proteinG !== undefined
                    ? `${food.nutrientsPer100g.proteinG} g Protein/100 g`
                    : 'Proteinwert nicht verfügbar'}
                  {currentOverride?.kind === 'food' &&
                  currentOverride.foodId === food.id
                    ? ' · aktuell ausgewählt'
                    : ''}
                </small>
              </button>
            ))}
            {searchState === 'ready' &&
              query.trim() &&
              candidates.length === 0 && (
                <small>Keine passende Zuordnung gefunden.</small>
              )}
          </div>
        )}
        <details className="custom-ingredient-value" open>
          <summary>Eigenen Wert verwenden</summary>
          <label>
            Protein dieser Zutat in diesem Rezept
            <span className="input-with-unit">
              <input
                type="number"
                data-initial-focus={mode === 'amount' || undefined}
                min="0"
                max="10000"
                step="0.1"
                inputMode="decimal"
                value={customProtein}
                onChange={(event) => setCustomProtein(event.target.value)}
              />
              <span>g</span>
            </span>
          </label>
          <button
            type="button"
            disabled={!customProteinValid}
            onClick={() =>
              onApply({
                kind: 'whole-ingredient',
                nutrients: { proteinG: parsedProtein },
              })
            }
          >
            Eigenen Wert verwenden
          </button>
        </details>
        <button
          type="button"
          className="secondary-button"
          onClick={() => onApply({ kind: 'ignored' })}
        >
          In diesem Rezept auslassen
        </button>
        {currentOverride && (
          <button
            type="button"
            className="secondary-button"
            onClick={() => onApply(undefined)}
          >
            Eigene Korrektur entfernen
          </button>
        )}
      </section>
    </div>
  );
}

function IngredientCombobox({
  ingredient,
  index,
  customFoods,
  onChange,
  onSelected,
  onCreateCustom,
  registerInput,
}: {
  ingredient: RecipeIngredient;
  index: number;
  customFoods: readonly CustomFood[];
  onChange: (ingredient: RecipeIngredient) => void;
  onSelected: () => void;
  onCreateCustom: (name: string) => void;
  registerInput: (node: HTMLInputElement | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [systemCatalog, setSystemCatalog] = useState<readonly FoodReference[]>(
    [],
  );
  const [activeIndex, setActiveIndex] = useState(-1);
  const [popupLayout, setPopupLayout] = useState({
    above: false,
    maxHeight: 320,
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const stableId = useMemo(
    () =>
      `ingredient-food-${ingredient.id ?? index}`.replace(/[^a-z0-9_-]/gi, '-'),
    [index, ingredient.id],
  );
  const customCatalog = useMemo(
    () => customFoods.map(customFoodToReference),
    [customFoods],
  );
  const combinedCatalog = useMemo(
    () => [...customCatalog, ...systemCatalog],
    [customCatalog, systemCatalog],
  );
  const query = ingredient.name.trim();

  useEffect(() => {
    if (!open || systemCatalog.length) return;
    let cancelled = false;
    setLoading(true);
    void import('@/lib/bls-catalog')
      .then(({ blsCatalog }) => {
        if (!cancelled) setSystemCatalog(blsCatalog);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, systemCatalog.length]);

  const results = useMemo(() => {
    if (!query) return customCatalog.slice(0, 6);
    return searchFoodReferences(query, combinedCatalog, 8);
  }, [combinedCatalog, customCatalog, query]);
  const actions = query ? 2 : 0;
  const optionCount = results.length + actions;
  const resultsSignature = results.map((food) => food.id).join('\0');

  useEffect(() => setActiveIndex(-1), [resultsSignature]);
  useEffect(() => {
    if (!open) return;
    const updatePopupLayout = () => {
      const rect = inputRef.current?.getBoundingClientRect();
      if (!rect) return;
      const viewportTop = window.visualViewport?.offsetTop ?? 0;
      const viewportHeight =
        window.visualViewport?.height ?? window.innerHeight;
      const viewportBottom = viewportTop + viewportHeight;
      const below = viewportBottom - rect.bottom - 12;
      const above = rect.top - viewportTop - 12;
      const opensAbove = below < 220 && above > below;
      setPopupLayout({
        above: opensAbove,
        maxHeight: Math.max(140, Math.min(360, opensAbove ? above : below)),
      });
    };
    updatePopupLayout();
    window.visualViewport?.addEventListener('resize', updatePopupLayout);
    window.visualViewport?.addEventListener('scroll', updatePopupLayout);
    return () => {
      window.visualViewport?.removeEventListener('resize', updatePopupLayout);
      window.visualViewport?.removeEventListener('scroll', updatePopupLayout);
    };
  }, [open]);
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    document
      .getElementById(`${stableId}-option-${activeIndex}`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open, stableId]);

  const chooseFood = (food: FoodReference) => {
    const isCustom = food.source.dataset === 'Eigene Lebensmittel';
    onChange({
      ...ingredient,
      name: foodDisplayName(food),
      foodLink: {
        kind: isCustom ? 'custom' : 'bls',
        foodId: food.id,
      },
      unit: ingredient.unit || preferredUnitForFood(food),
    });
    setOpen(false);
    setActiveIndex(-1);
    window.requestAnimationFrame(onSelected);
  };

  const chooseIndex = (nextIndex: number) => {
    if (nextIndex < results.length) {
      const food = results[nextIndex];
      if (food) chooseFood(food);
      return;
    }
    if (nextIndex === results.length) {
      setOpen(false);
      setActiveIndex(-1);
      onSelected();
      return;
    }
    setOpen(false);
    setActiveIndex(-1);
    onCreateCustom(query);
  };

  return (
    <div className="ingredient-combobox">
      <div className="ingredient-combobox-input">
        <Search size={18} aria-hidden="true" />
        <input
          ref={(node) => {
            inputRef.current = node;
            registerInput(node);
          }}
          role="combobox"
          aria-label={`Lebensmittel für Zutat ${index + 1}`}
          aria-describedby={`${stableId}-help`}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={`${stableId}-listbox`}
          aria-activedescendant={
            open && activeIndex >= 0
              ? `${stableId}-option-${activeIndex}`
              : undefined
          }
          autoComplete="off"
          value={ingredient.name}
          maxLength={500}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 100)}
          onChange={(event) => {
            const name = event.target.value;
            onChange({ ...ingredient, name, foodLink: undefined });
            setOpen(true);
            setActiveIndex(-1);
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setOpen(true);
              setActiveIndex((current) =>
                optionCount ? (current + 1 + optionCount) % optionCount : -1,
              );
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setOpen(true);
              setActiveIndex((current) =>
                optionCount ? (current - 1 + optionCount) % optionCount : -1,
              );
            } else if (event.key === 'Enter' && open) {
              event.preventDefault();
              if (activeIndex >= 0) chooseIndex(activeIndex);
              else {
                setOpen(false);
                onSelected();
              }
            } else if (event.key === 'Escape' && open) {
              event.preventDefault();
              event.stopPropagation();
              setOpen(false);
              setActiveIndex(-1);
            } else if (event.key === 'Tab') {
              setOpen(false);
            }
          }}
          placeholder="Lebensmittel suchen oder eingeben"
        />
        <button
          type="button"
          className="ingredient-combobox-toggle"
          aria-label={open ? 'Vorschläge schließen' : 'Vorschläge öffnen'}
          tabIndex={-1}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => {
            setOpen((current) => !current);
            inputRef.current?.focus();
          }}
        >
          <ChevronDown size={18} />
        </button>
      </div>
      <span id={`${stableId}-help`} className="sr-only">
        Tippe zum Suchen oder verwende deinen Text als freie Zutat.
      </span>
      {open && (
        <div
          id={`${stableId}-listbox`}
          className={`ingredient-options${popupLayout.above ? ' above' : ''}`}
          style={
            {
              '--ingredient-options-max-height': `${popupLayout.maxHeight}px`,
            } as React.CSSProperties
          }
          role="listbox"
          aria-label={`Vorschläge für Zutat ${index + 1}`}
        >
          {loading && !systemCatalog.length && (
            <div
              className="ingredient-option-status"
              role="option"
              aria-disabled="true"
              aria-selected="false"
            >
              Lebensmittel werden geladen …
            </div>
          )}
          {!loading && !query && !results.length && (
            <div
              className="ingredient-option-status"
              role="option"
              aria-disabled="true"
              aria-selected="false"
            >
              Tippe einen Namen, um die Bibliothek zu durchsuchen.
            </div>
          )}
          {results.map((food, resultIndex) => {
            const displayName = foodDisplayName(food);
            const detail = food.name !== displayName ? food.name : undefined;
            const custom = food.source.dataset === 'Eigene Lebensmittel';
            return (
              <button
                type="button"
                role="option"
                aria-label={`${displayName}${
                  custom
                    ? ', eigenes Lebensmittel'
                    : detail
                      ? `, ${detail}`
                      : ', Systembibliothek'
                }`}
                id={`${stableId}-option-${resultIndex}`}
                aria-selected={ingredient.foodLink?.foodId === food.id}
                tabIndex={-1}
                className={activeIndex === resultIndex ? 'active' : ''}
                key={food.id}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => chooseFood(food)}
              >
                <span>
                  <strong>{displayName}</strong>
                  {detail && <small>{detail}</small>}
                </span>
                <em>
                  {food.needsReview
                    ? 'Ungeprüft'
                    : custom
                      ? 'Eigenes'
                      : 'System'}
                </em>
              </button>
            );
          })}
          {query && (
            <>
              <button
                type="button"
                role="option"
                aria-label={`„${query}“ frei verwenden, nur in diesem Rezept`}
                id={`${stableId}-option-${results.length}`}
                aria-selected={false}
                tabIndex={-1}
                className={activeIndex === results.length ? 'active' : ''}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => chooseIndex(results.length)}
              >
                <span>
                  <strong>„{query}“ frei verwenden</strong>
                  <small>Nur in diesem Rezept</small>
                </span>
              </button>
              <button
                type="button"
                role="option"
                aria-label={`„${query}“ als eigenes Lebensmittel anlegen`}
                id={`${stableId}-option-${results.length + 1}`}
                aria-selected={false}
                tabIndex={-1}
                className={activeIndex === results.length + 1 ? 'active' : ''}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => chooseIndex(results.length + 1)}
              >
                <span>
                  <strong>„{query}“ als eigenes Lebensmittel anlegen</strong>
                  <small>Für weitere Rezepte speichern</small>
                </span>
                <Plus size={18} />
              </button>
            </>
          )}
        </div>
      )}
      <span className="ingredient-combobox-live sr-only" aria-live="polite">
        {open && !loading
          ? `${results.length} Lebensmittel${actions ? ' und 2 weitere Aktionen' : ''} verfügbar`
          : ''}
      </span>
    </div>
  );
}

function CustomFoodSheet({
  initialName,
  food,
  onClose,
  onSave,
}: {
  initialName?: string;
  food?: CustomFood;
  onClose: () => void;
  onSave: (food: CustomFood) => void;
}) {
  const sheetExit = useAnimatedSheetClose(onClose);
  const [name, setName] = useState(food?.name ?? initialName ?? '');
  const [nutrients, setNutrients] = useState({
    energyKcal: String(food?.nutrientsPer100g.energyKcal ?? ''),
    proteinG: String(food?.nutrientsPer100g.proteinG ?? ''),
    carbohydratesG: String(food?.nutrientsPer100g.carbohydratesG ?? ''),
    fatG: String(food?.nutrientsPer100g.fatG ?? ''),
    fiberG: String(food?.nutrientsPer100g.fiberG ?? ''),
    sugarG: String(food?.nutrientsPer100g.sugarG ?? ''),
    saltG: String(food?.nutrientsPer100g.saltG ?? ''),
  });
  const [density, setDensity] = useState(String(food?.densityGPerMl ?? ''));
  const [gramsPerPiece, setGramsPerPiece] = useState(
    String(food?.gramsPerUnit?.stueck ?? ''),
  );
  const dialogRef = useModalFocus<HTMLFormElement>(
    sheetExit.close,
    '[data-initial-focus]',
  );
  const sheetSwipe = useSheetSwipeToClose(onClose);
  const fields = [
    ['energyKcal', 'Energie', 'kcal'],
    ['proteinG', 'Eiweiß', 'g'],
    ['carbohydratesG', 'Kohlenhydrate', 'g'],
    ['fatG', 'Fett', 'g'],
    ['fiberG', 'Ballaststoffe', 'g'],
    ['sugarG', 'Zucker', 'g'],
    ['saltG', 'Salz', 'g'],
  ] as const;
  return (
    <div
      className={`modal-backdrop nested-sheet ${sheetExit.closing ? 'sheet-backdrop-closing' : ''}`}
    >
      <form
        ref={dialogRef}
        className={`bottom-sheet custom-food-sheet swipe-sheet ${sheetExit.closing ? 'sheet-closing' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="custom-food-title"
        aria-describedby="custom-food-description"
        onSubmit={(event) => {
          event.preventDefault();
          if (!name.trim()) return;
          const timestamp = new Date().toISOString();
          const nutrientsPer100g = Object.fromEntries(
            fields.flatMap(([key]) => {
              const value = nutrients[key].trim();
              return value ? [[key, Number(value)]] : [];
            }),
          ) as CustomFood['nutrientsPer100g'];
          const densityValue = density.trim() ? Number(density) : undefined;
          const pieceValue = gramsPerPiece.trim()
            ? Number(gramsPerPiece)
            : undefined;
          const gramsPerUnit = { ...food?.gramsPerUnit };
          if (pieceValue === undefined) delete gramsPerUnit.stueck;
          else gramsPerUnit.stueck = pieceValue;
          onSave({
            id: food?.id ?? crypto.randomUUID(),
            name: name.trim(),
            aliases: food?.aliases ?? [],
            nutrientsPer100g,
            ...(densityValue !== undefined
              ? { densityGPerMl: densityValue }
              : {}),
            ...(Object.keys(gramsPerUnit).length ? { gramsPerUnit } : {}),
            createdAt: food?.createdAt ?? timestamp,
            updatedAt: timestamp,
          });
        }}
      >
        <div className="sheet-grabber" aria-hidden="true" {...sheetSwipe} />
        <div className="modal-header">
          <IconButton label="Abbrechen" onClick={sheetExit.close}>
            <X size={21} />
          </IconButton>
          <h2 id="custom-food-title">
            {food ? 'Lebensmittel bearbeiten' : 'Eigenes Lebensmittel'}
          </h2>
          <span />
        </div>
        <p id="custom-food-description">
          {food?.needsReview &&
            'Aus einer Sicherung importiert: Bitte Nährwerte, Mengen und Namen prüfen. Mit Speichern bestätigst du diese Angaben. '}
          {food
            ? 'Korrekturen gelten für alle Rezepte, die dieses Lebensmittel verwenden.'
            : 'Der Name genügt. Details kannst du jetzt oder später ergänzen.'}
        </p>
        <label>
          Name
          <input
            data-initial-focus
            required
            maxLength={200}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <details className="custom-food-nutrients">
          <summary>Nährwerte pro 100 g ergänzen (optional)</summary>
          <div className="custom-food-grid">
            {fields.map(([key, label, unit]) => (
              <label key={key}>
                {label}
                <span className="input-with-unit">
                  <input
                    type="number"
                    min="0"
                    max={key === 'energyKcal' ? 1000 : 100}
                    step="0.1"
                    inputMode="decimal"
                    value={nutrients[key]}
                    onChange={(event) =>
                      setNutrients({ ...nutrients, [key]: event.target.value })
                    }
                  />
                  <span>{unit}</span>
                </span>
              </label>
            ))}
          </div>
        </details>
        <details className="custom-food-nutrients">
          <summary>Einheiten genauer berechnen (optional)</summary>
          <p className="field-help">
            Damit lassen sich auch ml, EL, TL oder Stück näherungsweise in Gramm
            umrechnen.
          </p>
          <div className="custom-food-grid">
            <label>
              Dichte
              <span className="input-with-unit">
                <input
                  type="number"
                  min="0.01"
                  max="100"
                  step="0.01"
                  inputMode="decimal"
                  value={density}
                  onChange={(event) => setDensity(event.target.value)}
                />
                <span>g/ml</span>
              </span>
            </label>
            <label>
              Gewicht pro Stück
              <span className="input-with-unit">
                <input
                  type="number"
                  min="0.1"
                  max="1000000"
                  step="0.1"
                  inputMode="decimal"
                  value={gramsPerPiece}
                  onChange={(event) => setGramsPerPiece(event.target.value)}
                />
                <span>g</span>
              </span>
            </label>
          </div>
        </details>
        <button className="primary-button" disabled={!name.trim()}>
          {food ? 'Änderungen speichern' : 'Speichern & auswählen'}
        </button>
      </form>
    </div>
  );
}

function RecipeEditor({
  recipe,
  savedDraft,
  currentImageUrl,
  automaticEstimates,
  foodOverrides,
  customFoods,
  onClose,
  onSave,
  onAutosave,
  onDiscardDraft,
  onCreateCustomFood,
  onDelete,
  inactive = false,
}: {
  recipe?: Recipe;
  savedDraft?: RecipeDraft;
  currentImageUrl?: string;
  automaticEstimates: boolean;
  foodOverrides: Record<string, FoodOverride>;
  customFoods: readonly CustomFood[];
  onClose: () => void;
  onSave: (
    draft: EditorDraft,
    file?: File,
    removeImage?: boolean,
    foodOverrides?: Record<string, FoodOverride>,
  ) => Promise<void>;
  onAutosave: (
    draft: RecipeDraft,
    images?: Record<string, Blob>,
  ) => Promise<void>;
  onDiscardDraft: (draftId: string) => Promise<void>;
  onCreateCustomFood: (food: CustomFood) => boolean;
  onDelete?: () => void;
  inactive?: boolean;
}) {
  const [draft, setDraft] = useState<EditorDraft>(() => {
    if (savedDraft) {
      const {
        foodOverrides: _,
        createdAt: __,
        updatedAt: ___,
        baseRecipeId: ____,
        ...restored
      } = savedDraft;
      return restored;
    }
    return recipe
      ? { ...recipe }
      : {
          id: crypto.randomUUID(),
          name: '',
          description: '',
          minutes: 30,
          servings: 2,
          tags: [],
          ingredients: [
            { id: crypto.randomUUID(), amount: '', unit: '', name: '' },
          ],
          steps: [''],
        };
  });
  const [proteinPerServing, setProteinPerServing] = useState(() => {
    const nutritionSource = savedDraft ?? recipe;
    const protein = nutritionSource?.nutrition?.wholeRecipe.proteinG?.value;
    const isUserValue =
      nutritionSource?.nutrition?.wholeRecipe.proteinG?.source.kind === 'user';
    return protein === undefined || !nutritionSource || !isUserValue
      ? ''
      : String(Math.round((protein / nutritionSource.servings) * 10) / 10);
  });
  const [automaticCalculation, setAutomaticCalculation] =
    useState<RecipeIngredientCalculation>();
  const [draftFoodOverrides, setDraftFoodOverrides] = useState(() => {
    if (savedDraft) return savedDraft.foodOverrides;
    const relevantKeys = new Set(
      draft.ingredients.map((ingredient, index) =>
        ingredientOverrideKey(
          draft.id ?? 'preview',
          ingredient.id ?? `ingredient-${index}`,
        ),
      ),
    );
    return Object.fromEntries(
      Object.entries(foodOverrides).filter(([key]) => relevantKeys.has(key)),
    );
  });
  const [customFoodTarget, setCustomFoodTarget] = useState<{
    ingredientId: string;
    name: string;
  }>();
  const [draftSaveStatus, setDraftSaveStatus] = useState<
    'idle' | 'saving' | 'saved'
  >('idle');
  const [foodPicker, setFoodPicker] = useState<{
    key: string;
    name: string;
    amount: string;
    unit: string;
    mode: 'mapping' | 'amount';
  }>();
  const [file, setFile] = useState<File>();
  const stagedImages = useRef<Record<string, Blob>>({});
  const imageSelection = useRef(0);
  const editorStopped = useRef(false);
  useEffect(() => {
    editorStopped.current = false;
    return () => {
      editorStopped.current = true;
      imageSelection.current += 1;
    };
  }, []);
  const [previewUrl, setPreviewUrl] = useState<string>();
  const [imageError, setImageError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saveBusy, setSaveBusy] = useState(false);
  const [removeImage, setRemoveImage] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const amountRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const unitRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const foodInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [ingredientAnnouncement, setIngredientAnnouncement] = useState('');
  const createdAt = useRef(savedDraft?.createdAt ?? new Date().toISOString());
  const autosaveCallbacks = useRef({ onAutosave, onDiscardDraft });
  autosaveCallbacks.current = { onAutosave, onDiscardDraft };
  const addIngredientAndFocus = () => {
    const id = crypto.randomUUID();
    setDraft((current) => ({
      ...current,
      ingredients: [
        ...current.ingredients,
        { id, amount: '', unit: '', name: '' },
      ],
    }));
    setIngredientAnnouncement('Neue Zutatenzeile hinzugefügt.');
    window.requestAnimationFrame(() => {
      foodInputRefs.current[id]?.focus();
      foodInputRefs.current[id]?.scrollIntoView({ block: 'center' });
    });
  };
  const initialAutosaveSignature = useRef(
    JSON.stringify({ draft, draftFoodOverrides, proteinPerServing }),
  );
  const createDraftRecord = useCallback((): RecipeDraft => {
    const protein = proteinPerServing.trim()
      ? Number(proteinPerServing)
      : undefined;
    const wholeRecipe = { ...draft.nutrition?.wholeRecipe };
    delete wholeRecipe.proteinG;
    if (protein !== undefined && Number.isFinite(protein) && protein > 0)
      wholeRecipe.proteinG = {
        value: protein * draft.servings,
        quality: 'declared',
        source: { kind: 'user' },
      };
    const { shareId: _, ...withoutShareId } = draft;
    const timestamp = new Date().toISOString();
    return {
      ...withoutShareId,
      id: draft.id ?? crypto.randomUUID(),
      imageCell: draft.imageCell ?? 0,
      nutrition:
        Object.keys(wholeRecipe).length > 0
          ? {
              wholeRecipe,
              enteredAs: 'per-serving',
              updatedAt: timestamp,
            }
          : undefined,
      ...(recipe ? { baseRecipeId: recipe.id } : {}),
      foodOverrides: draftFoodOverrides,
      createdAt: createdAt.current,
      updatedAt: timestamp,
    };
  }, [draft, draftFoodOverrides, proteinPerServing, recipe]);
  const requestClose = async () => {
    if (saveBusy) return;
    if (autosaveSignature === initialAutosaveSignature.current) {
      onClose();
      return;
    }
    const record = createDraftRecord();
    setDraftSaveStatus('saving');
    try {
      if (hasMeaningfulRecipeDraft(record))
        await onAutosave(record, stagedImages.current);
      else await onDiscardDraft(record.id);
      setDraftSaveStatus('saved');
      onClose();
    } catch {
      setSaveError(
        'Der Entwurf konnte nicht lokal gespeichert werden. Bitte lasse den Editor geöffnet und versuche es erneut.',
      );
      setDraftSaveStatus('idle');
    }
  };
  const dialogRef = useModalFocus<HTMLFormElement>(
    requestClose,
    '[data-initial-focus]',
  );
  const proteinValue = Number(proteinPerServing);
  const proteinInvalid =
    proteinPerServing.trim() !== '' &&
    (!Number.isFinite(proteinValue) || proteinValue <= 0 || proteinValue > 500);
  const canSave = Boolean(
    draft.name.trim() &&
    draft.ingredients.some((item) => item.name.trim()) &&
    !proteinInvalid,
  );
  const hasDraftContent = hasMeaningfulRecipeDraft(createDraftRecord());
  const displayedImage =
    previewUrl ??
    (!removeImage && draft.imageKey ? currentImageUrl : undefined);
  const ingredientSignature = JSON.stringify(draft.ingredients);
  const autosaveSignature = JSON.stringify({
    draft,
    draftFoodOverrides,
    proteinPerServing,
  });
  const proteinIssues =
    automaticCalculation?.ingredients.filter(
      (ingredient) =>
        ingredient.status !== 'ignored' &&
        ingredient.nutrients.proteinG === undefined,
    ) ?? [];
  useEffect(() => {
    if (!automaticEstimates) {
      setAutomaticCalculation(undefined);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const previewRecipe: Recipe = {
        id: draft.id ?? 'preview',
        shareId: 'preview:local',
        name: 'Vorschau',
        description: '',
        minutes: 1,
        servings: 1,
        tags: [],
        ingredients: JSON.parse(ingredientSignature) as Recipe['ingredients'],
        steps: [],
        imageCell: 0,
      };
      void calculateWithBundledFoodData(
        previewRecipe,
        draftFoodOverrides,
        customFoods,
      ).then(({ calculation }) => {
        if (!cancelled) setAutomaticCalculation(calculation);
      });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    automaticEstimates,
    customFoods,
    draft.id,
    draftFoodOverrides,
    ingredientSignature,
  ]);
  useEffect(() => {
    if (
      saveBusy ||
      editorStopped.current ||
      autosaveSignature === initialAutosaveSignature.current
    )
      return;
    const record = createDraftRecord();
    if (!hasMeaningfulRecipeDraft(record)) {
      void autosaveCallbacks.current.onDiscardDraft(record.id);
      setDraftSaveStatus('idle');
      return;
    }
    setDraftSaveStatus('saving');
    const timer = window.setTimeout(() => {
      if (editorStopped.current) return;
      void autosaveCallbacks.current
        .onAutosave(record, stagedImages.current)
        .then(() => setDraftSaveStatus('saved'))
        .catch(() => {
          setDraftSaveStatus('idle');
          setSaveError(
            'Der Entwurf konnte nicht lokal gespeichert werden. Deine Eingaben bleiben im geöffneten Editor erhalten.',
          );
        });
    }, 550);
    return () => window.clearTimeout(timer);
  }, [autosaveSignature, createDraftRecord, saveBusy]);
  useEffect(() => {
    const flushWhenHidden = () => {
      if (
        saveBusy ||
        editorStopped.current ||
        document.visibilityState !== 'hidden'
      )
        return;
      const record = createDraftRecord();
      if (hasMeaningfulRecipeDraft(record))
        void autosaveCallbacks.current
          .onAutosave(record, stagedImages.current)
          .catch(() =>
            setSaveError(
              'Der Entwurf konnte beim Verlassen der App nicht gespeichert werden.',
            ),
          );
    };
    document.addEventListener('visibilitychange', flushWhenHidden);
    window.addEventListener('pagehide', flushWhenHidden);
    return () => {
      document.removeEventListener('visibilitychange', flushWhenHidden);
      window.removeEventListener('pagehide', flushWhenHidden);
    };
  }, [createDraftRecord, saveBusy]);
  useEffect(() => {
    if (!file) {
      setPreviewUrl(undefined);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return (
    <>
      <div className={`modal-backdrop ${inactive ? 'underlay' : ''}`}>
        <form
          ref={dialogRef}
          className="editor-modal"
          role="dialog"
          aria-modal={!inactive}
          aria-hidden={
            inactive ||
            Boolean(foodPicker) ||
            Boolean(customFoodTarget) ||
            undefined
          }
          inert={
            inactive ||
            Boolean(foodPicker) ||
            Boolean(customFoodTarget) ||
            undefined
          }
          aria-labelledby="recipe-editor-title"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!canSave || saveBusy) return;
            editorStopped.current = true;
            imageSelection.current += 1;
            setSaveBusy(true);
            setSaveError('');
            try {
              const protein =
                proteinPerServing.trim() === ''
                  ? undefined
                  : Number(proteinPerServing);
              const existingNutrients = {
                ...draft.nutrition?.wholeRecipe,
              };
              delete existingNutrients.proteinG;
              if (protein !== undefined)
                existingNutrients.proteinG = {
                  value: protein * draft.servings,
                  quality: 'declared',
                  source: { kind: 'user' },
                };
              await onSave(
                {
                  ...draft,
                  nutrition:
                    Object.keys(existingNutrients).length > 0
                      ? {
                          wholeRecipe: existingNutrients,
                          enteredAs: 'per-serving',
                          updatedAt: new Date().toISOString(),
                        }
                      : undefined,
                },
                file,
                removeImage,
                draftFoodOverrides,
              );
            } catch {
              editorStopped.current = false;
              setSaveError(
                'Das Rezept konnte nicht gespeichert werden. Bitte versuche es erneut.',
              );
              setSaveBusy(false);
            }
          }}
        >
          <div className="modal-header">
            <IconButton
              label="Schließen"
              onClick={requestClose}
              disabled={saveBusy}
            >
              <X size={22} />
            </IconButton>
            <h2 id="recipe-editor-title">
              {recipe ? 'Rezept bearbeiten' : 'Rezept anlegen'}
              {draftSaveStatus !== 'idle' && (
                <small className="draft-save-status" aria-live="polite">
                  {draftSaveStatus === 'saving'
                    ? 'Entwurf wird gespeichert …'
                    : 'Entwurf lokal gespeichert'}
                </small>
              )}
            </h2>
            <button
              className="text-action"
              aria-label="Rezept speichern"
              disabled={!canSave || saveBusy}
            >
              Fertig
            </button>
          </div>
          {saveError && (
            <small className="form-error editor-save-error" role="alert">
              {saveError}
            </small>
          )}
          <label>
            Rezeptname
            <input
              data-initial-focus
              value={draft.name}
              maxLength={200}
              onChange={(event) =>
                setDraft({ ...draft, name: event.target.value })
              }
              placeholder="z. B. Gemüse-Curry"
            />
          </label>
          <label>
            Portionen
            <input
              type="number"
              min="1"
              max="1000"
              value={draft.servings}
              onFocus={(event) => event.currentTarget.select()}
              onChange={(event) => {
                const value = event.currentTarget.valueAsNumber;
                if (Number.isInteger(value) && value >= 1 && value <= 1000)
                  setDraft({ ...draft, servings: value });
              }}
            />
          </label>
          <details className="recipe-extra-details" open>
            <summary>Weitere Angaben (optional)</summary>
            <details className="recipe-image-details" open>
              <summary>
                {displayedImage ? 'Rezeptbild' : 'Bild hinzufügen (optional)'}
              </summary>
              <button
                type="button"
                className="image-drop"
                onClick={() => inputRef.current?.click()}
              >
                {displayedImage ? (
                  <img src={displayedImage} alt="Vorschau des Rezeptbilds" />
                ) : (
                  <>
                    <ImagePlus size={28} />
                    <strong>Rezeptbild auswählen</strong>
                    <span>
                      Wird verkleinert, lokal gespeichert und nur mit deiner
                      Sicherung exportiert.
                    </span>
                  </>
                )}
              </button>
              <input
                ref={inputRef}
                hidden
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => {
                  const selected = event.target.files?.[0];
                  if (!selected) return;
                  setImageError('');
                  const selection = ++imageSelection.current;
                  void optimizeImage(selected)
                    .then((optimized) => {
                      if (
                        editorStopped.current ||
                        imageSelection.current !== selection
                      )
                        return;
                      const draftImageKey = `draft-image-${crypto.randomUUID()}`;
                      stagedImages.current[draftImageKey] = optimized;
                      setDraft((current) => ({
                        ...current,
                        imageKey: draftImageKey,
                      }));
                      setRemoveImage(false);
                      setFile(
                        new File([optimized], 'rezeptbild', {
                          type: optimized.type,
                        }),
                      );
                    })
                    .catch(() => {
                      event.target.value = '';
                      setImageError(
                        'Bitte wähle ein gültiges JPG-, PNG- oder WebP-Bild bis 25 MB.',
                      );
                    });
                }}
              />
              {displayedImage && (
                <div className="image-actions">
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                  >
                    <ImagePlus size={16} /> Bild ändern
                  </button>
                  <button
                    type="button"
                    className="danger-text"
                    onClick={() => {
                      setFile(undefined);
                      setRemoveImage(true);
                      imageSelection.current += 1;
                      setDraft((current) => ({
                        ...current,
                        imageKey: undefined,
                      }));
                    }}
                  >
                    <Trash2 size={16} /> Bild entfernen
                  </button>
                </div>
              )}
              {imageError && <small className="form-error">{imageError}</small>}
            </details>
            <label>
              Beschreibung
              <textarea
                value={draft.description}
                maxLength={5000}
                onChange={(event) =>
                  setDraft({ ...draft, description: event.target.value })
                }
                placeholder="Was macht das Gericht besonders?"
              />
            </label>
            <div className="field-row">
              <label>
                Kochzeit (Min.)
                <input
                  type="number"
                  min="1"
                  max="10080"
                  value={draft.minutes}
                  onFocus={(event) => event.currentTarget.select()}
                  onChange={(event) => {
                    const value = event.currentTarget.valueAsNumber;
                    if (Number.isInteger(value) && value >= 1 && value <= 10080)
                      setDraft({ ...draft, minutes: value });
                  }}
                />
              </label>
            </div>
            <fieldset className="editor-tag-picker">
              <legend>Eigenschaften</legend>
              <p>Wähle nur Merkmale, die dauerhaft beim Rezept passen.</p>
              <div>
                {reusableRecipeTags.map((tag) => {
                  const active = draft.tags.some(
                    (entry) =>
                      entry.toLocaleLowerCase('de-DE') ===
                      tag.toLocaleLowerCase('de-DE'),
                  );
                  return (
                    <button
                      type="button"
                      key={tag}
                      className={active ? 'active' : ''}
                      aria-pressed={active}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          tags: active
                            ? draft.tags.filter(
                                (entry) =>
                                  entry.toLocaleLowerCase('de-DE') !==
                                  tag.toLocaleLowerCase('de-DE'),
                              )
                            : [...draft.tags, tag],
                        })
                      }
                    >
                      <Leaf size={15} /> {tag}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          </details>
          <details className="nutrition-editor">
            <summary>
              {proteinPerServing.trim()
                ? 'Protein: eigene Angabe'
                : automaticCalculation?.wholeRecipe.proteinG &&
                    draft.servings > 0
                  ? `Protein: ca. ${
                      Math.round(
                        (automaticCalculation.wholeRecipe.proteinG.value /
                          draft.servings) *
                          10,
                      ) / 10
                    } g pro Portion · aus Zutaten geschätzt`
                  : automaticEstimates && automaticCalculation
                    ? `Protein noch nicht vollständig · ${proteinIssues.length} ${
                        proteinIssues.length === 1 ? 'Zutat' : 'Zutaten'
                      } prüfen`
                    : 'Nährwerte (optional)'}
            </summary>
            {automaticEstimates && automaticCalculation && (
              <div className="nutrition-calculation-preview" aria-live="polite">
                <strong>Schätzung aus Zutaten</strong>
                <span>
                  {automaticCalculation.resolvedIngredients} von{' '}
                  {automaticCalculation.totalIngredients} Zutaten berücksichtigt
                </span>
                {(automaticCalculation.assumedAmounts > 0 ||
                  automaticCalculation.ignoredIngredients > 0) && (
                  <small>
                    {automaticCalculation.assumedAmounts > 0
                      ? `${automaticCalculation.assumedAmounts} Mengen mit hinterlegter Umrechnung`
                      : ''}
                    {automaticCalculation.assumedAmounts > 0 &&
                    automaticCalculation.ignoredIngredients > 0
                      ? ' · '
                      : ''}
                    {automaticCalculation.ignoredIngredients > 0
                      ? `${automaticCalculation.ignoredIngredients} bewusst ausgelassen`
                      : ''}
                  </small>
                )}
                {automaticCalculation.ingredients
                  .filter(
                    (ingredient) =>
                      draftFoodOverrides[ingredient.overrideKey] !== undefined,
                  )
                  .map((ingredient) => {
                    const override = draftFoodOverrides[ingredient.overrideKey];
                    const label =
                      override?.kind === 'food'
                        ? `${ingredient.food?.name ?? 'Lebensmittel'} · selbst zugeordnet`
                        : override?.kind === 'whole-ingredient'
                          ? `${override.nutrients.proteinG ?? '–'} g Protein · eigener Wert`
                          : 'Bewusst ausgelassen';
                    const originalIngredient =
                      draft.ingredients[ingredient.ingredientIndex];
                    return (
                      <div
                        className="nutrition-ingredient-issue nutrition-ingredient-override"
                        key={`override-${ingredient.ingredientIndex}`}
                      >
                        <small>
                          {draft.ingredients[ingredient.ingredientIndex]
                            ?.name || 'Unbenannte Zutat'}
                          : {label}
                        </small>
                        <button
                          type="button"
                          onClick={() =>
                            setFoodPicker({
                              key: ingredient.overrideKey,
                              name:
                                draft.ingredients[ingredient.ingredientIndex]
                                  ?.name || 'Unbenannte Zutat',
                              amount: originalIngredient?.amount ?? '',
                              unit: originalIngredient?.unit ?? '',
                              mode:
                                override?.kind === 'whole-ingredient' ||
                                ingredient.status === 'amount-unresolved'
                                  ? 'amount'
                                  : 'mapping',
                            })
                          }
                        >
                          Bearbeiten
                        </button>
                      </div>
                    );
                  })}
                {proteinIssues.map((ingredient) => (
                  <div
                    className="nutrition-ingredient-issue"
                    key={ingredient.ingredientIndex}
                  >
                    <small>
                      {draft.ingredients[ingredient.ingredientIndex]?.name ||
                        'Unbenannte Zutat'}
                      :{' '}
                      {ingredient.status === 'amount-unresolved'
                        ? 'Menge oder Einheit lässt sich noch nicht einschätzen.'
                        : ingredient.food
                          ? 'Für diesen Eintrag fehlt ein Proteinwert.'
                          : 'Keine eindeutige Zuordnung gefunden.'}
                    </small>
                    <button
                      type="button"
                      onClick={() =>
                        setFoodPicker({
                          key: ingredient.overrideKey,
                          name:
                            draft.ingredients[ingredient.ingredientIndex]
                              ?.name || 'Unbenannte Zutat',
                          amount:
                            draft.ingredients[ingredient.ingredientIndex]
                              ?.amount ?? '',
                          unit:
                            draft.ingredients[ingredient.ingredientIndex]
                              ?.unit ?? '',
                          mode:
                            ingredient.status === 'amount-unresolved'
                              ? 'amount'
                              : 'mapping',
                        })
                      }
                    >
                      {ingredient.status === 'amount-unresolved'
                        ? 'Wert eingeben'
                        : 'Zuordnen'}
                    </button>
                  </div>
                ))}
              </div>
            )}
            <label>
              Eigener Proteinwert pro Portion (optional)
              <span className="input-with-unit">
                <input
                  type="number"
                  min="0.1"
                  max="500"
                  step="0.1"
                  inputMode="decimal"
                  aria-invalid={proteinInvalid}
                  aria-describedby={
                    proteinInvalid
                      ? 'protein-editor-help protein-editor-error'
                      : 'protein-editor-help'
                  }
                  value={proteinPerServing}
                  onChange={(event) => setProteinPerServing(event.target.value)}
                  placeholder="z. B. 18"
                />
                <span>g</span>
              </span>
            </label>
            <p id="protein-editor-help">
              Deine Angabe hat immer Vorrang vor der Schätzung aus Zutaten. Lass
              das Feld leer, wenn Mampffred aus den Zutaten rechnen soll. Alles
              bleibt auf deinem Gerät.
            </p>
            {proteinInvalid && (
              <small
                id="protein-editor-error"
                className="form-error"
                role="status"
              >
                Bitte prüfe den Proteinwert.
              </small>
            )}
            {proteinPerServing.trim() !== '' && draft.servings > 0 && (
              <small>
                Das entspricht ca.{' '}
                {Math.round(
                  Number(proteinPerServing || 0) * draft.servings * 10,
                ) / 10}{' '}
                g für das gesamte Rezept.
              </small>
            )}
          </details>
          <fieldset>
            <legend>Zutaten</legend>
            {draft.ingredients.map((item, index) => (
              <div className="ingredient-editor" key={item.id ?? index}>
                <div className="ingredient-editor-heading">
                  <strong>Zutat {index + 1}</strong>
                  <IconButton
                    label={`Zutat ${index + 1} entfernen`}
                    onClick={() => {
                      if (draft.ingredients.length === 1) {
                        setDraft({
                          ...draft,
                          ingredients: [
                            {
                              id: item.id ?? crypto.randomUUID(),
                              amount: '',
                              unit: '',
                              name: '',
                            },
                          ],
                        });
                        setIngredientAnnouncement('Zutat 1 wurde geleert.');
                        window.requestAnimationFrame(() =>
                          foodInputRefs.current[
                            item.id ?? String(index)
                          ]?.focus(),
                        );
                        return;
                      }
                      const focusId =
                        draft.ingredients[index + 1]?.id ??
                        draft.ingredients[index - 1]?.id;
                      setDraft({
                        ...draft,
                        ingredients: draft.ingredients.filter(
                          (_, itemIndex) => itemIndex !== index,
                        ),
                      });
                      setIngredientAnnouncement(
                        `Zutat ${index + 1} wurde entfernt.`,
                      );
                      window.requestAnimationFrame(() => {
                        if (focusId) foodInputRefs.current[focusId]?.focus();
                      });
                    }}
                  >
                    <Trash2 size={16} />
                  </IconButton>
                </div>
                <IngredientCombobox
                  ingredient={item}
                  index={index}
                  customFoods={customFoods}
                  onChange={(ingredient) => {
                    setDraft({
                      ...draft,
                      ingredients: draft.ingredients.map((entry, itemIndex) =>
                        itemIndex === index ? ingredient : entry,
                      ),
                    });
                    if (ingredient.foodLink?.foodId !== item.foodLink?.foodId)
                      setDraftFoodOverrides((current) => {
                        const next = { ...current };
                        delete next[
                          ingredientOverrideKey(
                            draft.id ?? 'preview',
                            item.id ?? `ingredient-${index}`,
                          )
                        ];
                        return next;
                      });
                  }}
                  onSelected={() =>
                    amountRefs.current[item.id ?? String(index)]?.focus()
                  }
                  onCreateCustom={(name) =>
                    setCustomFoodTarget({
                      ingredientId: item.id ?? String(index),
                      name,
                    })
                  }
                  registerInput={(node) => {
                    foodInputRefs.current[item.id ?? String(index)] = node;
                  }}
                />
                <div className="ingredient-amount-row">
                  <label>
                    Menge
                    <input
                      ref={(node) => {
                        amountRefs.current[item.id ?? String(index)] = node;
                      }}
                      aria-label={`Menge für Zutat ${index + 1}`}
                      inputMode="decimal"
                      value={item.amount}
                      maxLength={100}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          ingredients: draft.ingredients.map(
                            (entry, itemIndex) =>
                              itemIndex === index
                                ? { ...entry, amount: event.target.value }
                                : entry,
                          ),
                        })
                      }
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter') return;
                        event.preventDefault();
                        unitRefs.current[item.id ?? String(index)]?.focus();
                      }}
                      placeholder="z. B. 250"
                    />
                  </label>
                  <label>
                    Einheit
                    <input
                      ref={(node) => {
                        unitRefs.current[item.id ?? String(index)] = node;
                      }}
                      aria-label={`Einheit für Zutat ${index + 1}`}
                      value={item.unit}
                      maxLength={100}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          ingredients: draft.ingredients.map(
                            (entry, itemIndex) =>
                              itemIndex === index
                                ? { ...entry, unit: event.target.value }
                                : entry,
                          ),
                        })
                      }
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter') return;
                        event.preventDefault();
                        addIngredientAndFocus();
                      }}
                      placeholder="g, ml, Stück …"
                    />
                  </label>
                </div>
              </div>
            ))}
            <button
              type="button"
              className="inline-add"
              onClick={addIngredientAndFocus}
            >
              <Plus size={16} /> Zutat hinzufügen
            </button>
            <span className="sr-only" aria-live="polite">
              {ingredientAnnouncement}
            </span>
          </fieldset>
          <fieldset>
            <legend>Schritte</legend>
            {draft.steps.map((step, index) => (
              <div className="step-editor" key={index}>
                <span>{index + 1}</span>
                <textarea
                  value={step}
                  maxLength={5000}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      steps: draft.steps.map((entry, stepIndex) =>
                        stepIndex === index ? event.target.value : entry,
                      ),
                    })
                  }
                  placeholder="Zubereitungsschritt"
                />
                <IconButton
                  label={`Schritt ${index + 1} entfernen`}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      steps: draft.steps.filter(
                        (_, stepIndex) => stepIndex !== index,
                      ),
                    })
                  }
                >
                  <Trash2 size={16} />
                </IconButton>
              </div>
            ))}
            <button
              type="button"
              className="inline-add"
              onClick={() =>
                setDraft({ ...draft, steps: [...draft.steps, ''] })
              }
            >
              <Plus size={16} /> Schritt hinzufügen
            </button>
          </fieldset>
          <button className="primary-button" disabled={!canSave || saveBusy}>
            {saveBusy ? 'Rezept wird gespeichert …' : 'Rezept speichern'}
          </button>
          {hasDraftContent && (
            <button
              type="button"
              className="danger-button"
              onClick={() => {
                if (
                  !window.confirm(
                    recipe
                      ? 'Gespeicherte Änderungen an diesem Rezept verwerfen?'
                      : 'Diesen Rezeptentwurf wirklich verwerfen?',
                  )
                )
                  return;
                editorStopped.current = true;
                imageSelection.current += 1;
                void onDiscardDraft(draft.id ?? '')
                  .then(onClose)
                  .catch(() => {
                    editorStopped.current = false;
                    setSaveError(
                      'Der Entwurf konnte nicht verworfen werden. Bitte erneut versuchen.',
                    );
                  });
              }}
            >
              <Trash2 size={17} />
              {recipe ? 'Änderungen verwerfen' : 'Entwurf verwerfen'}
            </button>
          )}
          {onDelete && (
            <button type="button" className="danger-button" onClick={onDelete}>
              <Trash2 size={17} /> Rezept löschen
            </button>
          )}
        </form>
      </div>
      {foodPicker && (
        <FoodMappingSheet
          ingredientName={foodPicker.name}
          ingredientAmount={foodPicker.amount}
          ingredientUnit={foodPicker.unit}
          mode={foodPicker.mode}
          currentOverride={draftFoodOverrides[foodPicker.key]}
          onClose={() => setFoodPicker(undefined)}
          onApply={(override) => {
            setDraftFoodOverrides((current) => {
              const next = { ...current };
              if (override) next[foodPicker.key] = override;
              else delete next[foodPicker.key];
              return next;
            });
            setFoodPicker(undefined);
          }}
        />
      )}
      {customFoodTarget && (
        <CustomFoodSheet
          initialName={customFoodTarget.name}
          onClose={() => setCustomFoodTarget(undefined)}
          onSave={(food) => {
            if (!onCreateCustomFood(food)) return;
            setDraft((current) => ({
              ...current,
              ingredients: current.ingredients.map((ingredient, index) =>
                (ingredient.id ?? String(index)) ===
                customFoodTarget.ingredientId
                  ? {
                      ...ingredient,
                      name: food.name,
                      unit:
                        ingredient.unit ||
                        preferredUnitForFood(customFoodToReference(food)),
                      foodLink: {
                        kind: 'custom',
                        foodId: `custom:${food.id}`,
                      },
                    }
                  : ingredient,
              ),
            }));
            const targetId = customFoodTarget.ingredientId;
            setCustomFoodTarget(undefined);
            window.requestAnimationFrame(() =>
              amountRefs.current[targetId]?.focus(),
            );
          }}
        />
      )}
    </>
  );
}

function PlannerSheet({
  data,
  imageUrls,
  initialDate,
  initialSlot,
  initialRecipeId,
  initialServings,
  initialQuery = '',
  initialFilter = 'Alle',
  onClose,
  onPlan,
  onRemove,
  onOpenRecipe,
}: {
  data: AppData;
  imageUrls: Record<string, string>;
  initialDate: string;
  initialSlot: MealSlot;
  initialRecipeId?: string;
  initialServings?: number;
  initialQuery?: string;
  initialFilter?: RecipeFilter;
  onClose: () => void;
  onPlan: (
    date: string,
    slot: MealSlot,
    recipeId: string,
    servings: number,
  ) => void;
  onRemove: (date: string, slot: MealSlot) => void;
  onOpenRecipe: (recipeId: string, state: PlannerState) => void;
}) {
  const sheetExit = useAnimatedSheetClose(onClose);
  const [date, setDate] = useState(initialDate);
  const [slot, setSlot] = useState(initialSlot);
  const dialogRef = useModalFocus<HTMLElement>(sheetExit.close);
  const sheetSwipe = useSheetSwipeToClose(onClose);
  const weekStart = startOfLocalWeek(fromIso(initialDate));
  const dates = Array.from({ length: 7 }, (_, index) =>
    addLocalDays(weekStart, index),
  );
  const plannedMeal = data.plan
    .find((day) => day.date === date)
    ?.meals.find((meal) => meal.slot === slot);
  const plannedRecipe = data.recipes.find(
    (recipe) => recipe.id === plannedMeal?.recipeId,
  );
  const initialRecipe = data.recipes.find(
    (recipe) => recipe.id === initialRecipeId,
  );
  const [selectedRecipeId, setSelectedRecipeId] = useState(
    initialRecipe?.id ?? plannedRecipe?.id,
  );
  const [query, setQuery] = useState(initialQuery);
  const [filter, setFilter] = useState<RecipeFilter>(initialFilter);
  const [servings, setServings] = useState(
    initialServings ?? plannedMeal?.servings ?? initialRecipe?.servings ?? 1,
  );
  const deferredQuery = useDeferredValue(query);
  const filteredRecipes = useMemo(
    () => filterRecipes(data.recipes, deferredQuery, filter),
    [data.recipes, deferredQuery, filter],
  );
  function syncSelection(nextDate: string, nextSlot: MealSlot) {
    const nextMeal = data.plan
      .find((day) => day.date === nextDate)
      ?.meals.find((meal) => meal.slot === nextSlot);
    const nextRecipe = data.recipes.find(
      (recipe) => recipe.id === nextMeal?.recipeId,
    );
    const fallbackRecipe = initialRecipe;
    setSelectedRecipeId(
      initialRecipe ? initialRecipe.id : (nextRecipe?.id ?? fallbackRecipe?.id),
    );
    setServings((current) =>
      initialRecipe
        ? current
        : (nextMeal?.servings ?? fallbackRecipe?.servings ?? 1),
    );
  }
  const selectedRecipe = data.recipes.find(
    (recipe) => recipe.id === selectedRecipeId,
  );
  const selectedRecipeIsFilteredOut = Boolean(
    selectedRecipe &&
    !filteredRecipes.some((recipe) => recipe.id === selectedRecipe.id),
  );
  return (
    <div
      className={`modal-backdrop align-end ${sheetExit.closing ? 'sheet-backdrop-closing' : ''}`}
    >
      <section
        ref={dialogRef}
        className={`planner-sheet swipe-sheet ${sheetExit.closing ? 'sheet-closing' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="planner-title"
      >
        <div className="sheet-handle" aria-hidden="true" {...sheetSwipe} />
        <div className="modal-header">
          <div>
            <h2 id="planner-title">Was möchtest du planen?</h2>
            <p>Wähle Tag, Mahlzeit und ein Rezept für deinen Essensplan.</p>
          </div>
          <IconButton label="Schließen" onClick={sheetExit.close}>
            <X size={20} />
          </IconButton>
        </div>
        <div className="field-row">
          <label>
            Tag
            <select
              value={date}
              onChange={(event) => {
                const nextDate = event.target.value;
                setDate(nextDate);
                syncSelection(nextDate, slot);
              }}
            >
              {dates.map((day) => (
                <option value={day} key={day}>
                  {localeDate.format(fromIso(day))}
                </option>
              ))}
            </select>
          </label>
          <label>
            Mahlzeit
            <select
              value={slot}
              onChange={(event) => {
                const nextSlot = event.target.value as MealSlot;
                setSlot(nextSlot);
                syncSelection(date, nextSlot);
              }}
            >
              {(['Frühstück', 'Mittagessen', 'Abendessen'] as MealSlot[]).map(
                (item) => (
                  <option key={item}>{item}</option>
                ),
              )}
            </select>
          </label>
        </div>
        <fieldset className="planner-servings">
          <legend>Portionen für Einkauf und Zubereitung</legend>
          <div>
            <button
              type="button"
              aria-label="Eine Portion weniger"
              onClick={() => setServings(Math.max(1, servings - 1))}
            >
              <Minus size={19} />
            </button>
            <strong>{servings}</strong>
            <button
              type="button"
              aria-label="Eine Portion mehr"
              onClick={() => setServings(Math.min(1000, servings + 1))}
            >
              <Plus size={19} />
            </button>
          </div>
          <span>
            <Users size={18} /> Für {servings}{' '}
            {servings === 1 ? 'Person' : 'Personen'}
          </span>
        </fieldset>
        {plannedRecipe && (
          <div className="planner-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                onOpenRecipe(plannedRecipe.id, {
                  date,
                  slot,
                  recipeId: selectedRecipeId,
                  servings,
                  query,
                  filter,
                })
              }
            >
              <CookingPot size={16} /> Rezept ansehen
            </button>
            <button
              type="button"
              className="danger-button"
              onClick={() => onRemove(date, slot)}
            >
              <Trash2 size={16} /> Aus Planung entfernen
            </button>
          </div>
        )}
        <div className="planner-library-heading">
          <strong>Rezept auswählen</strong>
          <span>{filteredRecipes.length} verfügbar</span>
        </div>
        <label className="search-field planner-search">
          <Search size={19} />
          <input
            aria-label="Rezepte für die Planung suchen"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rezepte suchen …"
          />
        </label>
        <div
          className="filter-row planner-filter-row"
          aria-label="Rezeptfilter"
        >
          {(
            [
              'Alle',
              'Favoriten',
              'Schnell',
              'Vegetarisch',
              'Vegan',
              'Gesund',
            ] as RecipeFilter[]
          ).map((item) => (
            <button
              type="button"
              key={item}
              className={filter === item ? 'active' : ''}
              aria-pressed={filter === item}
              onClick={() => setFilter(item)}
            >
              {item === 'Favoriten' && <Heart size={15} />}
              {(item === 'Schnell' || item === 'Gesund') && (
                <Sparkles size={15} />
              )}
              {(item === 'Vegetarisch' || item === 'Vegan') && (
                <Leaf size={15} />
              )}
              {item}
            </button>
          ))}
        </div>
        {selectedRecipeIsFilteredOut && selectedRecipe && (
          <button
            type="button"
            className="planner-current-selection"
            onClick={() => {
              setQuery('');
              setFilter('Alle');
            }}
          >
            <Check size={18} />
            <span>
              <small>Aktuell ausgewählt</small>
              <strong>{selectedRecipe.name}</strong>
            </span>
            <em>Auswahl anzeigen</em>
          </button>
        )}
        <div className="planner-recipes">
          {!filteredRecipes.length && (
            <div className="planner-no-results">
              <Search size={24} />
              <strong>Kein passendes Rezept gefunden</strong>
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setFilter('Alle');
                }}
              >
                Filter zurücksetzen
              </button>
            </div>
          )}
          {filteredRecipes.map((recipe) => (
            <button
              key={recipe.id}
              type="button"
              className={selectedRecipeId === recipe.id ? 'active' : ''}
              aria-pressed={selectedRecipeId === recipe.id}
              onClick={() => {
                setSelectedRecipeId(recipe.id);
              }}
            >
              <RecipeImage
                recipe={recipe}
                imageUrls={imageUrls}
                className="mini-sprite"
              />
              <span>
                <strong>{recipe.name}</strong>
                <small>
                  {recipe.minutes} Min.
                  {visibleRecipeTags(recipe)[0]
                    ? ` · ${visibleRecipeTags(recipe)[0]}`
                    : ''}
                </small>
              </span>
              {selectedRecipeId === recipe.id ? (
                <Check size={18} />
              ) : (
                <ChevronRight size={18} />
              )}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="primary-button planner-confirm"
          disabled={
            !selectedRecipeId ||
            !Number.isInteger(servings) ||
            servings < 1 ||
            servings > 1_000
          }
          onClick={() =>
            selectedRecipeId && onPlan(date, slot, selectedRecipeId, servings)
          }
        >
          {plannedRecipe ? 'Planung aktualisieren' : 'Mahlzeit einplanen'}
        </button>
      </section>
    </div>
  );
}

function SettingsView({
  data,
  panel,
  onClose,
  onBackup,
  onRestore,
  inactive = false,
  installAvailable,
  onInstall,
  showIosHint,
  onNutritionSettings,
  onSaveCustomFood,
}: {
  data: AppData;
  panel: SettingsPanel;
  onClose: () => void;
  onBackup: () => void;
  onRestore: (file: File) => void;
  inactive?: boolean;
  installAvailable: boolean;
  onInstall: () => Promise<void>;
  showIosHint: boolean;
  onNutritionSettings: (settings: NutritionSettings) => void;
  onSaveCustomFood: (food: CustomFood) => boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const dialogRef = useModalFocus<HTMLDivElement>(onClose);
  const [customFoodEditorId, setCustomFoodEditorId] = useState<string>();
  const editingCustomFood = data.customFoods.find(
    (food) => food.id === customFoodEditorId,
  );
  const proteinGoal = data.nutritionSettings.goals.find(
    (goal) => goal.period === 'week' && goal.nutrient === 'proteinG',
  );
  const [proteinMinimumInput, setProteinMinimumInput] = useState(
    proteinGoal ? String(proteinGoal.minimum) : '',
  );
  const parsedProteinMinimum = Number(proteinMinimumInput);
  const proteinMinimumInvalid =
    proteinMinimumInput.trim() !== '' &&
    (!Number.isFinite(parsedProteinMinimum) ||
      parsedProteinMinimum <= 0 ||
      parsedProteinMinimum > 5_000);
  function saveProteinMinimum() {
    if (proteinMinimumInvalid) return;
    const otherGoals = data.nutritionSettings.goals.filter(
      (goal) => !(goal.period === 'week' && goal.nutrient === 'proteinG'),
    );
    const minimum =
      proteinMinimumInput.trim() === '' ? undefined : parsedProteinMinimum;
    onNutritionSettings({
      ...data.nutritionSettings,
      goals:
        minimum === undefined
          ? otherGoals
          : [
              ...otherGoals,
              {
                nutrient: 'proteinG',
                period: 'week',
                minimum,
                enabled: true,
              },
            ],
    });
  }
  const panelTitle: Record<SettingsPanel, string> = {
    backup: 'Sicherung',
    nutrition: 'Nährwerte & Ziele',
    foods: 'Lebensmittel',
    privacy: 'Datenschutz & Speicher',
    app: 'Installation & Darstellung',
  };
  return (
    <div className={`detail-overlay ${inactive ? 'underlay' : ''}`}>
      <div
        ref={dialogRef}
        className="detail-screen settings-screen"
        role="dialog"
        aria-modal={!inactive && !customFoodEditorId}
        aria-hidden={inactive || Boolean(customFoodEditorId) || undefined}
        inert={inactive || Boolean(customFoodEditorId) || undefined}
        aria-label={panelTitle[panel]}
      >
        <Header title={panelTitle[panel]} back={onClose} />
        {panel === 'backup' && (
          <div className="backup-page">
            <section className="backup-hero-card">
              <div className="backup-illustration" aria-hidden="true">
                <Upload size={52} />
              </div>
              <h2>
                {data.lastBackup
                  ? `Zuletzt gesichert am ${shortDate.format(new Date(data.lastBackup))}`
                  : 'Noch keine Sicherung'}
              </h2>
              <p>
                Deine Rezepte, Wochenpläne und Einstellungen sind derzeit nur
                auf diesem Gerät gespeichert.
              </p>
              <button className="primary-button" onClick={onBackup}>
                <Download size={19} /> Sicherung erstellen
                <ChevronRight size={18} />
              </button>
              <button
                className="secondary-button"
                onClick={() => fileRef.current?.click()}
              >
                <Upload size={19} /> Sicherung wiederherstellen
              </button>
              <input
                ref={fileRef}
                hidden
                type="file"
                accept="application/json,.mampffred"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = '';
                  if (file) onRestore(file);
                }}
              />
              <div className="backup-privacy-copy">
                <LockKeyhole size={23} />
                <p>
                  <strong>Sicher. Lokal. In deiner Hand.</strong>
                  <span>
                    Mampffred überträgt deine Inhalte an keinen
                    Mampffred-Server; wir können sie nicht sehen. Nur eine von
                    dir exportierte Sicherungsdatei verlässt die App – geschützt
                    mit deinem Passwort. Auch ein Rezept verlässt das Gerät nur,
                    wenn du es ausdrücklich teilst.
                  </span>
                </p>
              </div>
            </section>
            <section className="backup-contents">
              <h2>Was wird gesichert?</h2>
              <p>Diese Inhalte bleiben beim Wiederherstellen erhalten:</p>
              <ul>
                <li>
                  <CookingPot size={21} />
                  <span>
                    <strong>Rezepte & Bilder</strong>
                    <small>Zutaten, Schritte und lokale Entwürfe</small>
                  </span>
                </li>
                <li>
                  <CalendarDays size={21} />
                  <span>
                    <strong>Wochenpläne</strong>
                    <small>Geplante Mahlzeiten und Portionen</small>
                  </span>
                </li>
                <li>
                  <ShoppingCart size={21} />
                  <span>
                    <strong>Einkaufslisten</strong>
                    <small>Offene und erledigte Artikel</small>
                  </span>
                </li>
                <li>
                  <Settings size={21} />
                  <span>
                    <strong>Einstellungen & Lebensmittel</strong>
                    <small>Eigene Einträge, App-Einstellungen und Ziele</small>
                  </span>
                </li>
              </ul>
            </section>
            <p className="backup-footer-note">
              <ShieldCheck size={20} />
              <span>
                <strong>Deine Daten. Immer bei dir.</strong>
                Einfach sichern. Jederzeit wiederherstellen.
              </span>
            </p>
          </div>
        )}
        {panel === 'nutrition' && (
          <section aria-labelledby="nutrition-settings-title">
            <h2 id="nutrition-settings-title">Planungshilfe</h2>
            <div className="settings-card nutrition-settings">
              <button
                type="button"
                className="settings-toggle"
                role="switch"
                aria-labelledby="protein-plan-enabled-label"
                aria-describedby="protein-plan-enabled-help"
                aria-checked={data.nutritionSettings.enabled}
                onClick={() =>
                  onNutritionSettings(
                    data.nutritionSettings.enabled
                      ? {
                          ...data.nutritionSettings,
                          enabled: false,
                          automaticEstimates: false,
                          promptDismissed: true,
                        }
                      : { ...data.nutritionSettings, enabled: true },
                  )
                }
              >
                <span>
                  <strong id="protein-plan-enabled-label">
                    Nährwert-Hinweise im Wochenplan
                  </strong>
                  <small id="protein-plan-enabled-help">
                    Fasst verfügbare Proteinwerte aus dem Wochenplan zusammen.
                  </small>
                </span>
                <span className="settings-switch" aria-hidden="true">
                  <span />
                </span>
              </button>
              {data.nutritionSettings.enabled && (
                <>
                  <button
                    type="button"
                    className="settings-toggle settings-toggle-secondary"
                    role="switch"
                    aria-labelledby="automatic-nutrition-label"
                    aria-describedby="automatic-nutrition-help"
                    aria-checked={data.nutritionSettings.automaticEstimates}
                    onClick={() =>
                      onNutritionSettings({
                        ...data.nutritionSettings,
                        automaticEstimates:
                          !data.nutritionSettings.automaticEstimates,
                      })
                    }
                  >
                    <span>
                      <strong id="automatic-nutrition-label">
                        Nährwerte automatisch berechnen
                      </strong>
                      <small id="automatic-nutrition-help">
                        Nutzt den lokal eingebetteten BLS 4.0. Keine Zutaten
                        werden versendet. Gramm und Kilogramm werden direkt
                        berechnet; andere Einheiten brauchen eine belegte
                        Umrechnung oder deine Korrektur.
                      </small>
                    </span>
                    <span className="settings-switch" aria-hidden="true">
                      <span />
                    </span>
                  </button>
                  <label className="nutrition-goal-field">
                    Protein-Richtwert pro Woche (optional)
                    <span className="input-with-unit">
                      <input
                        type="number"
                        min="1"
                        max="5000"
                        step="1"
                        inputMode="numeric"
                        aria-invalid={proteinMinimumInvalid}
                        aria-describedby={
                          proteinMinimumInvalid
                            ? 'protein-goal-help protein-goal-error'
                            : 'protein-goal-help'
                        }
                        value={proteinMinimumInput}
                        onChange={(event) =>
                          setProteinMinimumInput(event.target.value)
                        }
                        onBlur={saveProteinMinimum}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') event.currentTarget.blur();
                        }}
                        placeholder="Keine Vorgabe"
                      />
                      <span>g</span>
                    </span>
                  </label>
                </>
              )}
              {proteinMinimumInvalid && (
                <small
                  id="protein-goal-error"
                  className="form-error"
                  role="status"
                >
                  Bitte prüfe den Wochen-Planwert.
                </small>
              )}
              <p id="protein-goal-help">
                Der Richtwert gilt für die gesamte Woche. Er ist eine grobe
                Planungshilfe und keine Ernährungsberatung.
              </p>
              <details className="nutrition-source-details">
                <summary>Genauigkeit & Datenquelle</summary>
                <p>
                  Grundlage ist der Bundeslebensmittelschlüssel (BLS) 4.0 des
                  Max Rubner-Instituts, CC BY 4.0. Werte beziehen sich auf 100 g
                  essbaren Anteil und können abweichen.
                </p>
              </details>
            </div>
          </section>
        )}
        {panel === 'foods' && (
          <section>
            <div className="settings-section-heading">
              <div>
                <h2>Eigene Einträge</h2>
                <small>Nur lokal auf diesem Gerät</small>
              </div>
              <button
                type="button"
                className="settings-add-button"
                onClick={() => setCustomFoodEditorId('new')}
              >
                <Plus size={17} /> Neu
              </button>
            </div>
            {data.customFoods.length ? (
              <div className="settings-list custom-food-settings-list">
                {data.customFoods.map((food) => {
                  const linkedCount = [
                    ...data.recipes,
                    ...data.recipeDrafts,
                  ].reduce(
                    (count, recipe) =>
                      count +
                      recipe.ingredients.filter(
                        (ingredient) =>
                          ingredient.foodLink?.foodId === `custom:${food.id}`,
                      ).length,
                    0,
                  );
                  return (
                    <button
                      type="button"
                      key={food.id}
                      onClick={() => setCustomFoodEditorId(food.id)}
                    >
                      <Leaf />
                      <span>
                        <strong>{food.name}</strong>
                        {food.needsReview && (
                          <small>Importiert – vor Verwendung prüfen</small>
                        )}
                        <small>
                          {linkedCount
                            ? `In ${linkedCount} ${linkedCount === 1 ? 'Zutat' : 'Zutaten'} verwendet`
                            : 'Noch in keinem Rezept verwendet'}
                        </small>
                      </span>
                      <ChevronRight size={17} />
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="settings-card custom-food-empty">
                <Leaf size={26} />
                <span>
                  <strong>Noch keine eigenen Lebensmittel</strong>
                  <small>
                    Ergänze fehlende Produkte direkt beim Rezept oder hier.
                  </small>
                </span>
              </div>
            )}
          </section>
        )}
        {panel === 'privacy' && (
          <section>
            <h2>Auf diesem Gerät</h2>
            <div className="settings-list">
              <div>
                <LockKeyhole />
                <span>
                  <strong>Bleibt auf deinem Gerät</strong>
                  <small>
                    Keine Anmeldung, kein Tracking, keine Cloud-Synchronisation.
                  </small>
                </span>
              </div>
              <div>
                <CloudOff />
                <span>
                  <strong>Offline verfügbar</strong>
                  <small>
                    Rezepte, Wochenplan und Einkauf funktionieren ohne Internet.
                  </small>
                </span>
              </div>
            </div>
          </section>
        )}
        {panel === 'app' && (installAvailable || showIosHint) && (
          <section>
            <h2>Installation</h2>
            <div className="settings-card install-settings">
              <Download size={28} />
              <div>
                <strong>Wie eine App verwenden</strong>
                <small>
                  {showIosHint
                    ? 'In Safari: Teilen → „Zum Home-Bildschirm“. '
                    : 'Installiere Mampffred auf deinem Startbildschirm.'}
                </small>
              </div>
              {installAvailable && (
                <button
                  className="primary-button"
                  onClick={() => void onInstall().catch(() => undefined)}
                >
                  App installieren
                </button>
              )}
            </div>
          </section>
        )}
        {panel === 'privacy' && (
          <section>
            <h2>Lokale Daten</h2>
            <div className="settings-list compact">
              <div>
                <Utensils />
                <span>Rezepte</span>
                <strong>{data.recipes.length}</strong>
              </div>
              <div>
                <ImagePlus />
                <span>Eigene Bilder</span>
                <strong>
                  {data.recipes.filter((recipe) => recipe.imageKey).length}
                </strong>
              </div>
              <div>
                <ShoppingCart />
                <span>Einkaufsartikel</span>
                <strong>{data.shopping.length}</strong>
              </div>
            </div>
          </section>
        )}
        {panel === 'app' && (
          <section>
            <h2>App</h2>
            <div className="settings-list compact">
              <div>
                <Leaf />
                <span>Design</span>
                <strong>Warm & frisch</strong>
              </div>
              <div>
                <ShieldCheck />
                <span>Version</span>
                <strong>0.1.0</strong>
              </div>
            </div>
            <p className="privacy-note">
              Mampffred hat keine Anmeldung und fragt nie nach Bank- oder
              Kontopasswörtern. Ein selbst gewähltes Passwort wird nur für
              verschlüsselte Sicherungen verwendet. Mampffred ist für deinen
              privaten Gebrauch gebaut. Deine Rezepte, Planungen und Bilder
              werden nicht an einen App-Server übertragen.
            </p>
          </section>
        )}
      </div>
      {customFoodEditorId && (
        <CustomFoodSheet
          food={editingCustomFood}
          onClose={() => setCustomFoodEditorId(undefined)}
          onSave={(food) => {
            if (!onSaveCustomFood(food)) return;
            setCustomFoodEditorId(undefined);
          }}
        />
      )}
    </div>
  );
}

type BackupRequest = { mode: 'create' } | { mode: 'restore'; file: File };

function DeleteRecipeDialog({
  recipe,
  plannedCount,
  busy,
  onCancel,
  onConfirm,
}: {
  recipe: Recipe;
  plannedCount: number;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useModalFocus<HTMLElement>(onCancel);
  return (
    <div className="modal-backdrop">
      <section
        ref={dialogRef}
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-dialog-title"
        aria-describedby="delete-dialog-description"
      >
        <div className="lock-badge danger-icon">
          <Trash2 size={20} />
        </div>
        <h2 id="delete-dialog-title">„{recipe.name}“ löschen?</h2>
        <p id="delete-dialog-description">
          {plannedCount
            ? `Das Rezept wird außerdem aus ${plannedCount} geplanten ${plannedCount === 1 ? 'Mahlzeit' : 'Mahlzeiten'} entfernt.`
            : 'Das Rezept wird aus deiner Sammlung entfernt.'}{' '}
          Du kannst die Aktion anschließend zehn Sekunden lang rückgängig
          machen.
        </p>
        <div className="dialog-actions">
          <button type="button" onClick={onCancel} disabled={busy}>
            Abbrechen
          </button>
          <button
            type="button"
            className="danger-solid"
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Wird gelöscht …' : 'Rezept löschen'}
          </button>
        </div>
      </section>
    </div>
  );
}

function WeekShoppingDialog({
  result,
  onCancel,
  onConfirm,
}: {
  result: WeekShoppingResult;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const sheetExit = useAnimatedSheetClose(onCancel);
  const dialogRef = useModalFocus<HTMLElement>(sheetExit.close);
  const sheetSwipe = useSheetSwipeToClose(onCancel);
  const preview = result.preview;
  const generated = result.shopping.filter(
    (item) =>
      item.origin.kind === 'week' &&
      item.origin.weekStart === preview.weekStart,
  );
  const hasChanges =
    preview.addedItemCount +
      preview.updatedItemCount +
      preview.removedItemCount >
    0;
  return (
    <div
      className={`modal-backdrop align-end ${sheetExit.closing ? 'sheet-backdrop-closing' : ''}`}
    >
      <section
        ref={dialogRef}
        className={`planner-sheet week-shopping-sheet swipe-sheet ${sheetExit.closing ? 'sheet-closing' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="week-shopping-title"
      >
        <div className="sheet-handle" aria-hidden="true" {...sheetSwipe} />
        <div className="modal-header">
          <div>
            <h2 id="week-shopping-title">Einkauf aus Wochenplan</h2>
            <small>
              {shortDate.format(fromIso(preview.weekStart))} –{' '}
              {shortDate.format(fromIso(addLocalDays(preview.weekStart, 6)))}
            </small>
          </div>
          <IconButton label="Schließen" onClick={sheetExit.close}>
            <X size={20} />
          </IconButton>
        </div>
        {generated.length ? (
          <>
            <p className="sheet-intro">
              Aus {preview.contributingMealCount} geplanten{' '}
              {preview.contributingMealCount === 1 ? 'Mahlzeit' : 'Mahlzeiten'}{' '}
              entstehen {generated.length}{' '}
              {generated.length === 1 ? 'Einkaufsartikel' : 'Einkaufsartikel'}.
              Manuell ergänzte Artikel bleiben erhalten.
            </p>
            <div
              className="week-shopping-summary"
              aria-label="Änderungsvorschau"
            >
              <span>+{preview.addedItemCount} neu</span>
              <span>{preview.updatedItemCount} aktualisiert</span>
              <span>{preview.removedItemCount} entfernt</span>
            </div>
            <div className="week-shopping-preview">
              {generated.map((item) => (
                <div key={item.id}>
                  <span>
                    <strong>{item.name}</strong>
                    <small>{item.source}</small>
                  </span>
                  {item.needsReview && <em>Menge prüfen</em>}
                </div>
              ))}
            </div>
            {preview.reviewItemCount > 0 && (
              <p className="review-note">
                Bereits abgehakte Artikel mit geänderter Menge bleiben abgehakt
                und werden mit „Menge prüfen“ markiert.
              </p>
            )}
          </>
        ) : preview.removedItemCount > 0 ? (
          <div className="no-results compact-empty">
            <ShoppingCart size={30} />
            <h2>Keine Zutaten mehr geplant</h2>
            <p>
              {preview.removedItemCount}{' '}
              {preview.removedItemCount === 1
                ? 'erzeugter Wochenartikel wird'
                : 'erzeugte Wochenartikel werden'}{' '}
              entfernt. Manuelle Artikel bleiben erhalten.
            </p>
          </div>
        ) : (
          <div className="no-results compact-empty">
            <ShoppingCart size={30} />
            <h2>Noch keine Zutaten für diese Woche</h2>
            <p>Plane zuerst mindestens eine Mahlzeit mit Rezept.</p>
          </div>
        )}
        {preview.overflowItemCount > 0 && (
          <p className="form-error">
            Die Einkaufsliste wäre um {preview.overflowItemCount}{' '}
            {preview.overflowItemCount === 1 ? 'Artikel' : 'Artikel'} zu groß.
            Entferne zuerst andere Einträge.
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" onClick={onCancel}>
            Abbrechen
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={!hasChanges || preview.overflowItemCount > 0}
            onClick={onConfirm}
          >
            {hasChanges ? 'Einkauf übernehmen' : 'Bereits aktuell'}
          </button>
        </div>
      </section>
    </div>
  );
}

function BackupDialog({
  request,
  onClose,
  onSubmit,
  onConfirmRestore,
}: {
  request: BackupRequest;
  onClose: () => void;
  onSubmit: (password: string) => Promise<BackupPreview | void>;
  onConfirmRestore: () => Promise<void>;
}) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<BackupPreview>();
  const dialogRef = useModalFocus<HTMLFormElement>(onClose);
  const creating = request.mode === 'create';
  const valid =
    password.length >= (creating ? MIN_BACKUP_PASSWORD_LENGTH : 1) &&
    (!creating || password === confirmation);

  return (
    <div className="modal-backdrop">
      <form
        ref={dialogRef}
        className="backup-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="backup-dialog-title"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!valid && !preview) return;
          setBusy(true);
          setError('');
          try {
            if (preview) await onConfirmRestore();
            else {
              const result = await onSubmit(password);
              if (result) {
                setPreview(result);
                setBusy(false);
              }
            }
          } catch {
            setError(
              creating
                ? 'Die Sicherung konnte nicht erstellt werden.'
                : 'Passwort falsch oder Sicherung beschädigt.',
            );
            setBusy(false);
          }
        }}
      >
        <div className="modal-header">
          <div className="lock-badge">
            <LockKeyhole size={20} />
          </div>
          <h2 id="backup-dialog-title">
            {creating
              ? 'Verschlüsselte Sicherung erstellen'
              : preview
                ? 'Sicherung prüfen'
                : 'Sicherung entschlüsseln'}
          </h2>
          <IconButton label="Schließen" onClick={onClose}>
            <X size={20} />
          </IconButton>
        </div>
        {!preview && (
          <>
            <p>
              {creating
                ? 'Rezepte, Wochenplan, Einkauf und eigene Bilder werden mit deinem Sicherungs-Passwort verschlüsselt.'
                : `Gib das Sicherungs-Passwort für „${request.file.name}“ ein.`}
            </p>
            <label>
              Sicherungs-Passwort
              <input
                type="password"
                minLength={creating ? MIN_BACKUP_PASSWORD_LENGTH : 1}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={
                  creating
                    ? 'Mindestens 12 Zeichen, besser mehrere zufällige Wörter'
                    : 'Passwort deiner bisherigen Sicherung'
                }
                autoComplete={creating ? 'new-password' : 'current-password'}
              />
            </label>
          </>
        )}
        {creating && !preview && (
          <label>
            Sicherungs-Passwort wiederholen
            <input
              type="password"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              placeholder="Noch einmal eingeben"
              autoComplete="new-password"
            />
          </label>
        )}
        {creating &&
          !preview &&
          password &&
          confirmation &&
          password !== confirmation && (
            <small className="form-error">
              Die Passwörter stimmen nicht überein.
            </small>
          )}
        {error && <small className="form-error">{error}</small>}
        {preview ? (
          <div className="restore-preview">
            <dl>
              <div>
                <dt>Erstellt</dt>
                <dd>{localeDate.format(new Date(preview.createdAt))}</dd>
              </div>
              <div>
                <dt>Rezepte</dt>
                <dd>{preview.recipeCount}</dd>
              </div>
              <div>
                <dt>Entwürfe</dt>
                <dd>{preview.draftCount}</dd>
              </div>
              <div>
                <dt>Eigene Lebensmittel</dt>
                <dd>{preview.customFoodCount}</dd>
              </div>
              <div>
                <dt>Eigene Bilder</dt>
                <dd>{preview.imageCount}</dd>
              </div>
              <div>
                <dt>Planungen</dt>
                <dd>{preview.plannedMealCount}</dd>
              </div>
            </dl>
            <p>
              Diese Sicherung ersetzt deine aktuellen Daten vollständig. Bei
              einem Fehler bleibt dein jetziger Stand unverändert.
            </p>
            <p>
              Importierte Nährwerte musst du nach dem Wiederherstellen prüfen.
              Eigene Lebensmittel bleiben von Berechnungen ausgeschlossen, bis
              du sie einzeln geprüft und gespeichert hast. Rezeptbezogene
              Korrekturen werden aus Sicherheitsgründen nicht übernommen; die
              lokale Schätzung bleibt zunächst ausgeschaltet.
            </p>
          </div>
        ) : (
          <div className="security-note">
            <ShieldCheck size={19} />
            <span>
              <strong>AES-256-GCM</strong>
              Das Sicherungs-Passwort wird nicht gespeichert und kann nicht
              wiederhergestellt werden.
            </span>
          </div>
        )}
        <button
          className="primary-button"
          disabled={(!valid && !preview) || busy}
        >
          {busy
            ? 'Bitte warten …'
            : creating
              ? 'Sicherungsdatei erstellen'
              : preview
                ? 'Aktuelle Daten ersetzen'
                : 'Sicherung prüfen'}
        </button>
      </form>
    </div>
  );
}

function Onboarding({
  onStart,
  onInstall,
  installAvailable,
  showIosHint,
}: {
  onStart: () => void;
  onInstall: () => Promise<void>;
  installAvailable: boolean;
  showIosHint: boolean;
}) {
  return (
    <div className="onboarding">
      <div className="brand-lockup">
        <Image
          src={assetUrl('assets/mampffred-mascot-small.png')}
          width={112}
          height={130}
          alt="Mampffred"
          priority
        />
        <span>Mampffred</span>
      </div>
      <div className="onboarding-copy">
        <span className="eyebrow">Privat & offline</span>
        <h1>
          Dein Essen. Dein Plan.
          <br />
          Nur auf deinem Gerät.
        </h1>
        <p>
          Rezepte sammeln, die Woche planen und entspannt einkaufen – ohne Konto
          und ohne Cloud.
        </p>
        <div className="benefits">
          <div>
            <ShieldCheck />
            <span>
              <strong>Privat</strong>Deine Daten bleiben bei dir.
            </span>
          </div>
          <div>
            <CloudOff />
            <span>
              <strong>Offline</strong>Funktioniert ohne Internet.
            </span>
          </div>
          <div>
            <Leaf />
            <span>
              <strong>Einfach</strong>Planen statt grübeln.
            </span>
          </div>
        </div>
      </div>
      <div className="onboarding-actions">
        {installAvailable ? (
          <>
            <button
              className="primary-button start-button"
              onClick={() => void onInstall().catch(() => undefined)}
            >
              <Download size={18} /> App installieren
            </button>
            <button className="browser-button" onClick={onStart}>
              Erst einmal im Browser nutzen
            </button>
          </>
        ) : (
          <button className="primary-button start-button" onClick={onStart}>
            Mampffred starten
          </button>
        )}
        {showIosHint && (
          <small>
            Auf iPhone/iPad: In Safari <strong>Teilen</strong> und dann{' '}
            <strong>„Zum Home-Bildschirm“</strong> wählen. Am besten vor dem
            Anlegen deiner Sammlung installieren. Bereits im Browser
            gespeicherte Daten zuerst sichern und bei Bedarf in der
            installierten App wiederherstellen.
          </small>
        )}
      </div>
    </div>
  );
}

type LoadState = 'loading' | 'ready' | 'error';
type SaveState = 'idle' | 'saving' | 'saved' | 'error';
type WriterState = 'checking' | 'ready' | 'blocked' | 'unsupported' | 'error';
type PendingDeletion = {
  recipe: Recipe;
  recipeIndex: number;
  meals: Array<{
    date: string;
    meal: AppData['plan'][number]['meals'][number];
  }>;
  cleanupTimer?: number;
};
type PendingShoppingDeletion = {
  removed: RemovedShoppingItem[];
  cleanupTimer: number;
};

export default function MampffredApp() {
  const [data, publishData] = useState<AppData>(() => createEmptyData());
  const dataRef = useRef(data);
  const pendingImages = useRef<Record<string, Blob>>({});
  const retainedImages = useRef<string[]>([]);
  const [mutationError, setMutationError] = useState('');
  const [storageFailure, setStorageFailure] = useState(false);
  const lastSave = useRef<Promise<void>>(Promise.resolve());
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [writerState, setWriterState] = useState<WriterState>('checking');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [tab, setTab] = useState<Tab>(() =>
    typeof window === 'undefined'
      ? 'today'
      : (appTabFromHistoryState(window.history.state) ?? 'today'),
  );
  const [tabDirection, setTabDirection] = useState<'forward' | 'backward'>(
    'forward',
  );
  const [recipeQuery, setRecipeQuery] = useState('');
  const [recipeFilter, setRecipeFilter] = useState<RecipeFilter>('Alle');
  const [now, setNow] = useState(() => new Date());
  const [weekStart, setWeekStart] = useState(() => startOfLocalWeek());
  const currentWeekRef = useRef(startOfLocalWeek(now));
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent>();
  const [selectedRecipeId, setSelectedRecipeId] = useState<string>();
  const [recipePlanWeekStart, setRecipePlanWeekStart] = useState<string>();
  const [selectedDayDate, setSelectedDayDate] = useState<string>();
  const [editorRecipeId, setEditorRecipeId] = useState<string>();
  const [nutritionEditQueue, setNutritionEditQueue] = useState<string[]>();
  const [pendingPlanTarget, setPendingPlanTarget] = useState<{
    date: string;
    slot: MealSlot;
  }>();
  const [settings, setSettings] = useState<SettingsPanel>();
  const [backupRequest, setBackupRequest] = useState<BackupRequest>();
  const [weekShoppingRequest, setWeekShoppingRequest] =
    useState<WeekShoppingResult>();
  const [deleteRequest, setDeleteRequest] = useState<Recipe>();
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [pendingDeletion, setPendingDeletion] = useState<PendingDeletion>();
  const [pendingShoppingDeletion, setPendingShoppingDeletion] =
    useState<PendingShoppingDeletion>();
  const [planner, setPlanner] = useState<PlannerState>();
  const [plannerResume, setPlannerResume] = useState<PlannerResume>();
  const [toast, setToast] = useState<string>();
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const appFrameRef = useRef<HTMLDivElement>(null);
  const tabScrollPositions = useRef<Partial<Record<Tab, number>>>({});
  const imageUrlsRef = useRef<Record<string, string>>({});
  const imageLoadRequests = useRef(new Set<string>());
  const historyInitialized = useRef(false);
  const restoreCandidate = useRef<
    Awaited<ReturnType<typeof decryptBackup>>['payload'] | undefined
  >(undefined);
  const saveRevision = useRef(0);
  const toastTimer = useRef<number | undefined>(undefined);
  const deletionTimers = useRef(new Set<number>());
  const requestRecipeImage = useCallback((key: string) => {
    if (!key || imageUrlsRef.current[key] || imageLoadRequests.current.has(key))
      return;
    imageLoadRequests.current.add(key);
    void loadRecipeImage(key)
      .then((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        setImageUrls((current) => {
          if (current[key]) {
            URL.revokeObjectURL(url);
            return current;
          }
          const next = { ...current, [key]: url };
          imageUrlsRef.current = next;
          return next;
        });
      })
      .catch(() => undefined)
      .finally(() => imageLoadRequests.current.delete(key));
  }, []);
  const changeTab = useCallback(
    (nextTab: Tab) => {
      const direction = tabTransitionDirection(tab, nextTab);
      if (direction === 'none') return;
      const currentScreen = appFrameRef.current?.querySelector<HTMLElement>(
        ':scope > .screen-content',
      );
      tabScrollPositions.current[tab] = currentScreen?.scrollTop ?? 0;
      setTabDirection(direction);
      setTab(nextTab);
      if (historyInitialized.current)
        window.history.pushState(createAppHistoryState(nextTab), '');
    },
    [tab],
  );
  useLayoutEffect(() => {
    const nextScreen = appFrameRef.current?.querySelector<HTMLElement>(
      ':scope > .screen-content',
    );
    if (nextScreen) nextScreen.scrollTop = tabScrollPositions.current[tab] ?? 0;
  }, [tab]);
  const selectedRecipe = useMemo(
    () => data.recipes.find((recipe) => recipe.id === selectedRecipeId),
    [data.recipes, selectedRecipeId],
  );
  const editorSavedDraft = editorRecipeId?.startsWith('draft:')
    ? data.recipeDrafts.find(
        (draft) => draft.id === editorRecipeId.slice('draft:'.length),
      )
    : undefined;
  const editorRecipe = editorSavedDraft?.baseRecipeId
    ? data.recipes.find((recipe) => recipe.id === editorSavedDraft.baseRecipeId)
    : editorRecipeId &&
        editorRecipeId !== 'new' &&
        !editorRecipeId.startsWith('draft:')
      ? data.recipes.find((recipe) => recipe.id === editorRecipeId)
      : undefined;
  const editorImageKey = editorSavedDraft?.imageKey ?? editorRecipe?.imageKey;
  useEffect(() => {
    if (editorImageKey) requestRecipeImage(editorImageKey);
  }, [editorImageKey, requestRecipeImage]);
  useEffect(() => {
    const refreshClock = () => setNow(new Date());
    const timer = window.setInterval(refreshClock, 60_000);
    document.addEventListener('visibilitychange', refreshClock);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshClock);
    };
  }, []);
  useEffect(() => {
    const nextCurrentWeek = startOfLocalWeek(now);
    if (nextCurrentWeek === currentWeekRef.current) return;
    const previousCurrentWeek = currentWeekRef.current;
    setWeekStart((current) =>
      current === previousCurrentWeek ? nextCurrentWeek : current,
    );
    currentWeekRef.current = nextCurrentWeek;
  }, [now]);
  useEffect(() => {
    let cancelled = false;
    let release: (() => void) | undefined;
    void acquireAppWriter().then((lease) => {
      if (cancelled) {
        lease.release();
        return;
      }
      release = () => lease.release();
      setWriterState(
        lease.status === 'acquired'
          ? 'ready'
          : lease.status === 'busy'
            ? 'blocked'
            : lease.status,
      );
    });
    return () => {
      cancelled = true;
      release?.();
    };
  }, []);
  useEffect(() => {
    const onInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const onInstalled = () => setInstallPrompt(undefined);
    window.addEventListener('beforeinstallprompt', onInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    setLoadState('loading');
    loadData()
      .then((stored) => {
        if (cancelled) return;
        const next = stored ?? createEmptyData();
        dataRef.current = next;
        publishData(next);
        setLoadState('ready');
      })
      .catch(() => {
        if (!cancelled) setLoadState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [loadAttempt]);
  useEffect(() => {
    if (import.meta.env.PROD && 'serviceWorker' in navigator)
      navigator.serviceWorker
        .register(`${import.meta.env.BASE_URL}sw.js`, {
          scope: import.meta.env.BASE_URL,
        })
        .catch(() => undefined);
  }, []);
  useEffect(() => {
    if (loadState !== 'ready' || writerState !== 'ready') return;
    // Supported by current Safari and Chromium; refusal never blocks local use.
    void navigator.storage?.persist?.().catch(() => undefined);
  }, [loadState, writerState]);
  useEffect(() => {
    if (!historyInitialized.current) {
      if (!appTabFromHistoryState(window.history.state)) {
        window.history.replaceState(createAppHistoryState(tab), '');
        window.history.pushState(createAppHistoryState(tab), '');
      }
      historyInitialized.current = true;
    }
    const onPopState = (event: PopStateEvent) => {
      if (storageFailure) {
        window.history.pushState(createAppHistoryState(tab), '');
        return;
      }
      const restoreCurrentTabEntry = () =>
        window.history.pushState(createAppHistoryState(tab), '');
      if (backupRequest) {
        restoreCandidate.current = undefined;
        setBackupRequest(undefined);
        restoreCurrentTabEntry();
        return;
      }
      if (deleteRequest) {
        if (!deleteBusy) setDeleteRequest(undefined);
        restoreCurrentTabEntry();
        return;
      }
      if (weekShoppingRequest) {
        setWeekShoppingRequest(undefined);
        restoreCurrentTabEntry();
        return;
      }
      if (planner) {
        setPlanner(undefined);
        restoreCurrentTabEntry();
        return;
      }
      if (editorRecipeId) {
        setEditorRecipeId(undefined);
        setPendingPlanTarget(undefined);
        setNutritionEditQueue(undefined);
        restoreCurrentTabEntry();
        return;
      }
      if (plannerResume) {
        setSelectedRecipeId(plannerResume.backgroundRecipeId);
        setPlanner(plannerResume.state);
        setPlannerResume(undefined);
        restoreCurrentTabEntry();
        return;
      }
      if (selectedRecipeId) {
        setSelectedRecipeId(undefined);
        setRecipePlanWeekStart(undefined);
        restoreCurrentTabEntry();
        return;
      }
      if (settings) {
        setSettings(undefined);
        restoreCurrentTabEntry();
        return;
      }
      if (selectedDayDate) {
        setSelectedDayDate(undefined);
        restoreCurrentTabEntry();
        return;
      }
      const nextTab = appTabFromHistoryState(event.state);
      if (!nextTab || nextTab === tab) return;
      const currentScreen = appFrameRef.current?.querySelector<HTMLElement>(
        ':scope > .screen-content',
      );
      tabScrollPositions.current[tab] = currentScreen?.scrollTop ?? 0;
      const direction = tabTransitionDirection(tab, nextTab);
      if (direction !== 'none') setTabDirection(direction);
      setTab(nextTab);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [
    backupRequest,
    deleteBusy,
    deleteRequest,
    editorRecipeId,
    planner,
    plannerResume,
    selectedDayDate,
    selectedRecipeId,
    settings,
    storageFailure,
    tab,
    weekShoppingRequest,
  ]);
  function persistCurrent() {
    const revision = ++saveRevision.current;
    setSaveState('saving');
    const snapshot = dataRef.current;
    const images = { ...pendingImages.current };
    const queued = queueSaveData(snapshot, images, retainedImages.current);
    lastSave.current = queued;
    void queued
      .then(() => {
        if (saveRevision.current !== revision) return;
        pendingImages.current = {};
        const retained = new Set([
          ...referencedImageKeys(snapshot),
          ...retainedImages.current,
        ]);
        setImageUrls((current) =>
          Object.fromEntries(
            Object.entries(current).filter(([key, url]) => {
              if (retained.has(key)) return true;
              URL.revokeObjectURL(url);
              return false;
            }),
          ),
        );
        setStorageFailure(false);
        setSaveState('saved');
      })
      .catch(() => {
        if (saveRevision.current !== revision) return;
        setStorageFailure(true);
        setSaveState('error');
      });
    return queued;
  }
  function commitData(
    update: AppData | ((current: AppData) => AppData),
    images: Record<string, Blob> = {},
  ) {
    const next = validateDataUpdate(dataRef.current, update);
    const references = referencedImageKeys(next);
    pendingImages.current = Object.fromEntries(
      Object.entries({ ...pendingImages.current, ...images }).filter(([key]) =>
        references.has(key),
      ),
    );
    dataRef.current = next;
    publishData(next);
    setMutationError('');
    return persistCurrent();
  }
  function setData(update: AppData | ((current: AppData) => AppData)) {
    try {
      void commitData(update).catch(() => undefined);
      return true;
    } catch (error) {
      setMutationError(
        error instanceof Error && error.message !== 'INVALID_APP_DATA'
          ? error.message
          : 'Diese Änderung ist nicht speicherbar. Bitte prüfe die Angaben und die Sammlungsgrenzen.',
      );
      return false;
    }
  }
  useEffect(() => {
    if (saveState !== 'saved') return;
    const timer = window.setTimeout(() => setSaveState('idle'), 1200);
    return () => window.clearTimeout(timer);
  }, [saveState]);
  useEffect(() => {
    imageUrlsRef.current = imageUrls;
  }, [imageUrls]);
  useEffect(
    () => () => {
      for (const url of Object.values(imageUrlsRef.current))
        URL.revokeObjectURL(url);
    },
    [],
  );
  useEffect(
    () => () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
      for (const timer of deletionTimers.current) window.clearTimeout(timer);
    },
    [],
  );
  function showToast(message: string, duration = 2800) {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(undefined), duration);
  }
  function openNewRecipeEditor() {
    setEditorRecipeId('new');
  }
  function openExistingRecipeEditor(recipeId: string) {
    const existing = data.recipeDrafts.find(
      (draft) => draft.baseRecipeId === recipeId,
    );
    setEditorRecipeId(existing ? `draft:${existing.id}` : recipeId);
  }
  async function autosaveRecipeDraft(
    draft: RecipeDraft,
    images: Record<string, Blob> = {},
  ) {
    const data = dataRef.current;
    const nextData = migrateAppData({
      ...data,
      recipeDrafts: upsertRecipeDraft(data.recipeDrafts, draft),
    });
    await commitData(nextData, images);
  }
  async function discardRecipeDraft(draftId: string) {
    const data = dataRef.current;
    const nextData = {
      ...data,
      recipeDrafts: removeRecipeDraft(data.recipeDrafts, draftId),
    };
    await commitData(nextData);
  }
  function addCustomFood(food: CustomFood) {
    return setData((current) => ({
      ...current,
      customFoods: [food, ...current.customFoods],
    }));
  }
  function saveCustomFood(food: CustomFood) {
    food = { ...food, needsReview: false };
    return setData((current) => {
      const exists = current.customFoods.some((entry) => entry.id === food.id);
      return {
        ...current,
        customFoods: exists
          ? current.customFoods.map((entry) =>
              entry.id === food.id ? food : entry,
            )
          : [food, ...current.customFoods],
      };
    });
  }
  async function installApp() {
    if (!installPrompt) return;
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === 'accepted')
        setData((current) => ({ ...current, onboardingDone: true }));
    } finally {
      setInstallPrompt(undefined);
    }
  }
  async function updateNutritionSettings(settings: NutritionSettings) {
    const data = dataRef.current;
    const wasAutomatic = data.nutritionSettings.automaticEstimates;
    if (!settings.automaticEstimates || wasAutomatic) {
      setData((current) => ({ ...current, nutritionSettings: settings }));
      return;
    }
    const ingredientCount = data.recipes.reduce(
      (sum, recipe) => sum + recipe.ingredients.length,
      0,
    );
    const ingredientTextLength = data.recipes.reduce(
      (sum, recipe) =>
        sum +
        recipe.ingredients.reduce(
          (recipeSum, ingredient) =>
            recipeSum +
            ingredient.amount.length +
            ingredient.unit.length +
            ingredient.name.length,
          0,
        ),
      0,
    );
    if (ingredientCount > 5_000 || ingredientTextLength > 250_000) {
      showToast(
        'Für die lokale Schätzung sind zu viele Zutaten vorhanden. Teile deine Sammlung zuerst in Sicherungen auf.',
        5000,
      );
      return;
    }
    try {
      const { blsCatalog } = await import('@/lib/bls-catalog');
      if (dataRef.current !== data) {
        showToast(
          'Deine Sammlung wurde inzwischen geändert. Bitte aktiviere die Schätzung erneut.',
        );
        return;
      }
      const updatedAt = new Date().toISOString();
      const catalog = [
        ...data.customFoods.map(customFoodToReference),
        ...blsCatalog,
      ];
      const nextRecipes = data.recipes.map((recipe) => {
        const calculation = calculateRecipeFromIngredients(
          recipe,
          catalog,
          data.foodOverrides,
        );
        return {
          ...recipe,
          nutrition: mergeCalculatedNutrition(
            recipe.nutrition,
            calculation,
            updatedAt,
          ),
        };
      });
      if (
        !setData((current) => ({
          ...current,
          nutritionSettings: settings,
          recipes: nextRecipes,
        }))
      )
        return;
      showToast('Nährwerte wurden aus erkannten Zutaten neu geschätzt.');
    } catch {
      showToast('Die lokale Nährwertschätzung ist gerade nicht verfügbar.');
    }
  }
  function updateRecipe(recipe: Recipe) {
    setData((current) => ({
      ...current,
      recipes: current.recipes.map((item) =>
        item.id === recipe.id ? recipe : item,
      ),
    }));
  }
  function addSampleRecipes() {
    const samples = createSampleRecipes();
    const accepted = setData((current) => {
      const knownShareIds = new Set(
        current.recipes.map((recipe) => recipe.shareId),
      );
      const additions = samples.filter(
        (recipe) => !knownShareIds.has(recipe.shareId),
      );
      if (!additions.length) return current;
      return {
        ...current,
        recipes: [...current.recipes, ...additions],
        installedSamplePacks: [
          ...new Set([...current.installedSamplePacks, 'mampffred-samples-v1']),
        ],
      };
    });
    if (!accepted) return;
    showToast('Fehlende Beispielrezepte wurden hinzugefügt.');
    changeTab('recipes');
  }
  function openWeekShopping(targetWeekStart: string) {
    setWeekShoppingRequest(reconcileWeekShopping(data, targetWeekStart));
  }
  function applyWeekShopping() {
    const targetWeekStart = weekShoppingRequest?.preview.weekStart;
    if (!targetWeekStart || weekShoppingRequest.preview.overflowItemCount > 0)
      return;
    setData((current) => {
      const result = reconcileWeekShopping(current, targetWeekStart);
      if (result.preview.overflowItemCount > 0) return current;
      return {
        ...current,
        shopping: result.shopping.map((item) => {
          if (
            item.origin.kind !== 'week' ||
            item.origin.weekStart !== targetWeekStart ||
            !item.needsReview
          )
            return item;
          const { needsReview: _, ...reviewedItem } = item;
          return reviewedItem;
        }),
      };
    });
    setWeekShoppingRequest(undefined);
    changeTab('shopping');
    showToast('Einkauf wurde mit dem Wochenplan aktualisiert.');
  }
  function addRecipeToShopping(recipe: Recipe, servings: number) {
    const factor = servings / recipe.servings;
    const existing = new Set(
      data.shopping.map((item) =>
        `${item.source ?? ''}\0${item.name}`.toLocaleLowerCase('de-DE'),
      ),
    );
    const additions = recipe.ingredients.flatMap((ingredient) => {
      const amount = Number(ingredient.amount);
      const scaledAmount = Number.isFinite(amount)
        ? String(Math.round(amount * factor * 10) / 10)
        : ingredient.amount;
      const name = [scaledAmount, ingredient.unit, ingredient.name]
        .filter(Boolean)
        .join(' ')
        .slice(0, 5000);
      const key = `${recipe.name}\0${name}`.toLocaleLowerCase('de-DE');
      if (!name || existing.has(key)) return [];
      existing.add(key);
      const normalized = ingredient.name.toLocaleLowerCase('de-DE');
      const category: ShoppingItem['category'] =
        /brot|brötchen|baguette|toast/.test(normalized)
          ? 'Backwaren'
          : /milch|käse|feta|mozzarella|sahne|joghurt|butter/.test(normalized)
            ? 'Kühlregal'
            : /reis|nudel|pasta|linse|mehl|öl|gewürz|brühe|kokosmilch/.test(
                  normalized,
                )
              ? 'Vorrat'
              : /paprika|zucchini|tomate|zwiebel|kartoffel|kürbis|beere|obst|gemüse|basilikum/.test(
                    normalized,
                  )
                ? 'Gemüse & Obst'
                : 'Sonstiges';
      return [
        {
          id: crypto.randomUUID(),
          name,
          category,
          checked: false,
          source: recipe.name,
          origin: { kind: 'recipe', recipeId: recipe.id },
        } satisfies ShoppingItem,
      ];
    });
    const available = Math.max(0, 10_000 - data.shopping.length);
    const acceptedAdditions = additions.slice(0, available);
    if (!acceptedAdditions.length) {
      showToast('Diese Zutaten stehen bereits auf der Einkaufsliste.');
      return;
    }
    setData((current) => ({
      ...current,
      shopping: [...current.shopping, ...acceptedAdditions],
    }));
    showToast(
      `${acceptedAdditions.length} ${acceptedAdditions.length === 1 ? 'Zutat wurde' : 'Zutaten wurden'} hinzugefügt.`,
    );
  }
  function deleteShoppingItems(items: ShoppingItem[]) {
    if (!items.length) return;
    if (pendingShoppingDeletion) {
      window.clearTimeout(pendingShoppingDeletion.cleanupTimer);
      deletionTimers.current.delete(pendingShoppingDeletion.cleanupTimer);
    }
    const deletion = removeShoppingItems(
      data.shopping,
      new Set(items.map((item) => item.id)),
    );
    if (!deletion.removed.length) return;
    const cleanupTimer = window.setTimeout(() => {
      deletionTimers.current.delete(cleanupTimer);
      setPendingShoppingDeletion((current) =>
        current?.cleanupTimer === cleanupTimer ? undefined : current,
      );
    }, 10_000);
    deletionTimers.current.add(cleanupTimer);
    setData((current) => ({ ...current, shopping: deletion.next }));
    setToast(undefined);
    setPendingShoppingDeletion({
      removed: deletion.removed,
      cleanupTimer,
    });
  }
  function undoShoppingDeletion() {
    if (!pendingShoppingDeletion) return;
    if (
      !setData((current) => ({
        ...current,
        shopping: restoreShoppingItems(
          current.shopping,
          pendingShoppingDeletion.removed,
        ),
      }))
    )
      return;
    window.clearTimeout(pendingShoppingDeletion.cleanupTimer);
    deletionTimers.current.delete(pendingShoppingDeletion.cleanupTimer);
    setPendingShoppingDeletion(undefined);
    showToast('Einkaufsartikel wiederhergestellt.');
  }
  async function shareRecipe(recipe: Recipe) {
    const contents = serializeSharedRecipe(recipe);
    if (
      new TextEncoder().encode(contents).byteLength > MAX_SHARED_RECIPE_BYTES
    ) {
      showToast(
        'Dieses Rezept ist für eine einzelne Rezeptdatei zu groß.',
        4200,
      );
      return;
    }
    const safeName =
      recipe.name
        .normalize('NFKD')
        .replace(/[^a-z0-9_-]+/gi, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80) || 'mampffred-rezept';
    const file = new File([contents], `${safeName}.mampffred-rezept`, {
      type: 'application/json',
    });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: recipe.name,
          text: 'Ein Mampffred-Rezept. Persönliche Bilder und lokale Nährwertkorrekturen sind nicht enthalten.',
          files: [file],
        });
        return;
      }
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.name;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      showToast('Rezeptdatei wurde gespeichert und kann geteilt werden.');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      showToast('Das Rezept konnte gerade nicht geteilt werden.');
    }
  }
  async function importRecipeFile(file: File) {
    if (file.size > MAX_SHARED_RECIPE_BYTES) {
      showToast('Die Rezeptdatei ist zu groß.', 4200);
      return;
    }
    try {
      const imported = await parseSharedRecipe(await file.text());
      if (
        dataRef.current.recipes.some(
          (recipe) => recipe.shareId === imported.shareId,
        )
      ) {
        showToast('Dieses Rezept ist bereits in deiner Sammlung.');
        return;
      }
      const id = crypto.randomUUID();
      const recipe: Recipe = {
        ...imported,
        id,
        imageCell: Math.floor(Math.random() * 6),
        ingredients: imported.ingredients.map((ingredient) => ({
          ...ingredient,
          id: crypto.randomUUID(),
        })),
      };
      if (
        !setData((current) => ({
          ...current,
          recipes: [recipe, ...current.recipes],
        }))
      )
        return;
      await lastSave.current;
      showToast(`„${recipe.name}“ wurde sicher importiert.`);
    } catch {
      showToast(
        'Das Rezept konnte nicht importiert oder gespeichert werden. Bitte prüfe Datei und Speicherhinweis.',
        4200,
      );
    }
  }
  function openPlanner(
    date = todayLocal(),
    slot: MealSlot = 'Abendessen',
    recipeId?: string,
    servings?: number,
  ) {
    if (!data.recipes.length) {
      setPendingPlanTarget({ date, slot });
      openNewRecipeEditor();
      return;
    }
    setPlannerResume(undefined);
    setPlanner({ date, slot, recipeId, servings });
  }
  function openRecipePlanner(recipe: Recipe, servings: number) {
    if (!recipePlanWeekStart) {
      openPlanner(todayLocal(now), 'Abendessen', recipe.id, servings);
      return;
    }
    const firstSearchDate =
      recipePlanWeekStart === startOfLocalWeek(now)
        ? todayLocal(now)
        : recipePlanWeekStart;
    const firstFree = Array.from({ length: 7 }, (_, index) =>
      addLocalDays(recipePlanWeekStart, index),
    )
      .filter((date) => date >= firstSearchDate)
      .flatMap((date) =>
        mealSlots.map((slot) => ({
          date,
          slot,
          occupied: data.plan
            .find((day) => day.date === date)
            ?.meals.some((meal) => meal.slot === slot),
        })),
      )
      .find((entry) => !entry.occupied);
    openPlanner(
      firstFree?.date ?? recipePlanWeekStart,
      firstFree?.slot ?? 'Abendessen',
      recipe.id,
      servings,
    );
  }
  function planRecipe(
    date: string,
    slot: MealSlot,
    recipeId: string,
    servings: number,
  ) {
    if (
      !setData((current) => {
        const existing = current.plan.find((day) => day.date === date);
        const recipe = current.recipes.find((item) => item.id === recipeId);
        if (!recipe) return current;
        const updatedDay = {
          date,
          meals: [
            ...(existing?.meals ?? []).filter((meal) => meal.slot !== slot),
            {
              slot,
              recipeId,
              servings,
              trackedServings: Math.min(
                current.nutritionSettings.defaultTrackedServings,
                servings,
              ),
            },
          ],
        };
        return {
          ...current,
          plan: [
            ...current.plan.filter((day) => day.date !== date),
            updatedDay,
          ].sort((left, right) => left.date.localeCompare(right.date)),
        };
      })
    )
      return;
    setPlanner(undefined);
    setSelectedRecipeId(undefined);
    setRecipePlanWeekStart(undefined);
    showToast('Mahlzeit ist eingeplant.');
  }
  function removePlannedMeal(date: string, slot: MealSlot) {
    setData((current) => ({
      ...current,
      plan: current.plan
        .map((day) =>
          day.date === date
            ? {
                ...day,
                meals: day.meals.filter((meal) => meal.slot !== slot),
              }
            : day,
        )
        .filter((day) => day.meals.length),
    }));
    setPlanner(undefined);
    showToast('Mahlzeit wurde aus der Planung entfernt.');
  }
  async function saveRecipeDraft(
    draft: EditorDraft,
    file?: File,
    removeImage = false,
    foodOverrides: Record<string, FoodOverride> = {},
  ) {
    const id = draft.id ?? crypto.randomUUID();
    let imageKey = removeImage ? undefined : draft.imageKey;
    let newImage: Blob | undefined;
    if (file) {
      newImage = await optimizeImage(file);
      imageKey = `recipe-${id}-${crypto.randomUUID()}`;
    }
    let recipe: Recipe = {
      ...draft,
      name: draft.name.trim(),
      description: draft.description.trim(),
      tags: draft.tags.map((tag) => tag.trim()).filter(Boolean),
      ingredients: draft.ingredients
        .map((ingredient) => ({
          id: ingredient.id ?? crypto.randomUUID(),
          amount: ingredient.amount.trim(),
          unit: ingredient.unit.trim(),
          name: ingredient.name.trim(),
          ...(ingredient.foodLink ? { foodLink: ingredient.foodLink } : {}),
        }))
        .filter((ingredient) => ingredient.name),
      steps: draft.steps.map((step) => step.trim()).filter(Boolean),
      id,
      shareId: draft.shareId ?? `local:${id}`,
      imageCell: draft.imageCell ?? Math.floor(Math.random() * 6),
      imageKey,
    };
    let data = dataRef.current;
    const previousRecipe = data.recipes.find((item) => item.id === id);
    const mergedFoodOverrides = replaceRecipeFoodOverrides(
      data.foodOverrides,
      id,
      previousRecipe?.ingredients ?? [],
      recipe.ingredients,
      foodOverrides,
    );
    if (data.nutritionSettings.automaticEstimates) {
      const calculated = await calculateWithBundledFoodData(
        recipe,
        mergedFoodOverrides,
        data.customFoods,
      );
      recipe = { ...recipe, nutrition: calculated.nutrition };
    }
    data = dataRef.current;
    const nextData = migrateAppData({
      ...data,
      foodOverrides: replaceRecipeFoodOverrides(
        data.foodOverrides,
        id,
        previousRecipe?.ingredients ?? [],
        recipe.ingredients,
        foodOverrides,
      ),
      recipeDrafts: removeRecipeDraft(data.recipeDrafts, id),
      recipes: data.recipes.some((item) => item.id === id)
        ? data.recipes.map((item) => (item.id === id ? recipe : item))
        : [recipe, ...data.recipes],
    });
    await commitData(
      nextData,
      newImage && imageKey ? { [imageKey]: newImage } : {},
    );
    if (newImage && imageKey) {
      setImageUrls((current) => {
        const previous = current[imageKey];
        if (previous) URL.revokeObjectURL(previous);
        return { ...current, [imageKey]: URL.createObjectURL(newImage) };
      });
    }
    if (draft.imageKey && draft.imageKey !== imageKey) {
      setImageUrls((current) => {
        const previous = current[draft.imageKey!];
        if (previous) URL.revokeObjectURL(previous);
        const next = { ...current };
        delete next[draft.imageKey!];
        return next;
      });
    }
    setEditorRecipeId(undefined);
    if (nutritionEditQueue?.includes(id)) {
      const remaining = nutritionEditQueue.filter(
        (recipeId) => recipeId !== id,
      );
      setSelectedRecipeId(undefined);
      if (remaining[0]) {
        setNutritionEditQueue(remaining);
        setEditorRecipeId(remaining[0]);
        showToast(
          `${remaining.length} ${remaining.length === 1 ? 'Angabe fehlt' : 'Angaben fehlen'} noch.`,
        );
      } else {
        setNutritionEditQueue(undefined);
        showToast('Proteinangaben wurden aktualisiert.');
      }
    } else if (pendingPlanTarget) {
      setSelectedRecipeId(undefined);
      setPlanner({ ...pendingPlanTarget, recipeId: id });
      setPendingPlanTarget(undefined);
      showToast('Rezept gespeichert – jetzt einplanen.');
    } else {
      setSelectedRecipeId(id);
      showToast('Rezept gespeichert.');
    }
  }
  async function confirmDeleteRecipe() {
    const recipe = deleteRequest;
    const data = dataRef.current;
    if (!recipe) return;
    if (pendingDeletion) {
      setDeleteRequest(undefined);
      return;
    }
    setDeleteBusy(true);
    const deletion: PendingDeletion = {
      recipe,
      recipeIndex: data.recipes.findIndex((item) => item.id === recipe.id),
      meals: data.plan.flatMap((day) =>
        day.meals
          .filter((meal) => meal.recipeId === recipe.id)
          .map((meal) => ({ date: day.date, meal })),
      ),
    };
    const nextData: AppData = {
      ...data,
      recipes: data.recipes.filter((item) => item.id !== recipe.id),
      recipeDrafts: data.recipeDrafts.filter(
        (draft) => draft.id !== recipe.id && draft.baseRecipeId !== recipe.id,
      ),
      plan: data.plan.map((day) => ({
        ...day,
        meals: day.meals.filter((meal) => meal.recipeId !== recipe.id),
      })),
    };
    try {
      retainedImages.current = recipe.imageKey ? [recipe.imageKey] : [];
      await commitData(nextData);
      setDeleteRequest(undefined);
      setDeleteBusy(false);
      setEditorRecipeId(undefined);
      setSelectedRecipeId(undefined);
      setToast(undefined);
      const cleanupTimer = window.setTimeout(() => {
        deletionTimers.current.delete(cleanupTimer);
        if (recipe.imageKey) {
          retainedImages.current = [];
          void persistCurrent().catch(() => undefined);
          if (!referencedImageKeys(dataRef.current).has(recipe.imageKey))
            setImageUrls((current) => {
              const next = { ...current };
              const url = next[recipe.imageKey!];
              if (url) URL.revokeObjectURL(url);
              delete next[recipe.imageKey!];
              return next;
            });
        }
        setPendingDeletion((current) =>
          current?.recipe.id === recipe.id ? undefined : current,
        );
      }, 10_000);
      deletionTimers.current.add(cleanupTimer);
      setPendingDeletion({ ...deletion, cleanupTimer });
    } catch {
      setDeleteBusy(false);
      showToast('Das Rezept konnte nicht gelöscht werden.');
    }
  }
  async function undoDeleteRecipe() {
    const deletion = pendingDeletion;
    if (!deletion) return;
    const data = dataRef.current;
    const recipes = [...data.recipes];
    if (!recipes.some((recipe) => recipe.id === deletion.recipe.id))
      recipes.splice(
        Math.min(Math.max(deletion.recipeIndex, 0), recipes.length),
        0,
        deletion.recipe,
      );
    const nextData: AppData = {
      ...data,
      recipes,
      plan: data.plan.map((day) => {
        const restored = deletion.meals.filter(
          (entry) => entry.date === day.date,
        );
        return {
          ...day,
          meals: [
            ...day.meals,
            ...restored
              .filter(
                (entry) =>
                  !day.meals.some((meal) => meal.slot === entry.meal.slot),
              )
              .map((entry) => entry.meal),
          ],
        };
      }),
    };
    try {
      await commitData(nextData);
      if (deletion.cleanupTimer) {
        window.clearTimeout(deletion.cleanupTimer);
        deletionTimers.current.delete(deletion.cleanupTimer);
      }
      retainedImages.current = [];
      setPendingDeletion(undefined);
      showToast('Rezept wiederhergestellt.');
    } catch {
      showToast('Rückgängig machen ist fehlgeschlagen.');
    }
  }
  async function createBackup(password: string) {
    const data = dataRef.current;
    const createdAt = new Date().toISOString();
    const backupData = { ...data, lastBackup: createdAt };
    const imageEntries: Array<readonly [string, string]> = [];
    const imageOwners = [...data.recipes, ...data.recipeDrafts];
    const seenImageKeys = new Set<string>();
    for (const recipe of imageOwners) {
      if (!recipe.imageKey) continue;
      if (seenImageKeys.has(recipe.imageKey)) continue;
      seenImageKeys.add(recipe.imageKey);
      const blob =
        pendingImages.current[recipe.imageKey] ??
        (await loadRecipeImage(recipe.imageKey));
      if (!blob) throw new Error('MISSING_RECIPE_IMAGE');
      imageEntries.push([recipe.imageKey, await blobToDataUrl(blob)] as const);
    }
    const backup = await encryptBackup(
      {
        data: backupData,
        images: Object.fromEntries(imageEntries),
      },
      password,
      createdAt,
    );
    const link = document.createElement('a');
    link.href = URL.createObjectURL(backup);
    link.download = `mampffred-sicherung-${todayLocal()}.mampffred`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    setData((current) => ({ ...current, lastBackup: createdAt }));
    setBackupRequest(undefined);
    showToast('Sicherung wurde erstellt.');
  }
  async function inspectBackup(file: File, password: string) {
    const decrypted = await decryptBackup(file, password);
    restoreCandidate.current = decrypted.payload;
    return decrypted.preview;
  }
  async function confirmRestore() {
    const payload = restoreCandidate.current;
    if (!payload) throw new Error('MISSING_RESTORE_CANDIDATE');
    const restoredBlobs: Record<string, Blob> = {};
    for (const [key, dataUrl] of Object.entries(payload.images)) {
      const blob = dataUrlToBlob(dataUrl);
      restoredBlobs[key] = await optimizeImage(blob);
    }
    await queueReplaceAllData(payload.data, restoredBlobs);
    for (const timer of deletionTimers.current) window.clearTimeout(timer);
    deletionTimers.current.clear();
    setPendingDeletion(undefined);
    setPendingShoppingDeletion(undefined);
    const restoredUrls: Record<string, string> = {};
    for (const [key, blob] of Object.entries(restoredBlobs)) {
      restoredUrls[key] = URL.createObjectURL(blob);
    }
    setImageUrls((current) => {
      for (const url of Object.values(current)) URL.revokeObjectURL(url);
      return restoredUrls;
    });
    ++saveRevision.current;
    pendingImages.current = {};
    retainedImages.current = [];
    dataRef.current = payload.data;
    publishData(payload.data);
    setStorageFailure(false);
    setSaveState('saved');
    setLoadState('ready');
    restoreCandidate.current = undefined;
    setSettings(undefined);
    setBackupRequest(undefined);
    showToast('Sicherung wurde wiederhergestellt.');
  }
  if (loadState === 'loading' || writerState === 'checking')
    return (
      <main className="app-loading">
        <Image
          src={assetUrl('assets/mampffred-mascot-small.png')}
          width={110}
          height={128}
          alt="Mampffred lädt"
          priority
        />
        <span role="status" aria-live="polite">
          Mampffred deckt den Tisch …
        </span>
      </main>
    );
  if (writerState === 'blocked')
    return (
      <main className="recovery-screen">
        <ShieldCheck size={42} />
        <h1>Mampffred ist bereits geöffnet.</h1>
        <p>
          Schließe die App in anderen Browserfenstern oder als installierte App.
          So können Änderungen nicht gegenseitig überschrieben werden.
        </p>
        <button
          className="primary-button"
          onClick={() => window.location.reload()}
        >
          Erneut prüfen
        </button>
      </main>
    );
  if (writerState === 'unsupported' || writerState === 'error')
    return (
      <main className="recovery-screen">
        <ShieldCheck size={42} />
        <h1>Dieser Browser kann deine Daten nicht sicher sperren.</h1>
        <p>
          Öffne Mampffred in einer aktuellen Version von Chrome, Edge, Safari
          oder Firefox. So verhindert die App, dass zwei Fenster gleichzeitig
          dieselben lokalen Daten überschreiben.
        </p>
        <button
          className="primary-button"
          onClick={() => window.location.reload()}
        >
          Erneut prüfen
        </button>
      </main>
    );
  if (loadState === 'error')
    return (
      <>
        <main className="recovery-screen">
          <ShieldCheck size={42} />
          <h1>Deine Daten konnten nicht geöffnet werden.</h1>
          <p>
            Mampffred hat nichts überschrieben. Versuche es erneut oder stelle
            eine verschlüsselte Sicherung wieder her.
          </p>
          <button
            className="primary-button"
            onClick={() => setLoadAttempt((attempt) => attempt + 1)}
          >
            Erneut versuchen
          </button>
          <label className="recovery-upload">
            <Upload size={18} /> Sicherung auswählen
            <input
              hidden
              type="file"
              accept=".mampffred,application/json"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) setBackupRequest({ mode: 'restore', file });
                event.target.value = '';
              }}
            />
          </label>
        </main>
        {backupRequest?.mode === 'restore' && (
          <BackupDialog
            request={backupRequest}
            onClose={() => {
              restoreCandidate.current = undefined;
              setBackupRequest(undefined);
            }}
            onSubmit={(password) => inspectBackup(backupRequest.file, password)}
            onConfirmRestore={confirmRestore}
          />
        )}
      </>
    );
  const storageRecovery = storageFailure && (
    <div className="modal-backdrop">
      <main className="recovery-screen" role="alert">
        <ShieldCheck size={42} />
        <h1>Änderungen sind noch nicht gespeichert.</h1>
        <p>
          Bitte lasse Mampffred geöffnet. Gib Speicherplatz frei und versuche es
          erneut. Beim Schließen können ungespeicherte Änderungen verloren
          gehen.
        </p>
        <button
          className="primary-button"
          onClick={() => void persistCurrent().catch(() => undefined)}
        >
          Speichern erneut versuchen
        </button>
        <button
          className="secondary-button"
          onClick={() => setBackupRequest({ mode: 'create' })}
        >
          Aktuellen Stand verschlüsselt sichern
        </button>
        {backupRequest?.mode === 'create' && (
          <BackupDialog
            request={backupRequest}
            onClose={() => setBackupRequest(undefined)}
            onSubmit={createBackup}
            onConfirmRestore={confirmRestore}
          />
        )}
      </main>
    </div>
  );
  if (!data.onboardingDone)
    return (
      <>
        <main className="page-stage" inert={storageFailure}>
          <div className="app-frame">
            <Onboarding
              onStart={() =>
                setData((current) => ({ ...current, onboardingDone: true }))
              }
              onInstall={installApp}
              installAvailable={Boolean(installPrompt)}
              showIosHint={
                /iPad|iPhone|iPod/.test(navigator.userAgent) &&
                !window.matchMedia('(display-mode: standalone)').matches
              }
            />
          </div>
        </main>
        {storageRecovery}
      </>
    );
  return (
    <RecipeImageRequestContext.Provider value={requestRecipeImage}>
      <div inert={storageFailure} aria-hidden={storageFailure || undefined}>
        <main className="page-stage">
          {mutationError && (
            <div className="data-error-banner" role="alert">
              {mutationError}
              <button onClick={() => setMutationError('')}>Verstanden</button>
            </div>
          )}
          <div className="desktop-intro">
            <Image
              src={assetUrl('assets/mampffred-mascot-small.png')}
              width={112}
              height={132}
              alt="Mampffred"
            />
            <p className="wordmark">Mampffred</p>
            <h1>
              Plan rein.
              <br />
              Mahlzeit raus.
            </h1>
            <p>
              Deine private Rezept- und Essensplanung. Offline, übersichtlich
              und nur für dich.
            </p>
            <div className="intro-pill">
              <LockKeyhole size={17} /> Alles bleibt auf diesem Gerät
            </div>
          </div>
          <div
            ref={appFrameRef}
            className="app-frame"
            data-tab-direction={tabDirection}
            aria-hidden={
              Boolean(
                selectedDayDate ||
                selectedRecipeId ||
                editorRecipeId ||
                planner ||
                settings ||
                backupRequest ||
                weekShoppingRequest,
              ) || undefined
            }
            inert={
              Boolean(
                selectedDayDate ||
                selectedRecipeId ||
                editorRecipeId ||
                planner ||
                settings ||
                backupRequest ||
                weekShoppingRequest,
              ) || undefined
            }
          >
            {tab === 'today' && (
              <TodayView
                data={data}
                now={now}
                imageUrls={imageUrls}
                onRecipe={(recipe) => {
                  setRecipePlanWeekStart(undefined);
                  setSelectedRecipeId(recipe.id);
                }}
                onSettings={() => changeTab('more')}
                onBackup={() => setBackupRequest({ mode: 'create' })}
                onPlan={(slot = 'Abendessen') =>
                  openPlanner(todayLocal(now), slot)
                }
                onAddRecipe={openNewRecipeEditor}
                onAddSamples={addSampleRecipes}
              />
            )}
            {tab === 'week' && (
              <WeekView
                data={data}
                imageUrls={imageUrls}
                weekStart={weekStart}
                onWeekStart={setWeekStart}
                onAdd={(date, slot) => {
                  if (data.recipes.length) {
                    openPlanner(date, slot);
                    return;
                  }
                  setPendingPlanTarget({ date, slot });
                  openNewRecipeEditor();
                }}
                onCreateShopping={() => openWeekShopping(weekStart)}
                onNutritionSetup={() => setSettings('nutrition')}
                onDismissNutrition={() =>
                  setData((current) => ({
                    ...current,
                    nutritionSettings: {
                      ...current.nutritionSettings,
                      promptDismissed: true,
                    },
                  }))
                }
                onEditRecipes={(recipes) => {
                  if (!recipes[0]) return;
                  setNutritionEditQueue(recipes.map((recipe) => recipe.id));
                  openExistingRecipeEditor(recipes[0].id);
                }}
                onOpenRecipe={(recipe) => {
                  setRecipePlanWeekStart(weekStart);
                  setSelectedRecipeId(recipe.id);
                }}
                onOpenDay={setSelectedDayDate}
              />
            )}
            {tab === 'recipes' && (
              <RecipesView
                data={data}
                imageUrls={imageUrls}
                query={recipeQuery}
                filter={recipeFilter}
                onQuery={setRecipeQuery}
                onFilter={setRecipeFilter}
                onRecipe={(recipe) => {
                  setRecipePlanWeekStart(undefined);
                  setSelectedRecipeId(recipe.id);
                }}
                onDraft={(draft) => setEditorRecipeId(`draft:${draft.id}`)}
                onAdd={openNewRecipeEditor}
                onAddSamples={addSampleRecipes}
                onToggleFavorite={(recipe) =>
                  updateRecipe({ ...recipe, favorite: !recipe.favorite })
                }
                onImport={(file) => void importRecipeFile(file)}
              />
            )}
            {tab === 'shopping' && (
              <ShoppingView
                data={data}
                weekStart={weekStart}
                onWeekStart={setWeekStart}
                onChange={(shopping) =>
                  setData((current) => ({ ...current, shopping }))
                }
                onRemove={deleteShoppingItems}
                onFromWeek={() => openWeekShopping(weekStart)}
              />
            )}
            {tab === 'more' && <MoreView data={data} onOpen={setSettings} />}
            <BottomNav tab={tab} onTab={changeTab} />
            {saveState !== 'idle' && (
              <div
                className={`save-indicator ${saveState}`}
                role="status"
                aria-live="polite"
              >
                {saveState === 'saving' ? (
                  <>
                    <LoaderCircle size={14} className="status-spinner" />{' '}
                    Speichert …
                  </>
                ) : saveState === 'saved' ? (
                  <>
                    <Check size={14} /> Gespeichert
                  </>
                ) : (
                  <>
                    <Info size={14} /> Nicht gespeichert
                  </>
                )}
              </div>
            )}
          </div>
          {selectedDayDate && (
            <DayDetailSheet
              data={data}
              date={selectedDayDate}
              imageUrls={imageUrls}
              onClose={() => setSelectedDayDate(undefined)}
              onOpenRecipe={(recipe) => {
                setRecipePlanWeekStart(weekStart);
                setSelectedRecipeId(recipe.id);
              }}
              onPlan={(date, slot, recipeId) => {
                openPlanner(date, slot, recipeId);
              }}
              onNutritionSetup={() => {
                setSettings('nutrition');
              }}
              inactive={Boolean(selectedRecipeId || planner || settings)}
            />
          )}
          {selectedRecipe && (
            <RecipeDetail
              recipe={selectedRecipe}
              automaticEstimates={
                data.nutritionSettings.enabled &&
                data.nutritionSettings.automaticEstimates
              }
              imageUrls={imageUrls}
              onClose={() => {
                if (plannerResume) {
                  setSelectedRecipeId(plannerResume.backgroundRecipeId);
                  setPlanner(plannerResume.state);
                  setPlannerResume(undefined);
                  return;
                }
                setSelectedRecipeId(undefined);
                setRecipePlanWeekStart(undefined);
              }}
              onEdit={() => openExistingRecipeEditor(selectedRecipe.id)}
              onPlan={(servings) => openRecipePlanner(selectedRecipe, servings)}
              onFavorite={() =>
                updateRecipe({
                  ...selectedRecipe,
                  favorite: !selectedRecipe.favorite,
                })
              }
              onAddToShopping={(servings) =>
                addRecipeToShopping(selectedRecipe, servings)
              }
              onShare={() => void shareRecipe(selectedRecipe)}
              inactive={Boolean(editorRecipeId || planner)}
            />
          )}
          {editorRecipeId && (
            <RecipeEditor
              recipe={editorRecipe}
              savedDraft={editorSavedDraft}
              automaticEstimates={data.nutritionSettings.automaticEstimates}
              foodOverrides={data.foodOverrides}
              customFoods={data.customFoods}
              currentImageUrl={
                (editorSavedDraft?.imageKey ?? editorRecipe?.imageKey)
                  ? imageUrls[
                      (editorSavedDraft?.imageKey ?? editorRecipe?.imageKey)!
                    ]
                  : undefined
              }
              onClose={() => {
                setEditorRecipeId(undefined);
                setPendingPlanTarget(undefined);
                setNutritionEditQueue(undefined);
              }}
              onSave={saveRecipeDraft}
              onAutosave={autosaveRecipeDraft}
              onDiscardDraft={discardRecipeDraft}
              onCreateCustomFood={addCustomFood}
              onDelete={
                editorRecipe ? () => setDeleteRequest(editorRecipe) : undefined
              }
              inactive={Boolean(deleteRequest)}
            />
          )}
          {deleteRequest && (
            <DeleteRecipeDialog
              recipe={deleteRequest}
              plannedCount={data.plan.reduce(
                (total, day) =>
                  total +
                  day.meals.filter((meal) => meal.recipeId === deleteRequest.id)
                    .length,
                0,
              )}
              busy={deleteBusy}
              onCancel={() => setDeleteRequest(undefined)}
              onConfirm={() => void confirmDeleteRecipe()}
            />
          )}
          {planner && (
            <PlannerSheet
              data={data}
              imageUrls={imageUrls}
              initialDate={planner.date}
              initialSlot={planner.slot}
              initialRecipeId={planner.recipeId}
              initialServings={planner.servings}
              initialQuery={planner.query}
              initialFilter={planner.filter}
              onClose={() => setPlanner(undefined)}
              onPlan={planRecipe}
              onRemove={removePlannedMeal}
              onOpenRecipe={(recipeId, state) => {
                setPlannerResume({
                  state,
                  backgroundRecipeId: selectedRecipeId,
                });
                setPlanner(undefined);
                setSelectedRecipeId(recipeId);
              }}
            />
          )}
          {settings && (
            <SettingsView
              data={data}
              panel={settings}
              onClose={() => setSettings(undefined)}
              onBackup={() => setBackupRequest({ mode: 'create' })}
              onRestore={(file) => setBackupRequest({ mode: 'restore', file })}
              inactive={Boolean(backupRequest)}
              installAvailable={Boolean(installPrompt)}
              onInstall={installApp}
              onNutritionSettings={(nutritionSettings) =>
                void updateNutritionSettings(nutritionSettings)
              }
              onSaveCustomFood={saveCustomFood}
              showIosHint={
                /iPad|iPhone|iPod/.test(navigator.userAgent) &&
                !window.matchMedia('(display-mode: standalone)').matches
              }
            />
          )}
          {backupRequest && !storageFailure && (
            <BackupDialog
              request={backupRequest}
              onClose={() => {
                restoreCandidate.current = undefined;
                setBackupRequest(undefined);
              }}
              onSubmit={(password) =>
                backupRequest.mode === 'create'
                  ? createBackup(password)
                  : inspectBackup(backupRequest.file, password)
              }
              onConfirmRestore={confirmRestore}
            />
          )}
          {weekShoppingRequest && (
            <WeekShoppingDialog
              result={weekShoppingRequest}
              onCancel={() => setWeekShoppingRequest(undefined)}
              onConfirm={applyWeekShopping}
            />
          )}
          {pendingDeletion && (
            <div className="toast" role="status" aria-live="polite">
              <Check size={17} /> Rezept gelöscht.
              <button type="button" onClick={() => void undoDeleteRecipe()}>
                Rückgängig
              </button>
            </div>
          )}
          {pendingShoppingDeletion && !pendingDeletion && (
            <div className="toast" role="status" aria-live="polite">
              <Check size={17} />{' '}
              {pendingShoppingDeletion.removed.length === 1
                ? 'Einkaufsartikel entfernt.'
                : `${pendingShoppingDeletion.removed.length} Einkaufsartikel entfernt.`}
              <button type="button" onClick={undoShoppingDeletion}>
                Rückgängig
              </button>
            </div>
          )}
          {toast && !pendingDeletion && !pendingShoppingDeletion && (
            <div className="toast" role="status" aria-live="polite">
              <Check size={17} /> {toast}
            </div>
          )}
        </main>
      </div>
      {storageRecovery}
    </RecipeImageRequestContext.Provider>
  );
}
