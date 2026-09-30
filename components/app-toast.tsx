import { Check, CircleAlert, Undo2, X } from 'lucide-react';
import { useRef } from 'react';

const DISMISS_DISTANCE = 72;

/**
 * Horizontal swipe dismisses the toast, like native notifications. Vertical
 * movement is left to the page; a tap keeps working on the buttons.
 */
function useSwipeToDismiss(onDismiss: () => void, disabled: boolean) {
  const gesture = useRef<
    | { id: number; x: number; y: number; time: number; active: boolean }
    | undefined
  >(undefined);
  const setOffset = (element: HTMLElement, offset: number) => {
    element.style.setProperty('--toast-x', `${offset}px`);
    element.style.setProperty(
      '--toast-fade',
      String(Math.max(0, 1 - Math.abs(offset) / 220)),
    );
  };
  return {
    onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
      if (disabled || (event.target as HTMLElement).closest('button')) return;
      gesture.current = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        time: performance.now(),
        active: false,
      };
    },
    onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
      const current = gesture.current;
      if (!current || current.id !== event.pointerId) return;
      const dx = event.clientX - current.x;
      const dy = event.clientY - current.y;
      if (!current.active) {
        if (Math.abs(dx) < 6 || Math.abs(dx) < Math.abs(dy)) return;
        current.active = true;
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // Capture is a nicety; the gesture still works without it.
        }
        event.currentTarget.classList.add('is-dragging');
      }
      setOffset(event.currentTarget, dx);
    },
    onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
      const current = gesture.current;
      gesture.current = undefined;
      if (!current?.active) return;
      const element = event.currentTarget;
      const dx = event.clientX - current.x;
      const velocity = dx / Math.max(1, performance.now() - current.time);
      element.classList.remove('is-dragging');
      if (Math.abs(dx) > DISMISS_DISTANCE || Math.abs(velocity) > 0.6) {
        element.classList.add('is-leaving');
        setOffset(element, Math.sign(dx || 1) * (element.offsetWidth + 40));
        window.setTimeout(onDismiss, 180);
      } else setOffset(element, 0);
    },
    onPointerCancel(event: React.PointerEvent<HTMLDivElement>) {
      gesture.current = undefined;
      event.currentTarget.classList.remove('is-dragging');
      setOffset(event.currentTarget, 0);
    },
  };
}

export function AppToast({
  message,
  detail,
  tone = 'success',
  onUndo,
  onDismiss,
  busy = false,
  duration,
}: {
  message: string;
  detail?: string;
  tone?: 'success' | 'error';
  onUndo?: () => void;
  onDismiss: () => void;
  busy?: boolean;
  /** Shows the remaining time as a thin bar, in milliseconds. */
  duration?: number;
}) {
  const swipe = useSwipeToDismiss(onDismiss, busy);
  return (
    <div className={`toast ${tone} ${onUndo ? 'has-undo' : ''}`} {...swipe}>
      <span className="toast-symbol" aria-hidden="true">
        {tone === 'error' ? <CircleAlert size={19} /> : <Check size={19} />}
      </span>
      <output className="toast-copy" aria-live="polite">
        <strong>{message}</strong>
        {detail && <small>{detail}</small>}
      </output>
      {onUndo ? (
        <button
          type="button"
          className="toast-undo"
          disabled={busy}
          onClick={onUndo}
        >
          <Undo2 size={16} aria-hidden="true" />
          {busy ? 'Speichert …' : 'Rückgängig'}
        </button>
      ) : (
        <button
          type="button"
          className="toast-dismiss"
          disabled={busy}
          onClick={onDismiss}
          aria-label="Hinweis schließen"
        >
          <X size={18} />
        </button>
      )}
      {duration && !busy && (
        <span
          className="toast-timer"
          aria-hidden="true"
          style={{ animationDuration: `${duration}ms` }}
        />
      )}
    </div>
  );
}
