import type { AppData } from './model';
import { migrateAppData } from './model.ts';

export type BackupPayload = {
  data: AppData;
  images: Record<string, string>;
};

type EncryptedEnvelope = {
  format: 'mampffred-encrypted-v1';
  createdAt: string;
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
};

export type BackupPreview = {
  createdAt: string;
  recipeCount: number;
  draftCount: number;
  customFoodCount: number;
  imageCount: number;
  plannedMealCount: number;
  fileSize: number;
};

export type DecryptedBackup = {
  payload: BackupPayload;
  preview: BackupPreview;
};

const MAX_BACKUP_BYTES = 64 * 1024 * 1024;
const MAX_BACKUP_PLAINTEXT_BYTES = 40 * 1024 * 1024;
const MAX_BACKUP_CIPHERTEXT_BYTES = MAX_BACKUP_PLAINTEXT_BYTES + 16;
const MAX_BACKUP_CIPHERTEXT_BASE64_LENGTH =
  Math.ceil(MAX_BACKUP_CIPHERTEXT_BYTES / 3) * 4;
const MAX_IMAGE_DATA_URL_LENGTH = 12 * 1024 * 1024;
const MAX_BACKUP_IMAGES = 500;
const MIN_KDF_ITERATIONS = 100_000;
const MAX_KDF_ITERATIONS = 1_000_000;
export const MIN_BACKUP_PASSWORD_LENGTH = 12;
const DATA_URL_PATTERN =
  /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/;

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  if (!value || !/^[A-Za-z0-9+/]+={0,2}$/.test(value))
    throw new Error('INVALID_BASE64');
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function deriveKey(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
) {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('Bild konnte nicht gelesen werden.'));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export function dataUrlToBlob(dataUrl: string) {
  if (dataUrl.length > MAX_IMAGE_DATA_URL_LENGTH)
    throw new Error('BACKUP_IMAGE_TOO_LARGE');
  const match = DATA_URL_PATTERN.exec(dataUrl);
  if (!match) throw new Error('INVALID_IMAGE_DATA_URL');
  return new Blob([base64ToBytes(match[2])], { type: match[1] });
}

function validateBackupPayload(value: unknown): BackupPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('INVALID_PAYLOAD');
  const candidate = value as Partial<BackupPayload>;
  if (
    !candidate.images ||
    typeof candidate.images !== 'object' ||
    Array.isArray(candidate.images)
  )
    throw new Error('INVALID_PAYLOAD');
  const data = migrateAppData(candidate.data);
  const imageKeys = new Set(
    [...data.recipes, ...data.recipeDrafts].flatMap((recipe) =>
      recipe.imageKey ? [recipe.imageKey] : [],
    ),
  );
  const imageEntries = Object.entries(candidate.images);
  if (imageEntries.length > MAX_BACKUP_IMAGES)
    throw new Error('INVALID_PAYLOAD');
  const images: Record<string, string> = Object.create(null) as Record<
    string,
    string
  >;
  for (const [key, dataUrl] of imageEntries) {
    if (
      !imageKeys.has(key) ||
      ['__proto__', 'prototype', 'constructor'].includes(key) ||
      typeof dataUrl !== 'string'
    )
      throw new Error('INVALID_PAYLOAD');
    dataUrlToBlob(dataUrl);
    images[key] = dataUrl;
  }
  if ([...imageKeys].some((key) => !Object.hasOwn(images, key)))
    throw new Error('INVALID_PAYLOAD');
  return { data, images };
}

function quarantineImportedData(data: AppData): AppData {
  const quarantineNutrition = <
    T extends {
      nutrition?: AppData['recipes'][number]['nutrition'];
      ingredients: AppData['recipes'][number]['ingredients'];
    },
  >(
    recipe: T,
  ): T => ({
    ...recipe,
    ingredients: recipe.ingredients.map(
      ({ foodLink: _, ...ingredient }) => ingredient,
    ),
    ...(recipe.nutrition
      ? {
          nutrition: {
            ...recipe.nutrition,
            wholeRecipe: Object.fromEntries(
              Object.entries(recipe.nutrition.wholeRecipe).map(
                ([nutrient, metric]) => [
                  nutrient,
                  metric
                    ? {
                        ...metric,
                        source: { kind: 'imported-unverified' as const },
                      }
                    : metric,
                ],
              ),
            ),
          },
        }
      : {}),
  });
  return {
    ...data,
    recipes: data.recipes.map(quarantineNutrition),
    customFoods: data.customFoods.map((food) => ({
      ...food,
      needsReview: true,
    })),
    recipeDrafts: data.recipeDrafts.map((draft) => ({
      ...quarantineNutrition(draft),
      foodOverrides: {},
    })),
    nutritionSettings: {
      ...data.nutritionSettings,
      automaticEstimates: false,
    },
    foodOverrides: {},
  };
}

