import type { Recipe } from './model.ts';
import { createEmptyData, migrateAppData } from './model.ts';
import {
  sanitizeImportedText,
  sanitizeImportedTextList,
} from './imported-text.ts';
import { visibleRecipeTags } from './recipe-filter.ts';
import { validateImageFrame } from './image-frame.ts';
import { optimizeImage } from './storage.ts';

export const MAX_SHARED_RECIPE_BYTES = 500_000;
export const MAX_SHARED_RECIPE_FILE_BYTES = 2_000_000;
export const MAX_SHARED_IMAGE_BYTES = 1_000_000;
export type SharedRecipeImport = { recipe: Recipe; image?: Blob };
export const recipeReceiveInstructions = {
  Android:
    'In WhatsApp die Datei gedrückt halten → ⋮ → Teilen → Mampffred. Danach „Rezept hinzufügen“ wählen.',
  iPhone:
    'In Mampffred unter „Rezepte“ auf „Rezeptdatei importieren“ tippen und diese Datei auswählen.',
};
export const recipeShareMessage = `Rezept für Mampffred – ein vorhandenes Foto ist enthalten.\n\nAndroid: ${recipeReceiveInstructions.Android}\n\niPhone: ${recipeReceiveInstructions.iPhone}`;
// Die komprimierte Größe hängt vom Inhalt ab. Umfangreiche Rezepte können das
// Linkbudget überschreiten und müssen dann als Datei übertragen werden.
export const MAX_SHARED_RECIPE_LINK_CHARS = 8_000;

