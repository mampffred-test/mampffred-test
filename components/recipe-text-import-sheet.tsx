/* oxlint-disable jsx-a11y/prefer-tag-over-role -- Sheets follow the app's dialog pattern. */
import { ClipboardPaste, X } from 'lucide-react';
import { useDeferredValue, useMemo, useState } from 'react';
import {
  parseRecipeText,
  type ParsedRecipeText,
} from '@/lib/recipe-text-import';
import { IconButton } from './icon-button';
import {
  useAnimatedSheetClose,
  useModalFocus,
  useSheetSwipeToClose,
} from './modal-hooks';

/** Paste a recipe from a messenger or website and get an editable draft. */
export function RecipeTextImportSheet({
  initialText = '',
  onClose,
  onCreate,
}: {
  initialText?: string;
  onClose: () => void;
  onCreate: (recipe: ParsedRecipeText) => void;
}) {
  const sheetExit = useAnimatedSheetClose(onClose);
  const dialogRef = useModalFocus<HTMLElement>(sheetExit.close, 'textarea');
  const sheetSwipe = useSheetSwipeToClose(onClose);
  const [text, setText] = useState(initialText);
  const deferredText = useDeferredValue(text);
  const parsed = useMemo(() => parseRecipeText(deferredText), [deferredText]);
  // A missing title is fine: the editor asks for it.
  const usable = parsed.ingredients.length > 0 || parsed.steps.length > 0;
  return (
    <div
      className={`modal-backdrop align-end ${sheetExit.closing ? 'sheet-backdrop-closing' : ''}`}
    >
      <section
        ref={dialogRef}
        className={`planner-sheet text-import-sheet swipe-sheet ${sheetExit.closing ? 'sheet-closing' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="text-import-title"
      >
        <div className="sheet-handle" aria-hidden="true" {...sheetSwipe} />
        <div className="modal-header">
          <div>
            <h2 id="text-import-title">Rezept aus Text einfügen</h2>
            <small>Aus WhatsApp, einer Notiz oder Webseite kopieren</small>
          </div>
          <IconButton label="Schließen" onClick={sheetExit.close}>
            <X size={20} />
          </IconButton>
        </div>
        <label className="text-import-field">
          <span className="sr-only">Rezepttext</span>
          <textarea
            value={text}
            maxLength={50_000}
            rows={8}
            placeholder={
              'Omas Linsensuppe\nfür 4 Personen\n\nZutaten:\n250 g Linsen\n2 Möhren\n…\n\nZubereitung:\n1. …'
            }
            onChange={(event) => setText(event.target.value)}
          />
        </label>
        {'clipboard' in navigator &&
          'readText' in navigator.clipboard &&
          !text && (
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                navigator.clipboard
                  .readText()
                  .then((value) => setText(value.slice(0, 50_000)))
                  .catch(() => undefined);
              }}
            >
              <ClipboardPaste size={17} aria-hidden="true" /> Aus Zwischenablage
              einfügen
            </button>
          )}
        {text.trim() && (
          <div className="text-import-preview" aria-live="polite">
            <strong>
              {parsed.name || 'Ohne Titel – ergänzt du im Editor'}
            </strong>
            <small>
              {parsed.ingredients.length}{' '}
              {parsed.ingredients.length === 1 ? 'Zutat' : 'Zutaten'} ·{' '}
              {parsed.steps.length}{' '}
              {parsed.steps.length === 1 ? 'Schritt' : 'Schritte'}
              {parsed.servings ? ` · ${parsed.servings} Portionen` : ''}
              {parsed.minutes ? ` · ${parsed.minutes} Min.` : ''}
            </small>
            {parsed.ingredients.length > 0 && (
              <ul>
                {parsed.ingredients.slice(0, 5).map((ingredient, index) => (
                  <li key={index}>
                    {[
                      ingredient.amount,
                      ingredient.unit === 'Stück' ? '' : ingredient.unit,
                    ]
                      .filter(Boolean)
                      .join(' ')}{' '}
                    <b>{ingredient.name}</b>
                    {ingredient.note ? `, ${ingredient.note}` : ''}
                  </li>
                ))}
                {parsed.ingredients.length > 5 && (
                  <li>… und {parsed.ingredients.length - 5} weitere</li>
                )}
              </ul>
            )}
          </div>
        )}
        <p className="sheet-intro">
          Du prüfst alles im nächsten Schritt im Editor. Nichts wird
          gespeichert, bevor du es bestätigst.
        </p>
        <div className="dialog-actions">
          <button type="button" onClick={sheetExit.close}>
            Abbrechen
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={!usable}
            onClick={() => onCreate(parsed)}
          >
            Im Editor öffnen
          </button>
        </div>
      </section>
    </div>
  );
}
