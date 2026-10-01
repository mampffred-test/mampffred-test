import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  AppData,
  Recipe,
  RecipeIngredient,
  ShoppingItem,
} from '../lib/model.ts';
import {
  purchaseQuantity,
  reconcileWeekShopping,
  storedShoppingRange,
} from '../lib/week-shopping.ts';
import { catalogFoodById } from '../lib/food-catalog.ts';

const weekStart = '2026-08-31';

type Input = Pick<
  AppData,
  'recipes' | 'plan' | 'shopping' | 'pantry' | 'foodAliases'
>;

function recipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    id: 'recipe-a',
    shareId: 'share-a',
    name: 'Testgericht',
    description: '',
    minutes: 20,
    servings: 2,
    tags: [],
    ingredients: [],
    steps: [],
    imageCell: 0,
    ...overrides,
  };
}

function ingredients(...lines: Array<[string, string, string]>) {
  return lines.map(([amount, unit, name]): RecipeIngredient => ({
    amount,
    unit,
    name,
  }));
}

function input(recipes: Recipe[], shopping: ShoppingItem[] = []): Input {
  return {
    recipes,
    plan: [
      {
        date: weekStart,
        meals: [{ slot: 'Abendessen', recipeId: recipes[0].id, servings: 2 }],
      },
    ],
    shopping,
    pantry: {},
    foodAliases: {},
  };
}

/** Plans every recipe once at the given servings on consecutive days. */
function week(recipes: Recipe[], servings = 2): Input {
  return {
    ...input(recipes),
    plan: recipes.map((entry, index) => ({
      date: `2026-09-0${index + 1}`.replace('2026-09-00', '2026-08-31'),
      meals: [{ slot: 'Abendessen', recipeId: entry.id, servings }],
    })),
  };
}

function byName(result: { shopping: ShoppingItem[] }, name: string) {
  return result.shopping.find((item) => item.name === name);
}

const second = (overrides: Partial<Recipe>) =>
  recipe({ id: 'recipe-b', shareId: 'share-b', name: 'Zweites', ...overrides });

test('fasst dieselbe Zutat über Stück und Gramm zu einer Kaufmenge zusammen', () => {
  const result = reconcileWeekShopping(
    week([
      recipe({ ingredients: ingredients(['8', 'Stück', 'Cherrytomaten']) }),
      second({ ingredients: ingredients(['125', 'g', 'Cherrytomaten']) }),
    ]),
    weekStart,
  );
  const item = byName(result, 'Cherrytomaten');
  assert.equal(result.shopping.length, 1);
  assert.equal(item?.quantity, '1 Schale (250 g)');
  assert.equal(item?.detail, 'ca. 245 g für 2 Rezepte');
  assert.equal(item?.category, 'obst-gemuese');
  assert.equal(item?.foodId, 'cherrytomate');
});

test('rundet Stückware auf ganze Stück und zeigt den Bedarf', () => {
  const result = reconcileWeekShopping(
    week([
      recipe({ ingredients: ingredients(['0,5', 'Stück', 'Zucchini']) }),
      second({
        servings: 4,
        ingredients: ingredients(['1,5', 'Stück', 'Zucchini']),
      }),
    ]),
    weekStart,
  );
  const item = byName(result, 'Zucchini');
  assert.equal(item?.quantity, '2');
  assert.equal(item?.detail, '1¼ Stück für 2 Rezepte');
});

test('führt Namensvarianten und Notizen zu einem Lebensmittel zusammen', () => {
  const result = reconcileWeekShopping(
    week([
      recipe({
        ingredients: ingredients(
          ['1', 'Stück', 'Zwiebel'],
          ['200', 'g', 'Feta (eine Packung)'],
          ['2', 'Zehen', 'Knoblauch'],
        ),
      }),
      second({
        ingredients: ingredients(
          ['2', 'Stück', 'Zwiebeln'],
          ['1', 'Stück', 'kleine Zwiebel'],
          ['1', 'Stück', 'Rote Zwiebel'],
          ['200', 'g', 'Feta'],
          ['3', 'Stück', 'Knoblauchzehen'],
        ),
      }),
    ]),
    weekStart,
  );
  assert.equal(byName(result, 'Zwiebeln')?.quantity, '4');
  assert.equal(byName(result, 'Rote Zwiebel')?.quantity, '1');
  assert.equal(byName(result, 'Feta')?.quantity, '2 Packungen à 200 g');
  assert.equal(byName(result, 'Knoblauch')?.quantity, '1 Knolle');
  assert.equal(byName(result, 'Knoblauch')?.detail, '5 Zehen für 2 Rezepte');
  assert.equal(result.shopping.length, 4);
});

