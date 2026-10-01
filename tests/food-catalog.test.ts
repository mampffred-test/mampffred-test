import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  AISLES,
  CATALOG_PANTRY_PRESET,
  catalogFoodById,
  catalogFoodReferences,
  catalogFoods,
  foodGrams,
  matchCatalogFood,
  matchCatalogFoods,
  matchCatalogFoodsDetailed,
  searchCatalogFoods,
} from '../lib/food-catalog.ts';
import catalogNutrients from '../lib/data/food-catalog-nutrients.json' with { type: 'json' };
import { isUnitKey } from '../lib/units.ts';

const bls = JSON.parse(
  readFileSync(
    new URL('../lib/data/bls-4.0.min.json', import.meta.url),
    'utf8',
  ),
) as { foods: Array<[string, string, ...Array<number | null>]> };
const blsByCode = new Map(bls.foods.map((row) => [row[0], row]));

test('jeder Katalogeintrag ist vollständig und eindeutig', () => {
  const ids = new Set<string>();
  const names = new Map<string, string>();
  const aisleIds = new Set(AISLES.map((aisle) => aisle.id));
  assert.ok(catalogFoods.length >= 200, 'mindestens 200 Lebensmittel');
  for (const food of catalogFoods) {
    assert.match(food.id, /^[a-z0-9-]+$/, food.id);
    assert.ok(!ids.has(food.id), `doppelte ID ${food.id}`);
    ids.add(food.id);
    assert.ok(food.name.trim(), food.id);
    assert.ok(aisleIds.has(food.aisle), `${food.id}: Kategorie ${food.aisle}`);
    for (const unit of Object.keys(food.g ?? {}))
      assert.ok(isUnitKey(unit), `${food.id}: Einheit ${unit}`);
    for (const value of Object.values(food.g ?? {}))
      assert.ok(value > 0 && value < 5_000, food.id);
    if (food.nutrition !== false)
      assert.ok(food.bls, `${food.id} braucht einen BLS-Code`);
    if (typeof food.sell === 'object') {
      assert.ok(isUnitKey(food.sell.unit), food.id);
      assert.ok(
        food.sell.g || food.sell.ml || (food.sell.pieces && food.g?.stueck),
        `${food.id}: Packungsgröße fehlt`,
      );
    }
    if (food.sell === 'piece')
      assert.ok(food.g?.stueck, `${food.id}: Stückgewicht fehlt`);
  }
  // Synonyme dürfen nicht auf zwei verschiedene Lebensmittel zeigen.
  for (const food of catalogFoods)
    for (const label of [food.name, food.plural, ...(food.syn ?? [])]) {
      if (!label) continue;
      const key = label.toLocaleLowerCase('de-DE');
      const owner = names.get(key);
      assert.ok(
        !owner || owner === food.id,
        `"${label}": ${owner} und ${food.id}`,
      );
      names.set(key, food.id);
    }
});

test('Nährwerte stammen unverändert aus dem eingebetteten BLS 4.0', () => {
  const used = new Set(
    catalogFoods.flatMap((food) => (food.bls ? [food.bls] : [])),
  );
  const embedded = catalogNutrients as Record<string, Array<number | null>>;
  assert.deepEqual(new Set(Object.keys(embedded)), used);
  for (const code of used) {
    const row = blsByCode.get(code);
    assert.ok(row, `BLS-Code ${code} existiert nicht`);
    assert.deepEqual(embedded[code], row.slice(2), code);
  }
});

test('Katalog-Lebensmittel lassen sich als Nährwertquelle verwenden', () => {
  const references = catalogFoodReferences();
  const onion = references.find((food) => food.id === 'mf:zwiebel');
  assert.ok(onion);
  assert.equal(onion.name, 'Zwiebel');
  assert.equal(onion.source.dataset, 'BLS');
  assert.ok((onion.nutrientsPer100g.proteinG ?? 0) > 0);
  assert.ok((onion.gramsPerUnit?.stueck ?? 0) > 0);
  assert.equal(
    references.some((food) => food.id === 'mf:salz'),
    false,
    'vernachlässigbare Zutaten brauchen keine Nährwertquelle',
  );
});

test('rechnet Haushaltsmengen über den Katalog in Gramm um', () => {
  const garlic = catalogFoodById('knoblauch');
  const oil = catalogFoodById('olivenoel');
  const feta = catalogFoodById('feta');
  const cherry = catalogFoodById('cherrytomate');
  const milk = catalogFoodById('milch');
  assert.ok(garlic && oil && feta && cherry && milk);
  assert.equal(foodGrams(garlic, 2, 'Zehen')?.grams, 2 * (garlic.g?.zehe ?? 0));
  assert.equal(foodGrams(feta, 1, 'Packung')?.grams, 200);
  assert.equal(foodGrams(cherry, 1, 'Schale')?.grams, 250);
  assert.equal(foodGrams(feta, 150, 'g')?.quality, 'direct');
  assert.ok((foodGrams(oil, 3, 'EL')?.grams ?? 0) > 30);
  assert.ok(Math.abs((foodGrams(milk, 1, 'l')?.grams ?? 0) - 1030) < 1);
  assert.equal(foodGrams(feta, 2, 'Handvoll')?.quality, 'assumed');
  assert.equal(foodGrams(feta, 1, 'Flasche'), undefined);
});

