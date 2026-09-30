'use client';
import {
  ALL_MEAL_SLOTS,
  getEnabledMealSlots,
  visibleMealPlan,
} from '@/lib/meal-slots';

import { validateDataUpdate, referencedImageKeys } from '@/lib/data-updates';
import { MIN_BACKUP_PASSWORD_LENGTH } from '@/lib/backup';
import { getBackupReminder } from '@/lib/backup-reminder';
import { FramedImage, ImageFramingEditor } from './image-framing';
import { IconButton } from './icon-button';
import {
  useAnimatedSheetClose,
  useModalFocus,
  useSheetSwipeToClose,
} from './modal-hooks';
import {
  RecipeImage,
  RecipeImageRequestContext,
  THUMBNAIL_CACHE,
  assetUrl,
} from './recipe-image';
import { TodayView } from './today-view';
import {
  MealSlotIcon,
  TagIcon,
  isoWeekNumber,
  portions,
  weekLabel,
} from './plan-ui';
import { WeekView } from './week-view';
import { QuickPlanSheet } from './quick-plan-sheet';
import {
  applyPlanChanges,
  freeSlots,
  preferredServings,
  recipesForSlot,
  revertPlanChanges,
  seededRandom,
  weekDates,
  type FreeSlot,
  type PlanChange,
  type PlanProposal,
} from '@/lib/meal-planning';
import { UnitPicker } from './unit-picker';
import { RecipeStepsEditor } from './recipe-steps-editor';
import { useAppUpdate } from './use-app-update';
import { AppMaintenance, type AppUpdateControls } from './app-maintenance';
import { APP_VERSION } from '@/lib/app-version';
import { AppToast } from './app-toast';
import {
  removeRecipe,
  restoreRecipes,
  removedRecipeImageKeys,
  type RemovedRecipe,
} from '@/lib/recipe-undo';
import { scaledIngredientAmount } from '@/lib/ingredient-amount';
import {
  installStandardRecipes,
  newStandardImageKeys,
  restoreStandardRecipes,
} from '@/lib/standard-recipes';

/* oxlint-disable next/no-img-element, jsx-a11y/prefer-tag-over-role, react/immutability, react/refs, react/set-state-in-effect */