test('lässt Wasser weg, kennzeichnet Optionales und sortiert nach Laden', () => {
  const result = reconcileWeekShopping(
    input([
      recipe({
        ingredients: [
          { amount: '5', unit: 'EL', name: 'Wasser' },
          { amount: '75', unit: 'g', name: 'Optional: Mais' },
          { amount: '1', unit: 'EL', name: 'Pesto', optional: true },
          { amount: '400', unit: 'ml', name: 'Kokosmilch' },
          {
            amount: '400',
            unit: 'g',
            name: 'Gnocchi (ungekocht, aus dem Kühlregal)',
          },
          { amount: '2', unit: 'Stück', name: 'Zauberwurz' },
        ],
      }),
    ]),
    weekStart,
  );
  assert.equal(byName(result, 'Wasser'), undefined);
  assert.equal(byName(result, 'Mais')?.optional, true);
  assert.equal(byName(result, 'Pesto')?.optional, true);
  assert.equal(byName(result, 'Kokosmilch')?.category, 'konserven');
  assert.equal(byName(result, 'Kokosmilch')?.quantity, '1 Dose (400 ml)');
  assert.equal(byName(result, 'Gnocchi')?.category, 'kuehlregal');
  assert.equal(byName(result, 'Zauberwurz')?.category, 'sonstiges');
  assert.equal(byName(result, 'Zauberwurz')?.quantity, '2 Stück');
  assert.equal(result.preview.excludedIngredientCount, 1);
});

test('blendet Vorrat aus oder legt ihn in den Abschnitt „Vorrat prüfen“', () => {
  const data = input([
    recipe({
      ingredients: ingredients(
        ['', '', 'Salz und Pfeffer'],
        ['2', 'EL', 'Olivenöl'],
        ['50', 'ml', 'Olivenöl'],
      ),
    }),
  ]);
  data.pantry = { salz: 'always', pfeffer: 'check', olivenoel: 'check' };
  const result = reconcileWeekShopping(data, weekStart);
  assert.equal(byName(result, 'Salz'), undefined);
  assert.equal(byName(result, 'Pfeffer')?.pantryCheck, true);
  assert.equal(byName(result, 'Olivenöl')?.pantryCheck, true);
  assert.equal(byName(result, 'Olivenöl')?.detail, 'ca. 80 ml für Testgericht');
  assert.equal(result.preview.hiddenPantryCount, 1);
  assert.equal(result.preview.pantryCheckCount, 2);
});

test('nutzt Katalogbezug und gelernte Zuordnungen vor der Namenserkennung', () => {
  const data = input([
    recipe({
      ingredients: [
        { amount: '100', unit: 'g', name: 'Mein Spezialkäse' },
        {
          amount: '100',
          unit: 'g',
          name: 'Hirtenkäse vom Markt',
          foodLink: { kind: 'catalog', foodId: 'mf:feta' },
        },
      ],
    }),
  ]);
  data.foodAliases = { 'mein spezialkase': 'mf:feta' };
  const result = reconcileWeekShopping(data, weekStart);
  assert.equal(result.shopping.length, 1);
  assert.equal(byName(result, 'Feta')?.quantity, '1 Packung (200 g)');
});

test('berücksichtigt fixe Mengen und den gewählten Einkaufszeitraum', () => {
  const data = week(
    [
      recipe({
        servings: 4,
        ingredients: [
          { amount: '200', unit: 'g', name: 'Feta', scaleWithServings: false },
        ],
      }),
      second({ ingredients: ingredients(['1', 'Stück', 'Paprika']) }),
    ],
    2,
  );
  const all = reconcileWeekShopping(data, weekStart);
  assert.equal(byName(all, 'Feta')?.detail, '200 g für Testgericht');
  const later = reconcileWeekShopping(data, weekStart, { from: '2026-09-02' });
  assert.equal(byName(later, 'Feta'), undefined);
  assert.equal(byName(later, 'Paprika')?.quantity, '1');
  assert.equal(later.preview.plannedMealCount, 1);
});

