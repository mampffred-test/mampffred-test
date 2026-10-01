import type { AppData, Recipe } from './model.ts';
import { additionalStandardRecipes } from './standard-recipe-catalog.ts';
import { upgradeStandardRecipeIngredients } from './standard-recipe-upgrade.ts';

export function restoreStandardRecipes(data: AppData): AppData {
  const packs = new Set([
    STANDARD_RECIPE_PACK,
    ...additionalStandardRecipes.map((entry) => entry.pack),
  ]);
  return installStandardRecipes({
    ...data,
    installedSamplePacks: data.installedSamplePacks.filter(
      (pack) => !packs.has(pack),
    ),
  });
}

/** How many standard recipes Mampffred ships with. */
export function standardRecipeTotal(): number {
  return 1 + additionalStandardRecipes.length;
}

export function standardRecipeCount(data: AppData): number {
  const recipes = [
    { recipe: createCannelloniRecipe(), aliases: [] as string[] },
    ...additionalStandardRecipes,
  ];
  return recipes.filter(({ recipe, aliases }) =>
    data.recipes.some(
      (entry) =>
        entry.id === recipe.id ||
        entry.shareId === recipe.shareId ||
        aliases.includes(entry.shareId),
    ),
  ).length;
}

export const STANDARD_RECIPE_PACK = 'mampffred-cannelloni-v1';
export const CANNELLONI_IMAGE_KEY = 'standard-cannelloni-image-v1';
export const STANDARD_IMAGE_UPDATE_PACK = 'mampffred-handover-images-v1';

/** One-time image addition for the previously image-free handover recipes. */
function installHandoverImages(data: AppData): AppData {
  if (data.installedSamplePacks.includes(STANDARD_IMAGE_UPDATE_PACK))
    return data;
  if (data.installedSamplePacks.length >= 100) return data;
  const handover = additionalStandardRecipes.slice(3);
  if (!handover.some(({ pack }) => data.installedSamplePacks.includes(pack)))
    return data;
  const recipes = data.recipes.map((existing) => {
    if (existing.imageKey) return existing;
    const standard = handover.find(
      ({ recipe, aliases }) =>
        existing.id === recipe.id ||
        existing.shareId === recipe.shareId ||
        aliases.includes(existing.shareId),
    );
    if (!standard?.recipe.imageKey) return existing;
    const { imageFrame: _oldFrame, ...recipe } = existing;
    return { ...recipe, imageKey: standard.recipe.imageKey };
  });
  return {
    ...data,
    recipes,
    installedSamplePacks: [
      ...data.installedSamplePacks,
      STANDARD_IMAGE_UPDATE_PACK,
    ],
  };
}

