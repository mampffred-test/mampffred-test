/* oxlint-disable react/refs */
import { useCallback, useEffect, useRef, useState } from 'react';
import { rubberBand, shouldDismissDraggedSheet } from '@/lib/sheet-gesture';

const modalStack: HTMLElement[] = [];

export function useModalFocus<T extends HTMLElement>(
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
      ).filter(
        (element) =>
          !element.closest('[hidden], [inert]') &&
          element.getClientRects().length > 0,
      );
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

type SheetDrag = {
  startX: number;
  startY: number;
  mode: 'pending' | 'drag' | 'ignore';
  /** Height when the gesture began, and the resting ("normal") height. */
  startHeight: number;
  mediumHeight: number;
  largeHeight: number;
  canGrow: boolean;
  height: number;
  offset: number;
  samples: Array<{ y: number; time: number }>;
};

const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// Gap above an expanded sheet, so the page behind stays recognisable.
const EXPANDED_TOP_GAP = 16;

/**
 * Native bottom-sheet behaviour with two detents. Drag the handle, the header
 * or the content (while scrolled to the top): upwards the sheet grows to
 * almost full height, downwards it shrinks back and, below its normal height,
 * slides away to close. Release snaps to the nearest detent, taking the flick
 * speed into account. Spread the result onto the sheet handle.
 */
