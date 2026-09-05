export const appTabs = [
  'today',
  'week',
  'recipes',
  'shopping',
  'more',
] as const;

export type AppTab = (typeof appTabs)[number];
export type TabTransitionDirection = 'forward' | 'backward' | 'none';

export function tabTransitionDirection(
  current: AppTab,
  next: AppTab,
): TabTransitionDirection {
  const currentIndex = appTabs.indexOf(current);
  const nextIndex = appTabs.indexOf(next);
  if (currentIndex === nextIndex) return 'none';
  return nextIndex > currentIndex ? 'forward' : 'backward';
}