test('erkennt Zutatennamen aus echten Rezepten', () => {
  const cases: Array<[string, string]> = [
    ['Cherrytomaten', 'cherrytomate'],
    ['Kirschtomaten', 'cherrytomate'],
    ['Zwiebeln', 'zwiebel'],
    ['kleine Zwiebel', 'zwiebel'],
    ['Rote Zwiebel', 'rote-zwiebel'],
    ['Knoblauchzehen', 'knoblauch'],
    ['Knoblauchzehe (für die Erdnuss-Sojasauce)', 'knoblauch'],
    ['Bio-Zitrone', 'zitrone'],
    ['Hokkaido-Kürbis', 'hokkaido'],
    ['mittelgroßer Hokkaido-Kürbis (ca. 1 kg)', 'hokkaido'],
    ['Junger Spinat, gehackt (TK)', 'spinat-tk'],
    ['Erbsen, tiefgekühlt', 'erbsen-tk'],
    ['Brechbohnen, tiefgekühlt', 'brechbohnen-tk'],
    ['Petersilie (TK)', 'petersilie-tk'],
    ['8-Kräuter-Mischung (TK), nach Belieben', 'kraeuter-tk'],
    ['Geriebener Mozzarella', 'mozzarella-gerieben'],
    ['geriebener Mozzarella oder Edamer', 'mozzarella-gerieben'],
    ['Nudeln (Spaghetti, Locken, Spirelli oder eine andere Form)', 'nudeln'],
    [
      'Kartoffeln (alternativ je 300 g Kartoffeln: 100 g Muschelnudeln)',
      'kartoffel',
    ],
    ['Optional: Möhren', 'moehre'],
    ['mittelgroße Möhren', 'moehre'],
    ['Walnüsse (die Kerne verwenden)', 'walnuss'],
    ['Feta (eine Packung)', 'feta'],
    ['Etwas Öl zum Einfetten und Anbraten', 'oel'],
    ['Bratöl zum Dünsten und Einfetten', 'oel'],
    ['Leinöl oder Olivenöl zum Darübergeben', 'leinoel'],
    ['Wasser (2 Gläser à 200 ml)', 'wasser'],
    ['Couscous (1 Glas)', 'couscous'],
    ['Drillinge oder 300 g Süßkartoffel', 'kartoffel'],
    ['Brokkoli (ca. 300 g)', 'brokkoli'],
    ['kleiner Brokkoli', 'brokkoli'],
    ['Suppengemüse (ca. 500 g)', 'suppengemuese'],
    ['Tomaten, in Scheiben', 'tomate'],
    ['Toastscheiben (für 4 Sandwiches)', 'toastbrot'],
    ['Käsescheiben (eine pro Sandwich)', 'kaesescheiben'],
    ['Zitrone, Saft (für die Erdnuss-Sojasauce)', 'zitrone'],
    ['Pistazienkerne, geröstet und gesalzen', 'pistazie'],
    ['Rote Bete, vorgekocht und vakuumiert', 'rote-bete'],
    ['Gemüsebrühe beziehungsweise Gemüsebrühepulver', 'gemuesebruehe'],
    [
      'Gemüsebrühe; nach Bedarf so viel, dass das Gemüse bedeckt ist (Menge ca.)',
      'gemuesebruehe',
    ],
    ['Räuchertofu oder alternativ 200 g Halloumi', 'raeuchertofu'],
    [
      'Halloumi optional: als Ersatz für den Räuchertofu oder zusätzlich',
      'halloumi',
    ],
    ['Gnocchi (ungekocht, aus dem Kühlregal)', 'gnocchi'],
    ['weißer Spargel aus dem Glas', 'spargel-glas'],
    ['Hafer-Cuisine oder Soja-Cuisine', 'hafer-cuisine'],
    ['Hafercuisine', 'hafer-cuisine'],
    ['Optional: etwas Zucker zum Karamellisieren der Zwiebeln', 'zucker'],
    ['Pizzateig für ein Blech', 'pizzateig'],
    ['Ananas in Stücken', 'ananas-stuecke'],
    ['große Wraps', 'wraps'],
    ['Burger-Buns', 'burger-buns'],
    ['Reispapierblätter', 'reispapier'],
    ['milde Currypaste', 'currypaste'],
    ['getrocknete italienische Kräuter', 'italienische-kraeuter'],
    ['Optional: grünes Pesto', 'pesto'],
    ['Salatblätter (Herzsalat)', 'salat'],
    ['heller Balsamico', 'balsamico'],
    ['Kleine Zucchini (alternativ ½ mittelgroße)', 'zucchini'],
    ['Paprikaschoten', 'paprika'],
    ['rote Paprika', 'paprika'],
    ['Eier', 'ei'],
    ['Haferdrink', 'haferdrink'],
  ];
  for (const [input, expected] of cases)
    assert.equal(matchCatalogFood(input)?.id, expected, input);
});

