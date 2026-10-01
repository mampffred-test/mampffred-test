/// <reference types="vite/client" />
/* oxlint-disable next/no-img-element -- Vite app, no next/image. */
import { useState } from 'react';
import {
  ChevronDown,
  CookingPot,
  Download,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { APP_VERSION, APP_BUILD_ID } from '../lib/app-version.ts';
import {
  standardRecipeCount,
  standardRecipeTotal,
} from '../lib/standard-recipes.ts';
import type { AppData } from '../lib/model.ts';
import type { UpdateStatus } from '../lib/app-updates.ts';
import { assetUrl } from './recipe-image';

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
  children,
}: {
  data: AppData;
  update: AppUpdateControls;
  onRepair: () => Promise<void>;
  onReset: () => Promise<void>;
  onBackup: () => void;
  mode: 'app' | 'privacy';
  /** Extra cards between the recipe and the privacy card. */
  children?: React.ReactNode;
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
    checking: 'Wird geprüft …',
    current: 'Aktuell',
    available: 'Neue Version bereit',
    offline: 'Offline – Prüfung folgt mit Internet',
    error: 'Prüfung fehlgeschlagen',
    development: 'Entwicklungsversion',
  };
  const standardCount = standardRecipeCount(data);
  const standardTotal = standardRecipeTotal();
  const missingStandards = Math.max(0, standardTotal - standardCount);
  return (
    <section className={`maintenance-section is-${mode}`}>
      {mode === 'app' ? (
        <>
          <div
            className={`maintenance-card app-hero-card ${update.status === 'available' ? 'has-app-update' : ''}`}
          >
            <div className="app-hero-head">
              <img
                src={assetUrl('assets/app-icon-192.png')}
                alt=""
                width="56"
                height="56"
              />
              <div>
                <strong>Mampffred</strong>
                <span className="app-version">Version {APP_VERSION}</span>
                <output className={`app-update-status is-${update.status}`}>
                  {labels[update.status]}
                  {update.checkedAt &&
                    update.status !== 'checking' &&
                    ` · ${update.checkedAt} Uhr`}
                </output>
              </div>
            </div>
            {update.status === 'available' ? (
              <button
                className="primary-button update-apply-button"
                disabled={busy}
                onClick={() => void run(update.apply, '')}
              >
                <Download size={20} aria-hidden="true" /> Jetzt aktualisieren
              </button>
            ) : (
              <button
                className="secondary-button"
                disabled={
                  busy ||
                  update.status === 'checking' ||
                  update.status === 'development'
                }
                onClick={() => void update.check()}
              >
                <RefreshCw
                  size={18}
                  aria-hidden="true"
                  className={update.status === 'checking' ? 'is-spinning' : ''}
                />{' '}
                Nach Updates suchen
              </button>
            )}
            <p>
              Wird beim Öffnen automatisch geprüft. Deine Rezepte bleiben
              erhalten.
            </p>
          </div>

          <div className="maintenance-card app-standards-card">
            <div className="app-card-row">
              <span className="mo-icon is-green" aria-hidden="true">
                <CookingPot size={20} />
              </span>
              <span>
                <strong>Standardrezepte</strong>
                <small>
                  {missingStandards
                    ? `${missingStandards} ${missingStandards === 1 ? 'fehlt' : 'fehlen'}`
                    : 'Alle vorhanden'}
                </small>
              </span>
              <b className="app-standards-count">
                {standardCount}
                <small>/{standardTotal}</small>
              </b>
            </div>
            <span className="app-standards-meter" aria-hidden="true">
              <i
                style={{
                  transform: `scaleX(${standardTotal ? standardCount / standardTotal : 0})`,
                }}
              />
            </span>
            <button
              className="secondary-button"
              disabled={busy}
              onClick={() => void run(onRepair, '')}
            >
              <RefreshCw size={18} aria-hidden="true" />{' '}
              {missingStandards
                ? 'Fehlende wiederherstellen'
                : 'Prüfen & reparieren'}
            </button>
          </div>

          {children}

          <div className="maintenance-card app-privacy-card">
            <div className="app-card-row">
              <span className="mo-icon is-slate" aria-hidden="true">
                <ShieldCheck size={20} />
              </span>
              <span>
                <strong>Privat & lokal</strong>
                <small>
                  Keine Anmeldung, kein App-Server. Rezepte, Pläne und Bilder
                  bleiben auf deinem Gerät. Mampffred fragt nie nach Bank- oder
                  Kontopasswörtern.
                </small>
              </span>
            </div>
          </div>

          <details className="app-tech-details">
            <summary>
              Technische Details
              <ChevronDown size={16} aria-hidden="true" />
            </summary>
            <dl>
              <dt>Adresse</dt>
              <dd className="installation-address">
                {window.location.origin}
                {import.meta.env.BASE_URL}
              </dd>
              <dt>Build</dt>
              <dd>{APP_BUILD_ID}</dd>
            </dl>
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
                entfernt. Danach startet Mampffred mit den Standardrezepten.
                Heruntergeladene Sicherungsdateien bleiben erhalten.
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
      {mode === 'privacy' && message && <output>{message}</output>}
    </section>
  );
}
