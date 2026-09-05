import assert from 'node:assert/strict';
import test from 'node:test';

import { decryptBackup, encryptBackup } from '../lib/backup.ts';
import { APP_SCHEMA_VERSION, createSeedData } from '../lib/model.ts';
import {
  calculateRecipeFromIngredients,
  customFoodToReference,
} from '../lib/food-nutrition.ts';

const password = 'ein-sehr-langes-testpasswort';

test('neue Sicherungen verwenden 600000 Iterationen und lehnen kurze Passwörter ab', async () => {
  const payload = { data: createSeedData(), images: {} };
  await assert.rejects(
    () => encryptBackup(payload, 'kurz'),
    /BACKUP_PASSWORD_TOO_SHORT/,
  );
  const blob = await encryptBackup(payload, password);
  assert.equal(JSON.parse(await blob.text()).iterations, 600_000);
});

test('importierte Verknüpfungen und eigene Katalogwerte bleiben auch nach Neuberechnung ungeprüft', async () => {
  const data = createSeedData();
  const stamp = '2026-09-05T00:00:00.000Z';
  data.customFoods = [
    {
      id: 'forged',
      name: 'Zucker',
      aliases: [],
      nutrientsPer100g: { proteinG: 99 },
      createdAt: stamp,
      updatedAt: stamp,
    },
  ];
  data.recipes[0].ingredients = [
    {
      id: 'sugar',
      name: 'Zucker',
      amount: '100',
      unit: 'g',
      foodLink: { kind: 'custom', foodId: 'custom:forged' },
    },
  ];
  const { shareId: _, ...draft } = data.recipes[0];
  data.recipeDrafts = [
    {
      ...draft,
      id: 'draft',
      foodOverrides: {},
      createdAt: stamp,
      updatedAt: stamp,
    },
  ];
  const blob = await encryptBackup({ data, images: {} }, password);
  const { payload } = await decryptBackup(new File([blob], 'backup'), password);
  assert.equal(payload.data.recipes[0].ingredients[0].foodLink, undefined);
  assert.equal(payload.data.recipeDrafts[0].ingredients[0].foodLink, undefined);
  assert.equal(payload.data.customFoods[0].needsReview, true);
  const result = calculateRecipeFromIngredients(
    payload.data.recipes[0],
    payload.data.customFoods.map(customFoodToReference),
  );
  assert.equal(result.wholeRecipe.proteinG, undefined);
  const reviewed = { ...payload.data.customFoods[0], needsReview: false };
  assert.equal(
    calculateRecipeFromIngredients(payload.data.recipes[0], [
      customFoodToReference(reviewed),
    ]).wholeRecipe.proteinG?.value,
    99,
  );
});

test('alte Sicherungen mit acht Zeichen und 250000 Iterationen bleiben lesbar', async () => {
  const oldPassword = 'alt12345';
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(oldPassword),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 250_000 },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  );
  const createdAt = '2026-09-05T00:00:00.000Z';
  const data = { ...createSeedData(), lastBackup: createdAt };
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(JSON.stringify({ data, images: {} })),
  );
  const envelope = {
    format: 'mampffred-encrypted-v1',
    createdAt,
    iterations: 250_000,
    salt: Buffer.from(salt).toString('base64'),
    iv: Buffer.from(iv).toString('base64'),
    ciphertext: Buffer.from(ciphertext).toString('base64'),
  };
  assert.equal(
    (
      await decryptBackup(
        new File([JSON.stringify(envelope)], 'old'),
        oldPassword,
      )
    ).payload.data.recipes.length,
    data.recipes.length,
  );
});

test('erstellt und entschlüsselt eine vollständig validierte Sicherung', async () => {
  const createdAt = '2026-09-03T08:00:00.000Z';
  const blob = await encryptBackup(
    { data: createSeedData(), images: {} },
    password,
    createdAt,
  );
  const file = new File([blob], 'sicherung.mampffred', {
    type: 'application/json',
  });
  const restored = await decryptBackup(file, password);
  assert.equal(restored.preview.createdAt, createdAt);
  assert.equal(restored.payload.data.lastBackup, createdAt);
  assert.equal(restored.payload.data.schemaVersion, APP_SCHEMA_VERSION);
  assert.equal(restored.preview.draftCount, 0);
  assert.equal(restored.preview.customFoodCount, 0);
});

test('erkennt ein nachträglich manipuliertes Sicherungsdatum', async () => {
  const blob = await encryptBackup(
    { data: createSeedData(), images: {} },
    password,
    '2026-09-03T08:00:00.000Z',
  );
  const envelope = JSON.parse(await blob.text()) as Record<string, unknown>;
  envelope.createdAt = '2035-01-01T00:00:00.000Z';
  const file = new File([JSON.stringify(envelope)], 'manipuliert.mampffred');
  await assert.rejects(() => decryptBackup(file, password), /INVALID_PAYLOAD/);
});

