import { Check, CircleAlert, Undo2, X } from 'lucide-react';

export function AppToast({
  message,
  detail,
  tone = 'success',
  onUndo,
  onDismiss,
  busy = false,
}: {
  message: string;
  detail?: string;
  tone?: 'success' | 'error';
  onUndo?: () => void;
  onDismiss: () => void;
  busy?: boolean;
}) {
  return (
    <div className={`toast ${tone}`}>
      <span className="toast-symbol" aria-hidden="true">
        {tone === 'error' ? <CircleAlert size={20} /> : <Check size={20} />}
      </span>
      <output className="toast-copy" aria-live="polite">
        <strong>{message}</strong>
        {detail && <small>{detail}</small>}
      </output>
      <button
        type="button"
        className="toast-dismiss"
        disabled={busy}
        onClick={onDismiss}
        aria-label={
          onUndo
            ? 'Hinweis schließen und Rückgängig-Möglichkeit beenden'
            : 'Hinweis schließen'
        }
      >
        <X size={20} />
      </button>
      {onUndo && (
        <button
          type="button"
          className="toast-undo"
          disabled={busy}
          onClick={onUndo}
        >
          <Undo2 size={17} /> {busy ? 'Wird gespeichert …' : 'Rückgängig'}
        </button>
      )}
    </div>
  );
}
