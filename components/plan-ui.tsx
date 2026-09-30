/* oxlint-disable react/refs */
import { Coffee, Leaf, Moon, Sparkles, Sun } from 'lucide-react';
import { useRef } from 'react';
import { addLocalDays } from '@/lib/local-date';
import type { MealSlot } from '@/lib/model';

export const slotShortLabel: Record<MealSlot, string> = {
  Frühstück: 'Frühstück',
  Mittagessen: 'Mittag',
  Abendessen: 'Abend',
};

export function MealSlotIcon({
  slot,
  size = 18,
}: {
  slot: MealSlot;
  size?: number;
}) {
  if (slot === 'Frühstück') return <Coffee size={size} aria-hidden="true" />;
  if (slot === 'Mittagessen') return <Sun size={size} aria-hidden="true" />;
  return <Moon size={size} aria-hidden="true" />;
}

export const longDate = new Intl.DateTimeFormat('de-DE', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});
export const shortDate = new Intl.DateTimeFormat('de-DE', {
  day: 'numeric',
  month: 'short',
});
export const weekdayShort = new Intl.DateTimeFormat('de-DE', {
  weekday: 'short',
});
export const monthShort = new Intl.DateTimeFormat('de-DE', { month: 'short' });
export const clockTime = new Intl.DateTimeFormat('de-DE', {
  hour: '2-digit',
  minute: '2-digit',
});

export const weekdayLabel = (date: Date) =>
  weekdayShort.format(date).replace('.', '');

export const portions = (count: number) =>
  `${count} ${count === 1 ? 'Portion' : 'Portionen'}`;

/** Adds horizontal swipe to a region without blocking vertical scrolling. */
export function useHorizontalSwipe(
  onSwipe: (direction: 'previous' | 'next') => void,
) {
  const startRef = useRef<{ x: number; y: number; time: number }>(undefined);
  const onSwipeRef = useRef(onSwipe);
  onSwipeRef.current = onSwipe;
  return {
    onTouchStart(event: React.TouchEvent) {
      const touch = event.touches[0];
      // Horizontal scrollers keep their own gesture.
      const target = event.target as HTMLElement;
      startRef.current =
        event.touches.length === 1 && !target.closest('[data-own-swipe]')
          ? { x: touch.clientX, y: touch.clientY, time: performance.now() }
          : undefined;
    },
    onTouchEnd(event: React.TouchEvent) {
      const start = startRef.current;
      startRef.current = undefined;
      if (!start) return;
      const touch = event.changedTouches[0];
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      const elapsed = performance.now() - start.time;
      if (Math.abs(dx) < 64 || Math.abs(dx) < Math.abs(dy) * 1.6) return;
      if (elapsed > 700) return;
      onSwipeRef.current(dx < 0 ? 'next' : 'previous');
    },
    onTouchCancel() {
      startRef.current = undefined;
    },
  };
}

/** ISO 8601 calendar week, as printed in German calendars. */
export function isoWeekNumber(date: Date) {
  const day = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  day.setUTCDate(day.getUTCDate() + 4 - (day.getUTCDay() || 7));
  const yearStart = Date.UTC(day.getUTCFullYear(), 0, 1);
  return Math.ceil(((day.getTime() - yearStart) / 86_400_000 + 1) / 7);
}

/** Leaf for plant-based tags, sparkle for the others (as on the filter chips). */
export function TagIcon({ tag, size = 14 }: { tag: string; size?: number }) {
  return tag === 'Vegetarisch' || tag === 'Vegan' ? (
    <Leaf size={size} aria-hidden="true" />
  ) : (
    <Sparkles size={size} aria-hidden="true" />
  );
}

/** "Diese Woche", "Nächste Woche", … relative to the running week. */
export function weekLabel(weekStart: string, currentWeek: string) {
  if (weekStart === currentWeek) return 'Diese Woche';
  if (weekStart > currentWeek)
    return weekStart === addLocalDays(currentWeek, 7)
      ? 'Nächste Woche'
      : 'Spätere Woche';
  return weekStart === addLocalDays(currentWeek, -7)
    ? 'Letzte Woche'
    : 'Frühere Woche';
}
