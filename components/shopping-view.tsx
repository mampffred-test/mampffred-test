/* oxlint-disable next/no-img-element, jsx-a11y/prefer-tag-over-role -- Local images; sheets follow the app's dialog pattern. */
import {
  Beef,
  CalendarDays,
  Carrot,
  Check,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Cookie,
  Croissant,
  CupSoda,
  Droplet,
  House,
  Leaf,
  Milk,
  Package,
  Plus,
  Share2,
  ShoppingBasket,
  Snowflake,
  SprayCan,
  Store,
  Trash2,
  Wheat,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AISLES,
  aisleLabel,
  matchCatalogFood,
  type AisleId,
} from '@/lib/food-catalog';
import {
  addLocalDays,
  parseLocalDate,
  startOfLocalWeek,
} from '@/lib/local-date';
import type { AppData, PantryState, ShoppingItem } from '@/lib/model';
import {
  completeAisleOrder,
  createManualItem,
  findDuplicate,
  formatShoppingListText,
  groupShoppingItems,
} from '@/lib/shopping-list';
import { estimateLeftovers, storedShoppingRange } from '@/lib/week-shopping';
import { IconButton } from './icon-button';
import {
  useAnimatedSheetClose,
  useModalFocus,
  useSheetSwipeToClose,
} from './modal-hooks';
import { isoWeekNumber, weekLabel } from './plan-ui';
import { assetUrl } from './recipe-image';

const shortDate = new Intl.DateTimeFormat('de-DE', {
  day: 'numeric',
  month: 'short',
});

type Tone = 'green' | 'slate' | 'amber' | 'clay' | 'sage';

const aisleLook: Record<
  AisleId,
  { icon: React.ReactNode; tone: Tone; art?: string }
> = {
  'obst-gemuese': {
    icon: <Carrot size={20} />,
    tone: 'green',
    art: 'assets/shopping-produce-v1.webp',
  },
  brot: {
    icon: <Croissant size={20} />,
    tone: 'clay',
    art: 'assets/shopping-bakery-v1.webp',
  },
  kuehlregal: {
    icon: <Milk size={20} />,
    tone: 'slate',
    art: 'assets/shopping-dairy-v1.webp',
  },
  'fleisch-fisch': { icon: <Beef size={20} />, tone: 'clay' },
  veggie: { icon: <Leaf size={20} />, tone: 'green' },
  trocken: {
    icon: <Wheat size={20} />,
    tone: 'amber',
    art: 'assets/shopping-pantry-v1.webp',
  },
  konserven: { icon: <Package size={20} />, tone: 'amber' },
  backen: { icon: <Cookie size={20} />, tone: 'clay' },
  wuerzen: { icon: <Droplet size={20} />, tone: 'sage' },
  fruehstueck: { icon: <Cookie size={20} />, tone: 'amber' },
  tiefkuehl: { icon: <Snowflake size={20} />, tone: 'slate' },
  getraenke: { icon: <CupSoda size={20} />, tone: 'slate' },
  drogerie: { icon: <SprayCan size={20} />, tone: 'sage' },
  sonstiges: { icon: <ShoppingBasket size={20} />, tone: 'sage' },
};

/** Keeps the screen on while shopping; tolerates browsers without support. */
function useScreenWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let sentinel: WakeLockSentinel | undefined;
    let cancelled = false;
    const request = () => {
      if (document.visibilityState !== 'visible') return;
      navigator.wakeLock
        .request('screen')
        .then((lock) => {
          if (cancelled) void lock.release();
          else sentinel = lock;
        })
        .catch(() => undefined);
    };
    request();
    document.addEventListener('visibilitychange', request);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', request);
      void sentinel?.release().catch(() => undefined);
    };
  }, [active]);
}