test('lässt unbekannte Zutaten bewusst offen', () => {
  assert.equal(matchCatalogFood('Zauberpulver'), undefined);
  assert.equal(matchCatalogFood(''), undefined);
  assert.equal(matchCatalogFood('nach Belieben'), undefined);
});

test('zerlegt Aufzählungen nur, wenn jedes Teil erkannt wird', () => {
  const ids = (name: string) => matchCatalogFoods(name).map((food) => food.id);
  assert.deepEqual(ids('Salz und Pfeffer'), ['salz', 'pfeffer']);
  assert.deepEqual(ids('Salz, Pfeffer und weitere Gewürze nach Wahl'), [
    'salz',
    'pfeffer',
    'gewuerze',
  ]);
  assert.deepEqual(ids('Kümmel, Salz und Pfeffer nach Geschmack'), [
    'kuemmel',
    'salz',
    'pfeffer',
  ]);
  assert.deepEqual(ids('Ingwer und/oder Kurkuma nach Geschmack'), [
    'ingwer',
    'kurkuma',
  ]);
  assert.deepEqual(ids('Tomaten, in Scheiben'), ['tomate']);
});

test('belegt den Vorratsschrank nur mit wenigen Grundzutaten vor', () => {
  assert.ok(
    CATALOG_PANTRY_PRESET.length >= 5 && CATALOG_PANTRY_PRESET.length <= 8,
  );
  for (const id of ['salz', 'pfeffer', 'oel', 'olivenoel', 'zucker', 'mehl'])
    assert.ok(CATALOG_PANTRY_PRESET.includes(id), id);
});

test('Wasser wird nie eingekauft und zählt nicht zu Nährwerten', () => {
  const water = catalogFoodById('wasser');
  assert.equal(water?.shopping, false);
  assert.equal(water?.nutrition, false);
});

test('schlägt Alltagslebensmittel beim Tippen vor, ohne BLS-Gerichte', () => {
  const ids = (query: string) =>
    searchCatalogFoods(query, 5).map((food) => food.id);
  assert.equal(ids('Zwieb')[0], 'zwiebel');
  assert.ok(ids('Zwieb').includes('rote-zwiebel'));
  assert.equal(ids('cherry')[0], 'cherrytomate');
  assert.equal(ids('kirschtom')[0], 'cherrytomate');
  assert.equal(ids('Toastbr')[0], 'toastbrot');
  assert.equal(ids('paprika')[0], 'paprika');
  assert.ok(ids('paprika').includes('paprikapulver'));
  assert.equal(ids('mozzarella')[0], 'mozzarella');
  assert.deepEqual(ids(''), []);
  assert.deepEqual(ids('xyzq'), []);
});

test('behandelt Beispiel-Aufzählungen ohne „und“ als ein Lebensmittel', () => {
  assert.deepEqual(
    matchCatalogFoods(
      'Nudeln, Spaghetti, Locken, Spirelli oder eine andere Form',
    ).map((food) => food.id),
    ['nudeln'],
  );
});

test('verwechselt ähnliche Produkte nicht', () => {
  const id = (name: string) => matchCatalogFood(name)?.id;
  assert.equal(id('Agavendicksaft'), undefined);
  assert.equal(id('Limettensaft'), 'limettensaft');
  assert.equal(id('Mie-Nudeln'), 'mie-nudeln');
  assert.equal(id('Glasnudeln'), 'glasnudeln');
  assert.equal(id('Saure Gurken'), 'gewuerzgurken');
  assert.equal(id('Tomaten passiert'), 'passierte-tomaten');
  assert.equal(id('Dose Tomaten'), 'gehackte-tomaten');
  assert.equal(id('Hefe'), 'hefe');
});

test('kennzeichnet nur über Wortkürzung gefundene Treffer als ungefähr', () => {
  assert.equal(matchCatalogFoodsDetailed('Zwiebeln').approximate, false);
  assert.equal(matchCatalogFoodsDetailed('kleine Zwiebel').approximate, false);
  assert.equal(
    matchCatalogFoodsDetailed('Salz und Pfeffer').approximate,
    false,
  );
  const thai = matchCatalogFoodsDetailed('Thai-Basilikum');
  assert.equal(thai.foods[0]?.id, 'basilikum');
  assert.equal(thai.approximate, true);
});
