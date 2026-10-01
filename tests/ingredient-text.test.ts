import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseIngredientLine,
  splitIngredientName,
} from '../lib/ingredient-text.ts';

test('liest Menge, Einheit, Zutat und Notiz aus einer Zeile', () => {
  assert.deepEqual(parseIngredientLine('200 g Feta, zerbröselt'), {
    amount: '200',
    unit: 'g',
    name: 'Feta',
    note: 'zerbröselt',
    optional: false,
  });
  assert.deepEqual(parseIngredientLine('2 EL Olivenöl'), {
    amount: '2',
    unit: 'EL',
    name: 'Olivenöl',
    optional: false,
  });
  assert.deepEqual(parseIngredientLine('250g Mehl'), {
    amount: '250',
    unit: 'g',
    name: 'Mehl',
    optional: false,
  });
  assert.deepEqual(parseIngredientLine('3 Zwiebeln'), {
    amount: '3',
    unit: 'Stück',
    name: 'Zwiebeln',
    optional: false,
  });
});

test('versteht Brüche, Spannen und Aufzählungszeichen', () => {
  assert.equal(parseIngredientLine('½ Bund Petersilie').amount, '0,5');
  assert.equal(parseIngredientLine('½ Bund Petersilie').unit, 'Bund');
  assert.equal(parseIngredientLine('1 1/2 Tassen Mehl').amount, '1,5');
  assert.equal(parseIngredientLine('1 1/2 Tassen Mehl').unit, 'Tasse');
  assert.equal(parseIngredientLine('3-4 Tomaten').amount, '3–4');
  assert.equal(
    parseIngredientLine('- 2 Knoblauchzehen').name,
    'Knoblauchzehen',
  );
  assert.equal(parseIngredientLine('• 1 Prise Salz').unit, 'Prise');
  assert.equal(parseIngredientLine('1. 500 g Nudeln').name, 'Nudeln');
});

test('übernimmt Packungsangaben in Klammern als Notiz', () => {
  assert.deepEqual(parseIngredientLine('1 Dose (400 ml) Kokosmilch'), {
    amount: '1',
    unit: 'Dose',
    name: 'Kokosmilch',
    note: '400 ml',
    optional: false,
  });
});

test('erkennt Mengen ohne Zahl und nachgestellte Mengen', () => {
  assert.deepEqual(parseIngredientLine('Salz und Pfeffer'), {
    amount: '',
    unit: '',
    name: 'Salz und Pfeffer',
    optional: false,
  });
  assert.deepEqual(parseIngredientLine('etwas Öl zum Braten'), {
    amount: '',
    unit: '',
    name: 'Öl',
    note: 'etwas, zum Braten',
    optional: false,
  });
  assert.deepEqual(parseIngredientLine('Feta 200 g'), {
    amount: '200',
    unit: 'g',
    name: 'Feta',
    optional: false,
  });
  assert.equal(parseIngredientLine('Petersilie nach Belieben').optional, true);
});

test('trennt Name, Notiz und Optional-Kennzeichen', () => {
  assert.deepEqual(splitIngredientName('Optional: Möhren'), {
    name: 'Möhren',
    optional: true,
  });
  assert.deepEqual(splitIngredientName('Walnüsse (die Kerne verwenden)'), {
    name: 'Walnüsse',
    note: 'die Kerne verwenden',
    optional: false,
  });
  assert.deepEqual(splitIngredientName('Junger Spinat, gehackt (TK)'), {
    name: 'Junger Spinat',
    note: 'gehackt, TK',
    optional: false,
  });
  assert.deepEqual(
    splitIngredientName('8-Kräuter-Mischung (TK), nach Belieben'),
    {
      name: '8-Kräuter-Mischung',
      note: 'TK',
      optional: true,
    },
  );
  assert.deepEqual(
    splitIngredientName('Salz, Pfeffer und weitere Gewürze nach Wahl'),
    { name: 'Salz, Pfeffer und weitere Gewürze nach Wahl', optional: false },
  );
  assert.deepEqual(splitIngredientName('Salz und Pfeffer'), {
    name: 'Salz und Pfeffer',
    optional: false,
  });
  assert.deepEqual(splitIngredientName('Etwas Öl zum Anbraten'), {
    name: 'Öl',
    note: 'etwas, zum Anbraten',
    optional: false,
  });
});

test('behandelt nachgestelltes „optional:“ und Zweckangaben lesbar', () => {
  assert.deepEqual(
    splitIngredientName(
      'Halloumi optional: als Ersatz für den Räuchertofu oder zusätzlich',
    ),
    {
      name: 'Halloumi',
      note: 'als Ersatz für den Räuchertofu oder zusätzlich',
      optional: true,
    },
  );
  assert.deepEqual(
    splitIngredientName(
      'Etwas Öl oder Fett für den Sandwichmaker, falls kein Backpapier verwendet wird',
    ),
    {
      name: 'Öl oder Fett',
      note: 'etwas, für den Sandwichmaker, falls kein Backpapier verwendet wird',
      optional: false,
    },
  );
});