test('summiert unbekannte Zutaten weiter nach Name und Einheit', () => {
  const result = reconcileWeekShopping(
    week([
      recipe({ ingredients: ingredients(['2', 'Stück', 'Zauberwurz']) }),
      second({
        ingredients: ingredients(
          ['1', 'Stück', 'Zauberwurz'],
          ['', '', 'Zauberwurz'],
        ),
      }),
    ]),
    weekStart,
  );
  assert.equal(result.shopping.length, 1);
  assert.equal(byName(result, 'Zauberwurz')?.quantity, '3 Stück');
});

test('berechnet kaufbare Mengen für Packungen, Stück und lose Ware', () => {
  const food = (id: string) => catalogFoodById(id)!;
  assert.equal(purchaseQuantity(food('feta'), 204).text, '1 Packung (200 g)');
  assert.equal(purchaseQuantity(food('feta'), 230).text, '2 Packungen à 200 g');
  assert.equal(
    purchaseQuantity(food('wraps'), 300).text,
    '1 Packung (6 Stück)',
  );
  assert.equal(purchaseQuantity(food('zwiebel'), 170).text, '2');
  assert.equal(purchaseQuantity(food('kartoffel'), 780).text, '800 g');
  assert.equal(purchaseQuantity(food('kartoffel'), 1240).text, '1,3 kg');
  assert.equal(purchaseQuantity(food('feta'), 230).leftoverGrams, 170);
});

test('liefert bei wiederholtem Abgleich denselben Zustand', () => {
  const data = input([
    recipe({ ingredients: ingredients(['200', 'g', 'Reis']) }),
  ]);
  const first = reconcileWeekShopping(data, weekStart);
  const again = reconcileWeekShopping(
    { ...data, shopping: first.shopping },
    weekStart,
  );
  assert.deepEqual(again.shopping, first.shopping);
  assert.equal(again.preview.addedItemCount, 0);
  assert.equal(again.preview.updatedItemCount, 0);
  assert.equal(again.preview.unchangedItemCount, 1);
});

test('erhält fremde Einträge sowie ID und Checkstatus passender Wochenartikel', () => {
  const data = input([
    recipe({ ingredients: ingredients(['2', 'Stück', 'Paprika']) }),
  ]);
  const initial = reconcileWeekShopping(data, weekStart);
  const generated = { ...initial.shopping[0], checked: true };
  const manual: ShoppingItem = {
    id: 'manual-1',
    name: 'Kaffee',
    category: 'getraenke',
    checked: false,
    origin: { kind: 'manual' },
  };
  const recipeItem: ShoppingItem = {
    id: 'recipe-1',
    name: 'Milch',
    category: 'kuehlregal',
    checked: true,
    origin: { kind: 'recipe', recipeId: 'other' },
  };
  const otherWeek: ShoppingItem = {
    id: 'other-week',
    name: '100 g Reis',
    category: 'trocken',
    checked: false,
    origin: {
      kind: 'week',
      weekStart: '2026-08-24',
      groupKey: 'reis',
      sources: [],
      fingerprint: 'number:100:g',
    },
  };
  const result = reconcileWeekShopping(
    { ...data, shopping: [manual, generated, recipeItem, otherWeek] },
    weekStart,
  );
  const reconciled = result.shopping.find((item) => item.id === generated.id);
  assert.equal(reconciled?.checked, true);
  assert.deepEqual(result.shopping.slice(0, 3), [
    manual,
    recipeItem,
    otherWeek,
  ]);
  assert.equal(result.preview.preservedCheckedCount, 1);
  assert.equal(result.preview.preservedOtherItemCount, 3);
});

