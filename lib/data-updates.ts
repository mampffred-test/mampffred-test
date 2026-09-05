import { migrateAppData, type AppData } from './model.ts';

export const DATA_LIMITS = {
  recipes: 1_000,
  recipeDrafts: 100,
  customFoods: 1_000,
  shopping: 10_000,
  plan: 3_660,
} as const;

export function validateDataUpdate(
  current: AppData,
  update: AppData | ((current: AppData) => AppData),
) {
  const next = typeof update === 'function' ? update(current) : update;
  const labels = {
    recipes: 'Rezepte',
    recipeDrafts: 'Entwürfe',
    customFoods: 'eigene Lebensmittel',
    shopping: 'Einkaufsartikel',
    plan: 'geplante Tage',
  };
  for (const key of Object.keys(DATA_LIMITS) as Array<
    keyof typeof DATA_LIMITS
  >) {
    if (next[key].length > DATA_LIMITS[key])
      throw new Error(
        `Es sind höchstens ${DATA_LIMITS[key].toLocaleString('de-DE')} ${labels[key]} möglich. Bitte entferne zuerst einen Eintrag.`,
      );
  }
  return migrateAppData(next);
}

export function referencedImageKeys(data: AppData) {
  return new Set(
    [...data.recipes, ...data.recipeDrafts].flatMap((entry) =>
      entry.imageKey ? [entry.imageKey] : [],
    ),
  );
}