export function createCannelloniRecipe(): Recipe {
  return {
    id: 'standard-cannelloni-v1',
    shareId: 'sample-v1:cannelloni',
    name: 'Cannelloni mit Spinat, Zucchini und Frischkäse',
    description:
      'Cremig gefüllte Cannelloni in milder Tomaten-Hafer-Sauce, goldbraun mit Mozzarella überbacken. Ergibt vier Portionen – zum Beispiel für zwei Personen an zwei Tagen.',
    minutes: 55,
    servings: 4,
    tags: ['Vegetarisch'],
    imageCell: 4,
    ingredients: [
      {
        amount: '250',
        unit: 'g',
        name: 'Cannelloni',
        foodLink: { kind: 'catalog', foodId: 'mf:cannelloni' },
      },
      {
        amount: '200',
        unit: 'g',
        name: 'Frischkäse',
        foodLink: { kind: 'catalog', foodId: 'mf:frischkaese' },
      },
      {
        amount: '450',
        unit: 'g',
        name: 'TK-Spinat',
        note: 'junger Spinat, gehackt',
        foodLink: { kind: 'catalog', foodId: 'mf:spinat-tk' },
      },
      {
        amount: '1',
        unit: 'Stück',
        name: 'Zucchini',
        note: 'klein, alternativ ½ mittelgroße',
        foodLink: { kind: 'catalog', foodId: 'mf:zucchini' },
      },
      {
        amount: '1',
        unit: 'Stück',
        name: 'Rote Zwiebel',
        foodLink: { kind: 'catalog', foodId: 'mf:rote-zwiebel' },
      },
      {
        amount: '2',
        unit: 'Zehen',
        name: 'Knoblauch',
        foodLink: { kind: 'catalog', foodId: 'mf:knoblauch' },
      },
      {
        amount: '2',
        unit: 'Dosen',
        name: 'Gehackte Tomaten',
        foodLink: { kind: 'catalog', foodId: 'mf:gehackte-tomaten' },
      },
      {
        amount: '200',
        unit: 'ml',
        name: 'Hafercuisine',
        foodLink: { kind: 'catalog', foodId: 'mf:hafer-cuisine' },
      },
      {
        amount: '250',
        unit: 'g',
        name: 'Geriebener Mozzarella',
        foodLink: { kind: 'catalog', foodId: 'mf:mozzarella-gerieben' },
      },
      {
        amount: '',
        unit: '',
        name: 'Bratöl',
        note: 'zum Dünsten und Einfetten',
        foodLink: { kind: 'catalog', foodId: 'mf:oel' },
      },
      {
        amount: '',
        unit: '',
        name: 'Salz, Pfeffer und Gewürze nach Wahl',
      },
    ],
    steps: [
      'Den Backofen auf 200 °C Ober-/Unterhitze vorheizen. Eine Auflaufform dünn mit Bratöl einfetten. Zwiebel und Knoblauch schälen und fein hacken. Die Zucchini waschen und sehr fein würfeln oder hacken.',
      'Etwas Bratöl in einem Topf erhitzen. Die Zwiebel bei mittlerer Hitze glasig dünsten, ohne sie bräunen zu lassen. Knoblauch und gehackte Tomaten gleichzeitig dazugeben und kurz köcheln lassen. Hafercuisine einrühren und die Sauce mit Salz, Pfeffer und Gewürzen nach Wahl abschmecken.',
      'Den TK-Spinat nach Packungsangabe kurz garen. In ein Sieb geben und mit einem Löffel gründlich ausdrücken, damit die Füllung nicht zu feucht wird.',
      'Spinat, Frischkäse und Zucchini in einem Topf gründlich zu einer cremigen Füllung vermischen. Mit Salz, Pfeffer und Gewürzen nach Wahl abschmecken. Vor dem Befüllen so weit abkühlen lassen, dass sich die Masse gut anfassen lässt.',
      'Die ungekochten Cannelloni mit sauberen Händen mit der Spinat-Zucchini-Masse befüllen und in die vorbereitete Auflaufform legen. Einen Teil des Mozzarellas zwischen den Cannelloni verteilen.',
      'Die Tomatensauce gleichmäßig darübergießen, sodass die Cannelloni vollständig mit Sauce bedeckt sind. Den übrigen Mozzarella darüberstreuen.',
      'Auf mittlerer Schiene etwa 25–30 Minuten backen, bis die Cannelloni weich sind und der Käse goldbraun ist. Bei Bedarf etwas länger garen; die Garzeit kann je nach Nudelsorte abweichen. Vor dem Servieren kurz ruhen lassen.',
    ],
    imageKey: 'standard-cannelloni-image-v1',
  };
}

/** Install once. A deleted or individually edited standard recipe stays that way. */
export function installStandardRecipe(data: AppData): AppData {
  if (data.installedSamplePacks.includes(STANDARD_RECIPE_PACK)) return data;
  if (data.installedSamplePacks.length >= 100) return data;
  const recipe = createCannelloniRecipe();
  const exists = data.recipes.some(
    (entry) => entry.id === recipe.id || entry.shareId === recipe.shareId,
  );
  if (!exists && data.recipes.length >= 1_000) return data;
  return {
    ...data,
    recipes: exists ? data.recipes : [...data.recipes, recipe],
    installedSamplePacks: [...data.installedSamplePacks, STANDARD_RECIPE_PACK],
  };
}

/** Each recipe has its own marker, including recipes found through prior imports. */
export function installStandardRecipes(data: AppData): AppData {
  let next = installStandardRecipe(data);
  for (const { pack, recipe, aliases } of additionalStandardRecipes) {
    if (next.installedSamplePacks.includes(pack)) continue;
    if (next.installedSamplePacks.length >= 100) break;
    const exists = next.recipes.some(
      (entry) =>
        entry.id === recipe.id ||
        entry.shareId === recipe.shareId ||
        aliases.includes(entry.shareId),
    );
    if (!exists && next.recipes.length >= 1_000) continue;
    next = {
      ...next,
      recipes: exists
        ? next.recipes
        : [...next.recipes, structuredClone(recipe)],
      installedSamplePacks: [...next.installedSamplePacks, pack],
    };
  }
  next = installHandoverImages(next);
  next = upgradeStandardRecipeIngredients(next);
  // Replace only our earlier photograph; custom and removed photos stay intact.
  const previousImage =
    'standard-vegetarisches-huehnerfrikassee-mit-kraeuterseitlingen-image-v1';
  if (!next.recipes.some((recipe) => recipe.imageKey === previousImage))
    return next;
  return {
    ...next,
    recipes: next.recipes.map((recipe) =>
      recipe.imageKey === previousImage
        ? {
            ...recipe,
            imageKey:
              'standard-vegetarisches-huehnerfrikassee-mit-kraeuterseitlingen-image-v2',
          }
        : recipe,
    ),
  };
}

export function newStandardImageKeys(
  current: AppData,
  next: AppData,
): string[] {
  const existing = new Map(
    current.recipes.map((recipe) => [recipe.id, recipe.imageKey]),
  );
  return next.recipes.flatMap((recipe) =>
    recipe.imageKey && existing.get(recipe.id) !== recipe.imageKey
      ? [recipe.imageKey]
      : [],
  );
}