import {
  ArrowLeft,
  CalendarDays,
  Carrot,
  Check,
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
  Save,
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
  useCallback,
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
import type {
  AppData,
  CustomFood,
  FoodOverride,
  MealSlot,
  NutritionSettings,
  PlannedMeal,
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
import {
  removeShoppingItems,
  restoreShoppingItems,
  type RemovedShoppingItem,
} from '@/lib/shopping-undo';
import {
  appTabFromHistoryState,
  createAppHistoryState,
} from '@/lib/ui-history';
import { aggregateNutritionDay } from '@/lib/nutrition';
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
  createSharedRecipeFile,
  createSharedRecipeTransferFile,
  recipeShareMessage,
  recipeReceiveInstructions,
  sharedRecipeInbox,
  recipeImportErrorMessage,
  createSharedRecipeUrl,
  MAX_SHARED_RECIPE_FILE_BYTES,
  parseSharedRecipe,
  parseSharedRecipeFile,
  type SharedRecipeImport,
  readSharedRecipeHash,
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
type SettingsPanel =
  | 'planning'
  | 'backup'
  | 'nutrition'
  | 'foods'
  | 'privacy'
  | 'app';
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
const fromIso = parseLocalDate;
const recipeShareBaseUrl = () =>
  new URL(import.meta.env.BASE_URL, window.location.origin).href;
const sharePreparationMessage = (error: unknown) =>
  error instanceof Error &&
  (error.message === 'SHARED_RECIPE_LINK_TOO_LARGE' ||
    error.message === 'SHARED_RECIPE_TOO_LARGE')
    ? 'Dieses Rezept ist zu umfangreich für einen Rezeptlink. Sichere es stattdessen als Rezeptdatei.'
    : 'Das Rezept konnte gerade nicht geteilt werden.';

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

function DayDetailSheet({
  data,
  date,
  imageUrls,
  onClose,
  onOpenRecipe,
  onPlan,
  onRemove,
  onNutritionSetup,
  inactive = false,
}: {
  data: AppData;
  date: string;
  imageUrls: Record<string, string>;
  onClose: () => void;
  onOpenRecipe: (recipe: Recipe) => void;
  onPlan: (date: string, slot: MealSlot, recipeId?: string) => void;
  onRemove: (date: string, slot: MealSlot) => void;
  onNutritionSetup: () => void;
  inactive?: boolean;
}) {
  const mealSlots = getEnabledMealSlots(data);
  const visiblePlan = visibleMealPlan(data);
  const sheetExit = useAnimatedSheetClose(onClose);
  const dialogRef = useModalFocus<HTMLElement>(sheetExit.close);
  const sheetSwipe = useSheetSwipeToClose(onClose);
  const plannedDay = visiblePlan.find((day) => day.date === date);
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
            <small>{date === todayLocal() ? 'Heute' : 'Dein Tag'}</small>
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
                  className="dd-empty"
                  key={slot}
                  onClick={() => onPlan(date, slot)}
                >
                  <span className="dd-empty-icon" aria-hidden="true">
                    <MealSlotIcon slot={slot} />
                  </span>
                  <span>
                    <small>{slot}</small>
                    <strong>Noch frei – jetzt planen</strong>
                  </span>
                  <span className="dd-empty-plus" aria-hidden="true">
                    <Plus size={18} />
                  </span>
                </button>
              );
            return (
              <article className="dd-meal" key={slot}>
                <button
                  type="button"
                  className="dd-media"
                  onClick={() => onOpenRecipe(recipe)}
                  aria-label={`Rezept ansehen: ${recipe.name}`}
                >
                  <RecipeImage
                    recipe={recipe}
                    imageUrls={imageUrls}
                    className="dd-image"
                    cover
                    eager
                  />
                  <span className="td-hero-badge">
                    <MealSlotIcon slot={slot} size={15} />
                    {slot}
                  </span>
                </button>
                <div className="dd-body">
                  <h3>{recipe.name}</h3>
                  <div className="td-hero-meta">
                    <span>
                      <Users size={16} aria-hidden="true" />{' '}
                      {portions(meal.servings)}
                    </span>
                    <span>
                      <Clock3 size={16} aria-hidden="true" /> {recipe.minutes}{' '}
                      Min.
                    </span>
                  </div>
                  <button
                    type="button"
                    className="td-primary"
                    onClick={() => onOpenRecipe(recipe)}
                  >
                    <Utensils size={19} aria-hidden="true" />
                    <span>Rezept ansehen</span>
                    <ChevronRight size={19} aria-hidden="true" />
                  </button>
                  <div className="td-hero-actions">
                    <button
                      type="button"
                      onClick={() => onPlan(date, slot, recipe.id)}
                    >
                      <RefreshCw size={17} aria-hidden="true" /> Tauschen
                    </button>
                    <button
                      type="button"
                      className="is-danger"
                      onClick={() => onRemove(date, slot)}
                    >
                      <Trash2 size={17} aria-hidden="true" /> Entfernen
                    </button>
                  </div>
                </div>
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
  onDiscardDraft,
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
  onDiscardDraft: (draftId: string) => Promise<void>;
  onAdd: () => void;
  onAddSamples: () => void;
  onToggleFavorite: (recipe: Recipe) => void;
  onImport: (file: File) => void;
}) {
  const [discardTarget, setDiscardTarget] = useState<RecipeDraft>();
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
  const filterCounts = useMemo(
    () =>
      Object.fromEntries(
        filters.map((item) => [
          item,
          filterRecipes(data.recipes, '', item).length,
        ]),
      ) as Record<RecipeFilter, number>,
    // oxlint-disable-next-line react/exhaustive-deps
    [data.recipes],
  );
  // Stable for the whole day, so the banner does not change while browsing.
  const today = todayLocal();
  const featured = useMemo(() => {
    if (!data.recipes.length) return undefined;
    const random = seededRandom(`idee|${today}`);
    return data.recipes[Math.floor(random() * data.recipes.length)];
  }, [data.recipes, today]);
  return (
    <>
      <div
        className="screen-content recipes-view rx-view"
        inert={Boolean(discardTarget) || undefined}
      >
        <header className="td-header rx-header">
          <div>
            <h1>Rezepte</h1>
            <p>
              {data.recipes.length}{' '}
              {data.recipes.length === 1 ? 'Rezept' : 'Rezepte'} in deiner
              Sammlung
            </p>
          </div>
          <IconButton
            label="Rezept hinzufügen"
            className="rx-add"
            onClick={onAdd}
          >
            <Plus size={24} />
          </IconButton>
        </header>
        {featured && !query && filter === 'Alle' && (
          <div className="wk-hero-wrap rx-feature-wrap">
            <span className="wk-hero-leaves" aria-hidden="true">
              <img src={assetUrl('assets/basil-card-leaves.png')} alt="" />
            </span>
            <button
              type="button"
              className="wk-today has-photo rx-feature"
              onClick={() => onRecipe(featured)}
              aria-label={`Idee des Tages: ${featured.name}. Rezept öffnen`}
            >
              <RecipeImage
                recipe={featured}
                imageUrls={imageUrls}
                className="wk-today-photo"
                cover
                eager
              />
              <span className="wk-today-shade" aria-hidden="true" />
              <span className="wk-today-copy" aria-hidden="true">
                <span className="wk-today-chip">Idee des Tages</span>
                <strong>{featured.name}</strong>
                <small>
                  <span>
                    <Clock3 size={14} /> {featured.minutes} Min.
                  </span>
                  {visibleRecipeTags(featured)[0] && (
                    <span>
                      <TagIcon tag={visibleRecipeTags(featured)[0]} />{' '}
                      {visibleRecipeTags(featured)[0]}
                    </span>
                  )}
                  {featured.favorite && (
                    <span>
                      <Heart size={14} fill="currentColor" /> Favorit
                    </span>
                  )}
                </small>
              </span>
              <span className="wk-today-action" aria-hidden="true">
                <ChevronRight size={20} />
              </span>
            </button>
          </div>
        )}
        <label className="search-field rx-search">
          <Search size={19} />
          <input
            aria-label="Rezepte suchen"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="Name, Zutat oder Tag suchen …"
          />
        </label>
        <div className="filter-row rx-filters" aria-label="Rezeptfilter">
          {filters.map((item) => (
            <button
              key={item}
              className={filter === item ? 'active' : ''}
              aria-pressed={filter === item}
              onClick={(event) => {
                onFilter(item);
                event.currentTarget.scrollIntoView({
                  behavior: window.matchMedia(
                    '(prefers-reduced-motion: reduce)',
                  ).matches
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
              {(item === 'Vegetarisch' || item === 'Vegan') && (
                <Leaf size={16} />
              )}
              {item}
              <em>{filterCounts[item]}</em>
            </button>
          ))}
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
                <div className="recipe-draft-row" key={draft.id}>
                  <button
                    className="recipe-draft-open"
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
                  <button
                    type="button"
                    className="recipe-draft-discard"
                    aria-label={`Entwurf „${draft.name.trim() || draft.ingredients.find((item) => item.name.trim())?.name || 'Neues Rezept'}“ verwerfen`}
                    onClick={() => setDiscardTarget(draft)}
                  >
                    <Trash2 size={17} />
                    <span>Verwerfen</span>
                  </button>
                </div>
              ))}
          </section>
        )}
        {recipes.length ? (
          <div className="rx-grid" key={filter}>
            {recipes.map((recipe, index) => (
              <article
                className="rx-tile"
                key={recipe.id}
                style={
                  {
                    '--recipe-index': Math.min(index, 5),
                  } as React.CSSProperties
                }
              >
                <button
                  className="rx-tile-main"
                  onClick={() => onRecipe(recipe)}
                >
                  <RecipeImage
                    recipe={recipe}
                    imageUrls={imageUrls}
                    className="rx-tile-image"
                    thumbnail
                    cover
                  />
                  <strong>{recipe.name}</strong>
                  <small>
                    <span>
                      <Clock3 size={13} /> {recipe.minutes} Min.
                    </span>
                    {visibleRecipeTags(recipe)[0] && (
                      <span className="rx-tag">
                        <TagIcon tag={visibleRecipeTags(recipe)[0]} size={12} />{' '}
                        {visibleRecipeTags(recipe)[0]}
                      </span>
                    )}
                  </small>
                </button>
                <button
                  className={`rx-fav ${recipe.favorite ? 'active' : ''}`}
                  aria-label={
                    recipe.favorite
                      ? 'Aus Favoriten entfernen'
                      : 'Zu Favoriten hinzufügen'
                  }
                  aria-pressed={Boolean(recipe.favorite)}
                  onClick={() => onToggleFavorite(recipe)}
                >
                  <Heart
                    size={18}
                    fill={recipe.favorite ? 'currentColor' : 'none'}
                  />
                </button>
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
        <section className="rx-more" aria-labelledby="rx-more-title">
          <h2 id="rx-more-title">Rezepte hinzufügen</h2>
          <div className="rx-more-list">
            <button type="button" className="is-primary" onClick={onAdd}>
              <span className="rx-more-icon" aria-hidden="true">
                <Plus size={20} />
              </span>
              <span>
                <strong>Neues Rezept anlegen</strong>
                <small>Schritt für Schritt, mit Foto</small>
              </span>
              <ChevronRight size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => importFileRef.current?.click()}
            >
              <span className="rx-more-icon" aria-hidden="true">
                <Upload size={19} />
              </span>
              <span>
                <strong>Rezeptdatei importieren</strong>
                <small>Mampffred-Rezeptdatei öffnen</small>
              </span>
              <ChevronRight size={18} aria-hidden="true" />
            </button>
            <details className="rx-more-help">
              <summary>
                <span className="rx-more-icon" aria-hidden="true">
                  <Share2 size={19} />
                </span>
                <span>
                  <strong>Rezept aus WhatsApp übernehmen</strong>
                  <small>So klappt es auf Android und iPhone</small>
                </span>
                <ChevronDown size={18} aria-hidden="true" />
              </summary>
              <p>
                <strong>Android:</strong> {recipeReceiveInstructions.Android}
              </p>
              <p>
                <strong>iPhone:</strong> {recipeReceiveInstructions.iPhone}
              </p>
            </details>
          </div>
          <input
            ref={importFileRef}
            hidden
            type="file"
            accept=".mampffred-rezept,.json,.txt,application/json,text/plain"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onImport(file);
              event.currentTarget.value = '';
            }}
          />
        </section>
      </div>
      {discardTarget && (
        <DiscardDraftDialog
          name={
            discardTarget.name.trim() ||
            discardTarget.ingredients.find((item) => item.name.trim())?.name ||
            'Neues Rezept'
          }
          existingRecipe={Boolean(discardTarget.baseRecipeId)}
          onCancel={() => setDiscardTarget(undefined)}
          onConfirm={async () => {
            await onDiscardDraft(discardTarget.id);
            setDiscardTarget(undefined);
          }}
        />
      )}
    </>
  );
}

const shoppingCategories: Array<{
  category: ShoppingItem['category'];
  icon: React.ReactNode;
  tone: 'green' | 'slate' | 'amber' | 'clay' | 'sage';
  art?: string;
}> = [
  {
    category: 'Gemüse & Obst',
    icon: <Carrot size={20} />,
    tone: 'green',
    art: 'assets/shopping-produce-v1.webp',
  },
  {
    category: 'Kühlregal',
    icon: <Milk size={20} />,
    tone: 'slate',
    art: 'assets/shopping-dairy-v1.webp',
  },
  {
    category: 'Vorrat',
    icon: <Container size={20} />,
    tone: 'amber',
    art: 'assets/shopping-pantry-v1.webp',
  },
  {
    category: 'Backwaren',
    icon: <Croissant size={20} />,
    tone: 'clay',
    art: 'assets/shopping-bakery-v1.webp',
  },
  { category: 'Sonstiges', icon: <ShoppingBasket size={20} />, tone: 'sage' },
];

function ShoppingView({
  data,
  now,
  weekStart,
  onWeekStart,
  onChange,
  onRemove,
  onFromWeek,
}: {
  data: AppData;
  now: Date;
  weekStart: string;
  onWeekStart: (weekStart: string) => void;
  onChange: (items: ShoppingItem[]) => void;
  onRemove: (items: ShoppingItem[]) => void;
  onFromWeek: () => void;
}) {
  const [newItem, setNewItem] = useState('');
  const currentWeek = startOfLocalWeek(now);
  const visibleShopping = data.shopping.filter(
    (item) =>
      item.origin.kind !== 'week' || item.origin.weekStart === weekStart,
  );
  const weekItems = visibleShopping.filter(
    (item) => item.origin.kind === 'week',
  );
  const completed = visibleShopping.filter((item) => item.checked).length;
  const total = visibleShopping.length;
  const circumference = 2 * Math.PI * 22;
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
  function toggle(item: ShoppingItem) {
    onChange(
      data.shopping.map((entry) =>
        entry.id === item.id ? { ...entry, checked: !entry.checked } : entry,
      ),
    );
  }
  return (
    <div className="screen-content shopping-view sh-view">
      <header className="td-header">
        <div>
          <h1>Einkauf</h1>
          <p>
            {shortDate.format(fromIso(weekStart))} –{' '}
            {shortDate.format(fromIso(addLocalDays(weekStart, 6)))} · KW{' '}
            {isoWeekNumber(fromIso(weekStart))}
          </p>
        </div>
      </header>
      <nav className="wk-nav" aria-label="Einkaufswoche wechseln">
        <IconButton
          label="Vorherige Woche"
          onClick={() => onWeekStart(addLocalDays(weekStart, -7))}
        >
          <ChevronLeft size={21} />
        </IconButton>
        <button
          type="button"
          className="wk-nav-label"
          onClick={() => onWeekStart(currentWeek)}
          disabled={weekStart === currentWeek}
          aria-label={
            weekStart === currentWeek
              ? 'Aktuelle Woche wird angezeigt'
              : 'Zur aktuellen Woche wechseln'
          }
        >
          {weekLabel(weekStart, currentWeek)}
          {weekStart !== currentWeek && <small>Zurück zu heute</small>}
        </button>
        <IconButton
          label="Nächste Woche"
          onClick={() => onWeekStart(addLocalDays(weekStart, 7))}
        >
          <ChevronRight size={21} />
        </IconButton>
      </nav>

      <div className="wk-hero-wrap">
        <span className="wk-hero-leaves" aria-hidden="true">
          <img src={assetUrl('assets/basil-card-leaves.png')} alt="" />
        </span>
        <section className="wk-hero sh-hero" aria-label="Einkaufsfortschritt">
          <span className="wk-hero-glow" aria-hidden="true" />
          <div className="wk-hero-top">
            <span
              className="wk-ring"
              role="progressbar"
              aria-label="Einkauf erledigt"
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={completed}
            >
              <svg viewBox="0 0 56 56" aria-hidden="true">
                <circle className="wk-ring-track" cx="28" cy="28" r="22" />
                <circle
                  className="wk-ring-value"
                  cx="28"
                  cy="28"
                  r="22"
                  strokeDasharray={circumference}
                  strokeDashoffset={
                    circumference * (1 - (total ? completed / total : 0))
                  }
                />
              </svg>
              <strong>{completed}</strong>
            </span>
            <div className="wk-progress-copy">
              <strong>
                {total === 0
                  ? 'Bereit für deine Liste'
                  : completed === total
                    ? 'Alles im Korb!'
                    : `${completed} von ${total} erledigt`}
              </strong>
              <small>
                {total === 0
                  ? 'Starte mit deinem Wochenplan oder eigenen Artikeln.'
                  : completed === total
                    ? 'Guten Appetit und bis zum nächsten Einkauf.'
                    : `Noch ${total - completed} Artikel offen.`}
              </small>
            </div>
          </div>
          <div className="sh-hero-actions">
            <button type="button" className="wk-fill" onClick={onFromWeek}>
              <CalendarDays size={16} aria-hidden="true" />
              {weekItems.length
                ? 'Mit Wochenplan abgleichen'
                : 'Aus Wochenplan'}
            </button>
            {completed > 0 && (
              <button
                type="button"
                className="sh-clear"
                onClick={() =>
                  onRemove(visibleShopping.filter((item) => item.checked))
                }
              >
                <Trash2 size={15} aria-hidden="true" /> Erledigte ({completed})
              </button>
            )}
          </div>
        </section>
      </div>

      <form
        className="sh-add"
        onSubmit={(event) => {
          event.preventDefault();
          addItem();
        }}
      >
        <input
          aria-label="Einkaufsartikel hinzufügen"
          value={newItem}
          maxLength={500}
          onChange={(event) => setNewItem(event.target.value)}
          placeholder="Artikel hinzufügen, z. B. Milch"
          enterKeyHint="done"
        />
        <button
          type="submit"
          aria-label="Artikel hinzufügen"
          disabled={!newItem.trim()}
        >
          <Plus size={22} />
        </button>
      </form>

      {total === 0 ? (
        <section className="sh-empty">
          <img
            src={assetUrl('assets/mampffred-mascot-small.png')}
            alt=""
            width={96}
            height={105}
            decoding="async"
          />
          <h2>Deine Liste ist noch leer</h2>
          <p>
            Tippe oben auf „Aus Wochenplan“, dann stellt Mampffred die Zutaten
            deiner geplanten Rezepte zusammen.
          </p>
        </section>
      ) : (
        <div className="sh-groups">
          {shoppingCategories.map(({ category, icon, tone, art }) => {
            // Open items first, so the list shrinks while you shop.
            const items = visibleShopping
              .filter((item) => item.category === category)
              .toSorted(
                (left, right) => Number(left.checked) - Number(right.checked),
              );
            if (!items.length) return null;
            const done = items.filter((item) => item.checked).length;
            return (
              <section
                className={`sh-group ${done === items.length ? 'is-done' : ''}`}
                key={category}
                aria-label={category}
              >
                <header className="sh-group-head">
                  <span className={`mo-icon is-${tone}`} aria-hidden="true">
                    {icon}
                  </span>
                  <span>
                    <strong>{category}</strong>
                    <small>
                      {done} von {items.length} erledigt
                    </small>
                  </span>
                  {art && (
                    <img
                      className="sh-group-art"
                      src={assetUrl(art)}
                      alt=""
                      aria-hidden="true"
                      decoding="async"
                    />
                  )}
                </header>
                <span className="sh-group-bar" aria-hidden="true">
                  <i
                    style={{
                      transform: `scaleX(${done / items.length})`,
                    }}
                  />
                </span>
                <ul className="sh-list">
                  {items.map((item) => (
                    <li
                      className={`sh-row ${item.checked ? 'is-done' : ''}`}
                      key={item.id}
                    >
                      <label className="sh-check">
                        <input
                          type="checkbox"
                          aria-label={`${item.name} als ${item.checked ? 'unerledigt' : 'erledigt'} markieren`}
                          checked={item.checked}
                          onChange={() => toggle(item)}
                        />
                        <span className="sh-box" aria-hidden="true">
                          <Check size={15} strokeWidth={3} />
                        </span>
                        <span className="sh-copy">
                          <strong>{item.name}</strong>
                          {item.source && <small>{item.source}</small>}
                        </span>
                      </label>
                      <IconButton
                        className="sh-remove"
                        label={`${item.name} entfernen`}
                        onClick={() => onRemove([item])}
                      >
                        <Trash2 size={16} />
                      </IconButton>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MoreView({
  data,
  now,
  onOpen,
}: {
  data: AppData;
  now: Date;
  onOpen: (panel: SettingsPanel) => void;
}) {
  const reminder = getBackupReminder(data.lastBackup, now);
  const plan = visibleMealPlan(data);
  const plannedThisWeek = weekDates(startOfLocalWeek(now)).reduce(
    (total, date) =>
      total + (plan.find((day) => day.date === date)?.meals.length ?? 0),
    0,
  );
  const favorites = data.recipes.filter((recipe) => recipe.favorite).length;
  const groups: Array<{
    title: string;
    items: Array<{
      panel: SettingsPanel;
      label: string;
      detail: string;
      icon: React.ReactNode;
      tone: 'green' | 'amber' | 'sage' | 'clay' | 'slate';
      badge?: { label: string; tone: 'ok' | 'warn' | 'due' };
    }>;
  }> = [
    {
      title: 'Planung & Inhalte',
      items: [
        {
          panel: 'planning',
          label: 'Mahlzeiten planen',
          detail: getEnabledMealSlots(data).join(' · '),
          icon: <CalendarDays size={20} />,
          tone: 'green',
        },
        {
          panel: 'nutrition',
          label: 'Nährwerte & Ziele',
          detail: data.nutritionSettings.enabled
            ? 'Hinweise aktiviert'
            : 'Optional einrichten',
          icon: <Info size={20} />,
          tone: 'amber',
        },
        {
          panel: 'foods',
          label: 'Lebensmittel',
          detail: `${data.customFoods.length} ${data.customFoods.length === 1 ? 'eigener Eintrag' : 'eigene Einträge'}`,
          icon: <Leaf size={20} />,
          tone: 'sage',
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
          tone: 'clay',
          badge:
            reminder.kind === 'recent'
              ? { label: 'Aktuell', tone: 'ok' }
              : reminder.kind === 'stale'
                ? { label: 'Fällig', tone: 'due' }
                : { label: 'Empfohlen', tone: 'warn' },
        },
        {
          panel: 'privacy',
          label: 'Datenschutz & Speicher',
          detail: 'Lokal auf diesem Gerät',
          icon: <LockKeyhole size={20} />,
          tone: 'slate',
        },
      ],
    },
    {
      title: 'App',
      items: [
        {
          panel: 'app',
          label: 'App & Updates',
          detail: `Version ${APP_VERSION}`,
          icon: <Settings size={20} />,
          tone: 'green',
        },
      ],
    },
  ];
  return (
    <div className="screen-content mo-view">
      <header className="td-header">
        <div>
          <h1>Mehr</h1>
          <p>Alles an seinem Platz.</p>
        </div>
      </header>
      <div className="wk-hero-wrap">
        <section className="wk-hero mo-hero" aria-label="Deine Sammlung">
          <span className="wk-hero-glow" aria-hidden="true" />
          <div className="mo-hero-top">
            <span className="mo-mascot" aria-hidden="true">
              <img
                src={assetUrl('assets/mampffred-mascot-small.png')}
                alt=""
                width={68}
                height={74}
                decoding="async"
              />
            </span>
            <div>
              <strong>Hallo, ich bin Mampffred!</strong>
              <small>
                Dein privater Küchenhelfer. Alles bleibt auf diesem Gerät.
              </small>
            </div>
          </div>
          <dl className="mo-stats">
            <div>
              <dt>Rezepte</dt>
              <dd>{data.recipes.length}</dd>
            </div>
            <div>
              <dt>Favoriten</dt>
              <dd>{favorites}</dd>
            </div>
            <div>
              <dt>Diese Woche</dt>
              <dd>{plannedThisWeek}</dd>
            </div>
          </dl>
        </section>
      </div>
      {groups.map((group) => (
        <section className="mo-group" key={group.title}>
          <h2>{group.title}</h2>
          <div className="mo-menu">
            {group.items.map((item) => (
              <button
                type="button"
                key={item.panel}
                onClick={() => onOpen(item.panel)}
              >
                <span className={`mo-icon is-${item.tone}`} aria-hidden="true">
                  {item.icon}
                </span>
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.detail}</small>
                </span>
                {item.badge && (
                  <em className={`mo-badge is-${item.badge.tone}`}>
                    {item.badge.label}
                  </em>
                )}
                <ChevronRight size={19} aria-hidden="true" />
              </button>
            ))}
          </div>
        </section>
      ))}
      <p className="mo-footer">
        <LockKeyhole size={15} aria-hidden="true" /> Privat & offline ·
        Mampffred {APP_VERSION}
      </p>
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
  onDelete,
  onPlan,
  onFavorite,
  onAddToShopping,
  onShare,
  shareReady,
  onExport,
  exportBusy,
  planLabel = 'Planen',
  inactive = false,
}: {
  recipe: Recipe;
  automaticEstimates: boolean;
  imageUrls: Record<string, string>;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onPlan: (servings: number) => void;
  onFavorite: () => void;
  onAddToShopping: (servings: number) => void;
  onShare: () => void;
  shareReady: boolean;
  onExport: () => void;
  exportBusy: boolean;
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
            <IconButton
              label="Rezept teilen"
              onClick={onShare}
              disabled={!shareReady}
            >
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
            <IconButton label="Rezept löschen" onClick={onDelete}>
              <Trash2 size={19} />
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
                    {scaledIngredientAmount(
                      ingredient.amount,
                      factor,
                      ingredient.scaleWithServings,
                    )}
                  </strong>
                  <span>{ingredient.unit}</span>
                  <p>
                    {ingredient.name}
                    {ingredient.scaleWithServings === false && (
                      <small> · Menge bleibt gleich</small>
                    )}
                  </p>
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
            <button onClick={onExport} disabled={exportBusy}>
              <Download size={18} />{' '}
              {exportBusy
                ? 'Datei wird vorbereitet …'
                : 'Als Rezeptdatei sichern'}
            </button>
          </div>
          <button
            className="secondary-button danger-button detail-delete-button"
            onClick={onDelete}
          >
            <Trash2 size={18} /> Rezept löschen
          </button>
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
  error,
}: {
  error?: string;
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
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={
            error
              ? `${stableId}-help recipe-ingredients-error`
              : `${stableId}-help`
          }
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
          onFocus={() => setOpen(!error)}
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
          placeholder="Zutat suchen"
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

function RecipeImageSheet(
  props: React.ComponentProps<typeof ImageFramingEditor>,
) {
  const dialogRef = useModalFocus<HTMLElement>(props.onCancel);
  const onCancel = useRef(props.onCancel);
  onCancel.current = props.onCancel;
  useEffect(() => {
    const onBack = (event: PopStateEvent) => {
      event.stopImmediatePropagation();
      window.history.pushState(window.history.state, '');
      onCancel.current();
    };
    window.addEventListener('popstate', onBack, true);
    return () => window.removeEventListener('popstate', onBack, true);
  }, []);
  return (
    <div className="modal-backdrop image-edit-backdrop">
      <section
        ref={dialogRef}
        className="image-edit-screen"
        role="dialog"
        aria-modal="true"
        aria-labelledby="image-editor-title"
      >
        <ImageFramingEditor {...props} />
      </section>
    </div>
  );
}

function DiscardDraftDialog({
  name,
  existingRecipe,
  onCancel,
  onConfirm,
}: {
  name: string;
  existingRecipe: boolean;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const cancel = () => {
    if (!busy) onCancel();
  };
  const dialogRef = useModalFocus<HTMLElement>(cancel);
  return (
    <div className="modal-backdrop">
      <section
        ref={dialogRef}
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="discard-draft-title"
        aria-describedby="discard-draft-description"
      >
        <div className="lock-badge danger-icon">
          <Trash2 size={20} />
        </div>
        <h2 id="discard-draft-title">Entwurf verwerfen?</h2>
        <p id="discard-draft-description">
          Der Entwurf „{name || 'Neues Rezept'}“ wird gelöscht.{' '}
          {existingRecipe
            ? 'Dein gespeichertes Rezept bleibt erhalten.'
            : 'Diese Aktion kann nicht rückgängig gemacht werden.'}
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" onClick={cancel} disabled={busy}>
            Behalten
          </button>
          <button
            type="button"
            className="danger-solid"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError('');
              try {
                await onConfirm();
              } catch {
                setError(
                  'Der Entwurf konnte nicht verworfen werden. Bitte versuche es erneut.',
                );
                setBusy(false);
              }
            }}
          >
            {busy ? 'Wird verworfen …' : 'Entwurf verwerfen'}
          </button>
        </div>
      </section>
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
  const [framingOpen, setFramingOpen] = useState(false);
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
  const [discardOpen, setDiscardOpen] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [removeImage, setRemoveImage] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const amountRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const unitRefs = useRef<Record<string, HTMLButtonElement | null>>({});
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
    if (discardOpen) {
      setDiscardOpen(false);
      return;
    }
    if (framingOpen) {
      setFramingOpen(false);
      return;
    }
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
  const [editorStage, setEditorStage] = useState(0);
  const [validationAttempted, setValidationAttempted] = useState(false);
  const [numberErrors, setNumberErrors] = useState<Record<string, string>>({});
  const nameError =
    validationAttempted && !draft.name.trim()
      ? 'Bitte gib deinem Rezept einen Namen.'
      : '';
  const ingredientsError =
    validationAttempted && !draft.ingredients.some((item) => item.name.trim())
      ? 'Füge mindestens eine Zutat hinzu.'
      : '';
  const stageNames = ['Grundlagen', 'Zutaten', 'Zubereitung'];
  const canSave = Boolean(
    draft.name.trim() &&
    draft.ingredients.some((item) => item.name.trim()) &&
    !proteinInvalid &&
    !framingOpen,
  );
  function showStage(stage: number, target?: HTMLElement) {
    setEditorStage(stage);
    window.requestAnimationFrame(() => {
      let parent = target?.parentElement;
      while (parent) {
        if (parent instanceof HTMLDetailsElement) parent.open = true;
        parent = parent.parentElement;
      }
      dialogRef.current?.scrollTo({ top: 0 });
      (
        target ??
        dialogRef.current?.querySelector<HTMLElement>(`#wizard-stage-${stage}`)
      )?.focus({ preventScroll: true });
      if (target) target.scrollIntoView({ block: 'center' });
    });
  }
  function validateRecipe() {
    setValidationAttempted(true);
    const invalid = [
      ...(dialogRef.current?.querySelectorAll<HTMLInputElement>(
        'input:invalid',
      ) ?? []),
    ];
    setNumberErrors(
      Object.fromEntries(
        invalid
          .filter((input) => input.dataset.validationField)
          .map((input) => [
            input.dataset.validationField!,
            input.validationMessage,
          ]),
      ),
    );
    const target = !draft.name.trim()
      ? dialogRef.current?.querySelector<HTMLInputElement>(
          '[data-initial-focus]',
        )
      : (invalid[0] ??
        (proteinInvalid
          ? dialogRef.current?.querySelector<HTMLInputElement>(
              '[aria-describedby*="protein-editor-help"]',
            )
          : !draft.ingredients.some((item) => item.name.trim())
            ? Object.values(foodInputRefs.current).find(Boolean)
            : undefined));
    if (!target) return true;
    const stage = Number(
      target.closest<HTMLElement>('[data-editor-stage]')?.dataset.editorStage ??
        0,
    );
    showStage(stage, target);
    return false;
  }
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
      <div
        className={`modal-backdrop ${inactive || framingOpen ? 'underlay' : ''}`}
      >
        <form
          ref={dialogRef}
          className="editor-modal editor-wizard"
          noValidate
          role="dialog"
          aria-modal={!inactive && !framingOpen && !discardOpen}
          aria-hidden={
            inactive ||
            discardOpen ||
            framingOpen ||
            Boolean(foodPicker) ||
            Boolean(customFoodTarget) ||
            undefined
          }
          inert={
            inactive ||
            discardOpen ||
            framingOpen ||
            Boolean(foodPicker) ||
            Boolean(customFoodTarget) ||
            undefined
          }
          aria-labelledby="recipe-editor-title"
          onInputCapture={(event) => {
            if (saveError) setSaveError('');
            const input = event.target as HTMLInputElement;
            const key = input.dataset.validationField;
            if (key)
              setNumberErrors((current) => {
                const next = { ...current };
                delete next[key];
                return next;
              });
          }}
          onSubmit={async (event) => {
            event.preventDefault();
            if (saveBusy || framingOpen) return;
            if (editorStage < 2) {
              setSaveError('');
              showStage(editorStage + 1);
              return;
            }
            if (!validateRecipe() || !canSave) return;
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
              <small className="draft-save-status" aria-live="polite">
                {draftSaveStatus === 'saving'
                  ? 'Entwurf wird gespeichert …'
                  : draftSaveStatus === 'saved' || savedDraft
                    ? 'Entwurf lokal gespeichert'
                    : recipe
                      ? 'Gespeichertes Rezept'
                      : 'Dein Entwurf bleibt auf diesem Gerät'}
              </small>
            </h2>
            {hasDraftContent && (
              <button
                type="button"
                className="editor-discard-draft"
                aria-label="Entwurf verwerfen"
                title="Entwurf verwerfen"
                disabled={saveBusy}
                onClick={() => setDiscardOpen(true)}
              >
                <Trash2 size={20} />
              </button>
            )}
          </div>
          <nav className="wizard-progress" aria-label="Rezept-Erstellung">
            <ol>
              {stageNames.map((name, index) => (
                <li
                  key={name}
                  className={index <= editorStage ? 'reached' : ''}
                >
                  <button
                    type="button"
                    aria-label={`${index + 1}. ${name}`}
                    aria-current={index === editorStage ? 'step' : undefined}
                    disabled={saveBusy}
                    onClick={() => {
                      setSaveError('');
                      showStage(index);
                    }}
                  >
                    <span>
                      {index < editorStage ? <Check size={13} /> : index + 1}
                    </span>
                    <small>{name}</small>
                  </button>
                </li>
              ))}
            </ol>
            <p aria-live="polite">
              {editorStage + 1} von 3 · {stageNames[editorStage]}
            </p>
          </nav>
          {saveError && (
            <small className="form-error editor-save-error" role="alert">
              {saveError}
            </small>
          )}
          <section
            className="wizard-panel"
            data-editor-stage="0"
            hidden={editorStage !== 0}
            aria-labelledby="wizard-stage-0"
          >
            <h3 id="wizard-stage-0" tabIndex={-1}>
              Grundlagen
            </h3>
            <p className="wizard-intro">
              Die wichtigsten Infos zu deinem Rezept.
            </p>
            <label>
              Rezeptname
              <input
                data-initial-focus
                aria-label="Rezeptname"
                aria-required="true"
                aria-invalid={Boolean(nameError) || undefined}
                aria-describedby={nameError ? 'recipe-name-error' : undefined}
                value={draft.name}
                maxLength={200}
                onChange={(event) =>
                  setDraft({ ...draft, name: event.target.value })
                }
                placeholder="z. B. Gemüse-Curry"
              />
              {nameError && (
                <small
                  id="recipe-name-error"
                  className="field-validation-error"
                  role="alert"
                >
                  {nameError}
                </small>
              )}
            </label>
            <div className="wizard-recipe-image">
              <span className="wizard-field-label">
                Rezeptbild <small>(optional)</small>
              </span>
              <button
                type="button"
                className="image-drop"
                style={
                  draft.imageFrame?.crop
                    ? {
                        aspectRatio:
                          (draft.imageFrame.crop.width *
                            draft.imageFrame.crop.sourceAspect) /
                          draft.imageFrame.crop.height,
                        height: 'auto',
                      }
                    : undefined
                }
                onClick={() =>
                  displayedImage
                    ? setFramingOpen(true)
                    : inputRef.current?.click()
                }
              >
                {displayedImage ? (
                  <FramedImage
                    src={displayedImage}
                    frame={draft.imageFrame}
                    alt="Vorschau des Rezeptbilds"
                  />
                ) : (
                  <>
                    <ImagePlus size={28} />
                    <strong>Rezeptbild auswählen</strong>
                    <span>
                      Bleibt auf deinem Gerät. Beim Teilen als Rezeptdatei wird
                      das Bild mitgegeben.
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
                  event.target.value = '';
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
                        imageFrame: undefined,
                      }));
                      setRemoveImage(false);
                      setFramingOpen(true);
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
                  <button type="button" onClick={() => setFramingOpen(true)}>
                    <Pencil size={19} />
                    <span className="sr-only">Bild bearbeiten</span>
                  </button>
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
                      setFramingOpen(false);
                      setRemoveImage(true);
                      imageSelection.current += 1;
                      setDraft((current) => ({
                        ...current,
                        imageKey: undefined,
                        imageFrame: undefined,
                      }));
                    }}
                  >
                    <Trash2 size={16} /> Bild entfernen
                  </button>
                </div>
              )}
              {imageError && <small className="form-error">{imageError}</small>}
            </div>
            <div className="wizard-basics-numbers">
              {' '}
              <div className="wizard-number-field">
                Portionen
                <span className="wizard-number-control">
                  <button
                    type="button"
                    aria-label="Portionen verringern"
                    disabled={draft.servings <= 1}
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        servings: Math.max(1, current.servings - 1),
                      }))
                    }
                  >
                    <Minus size={16} />
                  </button>
                  <input
                    aria-label="Portionen"
                    data-validation-field="servings"
                    aria-invalid={Boolean(numberErrors.servings) || undefined}
                    aria-describedby={
                      numberErrors.servings
                        ? 'recipe-servings-error'
                        : undefined
                    }
                    type="number"
                    min="1"
                    max="1000"
                    value={draft.servings}
                    onFocus={(event) => event.currentTarget.select()}
                    onChange={(event) => {
                      const value = event.currentTarget.valueAsNumber;
                      if (
                        Number.isInteger(value) &&
                        value >= 1 &&
                        value <= 1000
                      )
                        setDraft({ ...draft, servings: value });
                    }}
                  />
                  <button
                    type="button"
                    aria-label="Portionen erhöhen"
                    disabled={draft.servings >= 1000}
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        servings: Math.min(1000, current.servings + 1),
                      }))
                    }
                  >
                    <Plus size={16} />
                  </button>
                </span>
                {numberErrors.servings && (
                  <small
                    id="recipe-servings-error"
                    className="field-validation-error"
                    role="alert"
                  >
                    {numberErrors.servings}
                  </small>
                )}
              </div>
              <div className="wizard-number-field">
                Kochzeit (Min.)
                <span className="wizard-number-control">
                  <button
                    type="button"
                    aria-label="Kochzeit verringern"
                    disabled={draft.minutes <= 1}
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        minutes: Math.max(1, current.minutes - 5),
                      }))
                    }
                  >
                    <Minus size={16} />
                  </button>
                  <input
                    aria-label="Kochzeit (Min.)"
                    data-validation-field="minutes"
                    aria-invalid={Boolean(numberErrors.minutes) || undefined}
                    aria-describedby={
                      numberErrors.minutes ? 'recipe-minutes-error' : undefined
                    }
                    type="number"
                    min="1"
                    max="10080"
                    value={draft.minutes}
                    onFocus={(event) => event.currentTarget.select()}
                    onChange={(event) => {
                      const value = event.currentTarget.valueAsNumber;
                      if (
                        Number.isInteger(value) &&
                        value >= 1 &&
                        value <= 10080
                      )
                        setDraft({ ...draft, minutes: value });
                    }}
                  />
                  <button
                    type="button"
                    aria-label="Kochzeit erhöhen"
                    disabled={draft.minutes >= 10080}
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        minutes: Math.min(10080, current.minutes + 5),
                      }))
                    }
                  >
                    <Plus size={16} />
                  </button>
                </span>
                {numberErrors.minutes && (
                  <small
                    id="recipe-minutes-error"
                    className="field-validation-error"
                    role="alert"
                  >
                    {numberErrors.minutes}
                  </small>
                )}
              </div>
            </div>
            <label>
              Beschreibung (optional)
              <textarea
                value={draft.description}
                maxLength={5000}
                onChange={(event) =>
                  setDraft({ ...draft, description: event.target.value })
                }
                placeholder="Was macht das Gericht besonders?"
              />
            </label>
            <details className="recipe-extra-details">
              <summary>
                Weitere Angaben (optional)
                <ChevronDown size={18} />
              </summary>
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
                  <div
                    className="nutrition-calculation-preview"
                    aria-live="polite"
                  >
                    <strong>Schätzung aus Zutaten</strong>
                    <span>
                      {automaticCalculation.resolvedIngredients} von{' '}
                      {automaticCalculation.totalIngredients} Zutaten
                      berücksichtigt
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
                          draftFoodOverrides[ingredient.overrideKey] !==
                          undefined,
                      )
                      .map((ingredient) => {
                        const override =
                          draftFoodOverrides[ingredient.overrideKey];
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
                                    draft.ingredients[
                                      ingredient.ingredientIndex
                                    ]?.name || 'Unbenannte Zutat',
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
                          {draft.ingredients[ingredient.ingredientIndex]
                            ?.name || 'Unbenannte Zutat'}
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
                      onChange={(event) =>
                        setProteinPerServing(event.target.value)
                      }
                      placeholder="z. B. 18"
                    />
                    <span>g</span>
                  </span>
                </label>
                <p id="protein-editor-help">
                  Deine Angabe hat immer Vorrang vor der Schätzung aus Zutaten.
                  Lass das Feld leer, wenn Mampffred aus den Zutaten rechnen
                  soll. Alles bleibt auf deinem Gerät.
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
            </details>
          </section>
          <section
            className="wizard-panel"
            data-editor-stage="1"
            hidden={editorStage !== 1}
            aria-labelledby="wizard-stage-1"
          >
            <h3 id="wizard-stage-1" tabIndex={-1}>
              Zutaten
            </h3>
            <p className="wizard-intro">
              Was kommt in dein Rezept? Die Mengen gelten für {draft.servings}{' '}
              {draft.servings === 1 ? 'Portion' : 'Portionen'}.
            </p>
            <fieldset className="ingredient-fieldset">
              <legend>Zutaten</legend>
              {draft.ingredients.map((item, index) => (
                <div className="ingredient-editor" key={item.id ?? index}>
                  <div className="ingredient-tile-header">
                    <strong
                      className="ingredient-number"
                      aria-label={`Zutat ${index + 1}`}
                    >
                      {index + 1}
                    </strong>
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
                  <div className="ingredient-tile-fields">
                    <div
                      className="ingredient-column-labels"
                      aria-hidden="true"
                    >
                      <span>Zutat</span>
                      <span>Menge</span>
                      <span>Einheit</span>
                    </div>
                    <IngredientCombobox
                      ingredient={item}
                      error={index === 0 ? ingredientsError : undefined}
                      index={index}
                      customFoods={customFoods}
                      onChange={(ingredient) => {
                        setDraft({
                          ...draft,
                          ingredients: draft.ingredients.map(
                            (entry, itemIndex) =>
                              itemIndex === index ? ingredient : entry,
                          ),
                        });
                        if (
                          ingredient.foodLink?.foodId !== item.foodLink?.foodId
                        )
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
                    <label>
                      <span className="sr-only">Menge</span>
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
                        placeholder="250"
                      />
                    </label>
                    <div className="unit-field">
                      <span className="sr-only">Einheit</span>
                      <UnitPicker
                        emptyLabel="Ohne"
                        buttonRef={(node) => {
                          unitRefs.current[item.id ?? String(index)] = node;
                        }}
                        label={`Einheit für Zutat ${index + 1}`}
                        value={item.unit}
                        onChange={(unit) =>
                          setDraft({
                            ...draft,
                            ingredients: draft.ingredients.map(
                              (entry, itemIndex) =>
                                itemIndex === index
                                  ? { ...entry, unit }
                                  : entry,
                            ),
                          })
                        }
                      />
                    </div>
                  </div>
                  <label className="ingredient-scaling-toggle">
                    <input
                      type="checkbox"
                      checked={item.scaleWithServings !== false}
                      aria-label={`Menge von Zutat ${index + 1} an Portionen anpassen`}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          ingredients: draft.ingredients.map(
                            (entry, itemIndex) =>
                              itemIndex === index
                                ? {
                                    ...entry,
                                    scaleWithServings: event.target.checked,
                                  }
                                : entry,
                          ),
                        })
                      }
                    />
                    Menge an Portionen anpassen
                  </label>
                  {index === 0 && ingredientsError && (
                    <small
                      id="recipe-ingredients-error"
                      className="field-validation-error"
                      role="alert"
                    >
                      {ingredientsError}
                    </small>
                  )}
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
            <aside className="wizard-tip">
              <Info size={20} />
              <div>
                <strong>Tipp</strong>
                <p>
                  Gib Mengen so an, wie du sie beim Kochen verwendest – zum
                  Beispiel in g, ml oder Stück.
                </p>
              </div>
            </aside>
          </section>
          <section
            className="wizard-panel"
            data-editor-stage="2"
            hidden={editorStage !== 2}
            aria-labelledby="wizard-stage-2"
          >
            <h3 id="wizard-stage-2" tabIndex={-1}>
              Zubereitung
            </h3>
            <RecipeStepsEditor
              initialSteps={draft.steps}
              onChange={(steps) =>
                setDraft((current) => ({ ...current, steps }))
              }
            />
            <details className="wizard-management">
              <summary>
                Rezept verwalten
                <ChevronDown size={16} />
              </summary>
              {hasDraftContent && (
                <button
                  type="button"
                  className="danger-button"
                  onClick={() => setDiscardOpen(true)}
                >
                  <Trash2 size={17} />
                  {recipe ? 'Änderungen verwerfen' : 'Entwurf verwerfen'}
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  className="danger-button"
                  onClick={onDelete}
                >
                  <Trash2 size={17} /> Rezept löschen
                </button>
              )}
            </details>
          </section>
          <footer className="wizard-footer">
            <button
              type="button"
              className="wizard-back"
              disabled={saveBusy}
              onClick={() => {
                if (editorStage === 0) void requestClose();
                else {
                  setSaveError('');
                  showStage(editorStage - 1);
                }
              }}
            >
              <ChevronLeft size={18} />
              Zurück
            </button>
            <button
              type="submit"
              className="primary-button"
              disabled={saveBusy || framingOpen}
            >
              {saveBusy ? (
                'Speichert …'
              ) : editorStage === 2 ? (
                <>
                  <Check size={19} />
                  Rezept speichern
                </>
              ) : (
                <>
                  Weiter
                  <ChevronRight size={19} />
                </>
              )}
            </button>
            <button
              type="button"
              className="wizard-save-draft"
              disabled={saveBusy || !hasDraftContent}
              onClick={() => void requestClose()}
            >
              <Save size={18} /> Als Entwurf speichern
            </button>
          </footer>
        </form>
      </div>
      {discardOpen && (
        <DiscardDraftDialog
          name={
            draft.name.trim() ||
            draft.ingredients.find((item) => item.name.trim())?.name ||
            'Neues Rezept'
          }
          existingRecipe={Boolean(recipe)}
          onCancel={() => setDiscardOpen(false)}
          onConfirm={async () => {
            editorStopped.current = true;
            imageSelection.current += 1;
            setSaveBusy(true);
            try {
              await onDiscardDraft(draft.id ?? '');
              onClose();
            } catch (error) {
              editorStopped.current = false;
              setSaveBusy(false);
              throw error;
            }
          }}
        />
      )}
      {displayedImage && framingOpen && (
        <RecipeImageSheet
          src={displayedImage}
          initialFrame={draft.imageFrame}
          onCancel={() => setFramingOpen(false)}
          onApply={(imageFrame) => {
            setDraft((current) => ({ ...current, imageFrame }));
            setFramingOpen(false);
          }}
        />
      )}
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
  const mealSlots = getEnabledMealSlots(data);
  const [slot, setSlot] = useState(
    mealSlots.includes(initialSlot) ? initialSlot : mealSlots[0],
  );
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
            <p>
              {mealSlots.length === 1
                ? `Plane dein ${mealSlots[0]}: Wähle Tag und Rezept.`
                : 'Wähle Tag, Mahlzeit und ein Rezept für deinen Essensplan.'}
            </p>
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
          {mealSlots.length > 1 && (
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
                {mealSlots.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
          )}
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
                thumbnail
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
  onMealSlots,
  onSaveCustomFood,
  appUpdate,
  onRepairStandards,
  onResetApp,
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
  onMealSlots: (slots: MealSlot[]) => void;
  onSaveCustomFood: (food: CustomFood) => boolean;
  appUpdate: AppUpdateControls;
  onRepairStandards: () => Promise<void>;
  onResetApp: () => Promise<void>;
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
    planning: 'Mahlzeiten planen',
    backup: 'Sicherung',
    nutrition: 'Nährwerte & Ziele',
    foods: 'Lebensmittel',
    privacy: 'Datenschutz & Speicher',
    app: 'App & Updates',
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
        {panel === 'planning' && (
          <section className="meal-planning-settings">
            <h2>Was möchtest du planen?</h2>
            <p>
              Wähle die Mahlzeiten, die zu deinem Alltag passen. Dein Essensplan
              und die Übersichten passen sich automatisch an.
            </p>
            <div className="meal-slot-options">
              {ALL_MEAL_SLOTS.map((slot) => {
                const selected = getEnabledMealSlots(data);
                const checked = selected.includes(slot);
                return (
                  <label
                    key={slot}
                    aria-label={slot}
                    className={checked ? 'is-selected' : ''}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={checked && selected.length === 1}
                      onChange={() =>
                        onMealSlots(
                          checked
                            ? selected.filter((item) => item !== slot)
                            : [...selected, slot],
                        )
                      }
                    />
                    <span>
                      <strong>{slot}</strong>
                      <small>
                        {slot === 'Frühstück'
                          ? 'Gut in den Tag starten'
                          : slot === 'Mittagessen'
                            ? 'Eine Pause zum Genießen'
                            : 'Den Tag lecker ausklingen lassen'}
                      </small>
                    </span>
                  </label>
                );
              })}
            </div>
            <p className="meal-settings-note">
              Mindestens eine Mahlzeit bleibt aktiv. Bereits geplante Mahlzeiten
              werden beim Abwählen ausgeblendet und beim Aktivieren wieder
              angezeigt. Der Wocheneinkauf und die Nährwertübersichten
              berücksichtigen nur deine Auswahl.
            </p>
          </section>
        )}
        {(panel === 'app' || panel === 'privacy') && (
          <AppMaintenance
            data={data}
            update={appUpdate}
            onRepair={onRepairStandards}
            onReset={onResetApp}
            onBackup={onBackup}
            mode={panel}
          />
        )}
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
                <strong>{APP_VERSION}</strong>
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

function RecipeShareFallback({
  recipe,
  onClose,
  onDownload,
  onLink,
}: {
  recipe: Recipe;
  onClose: () => void;
  onDownload: () => void;
  onLink: () => void;
}) {
  const dialogRef = useModalFocus<HTMLElement>(onClose);
  return (
    <div className="modal-backdrop">
      <section
        ref={dialogRef}
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-fallback-title"
      >
        <h2 id="share-fallback-title">Rezept teilen</h2>
        <p>
          Die direkte Dateiübergabe ist hier gerade nicht möglich. Du kannst das
          vollständige Rezept speichern oder einen Link teilen
          {recipe.imageKey ? ' – ohne eigenes Foto' : ''}.
        </p>
        <div className="share-fallback-actions">
          <button className="primary-button" onClick={onDownload}>
            Rezeptdatei speichern
          </button>
          <button onClick={onLink}>
            {recipe.imageKey ? 'Link ohne Foto teilen' : 'Rezeptlink teilen'}
          </button>
          <button onClick={onClose}>Abbrechen</button>
        </div>
      </section>
    </div>
  );
}

function RecipeLinkDialog({
  text,
  onClose,
}: {
  text: string;
  onClose: () => void;
}) {
  const dialogRef = useModalFocus<HTMLElement>(onClose);
  const [copyFailed, setCopyFailed] = useState(false);
  return (
    <div className="modal-backdrop">
      <section
        ref={dialogRef}
        className="confirm-dialog shared-recipe-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="recipe-link-title"
      >
        <h2 id="recipe-link-title">Rezeptlink kopieren</h2>
        <p>Du kannst den Link kopieren und in einer Nachricht teilen.</p>
        <textarea
          aria-label="Rezeptlink"
          readOnly
          value={text}
          rows={4}
          onFocus={(event) => event.currentTarget.select()}
        />
        {copyFailed && (
          <p role="status">
            Bitte markiere den Link im Textfeld und kopiere ihn über das
            Auswahlmenü.
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Schließen
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() => {
              // Ein neuer Klick gibt auch nach einem abgelehnten Share-Aufruf
              // eine frische Benutzeraktivierung für die Zwischenablage.
              try {
                void navigator.clipboard
                  .writeText(text)
                  .then(onClose)
                  .catch(() => setCopyFailed(true));
              } catch {
                setCopyFailed(true);
              }
            }}
          >
            Link kopieren
          </button>
        </div>
      </section>
    </div>
  );
}

function RecipeImportErrorDialog({
  message,
  onClose,
  onFile,
}: {
  message: string;
  onClose: () => void;
  onFile: (file: File) => Promise<void>;
}) {
  const dialogRef = useModalFocus<HTMLElement>(onClose);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="modal-backdrop">
      <section
        ref={dialogRef}
        className="confirm-dialog shared-recipe-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="recipe-import-error-title"
        aria-describedby="recipe-import-error-message"
      >
        <h2 id="recipe-import-error-title">
          Rezept konnte nicht geöffnet werden
        </h2>
        <p id="recipe-import-error-message" role="status">
          {message}
        </p>
        <input
          ref={inputRef}
          hidden
          type="file"
          accept=".mampffred-rezept,.json,.txt,application/json,text/plain"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file || busy) return;
            setBusy(true);
            void onFile(file).finally(() => setBusy(false));
          }}
        />
        <div className="dialog-actions">
          <button type="button" disabled={busy} onClick={onClose}>
            Schließen
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? 'Datei wird geprüft …' : 'Rezeptdatei auswählen'}
          </button>
        </div>
      </section>
    </div>
  );
}

function SharedRecipeDialog({
  recipe,
  image,
  busy,
  onCancel,
  onConfirm,
}: {
  recipe: Recipe;
  image?: Blob;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useModalFocus<HTMLElement>(() => {
    if (!busy) onCancel();
  });
  const [imageUrl, setImageUrl] = useState<string>();
  useEffect(() => {
    if (!image) {
      setImageUrl(undefined);
      return;
    }
    const url = URL.createObjectURL(image);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);
  return (
    <div className="modal-backdrop">
      <section
        ref={dialogRef}
        className="confirm-dialog shared-recipe-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shared-recipe-title"
        aria-describedby="shared-recipe-description"
      >
        <div className="lock-badge">
          <Share2 size={20} />
        </div>
        <small>Mit dir über Mampffred geteilt</small>
        <h2 id="shared-recipe-title">{recipe.name}</h2>
        {imageUrl && (
          <FramedImage
            src={imageUrl}
            frame={recipe.imageFrame}
            alt="Geteiltes Rezeptbild"
            className="shared-recipe-image"
          />
        )}
        <p id="shared-recipe-description">
          {recipe.description ||
            'Dieses Rezept kann deiner Sammlung hinzugefügt werden.'}
        </p>
        <div className="shared-recipe-meta">
          <span>
            <Clock3 size={15} /> {recipe.minutes} Min.
          </span>
          <span>
            <Users size={15} /> {recipe.servings}{' '}
            {recipe.servings === 1 ? 'Portion' : 'Portionen'}
          </span>
          <span>
            <Carrot size={15} /> {recipe.ingredients.length} Zutaten
          </span>
        </div>
        <div className="shared-recipe-preview">
          <strong>Zutaten</strong>
          <ul>
            {recipe.ingredients.slice(0, 5).map((ingredient) => (
              <li key={ingredient.id}>
                {[ingredient.amount, ingredient.unit, ingredient.name]
                  .filter(Boolean)
                  .join(' ')}
              </li>
            ))}
          </ul>
          {recipe.ingredients.length > 5 && (
            <small>
              und {recipe.ingredients.length - 5} weitere{' '}
              {recipe.ingredients.length - 5 === 1 ? 'Zutat' : 'Zutaten'}
            </small>
          )}
          <strong>Zubereitung</strong>
          <ol>
            {recipe.steps.slice(0, 2).map((step, index) => (
              <li key={index}>{step}</li>
            ))}
          </ol>
          {recipe.steps.length > 2 && (
            <small>
              und {recipe.steps.length - 2} weitere{' '}
              {recipe.steps.length - 2 === 1 ? 'Schritt' : 'Schritte'}
            </small>
          )}
        </div>
        <p className="shared-recipe-origin">
          Die Angaben stammen aus einem geteilten Rezept. Mampffred hat die
          Inhalte nicht geprüft.
        </p>
        <div className="dialog-actions">
          <button type="button" onClick={onCancel} disabled={busy}>
            Abbrechen
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Wird hinzugefügt …' : 'Rezept hinzufügen'}
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
  removed: RemovedRecipe[];
  cleanupTimer?: number;
};
type PendingShoppingDeletion = {
  removed: RemovedShoppingItem[];
  cleanupTimer: number;
};
type ToastState = {
  message: string;
  tone: 'success' | 'error';
  duration?: number;
  id?: number;
};
type PendingPlanUndo = {
  message: string;
  changes: PlanChange[];
  timer: number;
};

export default function MampffredApp() {
  const appUpdate = useAppUpdate();
  const [maintenanceBusy, setMaintenanceBusy] = useState(false);
  const [data, publishData] = useState<AppData>(() => createEmptyData());
  const mealSlots = getEnabledMealSlots(data);
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
  const pendingDeletionRef = useRef<PendingDeletion | undefined>(undefined);
  const recipeDeletionBusy = useRef(false);
  const [undoBusy, setUndoBusy] = useState(false);
  const [pendingShoppingDeletion, setPendingShoppingDeletion] =
    useState<PendingShoppingDeletion>();
  const [planner, setPlanner] = useState<PlannerState>();
  const [plannerResume, setPlannerResume] = useState<PlannerResume>();
  const [quickPlanTargets, setQuickPlanTargets] = useState<FreeSlot[]>();
  const [pendingPlanUndo, setPendingPlanUndo] = useState<PendingPlanUndo>();
  const [toast, setToast] = useState<ToastState>();
  const [sharedRecipePreview, setSharedRecipePreview] =
    useState<SharedRecipeImport>();
  const [recipeImportError, setRecipeImportError] = useState<string>();
  const [exportBusy, setExportBusy] = useState(false);
  const [sharedRecipeImportBusy, setSharedRecipeImportBusy] = useState(false);
  const [shareCopyText, setShareCopyText] = useState<string>();
  const [shareFallback, setShareFallback] = useState<Recipe>();
  const [nativeShareBusy, setNativeShareBusy] = useState(false);
  const incomingRecipeId = useRef<string | undefined>(undefined);
  const [incomingForwarded, setIncomingForwarded] = useState(false);
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
  const [preparedShareLink, setPreparedShareLink] = useState<{
    recipe: Recipe;
    url?: string;
    error?: string;
  }>();
  const [preparedShareFile, setPreparedShareFile] = useState<{
    recipe: Recipe;
    file?: File;
  }>();
  useEffect(() => {
    setPreparedShareFile(undefined);
    if (!selectedRecipe) return;
    let cancelled = false;
    void (async () => {
      const image = selectedRecipe.imageKey
        ? (pendingImages.current[selectedRecipe.imageKey] ??
          (await loadRecipeImage(selectedRecipe.imageKey)))
        : undefined;
      return createSharedRecipeTransferFile(selectedRecipe, image);
    })()
      .then((file) => {
        if (!cancelled) setPreparedShareFile({ recipe: selectedRecipe, file });
      })
      .catch(() => {
        if (!cancelled) setPreparedShareFile({ recipe: selectedRecipe });
      });
    return () => {
      cancelled = true;
    };
  }, [selectedRecipe]);
  useEffect(() => {
    setPreparedShareLink(undefined);
    if (!selectedRecipe) return;
    let cancelled = false;
    createSharedRecipeUrl(
      serializeSharedRecipe(selectedRecipe),
      recipeShareBaseUrl(),
    )
      .then((url) => {
        if (!cancelled) setPreparedShareLink({ recipe: selectedRecipe, url });
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setPreparedShareLink({
            recipe: selectedRecipe,
            error: sharePreparationMessage(error),
          });
      });
    return () => {
      cancelled = true;
    };
  }, [selectedRecipe]);
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
    if (maintenanceBusy) return;
    if (loadState !== 'ready' || writerState !== 'ready') return;
    if (installStandardRecipes(dataRef.current) === dataRef.current) return;
    let cancelled = false;
    void import('@/lib/standard-recipe-images')
      .then(async ({ loadStandardRecipeImages }) => {
        while (!cancelled) {
          const snapshot = dataRef.current;
          const next = installStandardRecipes(snapshot);
          if (next === snapshot) return;
          const images = await loadStandardRecipeImages(
            newStandardImageKeys(snapshot, next),
          );
          if (cancelled) return;
          // Preserve edits or imports made while image chunks were loading.
          if (dataRef.current !== snapshot) continue;
          await commitData(next, images);
          if (cancelled) return;
          const referenced = referencedImageKeys(dataRef.current);
          setImageUrls((current) => {
            const urls = { ...current };
            for (const [key, image] of Object.entries(images)) {
              if (referenced.has(key) && !urls[key])
                urls[key] = URL.createObjectURL(image);
            }
            return urls;
          });
          return;
        }
      })
      .catch(() => {
        if (!cancelled)
          setMutationError(
            'Die Standardrezepte konnten nicht geladen werden. Bitte starte die App erneut.',
          );
      });
    return () => {
      cancelled = true;
    };
  }, [loadState, writerState, maintenanceBusy]);
  useEffect(() => {
    if (loadState !== 'ready') return;
    let cancelled = false;
    const id = new URL(window.location.href).searchParams.get('incoming');
    if (writerState !== 'ready') return;
    if (!id) return;
    incomingRecipeId.current = id;
    void sharedRecipeInbox(recipeShareBaseUrl())
      .read(id)
      .then((preview) => {
        if (!cancelled) {
          setToast(undefined);
          setRecipeImportError(undefined);
          setSharedRecipePreview(preview);
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        void sharedRecipeInbox(recipeShareBaseUrl())
          .remove(id)
          .catch(() => undefined);
        incomingRecipeId.current = undefined;
        const url = new URL(window.location.href);
        url.searchParams.delete('incoming');
        window.history.replaceState(window.history.state, '', url);
        setToast(undefined);
        setRecipeImportError(recipeImportErrorMessage(error));
      });
    return () => {
      cancelled = true;
    };
  }, [loadState, writerState]);
  useEffect(() => {
    if (loadState !== 'ready' || !('BroadcastChannel' in window)) return;
    const channel = new BroadcastChannel(
      `mampffred-incoming-${import.meta.env.BASE_URL}`,
    );
    let stopped = false;
    let reading = false;
    const id = new URL(window.location.href).searchParams.get('incoming');
    channel.onmessage = (event: MessageEvent) => {
      const message = event.data;
      if (
        !message ||
        typeof message.id !== 'string' ||
        !/^(?:[a-f0-9-]{36}|error(?:-[A-Z_]{1,32})?)$/u.test(message.id)
      )
        return;
      if (
        writerState === 'blocked' &&
        message.type === 'opened' &&
        message.id === id
      ) {
        setIncomingForwarded(true);
        return;
      }
      if (writerState !== 'ready' || message.type !== 'open' || reading) return;
      if (
        incomingRecipeId.current === message.id &&
        (sharedRecipePreview || recipeImportError)
      ) {
        channel.postMessage({ type: 'opened', id: message.id });
        return;
      }
      // Preserve an active editor or another modal; the receiving window retries.
      if (
        sharedRecipePreview ||
        recipeImportError ||
        editorRecipeId ||
        planner ||
        quickPlanTargets ||
        settings ||
        backupRequest ||
        deleteRequest ||
        shareFallback ||
        storageFailure
      )
        return;
      reading = true;
      void sharedRecipeInbox(recipeShareBaseUrl())
        .read(message.id)
        .then((preview) => {
          if (stopped) return;
          incomingRecipeId.current = message.id;
          const url = new URL(window.location.href);
          url.searchParams.set('incoming', message.id);
          window.history.replaceState(window.history.state, '', url);
          setToast(undefined);
          setSharedRecipePreview(preview);
          channel.postMessage({ type: 'opened', id: message.id });
        })
        .catch((error: unknown) => {
          if (stopped) return;
          incomingRecipeId.current = message.id;
          setToast(undefined);
          setRecipeImportError(recipeImportErrorMessage(error));
          channel.postMessage({ type: 'opened', id: message.id });
          // Keep the handoff address until the dialog is dismissed, so the
          // receiving window can focus this instance even for failed imports.
          const url = new URL(window.location.href);
          url.searchParams.set('incoming', message.id);
          window.history.replaceState(window.history.state, '', url);
        })
        .finally(() => {
          reading = false;
        });
    };
    const request = () => {
      if (writerState === 'blocked' && id && !incomingForwarded)
        channel.postMessage({ type: 'open', id });
    };
    request();
    const timer =
      writerState === 'blocked' && id && !incomingForwarded
        ? window.setInterval(request, 1000)
        : undefined;
    return () => {
      stopped = true;
      window.clearInterval(timer);
      channel.close();
    };
  }, [
    loadState,
    writerState,
    incomingForwarded,
    sharedRecipePreview,
    recipeImportError,
    editorRecipeId,
    planner,
    quickPlanTargets,
    settings,
    backupRequest,
    deleteRequest,
    shareFallback,
    storageFailure,
  ]);
  useEffect(() => {
    if (loadState !== 'ready') return;
    let cancelled = false;
    const inspectSharedRecipe = () => {
      const hash = window.location.hash;
      if (!hash.startsWith('#recipe=')) return;
      void readSharedRecipeHash(hash)
        .then((contents) =>
          contents ? parseSharedRecipe(contents) : undefined,
        )
        .then((recipe) => {
          if (!cancelled && recipe) setSharedRecipePreview({ recipe });
        })
        .catch(() => {
          if (cancelled) return;
          setToast({
            message: 'Dieser Rezeptlink ist ungültig oder unvollständig.',
            tone: 'error',
          });
          if (toastTimer.current) window.clearTimeout(toastTimer.current);
          toastTimer.current = window.setTimeout(
            () => setToast(undefined),
            4200,
          );
        })
        .finally(() => {
          if (cancelled || window.location.hash !== hash) return;
          window.history.replaceState(
            window.history.state,
            '',
            `${window.location.pathname}${window.location.search}`,
          );
        });
    };
    inspectSharedRecipe();
    window.addEventListener('hashchange', inspectSharedRecipe);
    return () => {
      cancelled = true;
      window.removeEventListener('hashchange', inspectSharedRecipe);
    };
  }, [loadState]);
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
      if (quickPlanTargets) {
        setQuickPlanTargets(undefined);
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
    quickPlanTargets,
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
  function setData(
    update: AppData | ((current: AppData) => AppData),
    images: Record<string, Blob> = {},
  ) {
    try {
      void commitData(update, images).catch(() => undefined);
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
  function showToast(
    message: string,
    duration = 4500,
    tone: ToastState['tone'] = 'success',
  ) {
    setToast({ message, tone, duration, id: performance.now() });
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
      const scaledAmount = scaledIngredientAmount(
        ingredient.amount,
        factor,
        ingredient.scaleWithServings,
      );
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
    if (nativeShareBusy || preparedShareFile?.recipe !== recipe) return;
    const file = preparedShareFile.file;
    try {
      if (
        !file ||
        !navigator.share ||
        !navigator.canShare?.({ files: [file] })
      ) {
        setShareFallback(recipe);
        return;
      }
      setNativeShareBusy(true);
      // No await before share: preserve the activation from the user's click.
      await navigator.share({
        files: [file],
        title: recipe.name,
        text: recipeShareMessage,
      });
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError'))
        setShareFallback(recipe);
    } finally {
      setNativeShareBusy(false);
    }
  }
  async function shareRecipeLink(recipe: Recipe) {
    const text = `„${recipe.name}“ als Mampffred-Rezept öffnen und direkt zur eigenen Sammlung hinzufügen.`;
    // Der Link wird beim Öffnen des Rezepts vorbereitet: WebKit verliert die
    // transiente Aktivierung durch jedes await, deshalb muss share() ohne
    // vorgelagerte Kompression direkt aus dem Klick heraus laufen.
    if (preparedShareLink?.recipe !== recipe) return;
    const { url, error } = preparedShareLink;
    if (!url) {
      showToast(
        error || 'Der Rezeptlink wird noch vorbereitet.',
        4200,
        'error',
      );
      return;
    }
    if (navigator.share) {
      try {
        await navigator.share({ title: recipe.name, text, url });
        return;
      } catch (error) {
        // Abbruch durch die Person ist kein Fehler; alles andere fällt auf die
        // Zwischenablage zurück, statt nur eine Fehlermeldung zu zeigen.
        if (error instanceof DOMException && error.name === 'AbortError')
          return;
      }
    }
    try {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      showToast('Rezeptlink wurde kopiert.');
    } catch {
      setShareCopyText(`${text}\n${url}`);
    }
  }
  async function exportRecipeFile(recipe: Recipe) {
    if (exportBusy) return;
    setExportBusy(true);
    try {
      const image = recipe.imageKey
        ? (pendingImages.current[recipe.imageKey] ??
          (await loadRecipeImage(recipe.imageKey)))
        : undefined;
      const file = await createSharedRecipeFile(recipe, image);
      const link = document.createElement('a');
      link.href = URL.createObjectURL(file);
      link.download = file.name;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      showToast('Der Download der Rezeptdatei wurde gestartet.');
    } catch (error) {
      showToast(
        error instanceof Error && error.message === 'SHARED_RECIPE_TOO_LARGE'
          ? 'Dieses Rezept ist für eine Rezeptdatei zu groß. Erstelle unter „Mehr“ eine vollständige Sicherung.'
          : 'Die Rezeptdatei mit Bild konnte nicht erstellt werden. Bitte versuche es erneut.',
        4200,
        'error',
      );
    } finally {
      setExportBusy(false);
    }
  }
  async function saveImportedRecipe(imported: Recipe, image?: Blob) {
    const existing = dataRef.current.recipes.find(
      (recipe) => recipe.shareId === imported.shareId,
    );
    if (existing) {
      if (image && !existing.imageKey) {
        const key = `recipe-${existing.id}-${crypto.randomUUID()}`;
        if (
          !setData(
            (current) => ({
              ...current,
              recipes: current.recipes.map((recipe) =>
                recipe.id === existing.id
                  ? {
                      ...recipe,
                      imageKey: key,
                      imageFrame: imported.imageFrame,
                    }
                  : recipe,
              ),
            }),
            { [key]: image },
          )
        )
          return false;
        await lastSave.current;
      }
      changeTab('recipes');
      setRecipePlanWeekStart(undefined);
      setSelectedRecipeId(existing.id);
      showToast(
        image && !existing.imageKey
          ? 'Das Bild wurde zum vorhandenen Rezept ergänzt.'
          : 'Dieses Rezept ist bereits in deiner Sammlung.',
      );
      return true;
    }
    const id = crypto.randomUUID();
    const imageKey = image ? `recipe-${id}-${crypto.randomUUID()}` : undefined;
    const recipe: Recipe = {
      ...imported,
      id,
      imageKey,
      ingredients: imported.ingredients.map((ingredient) => ({
        ...ingredient,
        id: crypto.randomUUID(),
      })),
    };
    if (
      !setData(
        (current) => ({
          ...current,
          recipes: [recipe, ...current.recipes],
        }),
        image && imageKey ? { [imageKey]: image } : {},
      )
    )
      return false;
    await lastSave.current;
    changeTab('recipes');
    setRecipePlanWeekStart(undefined);
    setSelectedRecipeId(id);
    showToast(`„${recipe.name}“ wurde sicher importiert.`);
    return true;
  }
  async function importRecipeFile(file: File) {
    try {
      if (file.size > MAX_SHARED_RECIPE_FILE_BYTES)
        throw new Error('SHARED_RECIPE_TOO_LARGE');
      const imported = await parseSharedRecipeFile(await file.text());
      setRecipeImportError(undefined);
      setSharedRecipePreview(imported);
    } catch (error) {
      setRecipeImportError(recipeImportErrorMessage(error));
    }
  }
  async function confirmSharedRecipeImport() {
    if (!sharedRecipePreview || sharedRecipeImportBusy) return;
    setSharedRecipeImportBusy(true);
    try {
      if (
        await saveImportedRecipe(
          sharedRecipePreview.recipe,
          sharedRecipePreview.image,
        )
      )
        dismissSharedRecipe();
    } catch {
      showToast(
        'Das geteilte Rezept konnte nicht gespeichert werden.',
        4200,
        'error',
      );
    } finally {
      setSharedRecipeImportBusy(false);
    }
  }
  function dismissSharedRecipe() {
    setSharedRecipePreview(undefined);
    setRecipeImportError(undefined);
    const id = incomingRecipeId.current;
    incomingRecipeId.current = undefined;
    if (!id) return;
    void sharedRecipeInbox(recipeShareBaseUrl())
      .remove(id)
      .catch(() => undefined);
    const url = new URL(window.location.href);
    url.searchParams.delete('incoming');
    window.history.replaceState(window.history.state, '', url);
  }
  function openPlanner(
    date = todayLocal(),
    slot: MealSlot = 'Abendessen',
    recipeId?: string,
    servings?: number,
  ) {
    slot = mealSlots.includes(slot) ? slot : mealSlots[0];
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
  function clearPlanUndo() {
    setPendingPlanUndo((current) => {
      if (current) {
        window.clearTimeout(current.timer);
        deletionTimers.current.delete(current.timer);
      }
      return undefined;
    });
  }
  /** Writes plan changes and offers undo whenever something was replaced. */
  function commitPlanChanges(
    entries: Array<{ date: string; slot: MealSlot; meal?: PlannedMeal }>,
    message: string,
    undo: 'always' | 'replaced' = 'always',
  ) {
    let recorded: PlanChange[] = [];
    const accepted = setData((current) => {
      const result = applyPlanChanges(current.plan, entries);
      recorded = result.changes;
      return result.changes.length
        ? { ...current, plan: result.plan }
        : current;
    });
    if (!accepted) return false;
    const offerUndo =
      recorded.length > 0 &&
      (undo === 'always' || recorded.some((change) => change.before));
    clearPlanUndo();
    if (!offerUndo) {
      showToast(message);
      return true;
    }
    const timer = window.setTimeout(() => {
      deletionTimers.current.delete(timer);
      setPendingPlanUndo((current) =>
        current?.timer === timer ? undefined : current,
      );
    }, 8_000);
    deletionTimers.current.add(timer);
    setToast(undefined);
    setPendingPlanUndo({ message, changes: recorded, timer });
    return true;
  }
  function undoPlanChanges() {
    if (!pendingPlanUndo) return;
    const { changes } = pendingPlanUndo;
    if (
      !setData((current) => ({
        ...current,
        plan: revertPlanChanges(
          current.plan,
          changes,
          new Set(current.recipes.map((recipe) => recipe.id)),
        ),
      }))
    )
      return;
    clearPlanUndo();
    showToast('Plan wiederhergestellt.');
  }
  function plannedMeal(
    recipeId: string,
    slot: MealSlot,
    servings: number,
  ): PlannedMeal {
    return {
      slot,
      recipeId,
      servings,
      trackedServings: Math.min(
        dataRef.current.nutritionSettings.defaultTrackedServings,
        servings,
      ),
    };
  }
  function planRecipe(
    date: string,
    slot: MealSlot,
    recipeId: string,
    servings: number,
  ) {
    if (!dataRef.current.recipes.some((recipe) => recipe.id === recipeId))
      return;
    if (
      !commitPlanChanges(
        [{ date, slot, meal: plannedMeal(recipeId, slot, servings) }],
        'Mahlzeit ist eingeplant.',
        'replaced',
      )
    )
      return;
    setPlanner(undefined);
    setSelectedRecipeId(undefined);
    setRecipePlanWeekStart(undefined);
  }
  function removePlannedMeal(date: string, slot: MealSlot) {
    commitPlanChanges([{ date, slot }], 'Mahlzeit entfernt.');
    setPlanner(undefined);
  }
  function planSuggestion(date: string, slot: MealSlot, recipe: Recipe) {
    const servings = preferredServings(dataRef.current.plan, recipe.servings);
    commitPlanChanges(
      [{ date, slot, meal: plannedMeal(recipe.id, slot, servings) }],
      `„${recipe.name}“ ist eingeplant.`,
    );
  }
  function confirmQuickPlan(proposals: PlanProposal[], servings: number) {
    if (
      commitPlanChanges(
        proposals.map((entry) => ({
          date: entry.date,
          slot: entry.slot,
          meal: plannedMeal(entry.recipeId, entry.slot, servings),
        })),
        proposals.length === 1
          ? '1 Mahlzeit eingeplant.'
          : `${proposals.length} Mahlzeiten eingeplant.`,
      )
    )
      setQuickPlanTargets(undefined);
  }
  function openQuickPlan(targetWeekStart: string) {
    const targets = freeSlots(
      visibleMealPlan(dataRef.current),
      weekDates(targetWeekStart),
      mealSlots,
      todayLocal(now),
    );
    if (targets.length) setQuickPlanTargets(targets);
  }
  /** Ideas go to the first free slot, with the planner open for review. */
  function planIdea(recipe: Recipe, targetWeekStart: string) {
    const open = freeSlots(
      visibleMealPlan(dataRef.current),
      weekDates(targetWeekStart),
      mealSlots,
      todayLocal(now),
    );
    const target =
      open.find((entry) => recipesForSlot([recipe], entry.slot).length) ??
      open[0];
    const servings = preferredServings(dataRef.current.plan, recipe.servings);
    if (target) openPlanner(target.date, target.slot, recipe.id, servings);
    else openPlanner(targetWeekStart, mealSlots.at(-1), recipe.id, servings);
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
  function pauseRecipeDeletionTimer() {
    const timer = pendingDeletionRef.current?.cleanupTimer;
    if (timer !== undefined) {
      window.clearTimeout(timer);
      deletionTimers.current.delete(timer);
    }
  }
  function finishRecipeDeletion() {
    if (recipeDeletionBusy.current) return;
    pauseRecipeDeletionTimer();
    pendingDeletionRef.current = undefined;
    setPendingDeletion(undefined);
    retainedImages.current = [];
    // Storage cleanup also revokes unused image URLs after the save succeeds.
    void persistCurrent().catch(() => undefined);
  }
  function offerRecipeUndo(removed: RemovedRecipe[]) {
    pauseRecipeDeletionTimer();
    const cleanupTimer = window.setTimeout(finishRecipeDeletion, 10_000);
    deletionTimers.current.add(cleanupTimer);
    const pending = { removed, cleanupTimer };
    pendingDeletionRef.current = pending;
    setPendingDeletion(pending);
    retainedImages.current = removedRecipeImageKeys(removed);
  }
  async function confirmDeleteRecipe() {
    if (!deleteRequest || recipeDeletionBusy.current) return;
    const deletion = removeRecipe(dataRef.current, deleteRequest.id);
    if (!deletion) return;
    recipeDeletionBusy.current = true;
    setDeleteBusy(true);
    setUndoBusy(true);
    pauseRecipeDeletionTimer();
    const previous = pendingDeletionRef.current?.removed ?? [];
    const removed = [...previous, deletion.removed];
    retainedImages.current = removedRecipeImageKeys(removed);
    try {
      await commitData(deletion.next);
      setDeleteRequest(undefined);
      setEditorRecipeId(undefined);
      setSelectedRecipeId(undefined);
      setToast(undefined);
      offerRecipeUndo(removed);
    } catch {
      // Keep recovery available even if the optimistic local save failed.
      offerRecipeUndo(removed);
      showToast(
        'Die Löschung konnte nicht auf dem Gerät gespeichert werden.',
        6000,
        'error',
      );
    } finally {
      recipeDeletionBusy.current = false;
      setDeleteBusy(false);
      setUndoBusy(false);
    }
  }
  async function undoDeleteRecipe() {
    const deletion = pendingDeletionRef.current;
    if (!deletion || recipeDeletionBusy.current) return;
    recipeDeletionBusy.current = true;
    setUndoBusy(true);
    pauseRecipeDeletionTimer();
    try {
      await commitData((current) => restoreRecipes(current, deletion.removed));
      pendingDeletionRef.current = undefined;
      setPendingDeletion(undefined);
      retainedImages.current = [];
      showToast(
        deletion.removed.length === 1
          ? 'Rezept wiederhergestellt.'
          : `${deletion.removed.length} Rezepte wiederhergestellt.`,
      );
    } catch {
      offerRecipeUndo(deletion.removed);
      showToast(
        'Rückgängig machen ist fehlgeschlagen. Bitte erneut versuchen.',
        6000,
        'error',
      );
    } finally {
      recipeDeletionBusy.current = false;
      setUndoBusy(false);
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
  async function applyAppUpdate() {
    setMaintenanceBusy(true);
    try {
      await lastSave.current;
      await appUpdate.apply();
    } finally {
      setMaintenanceBusy(false);
    }
  }
  async function repairStandardRecipes() {
    setMaintenanceBusy(true);
    try {
      await lastSave.current;
      const next = restoreStandardRecipes(dataRef.current);
      const { loadStandardRecipeImages } =
        await import('@/lib/standard-recipe-images');
      const bundledKeys = new Set(
        newStandardImageKeys(
          createEmptyData(),
          installStandardRecipes(createEmptyData()),
        ),
      );
      const missingKeys: string[] = [];
      for (const recipe of next.recipes) {
        if (
          recipe.imageKey &&
          bundledKeys.has(recipe.imageKey) &&
          !(await loadRecipeImage(recipe.imageKey))
        )
          missingKeys.push(recipe.imageKey);
      }
      const images = await loadStandardRecipeImages(missingKeys);
      await commitData(next, images);
      setImageUrls((current) => {
        const urls = { ...current };
        for (const [key, image] of Object.entries(images))
          if (!urls[key]) urls[key] = URL.createObjectURL(image);
        return urls;
      });
      showToast('Fehlende Standardrezepte wurden ergänzt.');
    } finally {
      setMaintenanceBusy(false);
    }
  }
  async function resetApp() {
    setMaintenanceBusy(true);
    try {
      await lastSave.current;
      const fresh = installStandardRecipes(createEmptyData());
      const { loadStandardRecipeImages } =
        await import('@/lib/standard-recipe-images');
      const images = await loadStandardRecipeImages(
        newStandardImageKeys(createEmptyData(), fresh),
      );
      // No user data is removed until all four images are available.
      if ('caches' in window) {
        await caches.delete(
          `mampffred-${encodeURIComponent(import.meta.env.BASE_URL)}-inbox`,
        );
        await caches.delete(THUMBNAIL_CACHE);
      }
      for (const timer of deletionTimers.current) window.clearTimeout(timer);
      deletionTimers.current.clear();
      await queueReplaceAllData(fresh, images);
      ++saveRevision.current;
      pendingImages.current = {};
      retainedImages.current = [];
      dataRef.current = fresh;
      publishData(fresh);
      window.location.replace(
        new URL(import.meta.env.BASE_URL, window.location.origin).href,
      );
    } finally {
      setMaintenanceBusy(false);
    }
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
    pendingDeletionRef.current = undefined;
    setPendingDeletion(undefined);
    setPendingShoppingDeletion(undefined);
    // Undo must never rewrite a restored backup.
    setPendingPlanUndo(undefined);
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
  if (loadState === 'loading' || writerState === 'checking' || maintenanceBusy)
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
        <h1>
          {incomingForwarded
            ? 'Deine Nachricht ist angekommen.'
            : 'Mampffred ist bereits geöffnet.'}
        </h1>
        <p>
          {incomingForwarded
            ? 'Das Ergebnis der Rezeptprüfung findest du in deiner bereits geöffneten Mampffred-App.'
            : 'Schließe die App in anderen Browserfenstern oder als installierte App. So können Änderungen nicht gegenseitig überschrieben werden.'}
        </p>
        <button
          className="primary-button"
          onClick={() => {
            if (incomingForwarded)
              navigator.serviceWorker.controller?.postMessage({
                type: 'focus-incoming',
                id: new URL(window.location.href).searchParams.get('incoming'),
              });
            else window.location.reload();
          }}
        >
          {incomingForwarded ? 'Zur geöffneten App' : 'Erneut prüfen'}
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
          {appUpdate.status === 'available' &&
            !editorRecipeId &&
            !planner &&
            !quickPlanTargets &&
            !settings &&
            !backupRequest &&
            !selectedRecipeId &&
            !selectedDayDate && (
              <div className="app-update-banner" role="status">
                <div className="app-update-message">
                  <Download size={24} aria-hidden="true" />
                  <span>
                    <strong>Ein Update für Mampffred ist da!</strong>
                    <small>Die neue Version ist bereit.</small>
                  </span>
                </div>
                <button
                  onClick={() =>
                    void applyAppUpdate().catch(() =>
                      showToast(
                        'Update nicht abgeschlossen. Bitte erneut versuchen.',
                      ),
                    )
                  }
                >
                  Jetzt aktualisieren
                </button>
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
                quickPlanTargets ||
                settings ||
                backupRequest ||
                weekShoppingRequest ||
                sharedRecipePreview ||
                recipeImportError ||
                shareCopyText ||
                shareFallback,
              ) || undefined
            }
            inert={
              Boolean(
                selectedDayDate ||
                selectedRecipeId ||
                editorRecipeId ||
                planner ||
                quickPlanTargets ||
                settings ||
                backupRequest ||
                weekShoppingRequest ||
                sharedRecipePreview ||
                recipeImportError ||
                shareCopyText ||
                shareFallback,
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
                onPlan={(slot, date) => openPlanner(date, slot)}
                onRemove={(slot, date) => removePlannedMeal(date, slot)}
                onPlanSuggestion={(slot, date, recipe) =>
                  planSuggestion(date, slot, recipe)
                }
                onOpenWeek={() => {
                  setWeekStart(startOfLocalWeek(now));
                  changeTab('week');
                }}
                onAddRecipe={openNewRecipeEditor}
                onAddSamples={addSampleRecipes}
              />
            )}
            {tab === 'week' && (
              <WeekView
                data={data}
                now={now}
                imageUrls={imageUrls}
                weekStart={weekStart}
                onWeekStart={setWeekStart}
                onAdd={(date, slot) => openPlanner(date, slot)}
                onFillWeek={() => openQuickPlan(weekStart)}
                onPlanIdea={(recipe) => planIdea(recipe, weekStart)}
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
                onSettings={() => changeTab('more')}
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
                onDiscardDraft={async (id) => {
                  await discardRecipeDraft(id);
                  showToast('Entwurf verworfen.');
                }}
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
                now={now}
                weekStart={weekStart}
                onWeekStart={setWeekStart}
                onChange={(shopping) =>
                  setData((current) => ({ ...current, shopping }))
                }
                onRemove={deleteShoppingItems}
                onFromWeek={() => openWeekShopping(weekStart)}
              />
            )}
            {tab === 'more' && (
              <MoreView data={data} now={now} onOpen={setSettings} />
            )}
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
              onRemove={removePlannedMeal}
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
              onDelete={() => setDeleteRequest(selectedRecipe)}
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
              shareReady={
                preparedShareFile?.recipe === selectedRecipe &&
                preparedShareLink?.recipe === selectedRecipe &&
                !nativeShareBusy
              }
              onExport={() => void exportRecipeFile(selectedRecipe)}
              exportBusy={exportBusy}
              inactive={Boolean(
                editorRecipeId ||
                deleteRequest ||
                planner ||
                sharedRecipePreview ||
                shareCopyText ||
                shareFallback,
              )}
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
          {quickPlanTargets && (
            <QuickPlanSheet
              data={data}
              imageUrls={imageUrls}
              targets={quickPlanTargets}
              onClose={() => setQuickPlanTargets(undefined)}
              onConfirm={confirmQuickPlan}
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
              onMealSlots={(enabledMealSlots) =>
                setData((current) => {
                  if (!enabledMealSlots.length) return current;
                  let next = {
                    ...current,
                    enabledMealSlots: ALL_MEAL_SLOTS.filter((slot) =>
                      enabledMealSlots.includes(slot),
                    ),
                  };
                  const weeks = new Set(
                    current.shopping.flatMap((item) =>
                      item.origin.kind === 'week'
                        ? [item.origin.weekStart]
                        : [],
                    ),
                  );
                  for (const week of weeks)
                    next = {
                      ...next,
                      shopping: reconcileWeekShopping(next, week).shopping,
                    };
                  return next;
                })
              }
              onSaveCustomFood={saveCustomFood}
              showIosHint={
                /iPad|iPhone|iPod/.test(navigator.userAgent) &&
                !window.matchMedia('(display-mode: standalone)').matches
              }
              appUpdate={{ ...appUpdate, apply: applyAppUpdate }}
              onRepairStandards={repairStandardRecipes}
              onResetApp={resetApp}
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
          {sharedRecipePreview && (
            <SharedRecipeDialog
              recipe={sharedRecipePreview.recipe}
              image={sharedRecipePreview.image}
              busy={sharedRecipeImportBusy}
              onCancel={dismissSharedRecipe}
              onConfirm={() => void confirmSharedRecipeImport()}
            />
          )}
          {recipeImportError && (
            <RecipeImportErrorDialog
              message={recipeImportError}
              onClose={dismissSharedRecipe}
              onFile={importRecipeFile}
            />
          )}
          {shareFallback && (
            <RecipeShareFallback
              recipe={shareFallback}
              onClose={() => setShareFallback(undefined)}
              onDownload={() => {
                void exportRecipeFile(shareFallback);
                setShareFallback(undefined);
              }}
              onLink={() => {
                void shareRecipeLink(shareFallback);
                setShareFallback(undefined);
              }}
            />
          )}
          {shareCopyText && (
            <RecipeLinkDialog
              text={shareCopyText}
              onClose={() => setShareCopyText(undefined)}
            />
          )}
          <div className="toast-stack" aria-label="Hinweise">
            {pendingDeletion && (
              <AppToast
                message={
                  pendingDeletion.removed.length === 1
                    ? 'Rezept gelöscht'
                    : `${pendingDeletion.removed.length} Rezepte gelöscht`
                }
                detail={
                  pendingDeletion.removed.length === 1
                    ? '10 Sekunden zum Wiederherstellen.'
                    : 'Alle gemeinsam wiederherstellen · 10 Sekunden.'
                }
                key={pendingDeletion.cleanupTimer}
                busy={undoBusy}
                duration={10_000}
                onUndo={() => void undoDeleteRecipe()}
                onDismiss={finishRecipeDeletion}
              />
            )}
            {pendingShoppingDeletion && (
              <AppToast
                message={
                  pendingShoppingDeletion.removed.length === 1
                    ? 'Einkaufsartikel entfernt'
                    : `${pendingShoppingDeletion.removed.length} Einkaufsartikel entfernt`
                }
                key={pendingShoppingDeletion.cleanupTimer}
                duration={10_000}
                onUndo={undoShoppingDeletion}
                onDismiss={() => {
                  window.clearTimeout(pendingShoppingDeletion.cleanupTimer);
                  deletionTimers.current.delete(
                    pendingShoppingDeletion.cleanupTimer,
                  );
                  setPendingShoppingDeletion(undefined);
                }}
              />
            )}
            {pendingPlanUndo && (
              <AppToast
                key={pendingPlanUndo.timer}
                message={pendingPlanUndo.message}
                duration={8_000}
                onUndo={undoPlanChanges}
                onDismiss={clearPlanUndo}
              />
            )}
            {toast && (
              <AppToast
                key={toast.id}
                message={toast.message}
                tone={toast.tone}
                duration={toast.duration}
                onDismiss={() => {
                  if (toastTimer.current)
                    window.clearTimeout(toastTimer.current);
                  setToast(undefined);
                }}
              />
            )}
          </div>
        </main>
      </div>
      {storageRecovery}
    </RecipeImageRequestContext.Provider>
  );
}