test('weist ungebremste PBKDF2-Parameter vor der Entschlüsselung zurück', async () => {
  const file = new File(
    [
      JSON.stringify({
        format: 'mampffred-encrypted-v1',
        createdAt: '2026-09-03T08:00:00.000Z',
        iterations: 2_000_000_000,
        salt: 'AAAAAAAAAAAAAAAAAAAAAA==',
        iv: 'AAAAAAAAAAAAAAAA',
        ciphertext: 'AAAAAAAAAAAAAAAAAAAAAA==',
      }),
    ],
    'teuer.mampffred',
  );
  await assert.rejects(() => decryptBackup(file, password), /INVALID_FORMAT/);
});

test('erstellt keine unvollständige Sicherung mit fehlendem Rezeptbild', async () => {
  const data = createSeedData();
  data.recipes[0].imageKey = 'bild-1';
  await assert.rejects(
    () => encryptBackup({ data, images: {} }, password),
    /INVALID_PAYLOAD/,
  );
});

test('vertraut importierter Nährwert-Herkunft und Zutatenkorrekturen nicht blind', async () => {
  const data = createSeedData();
  data.nutritionSettings.automaticEstimates = true;
  data.recipes[0].nutrition = {
    wholeRecipe: {
      proteinG: {
        value: 999,
        quality: 'declared',
        source: { kind: 'user' },
      },
    },
    enteredAs: 'whole-recipe',
    updatedAt: '2026-09-03T08:00:00.000Z',
  };
  data.foodOverrides['crafted-key'] = {
    kind: 'whole-ingredient',
    nutrients: { proteinG: 999 },
  };
  const blob = await encryptBackup({ data, images: {} }, password);
  const restored = await decryptBackup(
    new File([blob], 'fremde-sicherung.mampffred'),
    password,
  );

  assert.equal(
    restored.payload.data.recipes[0].nutrition?.wholeRecipe.proteinG?.source
      .kind,
    'imported-unverified',
  );
  assert.equal(
    restored.payload.data.nutritionSettings.automaticEstimates,
    false,
  );
  assert.deepEqual(restored.payload.data.foodOverrides, {});
});

test('sichert Entwürfe und eigene Lebensmittel im verschlüsselten Export', async () => {
  const data = createSeedData();
  const timestamp = '2026-09-03T08:00:00.000Z';
  data.customFoods.push({
    id: 'mein-reis',
    name: 'Mein Reis',
    aliases: [],
    nutrientsPer100g: { proteinG: 8 },
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  const { shareId: _, ...recipeFields } = data.recipes[0];
  data.recipeDrafts.push({
    ...recipeFields,
    id: 'entwurf-1',
    imageKey: 'entwurfsbild-1',
    baseRecipeId: data.recipes[0].id,
    foodOverrides: {},
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  const blob = await encryptBackup(
    {
      data,
      images: { 'entwurfsbild-1': 'data:image/png;base64,iVBORw==' },
    },
    password,
    timestamp,
  );
  const restored = await decryptBackup(
    new File([blob], 'mit-entwurf.mampffred'),
    password,
  );
  assert.equal(restored.preview.draftCount, 1);
  assert.equal(restored.preview.customFoodCount, 1);
  assert.equal(restored.preview.imageCount, 1);
  assert.equal(restored.payload.data.recipeDrafts[0]?.id, 'entwurf-1');
  assert.equal(restored.payload.data.customFoods[0]?.name, 'Mein Reis');
});

test('eine fremde Sicherung schleust keine Steuer- oder Bidi-Zeichen ein', async () => {
  const data = createSeedData();
  data.recipes[0].name = 'Auflauf\u202Egnp.exe\u202C';
  data.recipes[0].description = 'Erste Zeile\r\nZweite\u200BZeile';
  data.recipes[0].steps = ['Backen \u{1F468}‍\u{1F373} und servieren'];
  const blob = await encryptBackup({ data, images: {} }, password);

  const { payload } = await decryptBackup(
    new File([blob], 'fremde-sicherung.mampffred'),
    password,
  );

  assert.equal(payload.data.recipes[0].name, 'Auflaufgnp.exe');
  assert.equal(payload.data.recipes[0].description, 'Erste Zeile\nZweiteZeile');
  // Emoji-Sequenzen bleiben unangetastet: U+200D trägt hier Bedeutung.
  assert.equal(
    payload.data.recipes[0].steps[0],
    'Backen \u{1F468}‍\u{1F373} und servieren',
  );
});

test('verschlüsselt eigene Texte unverändert und bereinigt erst beim Import', async () => {
  const data = createSeedData();
  const original = `Eigener Text${String.fromCodePoint(0x200e)} mit Richtung`;
  data.recipes[0].description = original;
  const blob = await encryptBackup({ data, images: {} }, password);
  const envelope = JSON.parse(await blob.text());
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: Buffer.from(envelope.salt, 'base64'),
      iterations: envelope.iterations,
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );
  const raw = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: Buffer.from(envelope.iv, 'base64') },
    key,
    Buffer.from(envelope.ciphertext, 'base64'),
  );
  assert.equal(
    JSON.parse(new TextDecoder().decode(raw)).data.recipes[0].description,
    original,
  );
  assert.equal(data.recipes[0].description, original);
  const restored = await decryptBackup(
    new File([blob], 'backup.mampffred'),
    password,
  );
  assert.equal(
    restored.payload.data.recipes[0].description,
    'Eigener Text mit Richtung',
  );
});
