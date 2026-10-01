/* oxlint-disable jsx-a11y/prefer-tag-over-role -- Segmented buttons need a labelled group. */
import { Plus, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  aisleLabel,
  catalogFoodById,
  CATALOG_PANTRY_PRESET,
  searchCatalogFoods,
} from '@/lib/food-catalog';
import type { PantryState } from '@/lib/model';
import { IconButton } from './icon-button';

/** "Vorratsschrank": what the household keeps at home. */
export function PantrySettings({
  pantry,
  onPantry,
}: {
  pantry: Record<string, PantryState>;
  onPantry: (
    foodIds: string | readonly string[],
    state: PantryState | undefined,
  ) => void;
}) {
  const [query, setQuery] = useState('');
  const entries = useMemo(
    () =>
      Object.entries(pantry)
        .flatMap(([id, state]) => {
          const food = catalogFoodById(id);
          return food ? [{ food, state }] : [];
        })
        .sort((left, right) =>
          left.food.name.localeCompare(right.food.name, 'de-DE'),
        ),
    [pantry],
  );
  const suggestions = useMemo(
    () =>
      searchCatalogFoods(query, 6).filter(
        (food) => !Object.hasOwn(pantry, food.id),
      ),
    [pantry, query],
  );
  const missingPresets = CATALOG_PANTRY_PRESET.filter(
    (id) => !Object.hasOwn(pantry, id),
  );
  return (
    <section className="pantry-settings" aria-labelledby="pantry-title">
      <h2 id="pantry-title">Was hast du meistens zu Hause?</h2>
      <p>
        <strong>Meist da</strong> landet beim Einkauf eingeklappt unter „Vorrat
        prüfen“. <strong>Immer da</strong> kommt gar nicht erst auf die Liste.
        Änderungen gelten ab dem nächsten Abgleich mit dem Wochenplan.
      </p>
      <label className="search-field pantry-search">
        <Search size={18} aria-hidden="true" />
        <input
          aria-label="Lebensmittel zum Vorrat hinzufügen"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Hinzufügen, z. B. Senf"
        />
      </label>
      {suggestions.length > 0 && (
        <ul className="pantry-suggestions">
          {suggestions.map((food) => (
            <li key={food.id}>
              <button
                type="button"
                onClick={() => {
                  onPantry(food.id, 'check');
                  setQuery('');
                }}
              >
                <span>
                  <strong>{food.name}</strong>
                  <small>{aisleLabel(food.aisle)}</small>
                </span>
                <Plus size={18} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {entries.length ? (
        <ul className="pantry-list">
          {entries.map(({ food, state }) => (
            <li key={food.id}>
              <span>
                <strong>{food.name}</strong>
                <small>{aisleLabel(food.aisle)}</small>
              </span>
              <div className="segmented" role="group" aria-label={food.name}>
                <button
                  type="button"
                  aria-pressed={state === 'check'}
                  onClick={() => onPantry(food.id, 'check')}
                >
                  Meist da
                </button>
                <button
                  type="button"
                  aria-pressed={state === 'always'}
                  onClick={() => onPantry(food.id, 'always')}
                >
                  Immer da
                </button>
              </div>
              <IconButton
                label={`${food.name} aus dem Vorrat entfernen`}
                onClick={() => onPantry(food.id, undefined)}
              >
                <X size={18} />
              </IconButton>
            </li>
          ))}
        </ul>
      ) : (
        <p className="pantry-empty">
          Noch nichts eingetragen – alles kommt auf die Einkaufsliste.
        </p>
      )}
      {missingPresets.length > 0 && (
        <button
          type="button"
          className="secondary-button"
          onClick={() => onPantry(missingPresets, 'check')}
        >
          Grundzutaten vorschlagen (Salz, Pfeffer, Öl …)
        </button>
      )}
    </section>
  );
}