test('aktualisiert Mengen mit Review-Hinweis und entfernt veraltete Gruppen', () => {
  const data = input([
    recipe({
      ingredients: ingredients(['100', 'g', 'Reis'], ['1', 'Stück', 'Paprika']),
    }),
  ]);
  const initial = reconcileWeekShopping(data, weekStart);
  const riceBefore = byName(initial, 'Reis')!;
  // Already bought: a larger need must be pointed out.
  const changed = input(
    [recipe({ ingredients: ingredients(['300', 'g', 'Reis']) })],
    initial.shopping.map((item) =>
      item.id === riceBefore.id ? { ...item, checked: true } : item,
    ),
  );
  changed.plan[0].meals[0].servings = 4;
  const result = reconcileWeekShopping(changed, weekStart);
  const riceAfter = byName(result, 'Reis')!;
  assert.equal(riceAfter.id, riceBefore.id);
  assert.equal(riceAfter.quantity, '2 Packungen à 500 g');
  assert.equal(riceAfter.needsReview, true);
  assert.equal(byName(result, 'Paprika'), undefined);
  assert.equal(result.preview.updatedItemCount, 1);
  assert.equal(result.preview.removedItemCount, 1);
  assert.equal(result.preview.reviewItemCount, 1);
});

test('meldet, wenn erzeugte Artikel die Speichergrenze überschreiten würden', () => {
  const manualItems: ShoppingItem[] = Array.from(
    { length: 9_999 },
    (_, index) => ({
      id: `manual-${index}`,
      name: `Artikel ${index}`,
      category: 'sonstiges',
      checked: false,
      origin: { kind: 'manual' },
    }),
  );
  const result = reconcileWeekShopping(
    input(
      [
        recipe({
          ingredients: ingredients(
            ['1', 'Stück', 'Apfel'],
            ['1', 'Stück', 'Birne'],
          ),
        }),
      ],
      manualItems,
    ),
    weekStart,
  );
  assert.equal(result.preview.overflowItemCount, 1);
});

test('entfernt veraltete Wochenartikel auch bei inzwischen leerem Plan', () => {
  const initialInput = input([
    recipe({ ingredients: ingredients(['1', 'Stück', 'Paprika']) }),
  ]);
  const initial = reconcileWeekShopping(initialInput, weekStart);
  const result = reconcileWeekShopping(
    { ...initialInput, plan: [], shopping: initial.shopping },
    weekStart,
  );
  assert.deepEqual(result.shopping, []);
  assert.equal(result.preview.removedItemCount, 1);
});

test('übernimmt Haken von Artikeln, die eine ältere App-Version erzeugt hat', () => {
  const data = input([
    recipe({
      ingredients: ingredients(
        ['950', 'g', 'Cherrytomaten'],
        ['400', 'g', 'Feta'],
        ['1', 'Stück', 'Paprika'],
      ),
    }),
  ]);
  const legacy = (
    id: string,
    name: string,
    checked: boolean,
  ): ShoppingItem => ({
    id,
    name,
    category: 'obst-gemuese',
    checked,
    origin: {
      kind: 'week',
      weekStart,
      groupKey: `number:${id}`,
      sources: [],
      fingerprint: `number:${id}`,
    },
  });
  data.shopping = [
    legacy('alt-1', '950 g Cherrytomaten', true),
    legacy('alt-2', '400 g Feta', true),
    legacy('alt-3', '200 g Feta (eine Packung)', false),
    legacy('alt-4', '1 Stück Paprika', false),
  ];
  const result = reconcileWeekShopping(data, weekStart);
  const tomatoes = byName(result, 'Cherrytomaten');
  assert.equal(tomatoes?.id, 'alt-1');
  assert.equal(tomatoes?.checked, true);
  assert.equal(byName(result, 'Feta')?.checked, false);
  assert.equal(byName(result, 'Paprika')?.id, 'alt-4');
  assert.equal(result.shopping.length, 3);
});