export function useSheetSwipeToClose(onClose: () => void) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const cleanupRef = useRef<(() => void) | undefined>(undefined);

  const ref = useCallback((handle: HTMLDivElement | null) => {
    cleanupRef.current?.();
    cleanupRef.current = undefined;
    const sheet = handle?.closest<HTMLElement>('.swipe-sheet');
    if (!handle || !sheet) return;
    const backdrop = sheet.parentElement;
    let drag: SheetDrag | undefined;
    let timer: number | undefined;

    const viewportHeight = () =>
      window.visualViewport?.height ?? window.innerHeight;
    const setOffset = (offset: number, reference: number) => {
      sheet.style.setProperty('--sheet-drag', `${offset}px`);
      backdrop?.style.setProperty(
        '--sheet-dim',
        String(1 - Math.min(1, Math.max(0, offset) / reference)),
      );
    };
    const setHeight = (height: number) => {
      sheet.style.height = `${height}px`;
      sheet.style.maxHeight = 'none';
    };
    const clearInline = () => {
      sheet.style.removeProperty('--sheet-drag');
      sheet.style.removeProperty('height');
      sheet.style.removeProperty('max-height');
      backdrop?.style.removeProperty('--sheet-dim');
    };
    const finish = (
      target: 'close' | 'medium' | 'large',
      current: SheetDrag,
    ) => {
      sheet.classList.remove('sheet-dragging');
      if (target === 'close' && prefersReducedMotion()) {
        onCloseRef.current();
        return;
      }
      sheet.classList.add('sheet-snapping');
      backdrop?.classList.add('sheet-backdrop-settling');
      if (target === 'close') {
        setOffset(current.height + 40, current.height);
      } else {
        setOffset(0, current.height);
        setHeight(
          target === 'large' ? current.largeHeight : current.mediumHeight,
        );
      }
      window.clearTimeout(timer);
      timer = window.setTimeout(
        () => {
          sheet.classList.remove('sheet-snapping');
          backdrop?.classList.remove('sheet-backdrop-settling');
          if (target === 'close') {
            onCloseRef.current();
            return;
          }
          sheet.classList.toggle('is-expanded', target === 'large');
          clearInline();
        },
        target === 'close' ? 240 : 300,
      );
    };
    const start = (x: number, y: number, target: EventTarget | null) => {
      const element = target as HTMLElement | null;
      // Horizontal scrollers and text fields keep their own gestures.
      if (element?.closest('[data-own-swipe], .filter-row, input, textarea'))
        return;
      window.clearTimeout(timer);
      sheet.classList.remove('sheet-snapping');
      const expanded = sheet.classList.contains('is-expanded');
      const largeHeight = Math.round(viewportHeight() - EXPANDED_TOP_GAP);
      const startHeight = sheet.offsetHeight;
      if (!expanded) sheet.dataset.mediumHeight = String(startHeight);
      const mediumHeight = Math.min(
        Number(sheet.dataset.mediumHeight) || startHeight,
        startHeight,
      );
      drag = {
        startX: x,
        startY: y,
        mode:
          handle.contains(element) || element?.closest('.modal-header')
            ? 'drag'
            : 'pending',
        startHeight,
        mediumHeight,
        largeHeight,
        // Only sheets with more content than fits are worth enlarging.
        canGrow:
          expanded ||
          (sheet.scrollHeight > sheet.clientHeight + 4 &&
            largeHeight > startHeight + 24),
        height: startHeight,
        offset: 0,
        samples: [{ y, time: performance.now() }],
      };
    };
    /** Returns true when the sheet consumed the movement. */
    const move = (x: number, y: number) => {
      if (!drag || drag.mode === 'ignore') return false;
      const dx = x - drag.startX;
      const dy = y - drag.startY;
      if (drag.mode === 'pending') {
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 4) {
          drag.mode = 'ignore';
          return false;
        }
        // From the content, only a downward pull at the very top drags.
        if (dy <= 0 || sheet.scrollTop > 0) {
          if (Math.abs(dy) > 4) drag.mode = 'ignore';
          return false;
        }
        drag.mode = 'drag';
      }
      if (!sheet.classList.contains('sheet-dragging'))
        sheet.classList.add('sheet-dragging');
      const wanted = drag.startHeight - dy;
      if (drag.canGrow && wanted >= drag.mediumHeight) {
        // Between the detents the height follows the finger.
        const overshoot = wanted - drag.largeHeight;
        drag.height =
          overshoot > 0
            ? drag.largeHeight - rubberBand(-overshoot)
            : Math.round(wanted);
        drag.offset = 0;
        setHeight(drag.height);
        setOffset(0, drag.height);
      } else {
        drag.height = drag.canGrow ? drag.mediumHeight : drag.startHeight;
        if (drag.canGrow) setHeight(drag.height);
        drag.offset = rubberBand(Math.round(drag.height - wanted));
        setOffset(drag.offset, drag.height);
      }
      const time = performance.now();
      drag.samples = [
        ...drag.samples.filter((sample) => time - sample.time < 100),
        { y, time },
      ];
      return true;
    };
    const end = (cancelled = false) => {
      const current = drag;
      drag = undefined;
      if (!current || current.mode !== 'drag') return;
      const first = current.samples[0];
      const last = current.samples.at(-1)!;
      const velocity = (last.y - first.y) / Math.max(1, last.time - first.time);
      if (cancelled) {
        finish(
          sheet.classList.contains('is-expanded') ? 'large' : 'medium',
          current,
        );
        return;
      }
      if (current.offset > 0) {
        // A flick moves one detent at a time: large → normal, normal → closed.
        const startedLarge = current.startHeight > current.mediumHeight + 24;
        finish(
          shouldDismissDraggedSheet({
            distance: current.offset,
            releaseVelocity: startedLarge ? 0 : velocity,
            sheetHeight: current.height,
          })
            ? 'close'
            : 'medium',
          current,
        );
        return;
      }
      if (!current.canGrow) {
        finish('medium', current);
        return;
      }
      const midpoint = (current.mediumHeight + current.largeHeight) / 2;
      finish(
        velocity < -0.35
          ? 'large'
          : velocity > 0.35
            ? 'medium'
            : current.height > midpoint
              ? 'large'
              : 'medium',
        current,
      );
    };

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) {
        end(true);
        return;
      }
      const touch = event.touches[0];
      start(touch.clientX, touch.clientY, event.target);
    };
    const onTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (touch && move(touch.clientX, touch.clientY) && event.cancelable)
        event.preventDefault();
    };
    const onTouchEnd = () => end();
    const onTouchCancel = () => end(true);
    // Mouse and pen drag from the handle or the header, like on desktop.
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'touch' || event.button !== 0) return;
      const element = event.target as HTMLElement;
      const onGrip =
        handle.contains(element) ||
        (element.closest('.modal-header') &&
          !element.closest('button, a, input, select, textarea'));
      if (!onGrip) return;
      start(event.clientX, event.clientY, element);
      try {
        sheet.setPointerCapture(event.pointerId);
      } catch {
        // Capture only keeps the drag alive outside the sheet.
      }
    };
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType !== 'touch' && move(event.clientX, event.clientY))
        event.preventDefault();
    };
    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') end(event.type === 'pointercancel');
    };

    sheet.addEventListener('touchstart', onTouchStart, { passive: true });
    sheet.addEventListener('touchmove', onTouchMove, { passive: false });
    sheet.addEventListener('touchend', onTouchEnd);
    sheet.addEventListener('touchcancel', onTouchCancel);
    sheet.addEventListener('pointerdown', onPointerDown);
    sheet.addEventListener('pointermove', onPointerMove);
    sheet.addEventListener('pointerup', onPointerUp);
    sheet.addEventListener('pointercancel', onPointerUp);
    cleanupRef.current = () => {
      window.clearTimeout(timer);
      sheet.removeEventListener('touchstart', onTouchStart);
      sheet.removeEventListener('touchmove', onTouchMove);
      sheet.removeEventListener('touchend', onTouchEnd);
      sheet.removeEventListener('touchcancel', onTouchCancel);
      sheet.removeEventListener('pointerdown', onPointerDown);
      sheet.removeEventListener('pointermove', onPointerMove);
      sheet.removeEventListener('pointerup', onPointerUp);
      sheet.removeEventListener('pointercancel', onPointerUp);
    };
  }, []);

  useEffect(() => () => cleanupRef.current?.(), []);
  return { ref };
}

export function useAnimatedSheetClose(onClose: () => void) {
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