type SharedRecipeEnvelope = {
  format: 'mampffred-recipe';
  version: 1;
  shareId: string;
  imageCell?: number;
  recipe: {
    name: string;
    description: string;
    minutes: number;
    servings: number;
    tags: string[];
    ingredients: Array<{ amount: string; unit: string; name: string }>;
    steps: string[];
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function serializeSharedRecipe(recipe: Recipe) {
  const envelope: SharedRecipeEnvelope = {
    format: 'mampffred-recipe',
    version: 1,
    shareId: recipe.shareId,
    ...(!recipe.imageKey ? { imageCell: recipe.imageCell } : {}),
    recipe: {
      name: recipe.name,
      description: recipe.description,
      minutes: recipe.minutes,
      servings: recipe.servings,
      tags: visibleRecipeTags(recipe),
      ingredients: recipe.ingredients.map(({ amount, unit, name }) => ({
        amount,
        unit,
        name,
      })),
      steps: recipe.steps,
    },
  };
  return JSON.stringify(envelope, null, 2);
}

export async function createSharedRecipeFile(recipe: Recipe, image?: Blob) {
  const text = serializeSharedRecipe(recipe);
  if (new TextEncoder().encode(text).byteLength > MAX_SHARED_RECIPE_BYTES)
    throw new Error('SHARED_RECIPE_TOO_LARGE');
  if (recipe.imageKey && !image) throw new Error('MISSING_RECIPE_IMAGE');
  const envelope = { ...JSON.parse(text), version: 2 };
  if (image) {
    const optimized = await optimizeImage(image, {
      maxEdge: 1200,
      type: 'image/jpeg',
    });
    if (optimized.size > MAX_SHARED_IMAGE_BYTES)
      throw new Error('SHARED_IMAGE_TOO_LARGE');
    envelope.image = {
      type: optimized.type,
      data: bytesToBase64Url(new Uint8Array(await optimized.arrayBuffer())),
      ...(recipe.imageFrame
        ? { frame: validateImageFrame(recipe.imageFrame) }
        : {}),
    };
  }
  const contents = JSON.stringify(envelope);
  if (
    new TextEncoder().encode(contents).byteLength > MAX_SHARED_RECIPE_FILE_BYTES
  )
    throw new Error('SHARED_RECIPE_TOO_LARGE');
  return new File([contents], sharedRecipeFileName(recipe.name), {
    type: 'application/json',
  });
}

// A text document is accepted by native browser sharing; custom extensions and
// application/json are not supported consistently. The validated content stays
// identical to the recipe file, including its embedded photo.
export async function createSharedRecipeTransferFile(
  recipe: Recipe,
  image?: Blob,
) {
  const file = await createSharedRecipeFile(recipe, image);
  const envelope = JSON.parse(await file.text());
  const contents = JSON.stringify(
    {
      'Rezept in Mampffred übernehmen': recipeReceiveInstructions,
      ...envelope,
    },
    null,
    2,
  );
  const transfer = new File([contents], `${file.name}.txt`, {
    type: 'text/plain',
  });
  const { image: _, ...text } = JSON.parse(contents);
  if (
    transfer.size > MAX_SHARED_RECIPE_FILE_BYTES ||
    new TextEncoder().encode(JSON.stringify(text)).byteLength >
      MAX_SHARED_RECIPE_BYTES
  )
    throw new Error('SHARED_RECIPE_TOO_LARGE');
  return transfer;
}

export function sharedRecipeInbox(baseUrl: string) {
  const base = new URL(baseUrl);
  const name = `mampffred-${encodeURIComponent(base.pathname)}-inbox`;
  const key = (id: string) => {
    if (!/^[a-f0-9-]{36}$/u.test(id))
      throw new Error('INVALID_INCOMING_RECIPE');
    return new URL(`__share_inbox__/${id}`, base).href;
  };
  return {
    async read(id: string) {
      if (/^error(?:-[A-Z_]+)?$/u.test(id))
        throw new Error(`INCOMING_${id.slice(6) || 'TRANSPORT'}`);
      const url = key(id);
      const response = await caches
        .open(name)
        .then((cache) => cache.match(url))
        .catch(() => {
          throw new Error('INCOMING_STORAGE');
        });
      if (
        !response ||
        Date.now() - Number(response.headers.get('X-Received-At')) > 86_400_000
      )
        throw new Error('EXPIRED_INCOMING_RECIPE');
      const blob = await response.blob();
      if (blob.size > MAX_SHARED_RECIPE_FILE_BYTES)
        throw new Error('SHARED_RECIPE_TOO_LARGE');
      return parseSharedRecipeFile(await blob.text());
    },
    async remove(id: string) {
      const url = key(id);
      await (await caches.open(name)).delete(url);
    },
  };
}

export function recipeImportErrorMessage(error: unknown): string {
  const code = error instanceof Error ? error.message : '';
  switch (code) {
    case 'INCOMING_NO_FILE':
      return 'Es ist keine Rezeptdatei angekommen. Lade die Datei in WhatsApp vollständig herunter und teile die Nachricht erneut mit Mampffred. Du kannst die Datei auch hier auswählen.';
    case 'INCOMING_NO_RECIPE':
      return 'Es ist nur Text angekommen, aber keine erkennbare Mampffred-Rezeptdatei. Teile die Nachricht mit dem Dateianhang erneut oder wähle die Rezeptdatei hier aus.';
    case 'INCOMING_MULTIPLE':
      return 'Es sind mehrere Rezepte angekommen. Bitte teile jeweils nur eine Rezeptnachricht. Der Begleittext darf dabei bleiben.';
    case 'INCOMING_SIZE':
    case 'SHARED_RECIPE_TOO_LARGE':
    case 'SHARED_IMAGE_TOO_LARGE':
      return 'Die Rezeptdatei oder das enthaltene Bild ist zu groß. Bitte die absendende Person, das Rezept mit Mampffred erneut zu teilen. Rezeptdateien dürfen höchstens 2 MB groß sein.';
    case 'INCOMING_INBOX_FULL':
      return 'Es warten bereits mehrere Rezepte auf den Import. Füge die geöffneten Rezeptvorschauen hinzu oder schließe sie und teile die Nachricht danach erneut.';
    case 'INCOMING_STORAGE':
      return 'Mampffred konnte die empfangene Datei auf diesem Gerät nicht zwischenspeichern. Prüfe den freien Gerätespeicher und versuche es erneut.';
    case 'EXPIRED_INCOMING_RECIPE':
      return 'Diese Rezeptdatei ist nicht mehr zum Import verfügbar. Bitte teile die Nachricht erneut oder wähle die gespeicherte Datei hier aus.';
    case 'INVALID_SHARED_IMAGE':
    case 'INVALID_IMAGE_FILE':
    case 'INVALID_IMAGE_DIMENSIONS':
    case 'INVALID_IMAGE_FRAME':
    case 'IMAGE_PROCESSING_FAILED':
    case 'IMAGE_ENCODING_FAILED':
      return 'Das Bild in der Rezeptdatei konnte nicht gelesen werden. Bitte die absendende Person, das Bild in Mampffred neu auszuwählen und das Rezept erneut zu teilen.';
    case 'INCOMING_TRANSPORT':
      return 'Die Übergabe an Mampffred ist fehlgeschlagen. Bitte teile die Nachricht erneut oder wähle die gespeicherte Rezeptdatei hier aus.';
    default:
      return 'Diese Datei ist keine gültige oder unterstützte Mampffred-Rezeptdatei. Bitte die absendende Person, das Rezept mit einer aktuellen Mampffred-Version erneut zu teilen.';
  }
}

export async function parseSharedRecipeFile(
  contents: string,
): Promise<SharedRecipeImport> {
  if (
    new TextEncoder().encode(contents).byteLength > MAX_SHARED_RECIPE_FILE_BYTES
  )
    throw new Error('SHARED_RECIPE_TOO_LARGE');
  const envelope: unknown = JSON.parse(contents);
  if (!isRecord(envelope)) throw new Error('INVALID_SHARED_RECIPE');
  if (envelope.version === 1)
    return { recipe: await parseSharedRecipe(contents) };
  if (envelope.version !== 2) throw new Error('INVALID_SHARED_RECIPE');
  const { image, ...text } = envelope;
  const recipe = await parseSharedRecipe(
    JSON.stringify({ ...text, version: 1 }),
  );
  if (image === undefined) return { recipe };
  if (
    !isRecord(image) ||
    !['image/jpeg', 'image/png', 'image/webp'].includes(String(image.type)) ||
    typeof image.data !== 'string' ||
    image.data.length > Math.ceil((MAX_SHARED_IMAGE_BYTES * 4) / 3)
  )
    throw new Error('INVALID_SHARED_IMAGE');
  const bytes = base64UrlToBytes(image.data);
  if (bytes.byteLength > MAX_SHARED_IMAGE_BYTES)
    throw new Error('SHARED_IMAGE_TOO_LARGE');
  const imageFrame =
    image.frame === undefined ? undefined : validateImageFrame(image.frame);
  const optimized = await optimizeImage(
    new Blob([bytes], { type: String(image.type) }),
    { maxEdge: 1200, type: 'image/jpeg' },
  );
  if (optimized.size > MAX_SHARED_IMAGE_BYTES)
    throw new Error('SHARED_IMAGE_TOO_LARGE');
  return {
    recipe: { ...recipe, ...(imageFrame ? { imageFrame } : {}) },
    image: optimized,
  };
}

// Der Rezeptname stammt moeglicherweise aus einem fremden Link. Es ueberleben nur
// Buchstaben und Ziffern, damit weder Pfadtrenner noch Steuer- oder Bidi-Zeichen
// in den Dateinamen geraten.
export function sharedRecipeFileName(name: string) {
  const slug = name
    .normalize('NFC')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .slice(0, 60)
    .replace(/^-+|-+$/gu, '')
    .toLocaleLowerCase('de-DE');
  return `mampffred-${slug || 'rezept'}.mampffred-rezept`;
}

export function formatSharedRecipeText(recipe: Recipe) {
  const description = recipe.description.trim()
    ? `${recipe.description.trim()}\n\n`
    : '';
  const ingredients = recipe.ingredients
    .filter((ingredient) => ingredient.name.trim())
    .map(
      (ingredient) =>
        `- ${[ingredient.amount, ingredient.unit, ingredient.name]
          .filter(Boolean)
          .join(' ')}`,
    )
    .join('\n');
  const steps = recipe.steps
    .filter((step) => step.trim())
    .map((step, index) => `${index + 1}. ${step.trim()}`)
    .join('\n');
  return `${recipe.name}\n\n${description}${recipe.minutes} Min. · ${recipe.servings} ${recipe.servings === 1 ? 'Portion' : 'Portionen'}\n\nZutaten\n${ingredients}\n\nZubereitung\n${steps}`;
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8_192)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8_192));
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');
}

