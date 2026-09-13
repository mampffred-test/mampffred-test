import type { AppData, Recipe } from './model.ts';

export const STANDARD_RECIPE_PACK = 'mampffred-cannelloni-v1';
export const CANNELLONI_IMAGE_KEY = 'standard-cannelloni-image-v1';

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
      },
      {
        amount: '200',
        unit: 'g',
        name: 'Frischkäse',
      },
      {
        amount: '450',
        unit: 'g',
        name: 'Junger Spinat, gehackt (TK)',
      },
      {
        amount: '1',
        unit: 'Stück',
        name: 'Kleine Zucchini (alternativ ½ mittelgroße)',
      },
      {
        amount: '1',
        unit: 'Stück',
        name: 'Rote Zwiebel',
      },
      {
        amount: '2',
        unit: 'Zehen',
        name: 'Knoblauch',
      },
      {
        amount: '2',
        unit: 'Dosen',
        name: 'Gehackte Tomaten',
      },
      {
        amount: '200',
        unit: 'ml',
        name: 'Hafercuisine',
      },
      {
        amount: '250',
        unit: 'g',
        name: 'Geriebener Mozzarella',
      },
      {
        amount: '',
        unit: '',
        name: 'Bratöl zum Dünsten und Einfetten',
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