test('behält ungefähre und unbekannte Mengenangaben sichtbar', () => {
  const result = reconcileWeekShopping(
    week([
      recipe({
        ingredients: ingredients(
          ['ca. 200', 'g', 'Hackfleisch'],
          ['1', 'Ecke', 'Parmesan'],
          ['2 bis 3', 'EL', 'Ahornsirup'],
        ),
      }),
      second({ ingredients: ingredients(['100', 'g', 'Parmesan']) }),
    ]),
    weekStart,
  );
  assert.equal(byName(result, 'Hackfleisch')?.quantity, '1 Packung (500 g)');
  assert.equal(byName(result, 'Hackfleisch')?.detail, '200 g für Testgericht');
  assert.equal(
    byName(result, 'Parmesan')?.detail,
    '100 g + 1 Ecke für 2 Rezepte',
  );
  assert.match(byName(result, 'Ahornsirup')?.detail ?? '', /^2½ EL /);
});

test('meldet „Menge geändert“ nur bei geänderter Menge, nicht bei neuer Herkunft', () => {
  const first = recipe({ ingredients: ingredients(['200', 'g', 'Reis']) });
  const data = input([first]);
  const initial = reconcileWeekShopping(data, weekStart);
  const renamed = reconcileWeekShopping(
    {
      ...data,
      recipes: [{ ...first, name: 'Umbenannt' }],
      shopping: initial.shopping,
    },
    weekStart,
  );
  assert.equal(byName(renamed, 'Reis')?.needsReview, undefined);
});

test('führt ungefähre Treffer unter eigenem Namen statt sie zu verschmelzen', () => {
  const result = reconcileWeekShopping(
    week([
      recipe({ ingredients: ingredients(['1', 'Bund', 'Thai-Basilikum']) }),
      second({ ingredients: ingredients(['1', 'Bund', 'Basilikum']) }),
    ]),
    weekStart,
  );
  assert.equal(byName(result, 'Thai-Basilikum')?.category, 'obst-gemuese');
  assert.equal(byName(result, 'Thai-Basilikum')?.quantity, '1 Bund');
  assert.ok(byName(result, 'Basilikum'));
});

test('erkennt beim Update auch alte TK-Artikel und behält ihren Haken', () => {
  const data = input([
    recipe({
      ingredients: [
        {
          amount: '450',
          unit: 'g',
          name: 'TK-Spinat',
          foodLink: { kind: 'catalog', foodId: 'mf:spinat-tk' },
        },
      ],
    }),
  ]);
  data.shopping = [
    {
      id: 'alt-spinat',
      name: '450 g Junger Spinat, gehackt (TK)',
      category: 'obst-gemuese',
      checked: true,
      origin: {
        kind: 'week',
        weekStart,
        groupKey: 'number:alt',
        sources: [],
        fingerprint: 'number:alt',
      },
    },
  ];
  const result = reconcileWeekShopping(data, weekStart);
  assert.equal(result.shopping.length, 1);
  assert.equal(result.shopping[0].id, 'alt-spinat');
  assert.equal(result.shopping[0].checked, true);
});

test('merkt sich den Einkaufszeitraum für spätere Abgleiche', () => {
  const data = week([
    recipe({ ingredients: ingredients(['1', 'Stück', 'Paprika']) }),
    second({ ingredients: ingredients(['1', 'Stück', 'Zucchini']) }),
  ]);
  const result = reconcileWeekShopping(data, weekStart, { from: '2026-09-02' });
  const item = result.shopping[0];
  assert.equal(
    item.origin.kind === 'week' ? item.origin.from : undefined,
    '2026-09-02',
  );
  assert.deepEqual(storedShoppingRange(result.shopping, weekStart), {
    from: '2026-09-02',
  });
  assert.deepEqual(
    storedShoppingRange(result.shopping, '2026-09-07'),
    undefined,
  );
});

test('weist nur bei bereits gekauften Artikeln auf geänderte Mengen hin', () => {
  const data = input([
    recipe({ ingredients: ingredients(['100', 'g', 'Reis']) }),
  ]);
  const initial = reconcileWeekShopping(data, weekStart);
  const changed = input(
    [recipe({ ingredients: ingredients(['900', 'g', 'Reis']) })],
    initial.shopping,
  );
  const result = reconcileWeekShopping(changed, weekStart);
  assert.equal(byName(result, 'Reis')?.quantity, '2 Packungen à 500 g');
  assert.equal(byName(result, 'Reis')?.needsReview, undefined);
  assert.equal(result.preview.reviewItemCount, 0);
});