function base64UrlToBytes(value: string) {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new Error('INVALID_SHARE_LINK');
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/');
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function transformBytes(
  bytes: Uint8Array,
  transform: CompressionStream | DecompressionStream,
  limit = Number.POSITIVE_INFINITY,
) {
  const buffer = new Uint8Array(bytes.byteLength);
  buffer.set(bytes);
  // Bewusst chunkweise statt ueber Response.arrayBuffer(): ein praeparierter Link
  // wuerde sonst erst vollstaendig im Speicher landen und danach abgelehnt.
  const reader = (
    new Blob([buffer.buffer])
      .stream()
      .pipeThrough(transform) as ReadableStream<Uint8Array>
  ).getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error('SHARED_RECIPE_TOO_LARGE');
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

export async function createSharedRecipeUrl(contents: string, appUrl: string) {
  const source = new TextEncoder().encode(contents);
  if (source.byteLength > MAX_SHARED_RECIPE_BYTES)
    throw new Error('SHARED_RECIPE_TOO_LARGE');
  const compressed =
    typeof CompressionStream === 'undefined'
      ? source
      : await transformBytes(source, new CompressionStream('gzip'));
  const payload = `${compressed === source ? 'raw' : 'gzip'}.${bytesToBase64Url(compressed)}`;
  if (payload.length > MAX_SHARED_RECIPE_LINK_CHARS)
    throw new Error('SHARED_RECIPE_LINK_TOO_LARGE');
  const url = new URL(appUrl);
  url.hash = `recipe=${payload}`;
  return url.href;
}

export async function readSharedRecipeHash(hash: string) {
  if (!hash.startsWith('#recipe=')) return undefined;
  const payload = hash.slice('#recipe='.length);
  if (!payload || payload.length > MAX_SHARED_RECIPE_LINK_CHARS)
    throw new Error('INVALID_SHARE_LINK');
  const separator = payload.indexOf('.');
  const encoding = payload.slice(0, separator);
  const encoded = payload.slice(separator + 1);
  let bytes = base64UrlToBytes(encoded);
  if (encoding === 'gzip') {
    if (typeof DecompressionStream === 'undefined')
      throw new Error('UNSUPPORTED_SHARE_LINK');
    bytes = await transformBytes(
      bytes,
      new DecompressionStream('gzip'),
      MAX_SHARED_RECIPE_BYTES,
    );
  } else if (encoding !== 'raw') throw new Error('INVALID_SHARE_LINK');
  if (bytes.byteLength > MAX_SHARED_RECIPE_BYTES)
    throw new Error('SHARED_RECIPE_TOO_LARGE');
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

export async function parseSharedRecipe(contents: string): Promise<Recipe> {
  if (new TextEncoder().encode(contents).byteLength > MAX_SHARED_RECIPE_BYTES)
    throw new Error('SHARED_RECIPE_TOO_LARGE');
  const envelope: unknown = JSON.parse(contents);
  if (
    !isRecord(envelope) ||
    envelope.format !== 'mampffred-recipe' ||
    envelope.version !== 1 ||
    typeof envelope.shareId !== 'string' ||
    !isRecord(envelope.recipe)
  )
    throw new Error('INVALID_SHARED_RECIPE');
  const recipe = envelope.recipe;
  const imageCell = envelope.imageCell ?? 0;
  if (
    typeof imageCell !== 'number' ||
    !Number.isInteger(imageCell) ||
    imageCell < 0 ||
    imageCell > 5
  )
    throw new Error('INVALID_SHARED_RECIPE');
  if (!Array.isArray(recipe.ingredients))
    throw new Error('INVALID_SHARED_RECIPE');

  const validated = migrateAppData({
    ...createEmptyData(),
    recipes: [
      {
        id: 'shared-recipe-preview',
        shareId: envelope.shareId,
        name: sanitizeImportedText(recipe.name),
        description: sanitizeImportedText(recipe.description),
        minutes: recipe.minutes,
        servings: recipe.servings,
        tags: sanitizeImportedTextList(recipe.tags),
        ingredients: recipe.ingredients.map((ingredient, index) => {
          if (!isRecord(ingredient)) throw new Error('INVALID_SHARED_RECIPE');
          return {
            id: `shared-ingredient-${index + 1}`,
            amount: sanitizeImportedText(ingredient.amount),
            unit: sanitizeImportedText(ingredient.unit),
            name: sanitizeImportedText(ingredient.name),
          };
        }),
        steps: sanitizeImportedTextList(recipe.steps),
        imageCell,
      },
    ],
  }).recipes[0];
  if (!validated) throw new Error('INVALID_SHARED_RECIPE');
  const portable = { ...validated, tags: visibleRecipeTags(validated) };
  const content = JSON.parse(serializeSharedRecipe(portable)).recipe;
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(content)),
  );
  const hash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  return { ...portable, shareId: `imported:${hash}` };
}
