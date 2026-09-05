import { appTabs, type AppTab } from './navigation-motion.ts';

export type AppHistoryState = {
  mampffred: true;
  tab: AppTab;
};

export function createAppHistoryState(tab: AppTab): AppHistoryState {
  return { mampffred: true, tab };
}

export function appTabFromHistoryState(value: unknown): AppTab | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return undefined;
  const candidate = value as Record<string, unknown>;
  return candidate.mampffred === true &&
    typeof candidate.tab === 'string' &&
    appTabs.includes(candidate.tab as AppTab)
    ? (candidate.tab as AppTab)
    : undefined;
}
