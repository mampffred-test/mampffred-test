import type { Recipe } from './model.ts';
import { createEmptyData, migrateAppData } from './model.ts';
import {
  sanitizeImportedText,
  sanitizeImportedTextList,
} from './imported-text.ts';
import { visibleRecipeTags } from './recipe-filter.ts';

export const MAX_SHARED_RECIPE_BYTES = 500_000;
// Die komprimierte Größe hängt vom Inhalt ab. Umfangreiche Rezepte können das
// Linkbudget überschreiten und müssen dann als Datei übertragen werden.
export const MAX_SHARED_RECIPE_LINK_CHARS = 8_000;

type SharedRecipeEnvelope = {
  format: 'mampffred-recipe';
  version: 1;
  shareId: string;
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

export function createSharedRecipeFile(recipe: Recipe) {
  const contents = serializeSharedRecipe(recipe);
  if (new TextEncoder().encode(contents).byteLength > MAX_SHARED_RECIPE_BYTES)
    throw new Error('SHARED_RECIPE_TOO_LARGE');
  return new File([contents], sharedRecipeFileName(recipe.name), {
    type: 'application/json',
  });
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
        imageCell: 0,
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