export function ShoppingView({
  data,
  now,
  weekStart,
  onWeekStart,
  onChange,
  onRemove,
  onFromWeek,
  onPantry,
  onToast,
  onAisleOrder,
}: {
  data: AppData;
  now: Date;
  weekStart: string;
  onWeekStart: (weekStart: string) => void;
  onChange: (items: ShoppingItem[]) => void;
  onRemove: (items: ShoppingItem[]) => void;
  onFromWeek: () => void;
  onPantry: (foodId: string, state: PantryState | undefined) => void;
  onToast: (message: string) => void;
  onAisleOrder: (order: AisleId[]) => void;
}) {
  const [newItem, setNewItem] = useState('');
  const [orderOpen, setOrderOpen] = useState(false);
  const [duplicate, setDuplicate] = useState<{
    candidate: ShoppingItem;
    existing: ShoppingItem;
  }>();
  const [openItem, setOpenItem] = useState<ShoppingItem>();
  const [pantryOpen, setPantryOpen] = useState(false);
  const [shoppingMode, setShoppingMode] = useState(false);
  useScreenWakeLock(shoppingMode);
  const currentWeek = startOfLocalWeek(now);
  const visibleShopping = useMemo(
    () =>
      data.shopping.filter(
        (item) =>
          item.origin.kind !== 'week' || item.origin.weekStart === weekStart,
      ),
    [data.shopping, weekStart],
  );
  const aisleOrder = useMemo(
    () => completeAisleOrder(data.aisleOrder),
    [data.aisleOrder],
  );
  const groups = useMemo(
    () => groupShoppingItems(visibleShopping, aisleOrder),
    [aisleOrder, visibleShopping],
  );
  const hasWeekItems = visibleShopping.some(
    (item) => item.origin.kind === 'week',
  );
  const leftovers = useMemo(
    () =>
      hasWeekItems
        ? estimateLeftovers(
            data,
            weekStart,
            storedShoppingRange(data.shopping, weekStart) ?? {},
          )
        : [],
    // Recomputed when the plan or recipes change, not on every tick.
    // oxlint-disable-next-line react/exhaustive-deps
    [
      hasWeekItems,
      data.plan,
      data.recipes,
      data.pantry,
      data.foodAliases,
      data.enabledMealSlots,
      weekStart,
    ],
  );
  const regular = visibleShopping.filter((item) => !item.pantryCheck);
  const completed = regular.filter((item) => item.checked).length;
  const total = regular.length;
  const allCompleted = visibleShopping.filter((item) => item.checked);
  const pantryOpenCount = groups.pantry.filter((item) => !item.checked).length;
  const circumference = 2 * Math.PI * 22;

  function add(candidate: ShoppingItem) {
    if (data.shopping.length >= 10_000) return;
    onChange([...data.shopping, candidate]);
    setNewItem('');
    setDuplicate(undefined);
  }
  function submitNewItem() {
    const text = newItem.trim();
    if (!text) return;
    const candidate = createManualItem(text, crypto.randomUUID());
    const existing = findDuplicate(visibleShopping, candidate);
    if (existing) {
      setDuplicate({ candidate, existing });
      return;
    }
    add(candidate);
  }
  function toggle(item: ShoppingItem) {
    onChange(
      data.shopping.map((entry) => {
        if (entry.id !== item.id) return entry;
        const { needsReview: _, ...rest } = entry;
        return { ...rest, checked: !entry.checked };
      }),
    );
  }
  async function shareList() {
    const title = `Einkauf KW ${isoWeekNumber(parseLocalDate(weekStart))}`;
    const text = formatShoppingListText(visibleShopping, title, aisleOrder);
    try {
      if (navigator.share) {
        await navigator.share({ title, text });
        return;
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
    }
    try {
      await navigator.clipboard.writeText(text);
      onToast('Einkaufsliste wurde kopiert.');
    } catch {
      onToast('Teilen ist auf diesem Gerät gerade nicht möglich.');
    }
  }

  const renderRow = (item: ShoppingItem) => (
    <li className={`sh-row ${item.checked ? 'is-done' : ''}`} key={item.id}>
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
      </label>
      <button
        type="button"
        className="sh-copy"
        onClick={() => setOpenItem(item)}
        aria-label={`${item.name}${item.quantity ? `, ${item.quantity}` : ''} – Details`}
      >
        <span className="sh-title">
          <strong>{item.name}</strong>
          {item.quantity && <span className="sh-qty">{item.quantity}</span>}
        </span>
        {(item.detail || item.source || item.optional || item.needsReview) && (
          <small>
            {item.needsReview && item.checked && (
              <em className="sh-flag is-review">Menge geändert – prüfen</em>
            )}
            {item.optional && <em className="sh-flag">optional</em>}
            {item.detail ?? item.source}
          </small>
        )}
      </button>
    </li>
  );

  return (
    <div
      className={`screen-content shopping-view sh-view ${shoppingMode ? 'is-shopping-mode' : ''}`}
    >
      <header className="td-header">
        <div>
          <h1>Einkauf</h1>
          <p>
            {shortDate.format(parseLocalDate(weekStart))} –{' '}
            {shortDate.format(parseLocalDate(addLocalDays(weekStart, 6)))} · KW{' '}
            {isoWeekNumber(parseLocalDate(weekStart))}
          </p>
        </div>
      </header>
      {!shoppingMode && (
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
      )}

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
                    : `Noch ${total - completed} Artikel offen${
                        pantryOpenCount
                          ? `, ${pantryOpenCount} im Vorrat prüfen`
                          : ''
                      }.`}
              </small>
            </div>
          </div>
          <div className="sh-hero-actions">
            {!shoppingMode && (
              <button type="button" className="wk-fill" onClick={onFromWeek}>
                <CalendarDays size={16} aria-hidden="true" />
                {hasWeekItems ? 'Mit Wochenplan abgleichen' : 'Aus Wochenplan'}
              </button>
            )}
            {total > 0 && (
              <button
                type="button"
                className={`sh-clear ${shoppingMode ? 'is-active' : ''}`}
                aria-pressed={shoppingMode}
                onClick={() => setShoppingMode((value) => !value)}
              >
                <Store size={15} aria-hidden="true" />
                {shoppingMode ? 'Einkauf beenden' : 'Im Laden'}
              </button>
            )}
            {total > 0 && !shoppingMode && (
              <button
                type="button"
                className="sh-clear"
                onClick={() => void shareList()}
              >
                <Share2 size={15} aria-hidden="true" /> Teilen
              </button>
            )}
            {allCompleted.length > 0 && (
              <button
                type="button"
                className="sh-clear"
                onClick={() => onRemove(allCompleted)}
              >
                <Trash2 size={15} aria-hidden="true" /> Erledigte (
                {allCompleted.length})
              </button>
            )}
          </div>
        </section>
      </div>

      {!shoppingMode && (
        <form
          className="sh-add"
          onSubmit={(event) => {
            event.preventDefault();
            submitNewItem();
          }}
        >
          <input
            aria-label="Einkaufsartikel hinzufügen"
            value={newItem}
            maxLength={500}
            onChange={(event) => {
              setNewItem(event.target.value);
              setDuplicate(undefined);
            }}
            placeholder="Artikel hinzufügen, z. B. 2 l Milch"
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
      )}
      {duplicate && (
        <div className="sh-duplicate" role="status">
          <p>
            <strong>{duplicate.existing.name}</strong> steht schon auf der Liste
            {duplicate.existing.quantity
              ? ` (${duplicate.existing.quantity})`
              : ''}
            .
          </p>
          <div>
            <button type="button" onClick={() => setDuplicate(undefined)}>
              Passt so
            </button>
            <button
              type="button"
              className="is-primary"
              onClick={() => add(duplicate.candidate)}
            >
              Trotzdem hinzufügen
            </button>
          </div>
        </div>
      )}

      {visibleShopping.length === 0 ? (
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
            deiner geplanten Rezepte zusammen – in kaufbaren Mengen und nach
            Laden sortiert.
          </p>
        </section>
      ) : (
        <div className="sh-groups">
          {groups.sections.map(({ aisle, items }) => {
            const look = aisleLook[aisle];
            const label = aisleLabel(aisle);
            const done = items.filter((item) => item.checked).length;
            return (
              <section
                className={`sh-group ${done === items.length ? 'is-done' : ''}`}
                key={aisle}
                aria-label={label}
              >
                <header className="sh-group-head">
                  <span
                    className={`mo-icon is-${look.tone}`}
                    aria-hidden="true"
                  >
                    {look.icon}
                  </span>
                  <span>
                    <strong>{label}</strong>
                    <small>
                      {done} von {items.length} erledigt
                    </small>
                  </span>
                  {look.art && !shoppingMode && (
                    <img
                      className="sh-group-art"
                      src={assetUrl(look.art)}
                      alt=""
                      aria-hidden="true"
                      decoding="async"
                    />
                  )}
                </header>
                <span className="sh-group-bar" aria-hidden="true">
                  <i style={{ transform: `scaleX(${done / items.length})` }} />
                </span>
                <ul className="sh-list">{items.map(renderRow)}</ul>
              </section>
            );
          })}
          {groups.pantry.length > 0 && (
            <section className="sh-group sh-pantry" aria-label="Vorrat prüfen">
              <button
                type="button"
                className="sh-group-head sh-pantry-toggle"
                aria-expanded={pantryOpen}
                onClick={() => setPantryOpen((value) => !value)}
              >
                <span className="mo-icon is-sage" aria-hidden="true">
                  <House size={20} />
                </span>
                <span>
                  <strong>Vorrat prüfen</strong>
                  <small>
                    {pantryOpenCount
                      ? `${pantryOpenCount} meist zu Hause – kurz nachsehen`
                      : 'Alles geprüft'}
                  </small>
                </span>
                <ChevronDown
                  className={`sh-pantry-chevron ${pantryOpen ? 'is-open' : ''}`}
                  size={20}
                  aria-hidden="true"
                />
              </button>
              {pantryOpen && (
                <ul className="sh-list">{groups.pantry.map(renderRow)}</ul>
              )}
            </section>
          )}
          {leftovers.length > 0 && !shoppingMode && (
            <section className="sh-leftovers" aria-label="Was übrig bleibt">
              <strong>Bleibt voraussichtlich übrig</strong>
              <p>
                {leftovers
                  .slice(0, 4)
                  .map((entry) => entry.label)
                  .join(' · ')}
                {leftovers.length > 4 &&
                  ` · und ${leftovers.length - 4} weitere`}
              </p>
              <small>
                „Woche füllen“ schlägt Rezepte, die diese Reste verwerten,
                zuerst vor.
              </small>
            </section>
          )}
          {!shoppingMode && (
            <button
              type="button"
              className="sh-order-button"
              onClick={() => setOrderOpen(true)}
            >
              <ArrowUpDown size={16} aria-hidden="true" /> Reihenfolge wie in
              deinem Laden
            </button>
          )}
        </div>
      )}
      {orderOpen &&
        createPortal(
          <AisleOrderSheet
            order={aisleOrder}
            onClose={() => setOrderOpen(false)}
            onSave={(order) => {
              onAisleOrder(order);
              setOrderOpen(false);
            }}
          />,
          document.querySelector('.app-frame') ?? document.body,
        )}
      {openItem &&
        createPortal(
          <ShoppingItemSheet
            item={
              data.shopping.find((entry) => entry.id === openItem.id) ??
              openItem
            }
            pantryState={
              openItem.foodId ? data.pantry[openItem.foodId] : undefined
            }
            onClose={() => setOpenItem(undefined)}
            onSave={(updated) => {
              onChange(
                data.shopping.map((entry) =>
                  entry.id === updated.id ? updated : entry,
                ),
              );
              setOpenItem(undefined);
            }}
            onRemove={(item) => {
              onRemove([item]);
              setOpenItem(undefined);
            }}
            onPantry={(item, state) => {
              if (!item.foodId) return;
              onPantry(item.foodId, state);
              setOpenItem(undefined);
            }}
          />,
          // Outside the animated screen, so the sheet sticks to the bottom.
          document.querySelector('.app-frame') ?? document.body,
        )}
    </div>
  );
}

