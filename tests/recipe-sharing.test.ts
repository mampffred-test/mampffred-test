import assert from 'node:assert/strict';
import test from 'node:test';

import { createSampleRecipes } from '../lib/model.ts';
import {
  createSharedRecipeFile,
  createSharedRecipeUrl,
  formatSharedRecipeText,
  MAX_SHARED_RECIPE_LINK_CHARS,
  MAX_SHARED_RECIPE_BYTES,
  parseSharedRecipe,
  readSharedRecipeHash,
  serializeSharedRecipe,
  sharedRecipeFileName,
} from '../lib/recipe-sharing.ts';

test('erstellt einen lesbaren Text als Android-Fallback', () => {
  const recipe = createSampleRecipes()[0];
  const sharedText = formatSharedRecipeText(recipe);

  assert.match(sharedText, new RegExp(`^${recipe.name}`));
  assert.match(sharedText, /Zutaten\n- 100 g Haferflocken/);
  assert.match(sharedText, /Zubereitung\n1\./);
});

test('transportiert ein Rezept in einem kompakten Mampffred-Link', async () => {
  const contents = serializeSharedRecipe(createSampleRecipes()[0]);
  const url = await createSharedRecipeUrl(
    contents,
    'https://example.com/mampffred/',
  );

  assert.match(url, /^https:\/\/example\.com\/mampffred\/#recipe=/);
  assert.equal(await readSharedRecipeHash(new URL(url).hash), contents);
});

test('weist ungültige und überlange Rezeptlinks defensiv zurück', async () => {
  await assert.rejects(() => readSharedRecipeHash('#recipe=gzip.!ungueltig'));
  await assert.rejects(() =>
    readSharedRecipeHash(
      `#recipe=raw.${'a'.repeat(MAX_SHARED_RECIPE_LINK_CHARS)}`,
    ),
  );
});

test('bricht eine gzip-Bombe beim Entpacken ab', async () => {
  const compressed = new Uint8Array(
    await new Response(
      new Blob([new Uint8Array(2_000_000)])
        .stream()
        .pipeThrough(new CompressionStream('gzip')),
    ).arrayBuffer(),
  );
  const payload = `gzip.${Buffer.from(compressed).toString('base64url')}`;

  // Passt bequem ins Linkbudget, entpackt aber weit über die Inhaltsgrenze.
  assert.ok(payload.length < MAX_SHARED_RECIPE_LINK_CHARS);
  await assert.rejects(
    () => readSharedRecipeHash(`#recipe=${payload}`),
    /SHARED_RECIPE_TOO_LARGE/,
  );
});

test('entpackt zulässige Inhalte bis dicht an die Inhaltsgrenze', async () => {
  const contents = 'a'.repeat(MAX_SHARED_RECIPE_BYTES - 1);
  const url = await createSharedRecipeUrl(contents, 'https://example.com/');

  assert.equal(await readSharedRecipeHash(new URL(url).hash), contents);
});

test('das Linkbudget trägt auch ein sehr umfangreiches Rezept', async () => {
  const [base] = createSampleRecipes();
  const url = await createSharedRecipeUrl(
    serializeSharedRecipe({
      ...base,
      description: 'Ausführliche Beschreibung. '.repeat(30),
      ingredients: Array.from({ length: 120 }, (_, index) => ({
        id: `i${index}`,
        amount: '250',
        unit: 'g',
        name: `Zutat mit ausführlichem Namen Nummer ${index}`,
      })),
      steps: Array.from(
        { length: 120 },
        (_, index) =>
          `Schritt ${index}: ${'Alles gut vermengen und weiterverarbeiten. '.repeat(12)}`,
      ),
    }),
    'https://example.com/mampffred/',
  );

  assert.ok(url.length < MAX_SHARED_RECIPE_LINK_CHARS);
});

test('bildet Dateinamen ohne Pfad-, Steuer- oder Bidi-Zeichen', () => {
  assert.equal(
    sharedRecipeFileName('Ofengemüse mit Feta & Brot'),
    'mampffred-ofengemüse-mit-feta-brot.mampffred-rezept',
  );
  assert.equal(
    sharedRecipeFileName('../../etc/passwd'),
    'mampffred-etc-passwd.mampffred-rezept',
  );
  assert.equal(
    // Das Bidi-Override wird wie jedes Nicht-Alphanumerische zum Bindestrich.
    sharedRecipeFileName('Auflauf\u202Egnp.exe\u202C'),
    'mampffred-auflauf-gnp-exe.mampffred-rezept',
  );
  assert.equal(
    sharedRecipeFileName('***'),
    'mampffred-rezept.mampffred-rezept',
  );
  assert.ok(sharedRecipeFileName('A'.repeat(200)).length <= 90);
});

test('eine exportierte Rezeptdatei lässt sich wieder importieren', async () => {
  const source = createSampleRecipes()[0];
  const file = createSharedRecipeFile(source);
  const exported = await file.text();
  assert.equal(file.name, sharedRecipeFileName(source.name));
  assert.equal(file.type, 'application/json');

  const imported = await parseSharedRecipe(exported);

  assert.equal(imported.name, source.name);
  assert.deepEqual(
    imported.ingredients.map((ingredient) => ingredient.name),
    source.ingredients.map((ingredient) => ingredient.name),
  );
  assert.match(imported.shareId, /^imported:[a-f0-9]{64}$/);
});

test('erstellt keine Rezeptdatei, die der eigene Import wegen Übergröße ablehnt', () => {
  const source = {
    ...createSampleRecipes()[0],
    steps: Array.from({ length: 110 }, () => 'a'.repeat(4990)),
  };
  assert.throws(
    () => createSharedRecipeFile(source),
    /SHARED_RECIPE_TOO_LARGE/,
  );
});

test('entfernt Steuer- und Bidi-Zeichen aus geteilten Inhalten', async () => {
  const [base] = createSampleRecipes();
  const envelope = JSON.parse(serializeSharedRecipe(base));
  envelope.recipe.name = 'Auflauf\u202Egnp.exe\u202C';
  envelope.recipe.description = 'Erste Zeile\r\nZweite\u200BZeile\u0007';
  envelope.recipe.steps = ['Backen \u{1F468}‍\u{1F373} und servieren'];

  const imported = await parseSharedRecipe(JSON.stringify(envelope));

  assert.equal(imported.name, 'Auflaufgnp.exe');
  assert.equal(imported.description, 'Erste Zeile\nZweiteZeile');
  // Emoji-Sequenzen bleiben unangetastet: U+200D trägt hier Bedeutung.
  assert.equal(imported.steps[0], 'Backen \u{1F468}‍\u{1F373} und servieren');
});

test('teilt nur portable Rezeptdaten ohne lokale oder ungeprüfte Metadaten', async () => {
  const source = createSampleRecipes()[0];
  source.imageKey = 'private-local-image';
  source.favorite = true;
  source.tags = ['Vegetarisch', 'Familienessen'];
  source.ingredients[0].foodLink = {
    kind: 'bls',
    foodId: 'private-local-mapping',
  };

  const imported = await parseSharedRecipe(serializeSharedRecipe(source));

  assert.match(imported.shareId, /^imported:[a-f0-9]{64}$/);
  assert.equal(imported.name, source.name);
  assert.equal(imported.imageKey, undefined);
  assert.equal(imported.favorite, undefined);
  assert.equal(imported.nutrition, undefined);
  assert.deepEqual(imported.tags, ['Vegetarisch']);
  assert.ok(imported.ingredients.every((ingredient) => !ingredient.foodLink));
});

test('weist übergroße und formatfremde Rezeptdateien zurück', async () => {
  await assert.rejects(
    () => parseSharedRecipe('x'.repeat(MAX_SHARED_RECIPE_BYTES + 1)),
    /SHARED_RECIPE_TOO_LARGE/,
  );
  await assert.rejects(
    () => parseSharedRecipe('{"format":"something-else"}'),
    /INVALID_SHARED_RECIPE/,
  );
});

test('Datei-Identitäten können weder Beispiele belegen noch Wiederimporte umgehen', async () => {
  const original = JSON.parse(serializeSharedRecipe(createSampleRecipes()[0]));
  const first = await parseSharedRecipe(JSON.stringify(original));
  original.shareId = 'sample-v1:curry';
  assert.equal(
    (await parseSharedRecipe(JSON.stringify(original))).shareId,
    first.shareId,
  );
  assert.equal(
    (await parseSharedRecipe(serializeSharedRecipe(first))).shareId,
    first.shareId,
  );
  original.recipe.name = 'Anderer Inhalt';
  assert.notEqual(
    (await parseSharedRecipe(JSON.stringify(original))).shareId,
    first.shareId,
  );
});
