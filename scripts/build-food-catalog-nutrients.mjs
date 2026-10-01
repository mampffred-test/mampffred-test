// Erzeugt lib/data/food-catalog-nutrients.json aus dem eingebetteten BLS 4.0.
// Aufruf: node scripts/build-food-catalog-nutrients.mjs
import { readFileSync, writeFileSync } from 'node:fs';

import { FOOD_CATALOG } from '../lib/food-catalog-data.ts';

const bls = JSON.parse(
  readFileSync(
    new URL('../lib/data/bls-4.0.min.json', import.meta.url),
    'utf8',
  ),
);
const rows = new Map(bls.foods.map((row) => [row[0], row]));
const codes = [
  ...new Set(FOOD_CATALOG.flatMap((food) => (food.bls ? [food.bls] : []))),
].sort();
const output = {};
for (const code of codes) {
  const row = rows.get(code);
  if (!row) throw new Error(`BLS-Code ${code} fehlt`);
  output[code] = row.slice(2);
}
writeFileSync(
  new URL('../lib/data/food-catalog-nutrients.json', import.meta.url),
  `${JSON.stringify(output)}\n`,
);
console.log(`${codes.length} Nährwertzeilen geschrieben.`);
