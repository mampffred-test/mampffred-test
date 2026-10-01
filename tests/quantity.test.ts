import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatQuantity,
  parseQuantity,
  parseQuantityRange,
} from '../lib/quantity.ts';
import { canonicalUnit, unitLabel } from '../lib/units.ts';

test('liest Dezimalzahlen mit Komma, Punkt und Tausenderpunkten', () => {
  assert.equal(parseQuantity('2'), 2);
  assert.equal(parseQuantity('1,5'), 1.5);
  assert.equal(parseQuantity('0.25'), 0.25);
  assert.equal(parseQuantity('1.000'), 1000);
  assert.equal(parseQuantity(' 250 '), 250);
});

test('liest Brüche als Zeichen, mit Schrägstrich und gemischt', () => {
  assert.equal(parseQuantity('½'), 0.5);
  assert.equal(parseQuantity('¼'), 0.25);
  assert.equal(parseQuantity('¾'), 0.75);
  assert.equal(parseQuantity('1/2'), 0.5);
  assert.equal(parseQuantity('1 1/2'), 1.5);
  assert.equal(parseQuantity('1½'), 1.5);
  assert.equal(parseQuantity('2 ½'), 2.5);
  assert.ok(Math.abs((parseQuantity('⅓') ?? 0) - 1 / 3) < 1e-9);
});

test('lehnt Freitext, Null und unsinnige Werte ab', () => {
  assert.equal(parseQuantity(''), undefined);
  assert.equal(parseQuantity('etwas'), undefined);
  assert.equal(parseQuantity('nach Belieben'), undefined);
  assert.equal(parseQuantity('1/0'), undefined);
  assert.equal(parseQuantity('-2'), undefined);
  assert.equal(parseQuantity('1e5'), undefined);
});

test('liest Spannen und nutzt für Berechnungen den Mittelwert', () => {
  assert.deepEqual(parseQuantityRange('2-3'), { min: 2, max: 3 });
  assert.deepEqual(parseQuantityRange('1–2'), { min: 1, max: 2 });
  assert.deepEqual(parseQuantityRange('½ - 1'), { min: 0.5, max: 1 });
  assert.deepEqual(parseQuantityRange('4'), { min: 4, max: 4 });
  assert.equal(parseQuantityRange('3-2'), undefined);
});

test('formatiert Mengen deutsch und mit gängigen Brüchen', () => {
  assert.equal(formatQuantity(2), '2');
  assert.equal(formatQuantity(0.5), '½');
  assert.equal(formatQuantity(1.5), '1½');
  assert.equal(formatQuantity(0.25), '¼');
  assert.equal(formatQuantity(2.75), '2¾');
  assert.equal(formatQuantity(1.2), '1,2');
  assert.equal(formatQuantity(0.333333), '⅓');
  assert.equal(formatQuantity(1250), '1250');
  assert.equal(formatQuantity(1.5, { fractions: false }), '1,5');
});

test('vereinheitlicht Einheiten samt Plural und Abkürzungen', () => {
  assert.equal(canonicalUnit('g'), 'g');
  assert.equal(canonicalUnit('Gramm'), 'g');
  assert.equal(canonicalUnit('kg'), 'kg');
  assert.equal(canonicalUnit('Stück'), 'stueck');
  assert.equal(canonicalUnit('Stk.'), 'stueck');
  assert.equal(canonicalUnit('Zehen'), 'zehe');
  assert.equal(canonicalUnit('Scheiben'), 'scheibe');
  assert.equal(canonicalUnit('EL'), 'el');
  assert.equal(canonicalUnit('Esslöffel'), 'el');
  assert.equal(canonicalUnit('TL'), 'tl');
  assert.equal(canonicalUnit('Dosen'), 'dose');
  assert.equal(canonicalUnit('Msp.'), 'msp');
  assert.equal(canonicalUnit('Päckchen'), 'packung');
  assert.equal(canonicalUnit(''), '');
  assert.equal(canonicalUnit('Gläser'), 'glas');
  assert.equal(canonicalUnit('Blätter'), 'blatt');
  assert.equal(canonicalUnit('Hand voll'), 'handvoll');
  assert.equal(canonicalUnit('Schuss'), 'schuss');
  assert.equal(canonicalUnit('irgendwas'), undefined);
});

test('beschriftet Einheiten passend zur Menge', () => {
  assert.equal(unitLabel('zehe', 1), 'Zehe');
  assert.equal(unitLabel('zehe', 2), 'Zehen');
  assert.equal(unitLabel('dose', 0.5), 'Dose');
  assert.equal(unitLabel('dose', 3), 'Dosen');
  assert.equal(unitLabel('glas', 2), 'Gläser');
  assert.equal(unitLabel('stueck', 3), 'Stück');
  assert.equal(unitLabel('g', 400), 'g');
  assert.equal(unitLabel('packung', 2), 'Packungen');
  assert.equal(unitLabel('bund', 2), 'Bund');
});

test('versteht ungefähre Angaben, „bis“-Spannen und Multiplikatoren', () => {
  assert.equal(parseQuantity('ca. 200'), 200);
  assert.equal(parseQuantity('circa 2'), 2);
  assert.equal(parseQuantity('etwa ½'), 0.5);
  assert.equal(parseQuantity('2x'), 2);
  assert.deepEqual(parseQuantityRange('2 bis 3'), { min: 2, max: 3 });
  assert.deepEqual(parseQuantityRange('ca. 2-3'), { min: 2, max: 3 });
});