export async function encryptBackup(
  payload: BackupPayload,
  password: string,
  createdAt = new Date().toISOString(),
) {
  if (password.length < MIN_BACKUP_PASSWORD_LENGTH)
    throw new Error('BACKUP_PASSWORD_TOO_SHORT');
  const iterations = 600_000;
  const protectedPayload = validateBackupPayload({
    ...payload,
    data: { ...payload.data, lastBackup: createdAt },
  });
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, iterations);
  const plaintext = new TextEncoder().encode(JSON.stringify(protectedPayload));
  if (plaintext.byteLength > MAX_BACKUP_PLAINTEXT_BYTES)
    throw new Error('BACKUP_TOO_LARGE');
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext),
  );
  const envelope: EncryptedEnvelope = {
    format: 'mampffred-encrypted-v1',
    createdAt,
    iterations,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(ciphertext),
  };
  return new Blob([JSON.stringify(envelope)], { type: 'application/json' });
}

export async function decryptBackup(
  file: File,
  password: string,
): Promise<DecryptedBackup> {
  if (file.size < 1 || file.size > MAX_BACKUP_BYTES)
    throw new Error('INVALID_BACKUP_SIZE');
  const parsed = JSON.parse(await file.text()) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new Error('INVALID_FORMAT');
  const envelope = parsed as Partial<EncryptedEnvelope>;
  if (
    envelope.format !== 'mampffred-encrypted-v1' ||
    typeof envelope.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(envelope.createdAt)) ||
    typeof envelope.iterations !== 'number' ||
    !Number.isInteger(envelope.iterations) ||
    envelope.iterations < MIN_KDF_ITERATIONS ||
    envelope.iterations > MAX_KDF_ITERATIONS ||
    typeof envelope.salt !== 'string' ||
    envelope.salt.length !== 24 ||
    typeof envelope.iv !== 'string' ||
    envelope.iv.length !== 16 ||
    typeof envelope.ciphertext !== 'string'
  )
    throw new Error('INVALID_FORMAT');
  const salt = base64ToBytes(envelope.salt);
  const iv = base64ToBytes(envelope.iv);
  if (
    salt.byteLength !== 16 ||
    iv.byteLength !== 12 ||
    envelope.ciphertext.length > MAX_BACKUP_CIPHERTEXT_BASE64_LENGTH
  )
    throw new Error('INVALID_FORMAT');
  const ciphertext = base64ToBytes(envelope.ciphertext);
  if (ciphertext.byteLength > MAX_BACKUP_CIPHERTEXT_BYTES)
    throw new Error('INVALID_FORMAT');
  const key = await deriveKey(password, salt, envelope.iterations);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext,
  );
  if (plaintext.byteLength > MAX_BACKUP_PLAINTEXT_BYTES)
    throw new Error('INVALID_PAYLOAD');
  const decoded = JSON.parse(new TextDecoder().decode(plaintext)) as unknown;
  const { data: validatedData, images } = validateBackupPayload(decoded);
  const data = quarantineImportedData(validatedData);
  if (data.lastBackup !== envelope.createdAt)
    throw new Error('INVALID_PAYLOAD');
  return {
    payload: { data, images },
    preview: {
      createdAt: envelope.createdAt,
      recipeCount: data.recipes.length,
      draftCount: data.recipeDrafts.length,
      customFoodCount: data.customFoods.length,
      imageCount: Object.keys(images).length,
      plannedMealCount: data.plan.reduce(
        (total, day) => total + day.meals.length,
        0,
      ),
      fileSize: file.size,
    },
  };
}
