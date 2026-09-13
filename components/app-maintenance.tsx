/// <reference types="vite/client" />
import { useState } from 'react';
import { Download, RefreshCw, Trash2 } from 'lucide-react';
import { APP_VERSION, APP_BUILD_ID } from '../lib/app-version.ts';
import { standardRecipeCount } from '../lib/standard-recipes.ts';
import type { AppData } from '../lib/model.ts';
import type { UpdateStatus } from '../lib/app-updates.ts';

export type AppUpdateControls = {
  status: UpdateStatus;
  checkedAt?: string;
  check: () => Promise<void>;
  apply: () => Promise<void>;
};
export function AppMaintenance({
  data,
  update,
  onRepair,
  onReset,
  onBackup,
  mode,
}: {
  data: AppData;
  update: AppUpdateControls;
  onRepair: () => Promise<void>;
  onReset: () => Promise<void>;
  onBackup: () => void;
  mode: 'app' | 'privacy';
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const run = async (action: () => Promise<void>, success: string) => {
    setBusy(true);
    setMessage('');
    try {
      await action();
      setMessage(success);
    } catch {
      setMessage('Nicht abgeschlossen. Bitte versuche es erneut.');
    } finally {
      setBusy(false);
    }
  };
  const labels: Record<UpdateStatus, string> = {
    checking: 'Update wird geprüft …',
    current: 'Du verwendest die aktuelle Version.',
    available: 'Eine neue Version ist bereit.',
    offline: 'Offline. Updates werden mit Internet erneut geprüft.',
    error: 'Update konnte nicht geprüft werden. Bitte erneut versuchen.',
    development: 'Lokale Entwicklungsversion',
  };
  return (
    <section className="maintenance-section">
      {mode === 'app' ? (
        <>
          <h2>Updates & Rezepte</h2>
          <div className="maintenance-card">
            <strong className="app-version">Version {APP_VERSION}</strong>
            <output className="app-update-status">
              {labels[update.status]}
            </output>
            {update.checkedAt && (
              <p className="app-update-checked">
                Zuletzt geprüft: {update.checkedAt} Uhr
              </p>
            )}
            <button
              className="secondary-button"
              disabled={
                busy ||
                update.status === 'checking' ||
                update.status === 'development'
              }
              onClick={() => void update.check()}
            >
              <RefreshCw size={18} /> Nach Updates suchen
            </button>
            {update.status === 'available' && (
              <button
                className="primary-button"
                disabled={busy}
                onClick={() => void run(update.apply, '')}
              >
                Jetzt aktualisieren
              </button>
            )}
            <p>
              Updates werden beim Öffnen und bei der Rückkehr zur App geprüft.
              Ein Neustart erfolgt erst nach deiner Bestätigung. Eigene Rezepte
              bleiben erhalten.
            </p>
          </div>
          <div className="maintenance-card">
            <strong>
              {standardRecipeCount(data)} von 4 Standardrezepten vorhanden
            </strong>
            <p>
              Neue Standardrezepte werden mit App-Updates ergänzt. Hier kannst
              du auch bewusst entfernte Standardrezepte wieder hinzufügen.
            </p>
            <button
              className="secondary-button"
              disabled={busy}
              onClick={() =>
                void run(
                  onRepair,
                  'Standardrezepte wurden geprüft und fehlende ergänzt.',
                )
              }
            >
              <RefreshCw size={18} /> Standardrezepte wiederherstellen
            </button>
          </div>
          <details>
            <summary>Installationsadresse</summary>
            <p className="installation-address">
              {window.location.origin}
              {import.meta.env.BASE_URL}
            </p>
            <p>Build: {APP_BUILD_ID}</p>
          </details>
        </>
      ) : (
        <>
          <h2>Frisch starten</h2>
          <p>
            Chrome speichert Mampffred-Daten bei der Website. App-Deinstallation
            und App-Cache-Leerung entfernen diesen Website-Speicher nicht immer.
          </p>
          {!confirmReset ? (
            <button
              className="secondary-button danger-button"
              onClick={() => setConfirmReset(true)}
            >
              <Trash2 size={18} /> App vollständig zurücksetzen
            </button>
          ) : (
            <div className="maintenance-card reset-confirmation">
              <strong>
                Alle persönlichen App-Daten auf diesem Gerät löschen?
              </strong>
              <p>
                Eigene Rezepte und Bilder, Entwürfe, Wochenpläne,
                Einkaufslisten, Lebensmittel und Einstellungen werden endgültig
                entfernt. Danach startet Mampffred mit den vier
                Standardrezepten. Heruntergeladene Sicherungsdateien bleiben
                erhalten.
              </p>
              <button
                className="secondary-button"
                disabled={busy}
                onClick={onBackup}
              >
                <Download size={18} /> Vorher Sicherung erstellen
              </button>
              <label>
                Zur Bestätigung ZURÜCKSETZEN eingeben
                <input
                  value={confirmation}
                  disabled={busy}
                  onChange={(event) => setConfirmation(event.target.value)}
                  autoComplete="off"
                />
              </label>
              <button
                className="primary-button reset-confirm-button"
                disabled={busy || confirmation !== 'ZURÜCKSETZEN'}
                onClick={() => void run(onReset, '')}
              >
                Endgültig löschen & neu starten
              </button>
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() => {
                  setConfirmReset(false);
                  setConfirmation('');
                }}
              >
                Abbrechen
              </button>
            </div>
          )}
        </>
      )}
      {message && <output>{message}</output>}
    </section>
  );
}
