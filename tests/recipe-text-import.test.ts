import assert from 'node:assert/strict';
import test from 'node:test';

import { parseRecipeText } from '../lib/recipe-text-import.ts';
import { formatSharedRecipeText } from '../lib/recipe-sharing.ts';
import { additionalStandardRecipes } from '../lib/standard-recipe-catalog.ts';

test('liest Mampffreds eigenen Teilen-Text vollständig zurück', () => {
  const recipe = additionalStandardRecipes.find((entry) =>
    entry.recipe.name.startsWith('Feta-Pasta'),
  )!.recipe;
  const parsed = parseRecipeText(formatSharedRecipeText(recipe));
  assert.equal(parsed.name, recipe.name);
  assert.equal(parsed.description, recipe.description);
  assert.equal(parsed.minutes, recipe.minutes);
  assert.equal(parsed.servings, recipe.servings);
  assert.equal(parsed.steps.length, recipe.steps.length);
  assert.equal(parsed.steps[0], recipe.steps[0]);
  assert.deepEqual(
    parsed.ingredients.map((ingredient) => [
      ingredient.amount,
      ingredient.name,
      ingredient.scaleWithServings ?? true,
    ]),
    recipe.ingredients.map((ingredient) => [
      ingredient.amount,
      ingredient.name,
      ingredient.scaleWithServings ?? true,
    ]),
  );
});

test('versteht typische Messenger-Rezepte mit Überschriften', () => {
  const parsed = parseRecipeText(`Omas Linsensuppe 🍲
für 4 Personen, ca. 1 Std.

Zutaten:
• 250g Tellerlinsen
• 2 Möhren, gewürfelt
• 1 Zwiebel
• 1,5 l Gemüsebrühe
• Salz & Pfeffer
• Petersilie nach Belieben

Zubereitung:
1. Zwiebel und Möhren in etwas Öl anschwitzen.
2. Linsen und Brühe zugeben, 40 Minuten köcheln.
3. Abschmecken und mit Petersilie servieren.`);
  assert.equal(parsed.name, 'Omas Linsensuppe');
  assert.equal(parsed.servings, 4);
  assert.equal(parsed.minutes, 60);
  assert.deepEqual(
    parsed.ingredients.map((ingredient) => [
      ingredient.amount,
      ingredient.unit,
      ingredient.name,
    ]),
    [
      ['250', 'g', 'Tellerlinsen'],
      ['2', 'Stück', 'Möhren'],
      ['1', 'Stück', 'Zwiebel'],
      ['1,5', 'l', 'Gemüsebrühe'],
      ['', '', 'Salz & Pfeffer'],
      ['', '', 'Petersilie'],
    ],
  );
  assert.equal(parsed.ingredients[1].note, 'gewürfelt');
  assert.equal(parsed.ingredients[5].optional, true);
  assert.deepEqual(parsed.steps, [
    'Zwiebel und Möhren in etwas Öl anschwitzen.',
    'Linsen und Brühe zugeben, 40 Minuten köcheln.',
    'Abschmecken und mit Petersilie servieren.',
  ]);
});

test('trennt Zutaten und Schritte auch ohne Überschriften', () => {
  const parsed = parseRecipeText(`Schnelle Tomatensoße
400 g passierte Tomaten
2 EL Olivenöl
1 Knoblauchzehe
Öl erhitzen und den Knoblauch kurz anbraten.
Tomaten zugeben und zehn Minuten einkochen lassen.`);
  assert.equal(parsed.name, 'Schnelle Tomatensoße');
  assert.equal(parsed.ingredients.length, 3);
  assert.equal(parsed.steps.length, 2);
  assert.equal(parsed.servings, undefined);
});

test('liefert für leeren oder unbrauchbaren Text nichts Erfundenes', () => {
  const parsed = parseRecipeText('   \n  ');
  assert.equal(parsed.name, '');
  assert.deepEqual(parsed.ingredients, []);
  assert.deepEqual(parsed.steps, []);
});

test('versteht Unterüberschriften, ungefähre Mengen und Zeitangaben', () => {
  const parsed = parseRecipeText(`Flammkuchen
Zubereitungszeit: 45 Minuten

Zutaten (für 4 Personen):
Für den Teig:
250 g Mehl
ca. 125 ml Wasser
Für den Belag:
2x Zwiebeln
200 g Schmand

Zubereitung:
Teig kneten, ausrollen, belegen und backen.`);
  assert.equal(parsed.name, 'Flammkuchen');
  assert.equal(parsed.minutes, 45);
  assert.equal(parsed.servings, 4);
  assert.deepEqual(
    parsed.ingredients.map((entry) => [entry.amount, entry.unit, entry.name]),
    [
      ['250', 'g', 'Mehl'],
      ['125', 'ml', 'Wasser'],
      ['2', 'Stück', 'Zwiebeln'],
      ['200', 'g', 'Schmand'],
    ],
  );
  assert.equal(parsed.steps.length, 1);
});

test('nimmt ohne Titelzeile die erste Zutat nicht als Namen', () => {
  const parsed = parseRecipeText(`200 g Nudeln
1 Glas Pesto
Nudeln kochen und mit Pesto mischen.`);
  assert.equal(parsed.name, '');
  assert.equal(parsed.ingredients.length, 2);
  assert.equal(parsed.steps.length, 1);
});