function ShoppingItemSheet({
  item,
  pantryState,
  onClose,
  onSave,
  onRemove,
  onPantry,
}: {
  item: ShoppingItem;
  pantryState: PantryState | undefined;
  onClose: () => void;
  onSave: (item: ShoppingItem) => void;
  onRemove: (item: ShoppingItem) => void;
  onPantry: (item: ShoppingItem, state: PantryState | undefined) => void;
}) {
  const sheetExit = useAnimatedSheetClose(onClose);
  const dialogRef = useModalFocus<HTMLElement>(sheetExit.close);
  const sheetSwipe = useSheetSwipeToClose(onClose);
  const generated = item.origin.kind === 'week';
  const [name, setName] = useState(item.name);
  const [quantity, setQuantity] = useState(item.quantity ?? '');
  const [category, setCategory] = useState<AisleId>(item.category);
  const changed =
    name.trim() !== item.name ||
    quantity.trim() !== (item.quantity ?? '') ||
    category !== item.category;
  return (
    <div
      className={`modal-backdrop align-end ${sheetExit.closing ? 'sheet-backdrop-closing' : ''}`}
    >
      <section
        ref={dialogRef}
        className={`planner-sheet sh-item-sheet swipe-sheet ${sheetExit.closing ? 'sheet-closing' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="shopping-item-title"
      >
        <div className="sheet-handle" aria-hidden="true" {...sheetSwipe} />
        <div className="modal-header">
          <div>
            <h2 id="shopping-item-title">{item.name}</h2>
            {item.quantity && <small>{item.quantity}</small>}
          </div>
          <IconButton label="Schließen" onClick={sheetExit.close}>
            <X size={20} />
          </IconButton>
        </div>
        {(item.detail || item.source) && (
          <div className="sh-item-origin">
            <strong>Wofür?</strong>
            <p>{item.detail ?? item.source}</p>
            {item.source && item.detail && (
              <p className="sh-item-recipes">{item.source}</p>
            )}
          </div>
        )}
        {generated ? (
          <p className="sheet-intro">
            Menge und Name kommen aus deinem Wochenplan und werden beim nächsten
            Abgleich aktualisiert.
          </p>
        ) : (
          <div className="sh-item-fields">
            <label>
              <span>Artikel</span>
              <input
                value={name}
                maxLength={500}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label>
              <span>Menge (optional)</span>
              <input
                value={quantity}
                maxLength={100}
                placeholder="z. B. 2 Packungen"
                onChange={(event) => setQuantity(event.target.value)}
              />
            </label>
            <label>
              <span>Bereich im Laden</span>
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value as AisleId)}
              >
                {AISLES.map((aisle) => (
                  <option key={aisle.id} value={aisle.id}>
                    {aisle.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        {item.foodId && (
          <div className="sh-item-pantry">
            <strong>Vorratsschrank</strong>
            <div className="segmented" role="group" aria-label="Vorrat">
              <button
                type="button"
                aria-pressed={!pantryState}
                onClick={() => onPantry(item, undefined)}
              >
                Kaufe ich
              </button>
              <button
                type="button"
                aria-pressed={pantryState === 'check'}
                onClick={() => onPantry(item, 'check')}
              >
                Meist da
              </button>
              <button
                type="button"
                aria-pressed={pantryState === 'always'}
                onClick={() => onPantry(item, 'always')}
              >
                Immer da
              </button>
            </div>
            <small>
              „Meist da“ wandert unter „Vorrat prüfen“, „Immer da“ verschwindet
              von der Liste – auch künftig.
            </small>
          </div>
        )}
        <div className="dialog-actions">
          <button
            type="button"
            className="danger-text"
            onClick={() => onRemove(item)}
          >
            <Trash2 size={16} aria-hidden="true" /> Entfernen
          </button>
          {!generated && (
            <button
              type="button"
              className="primary-button"
              disabled={!changed || !name.trim()}
              onClick={() => {
                const trimmedQuantity = quantity.trim();
                const { quantity: _, foodId: __, ...rest } = item;
                // A renamed item may be a different food now.
                const food =
                  name.trim() === item.name
                    ? item.foodId
                    : matchCatalogFood(name.trim())?.id;
                onSave({
                  ...rest,
                  name: name.trim(),
                  ...(food ? { foodId: food } : {}),
                  ...(trimmedQuantity ? { quantity: trimmedQuantity } : {}),
                  category,
                });
              }}
            >
              Speichern
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

function AisleOrderSheet({
  order,
  onClose,
  onSave,
}: {
  order: AisleId[];
  onClose: () => void;
  onSave: (order: AisleId[]) => void;
}) {
  const sheetExit = useAnimatedSheetClose(onClose);
  const dialogRef = useModalFocus<HTMLElement>(sheetExit.close);
  const sheetSwipe = useSheetSwipeToClose(onClose);
  const [draft, setDraft] = useState(order);
  const move = (index: number, delta: number) =>
    setDraft((current) => {
      const next = [...current];
      const target = index + delta;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  return (
    <div
      className={`modal-backdrop align-end ${sheetExit.closing ? 'sheet-backdrop-closing' : ''}`}
    >
      <section
        ref={dialogRef}
        className={`planner-sheet sh-order-sheet swipe-sheet ${sheetExit.closing ? 'sheet-closing' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="aisle-order-title"
      >
        <div className="sheet-handle" aria-hidden="true" {...sheetSwipe} />
        <div className="modal-header">
          <div>
            <h2 id="aisle-order-title">Reihenfolge im Laden</h2>
            <small>So, wie du durch deinen Markt läufst</small>
          </div>
          <IconButton label="Schließen" onClick={sheetExit.close}>
            <X size={20} />
          </IconButton>
        </div>
        <ol className="sh-order-list">
          {draft.map((aisle, index) => (
            <li key={aisle}>
              <span
                className={`mo-icon is-${aisleLook[aisle].tone}`}
                aria-hidden="true"
              >
                {aisleLook[aisle].icon}
              </span>
              <strong>{aisleLabel(aisle)}</strong>
              <IconButton
                label={`${aisleLabel(aisle)} nach oben`}
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                <ArrowUp size={18} />
              </IconButton>
              <IconButton
                label={`${aisleLabel(aisle)} nach unten`}
                disabled={index === draft.length - 1}
                onClick={() => move(index, 1)}
              >
                <ArrowDown size={18} />
              </IconButton>
            </li>
          ))}
        </ol>
        <div className="dialog-actions">
          <button
            type="button"
            onClick={() => setDraft(AISLES.map((entry) => entry.id))}
          >
            Standard
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() => onSave(draft)}
          >
            Speichern
          </button>
        </div>
      </section>
    </div>
  );
}
