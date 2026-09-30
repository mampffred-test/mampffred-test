/* oxlint-disable jsx-a11y/prefer-tag-over-role */
import {
  Check,
  Minus,
  Plus,
  RefreshCw,
  Shuffle,
  Sparkles,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { parseLocalDate } from '@/lib/local-date';
import {
  preferredServings,
  proposeMeals,
  rankRecipesForSlot,
  type FreeSlot,
  type PlanProposal,
} from '@/lib/meal-planning';
import type { AppData, MealSlot } from '@/lib/model';
import { IconButton } from './icon-button';
import {
  useAnimatedSheetClose,
  useModalFocus,
  useSheetSwipeToClose,
} from './modal-hooks';
import { MealSlotIcon, shortDate, weekdayLabel } from './plan-ui';
import { RecipeImage } from './recipe-image';

const keyOf = (entry: { date: string; slot: MealSlot }) =>
  `${entry.date}|${entry.slot}`;

export function QuickPlanSheet({
  data,
  imageUrls,
  targets,
  onClose,
  onConfirm,
}: {
  data: AppData;
  imageUrls: Record<string, string>;
  targets: FreeSlot[];
  onClose: () => void;
  onConfirm: (proposals: PlanProposal[], servings: number) => void;
}) {
  const sheetExit = useAnimatedSheetClose(onClose);
  const dialogRef = useModalFocus<HTMLElement>(sheetExit.close);
  const sheetSwipe = useSheetSwipeToClose(onClose);
  const propose = () =>
    proposeMeals({ recipes: data.recipes, plan: data.plan, targets });
  const [proposals, setProposals] = useState<PlanProposal[]>(propose);
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(new Set());
  const [servings, setServings] = useState(() =>
    preferredServings(data.plan, 2),
  );
  const [rolled, setRolled] = useState<Record<string, number>>({});
  const selected = proposals.filter((entry) => !skipped.has(keyOf(entry)));
  const withoutFit = targets.length - proposals.length;
  const proposed = new Set(proposals.map(keyOf));
  const unmatchedBreakfast = targets.some(
    (target) => target.slot === 'Frühstück' && !proposed.has(keyOf(target)),
  );

  function reroll(target: PlanProposal) {
    const others = proposals
      .filter((entry) => keyOf(entry) !== keyOf(target))
      .map((entry) => entry.recipeId);
    const next =
      rankRecipesForSlot({
        recipes: data.recipes,
        plan: data.plan,
        date: target.date,
        slot: target.slot,
        exclude: [...others, target.recipeId],
      })[0] ??
      rankRecipesForSlot({
        recipes: data.recipes,
        plan: data.plan,
        date: target.date,
        slot: target.slot,
        exclude: [target.recipeId],
      })[0];
    if (!next) return;
    setProposals((current) =>
      current.map((entry) =>
        keyOf(entry) === keyOf(target)
          ? { ...entry, recipeId: next.id }
          : entry,
      ),
    );
    setRolled((current) => ({
      ...current,
      [keyOf(target)]: (current[keyOf(target)] ?? 0) + 1,
    }));
    setSkipped((current) => {
      const nextSkipped = new Set(current);
      nextSkipped.delete(keyOf(target));
      return nextSkipped;
    });
  }

  return (
    <div
      className={`modal-backdrop align-end ${sheetExit.closing ? 'sheet-backdrop-closing' : ''}`}
    >
      <section
        ref={dialogRef}
        className={`planner-sheet quick-plan-sheet swipe-sheet ${sheetExit.closing ? 'sheet-closing' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-plan-title"
      >
        <div className="sheet-handle" aria-hidden="true" {...sheetSwipe} />
        <div className="modal-header">
          <div>
            <small className="qp-eyebrow">
              <Sparkles size={14} aria-hidden="true" /> Vorschläge
            </small>
            <h2 id="quick-plan-title">
              {targets.length === 1 ? 'Mahlzeit füllen' : 'Woche füllen'}
            </h2>
            <p>
              Mampffred schlägt passende Rezepte vor – Favoriten zuerst, ohne
              Wiederholungen. Tippe auf <RefreshCw size={13} /> für eine andere
              Idee.
            </p>
          </div>
          <IconButton label="Schließen" onClick={sheetExit.close}>
            <X size={20} />
          </IconButton>
        </div>

        <div className="qp-servings">
          <span>Portionen je Mahlzeit</span>
          <div>
            <button
              type="button"
              aria-label="Eine Portion weniger"
              onClick={() => setServings((value) => Math.max(1, value - 1))}
            >
              <Minus size={18} />
            </button>
            <strong aria-live="polite">{servings}</strong>
            <button
              type="button"
              aria-label="Eine Portion mehr"
              onClick={() => setServings((value) => Math.min(1000, value + 1))}
            >
              <Plus size={18} />
            </button>
          </div>
        </div>

        {proposals.length ? (
          <ul className="qp-list">
            {proposals.map((entry) => {
              const recipe = data.recipes.find(
                (item) => item.id === entry.recipeId,
              );
              if (!recipe) return null;
              const key = keyOf(entry);
              const included = !skipped.has(key);
              const date = parseLocalDate(entry.date);
              return (
                <li key={key} className={included ? '' : 'is-skipped'}>
                  <button
                    type="button"
                    className="qp-toggle"
                    aria-pressed={included}
                    aria-label={`${weekdayLabel(date)}, ${shortDate.format(date)}, ${entry.slot}: ${recipe.name} ${included ? 'einplanen' : 'auslassen'}`}
                    onClick={() =>
                      setSkipped((current) => {
                        const next = new Set(current);
                        if (next.has(key)) next.delete(key);
                        else next.add(key);
                        return next;
                      })
                    }
                  >
                    <span className="qp-check" aria-hidden="true">
                      {included && <Check size={15} strokeWidth={3} />}
                    </span>
                    <RecipeImage
                      key={recipe.id}
                      recipe={recipe}
                      imageUrls={imageUrls}
                      className="qp-thumb"
                      thumbnail
                      cover
                    />
                    <span className="qp-copy">
                      <small>
                        <MealSlotIcon slot={entry.slot} size={13} />
                        {weekdayLabel(date)}, {shortDate.format(date)} ·{' '}
                        {entry.slot}
                      </small>
                      <strong key={rolled[key] ?? 0}>{recipe.name}</strong>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="qp-reroll"
                    aria-label={`Anderes Rezept für ${weekdayLabel(date)}, ${entry.slot}`}
                    onClick={() => reroll(entry)}
                  >
                    <RefreshCw size={18} key={rolled[key] ?? 0} />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="qp-empty">
            Für die freien Plätze passt gerade kein Rezept.
            {unmatchedBreakfast &&
              ' Für Frühstück helfen Rezepte mit dem Stichwort „Frühstück“.'}
          </p>
        )}
        {withoutFit > 0 && proposals.length > 0 && (
          <p className="qp-note">
            {withoutFit === 1
              ? '1 Platz bleibt frei'
              : `${withoutFit} Plätze bleiben frei`}
            {unmatchedBreakfast
              ? ' – für Frühstück fehlen Rezepte mit dem Stichwort „Frühstück“.'
              : ', weil keine passenden Rezepte vorhanden sind.'}
          </p>
        )}

        <div className="qp-footer">
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              setProposals(propose());
              setSkipped(new Set());
              setRolled((current) =>
                Object.fromEntries(
                  targets.map((target) => [
                    keyOf(target),
                    (current[keyOf(target)] ?? 0) + 1,
                  ]),
                ),
              );
            }}
            disabled={!proposals.length}
          >
            <Shuffle size={17} aria-hidden="true" /> Neu mischen
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={!selected.length}
            onClick={() => onConfirm(selected, servings)}
          >
            {selected.length === 1
              ? '1 Mahlzeit einplanen'
              : `${selected.length} Mahlzeiten einplanen`}
          </button>
        </div>
      </section>
    </div>
  );
}
