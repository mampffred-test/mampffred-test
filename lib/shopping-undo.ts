import type { ShoppingItem } from './model.ts';

export type RemovedShoppingItem = { item: ShoppingItem; index: number };

export function removeShoppingItems(
  current: readonly ShoppingItem[],
  ids: ReadonlySet<string>,
) {
  const removed: RemovedShoppingItem[] = [];
  const next = current.filter((item, index) => {
    if (!ids.has(item.id)) return true;
    removed.push({ item, index });
    return false;
  });
  return { next, removed };
}

export function restoreShoppingItems(
  current: readonly ShoppingItem[],
  removed: readonly RemovedShoppingItem[],
) {
  const next = [...current];
  const knownIds = new Set(next.map((item) => item.id));
  for (const entry of [...removed].sort(
    (left, right) => left.index - right.index,
  )) {
    if (knownIds.has(entry.item.id)) continue;
    next.splice(Math.min(Math.max(entry.index, 0), next.length), 0, entry.item);
    knownIds.add(entry.item.id);
  }
  return next;
}
