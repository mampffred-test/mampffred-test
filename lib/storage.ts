import type { AppData } from './model';
import { migrateAppData } from './model.ts';
import { referencedImageKeys } from './data-updates.ts';

const DB_NAME = 'mampffred';
const DB_VERSION = 1;
const MAX_IMAGE_INPUT_BYTES = 25 * 1024 * 1024;
const MAX_IMAGE_EDGE = 8_000;
const MAX_IMAGE_PIXELS = 32_000_000;
const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

let databasePromise: Promise<IDBDatabase> | undefined;
let saveQueue: Promise<unknown> = Promise.resolve();
let writerLease:
  | {
      users: number;
      availability: Promise<'acquired' | 'busy' | 'unsupported' | 'error'>;
      unlock?: () => void;
    }
  | undefined;

export async function acquireAppWriter() {
  if (!writerLease) {
    let resolveAvailability!: (
      status: 'acquired' | 'busy' | 'unsupported' | 'error',
    ) => void;
    const lease = {
      users: 0,
      availability: new Promise<'acquired' | 'busy' | 'unsupported' | 'error'>(
        (resolve) => {
          resolveAvailability = resolve;
        },
      ),
      unlock: undefined as (() => void) | undefined,
    };
    writerLease = lease;
    if (!navigator.locks) resolveAvailability('unsupported');
    else
      void navigator.locks
        .request(
          'mampffred-exclusive-writer',
          { ifAvailable: true },
          async (lock) => {
            if (!lock) {
              resolveAvailability('busy');
              return;
            }
            await new Promise<void>((resolve) => {
              lease.unlock = resolve;
              resolveAvailability('acquired');
            });
          },
        )
        .catch(() => resolveAvailability('error'));
  }
  const lease = writerLease;
  lease.users += 1;
  const status = await lease.availability;
  let released = false;
  return {
    acquired: status === 'acquired',
    status,
    release() {
      if (released) return;
      released = true;
      lease.users -= 1;
      if (lease.users === 0) {
        lease.unlock?.();
        if (writerLease === lease) writerLease = undefined;
      }
    },
  };
}

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    let settled = false;
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('app')) db.createObjectStore('app');
      if (!db.objectStoreNames.contains('images'))
        db.createObjectStore('images');
    };
    request.onsuccess = () => {
      const db = request.result;
      if (settled) {
        db.close();
        return;
      }
      settled = true;
      db.onversionchange = () => {
        db.close();
        databasePromise = undefined;
      };
      resolve(db);
    };
    request.onerror = () => {
      if (settled) return;
      settled = true;
      databasePromise = undefined;
      reject(request.error ?? new Error('DATABASE_OPEN_FAILED'));
    };
    request.onblocked = () => {
      if (settled) return;
      settled = true;
      databasePromise = undefined;
      reject(new Error('DATABASE_OPEN_BLOCKED'));
    };
  });
  return databasePromise;
}

async function transact<T>(
  storeNames: 'app' | 'images' | ['app', 'images'],
  mode: IDBTransactionMode,
  action: (transaction: IDBTransaction) => IDBRequest<T>,
): Promise<T> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeNames, mode);
    let result: T;
    let request: IDBRequest<T>;
    try {
      request = action(transaction);
      request.onsuccess = () => {
        result = request.result;
      };
    } catch (error) {
      transaction.abort();
      reject(error);
      return;
    }
    transaction.oncomplete = () => resolve(result);
    transaction.onabort = () =>
      reject(
        transaction.error ?? request.error ?? new Error('TRANSACTION_ABORTED'),
      );
    transaction.onerror = () => undefined;
  });
}

export async function loadData() {
  const stored = await transact<unknown>('app', 'readonly', (transaction) =>
    transaction.objectStore('app').get('state'),
  );
  return stored === undefined ? undefined : migrateAppData(stored);
}

export async function saveData(
  data: AppData,
  images: Record<string, Blob> = {},
  retainedKeys: string[] = [],
) {
  const validated = migrateAppData(data);
  const referenced = referencedImageKeys(validated);
  const retained = new Set([...referenced, ...retainedKeys]);
  await transact<IDBValidKey>(['app', 'images'], 'readwrite', (transaction) => {
    const imageStore = transaction.objectStore('images');
    for (const [key, blob] of Object.entries(images)) {
      if (referenced.has(key)) imageStore.put(blob, key);
    }
    // Cursor cleanup and metadata commit share one transaction: failures roll back both.
    const cursor = imageStore.openCursor();
    cursor.onsuccess = () => {
      const entry = cursor.result;
      if (!entry) return;
      if (typeof entry.key !== 'string' || !retained.has(entry.key))
        entry.delete();
      entry.continue();
    };
    for (const key of referenced) {
      const request = imageStore.getKey(key);
      request.onsuccess = () => {
        if (request.result === undefined) transaction.abort();
      };
    }
    return transaction.objectStore('app').put(validated, 'state');
  });
}

export function queueSaveData(
  data: AppData,
  images: Record<string, Blob> = {},
  retainedKeys: string[] = [],
) {
  const snapshot = structuredClone(data);
  const imageSnapshot = { ...images };
  const retainedSnapshot = [...retainedKeys];
  const queued = saveQueue
    .catch(() => undefined)
    .then(() => saveData(snapshot, imageSnapshot, retainedSnapshot));
  saveQueue = queued;
  return queued.then(() => undefined);
}

export async function saveRecipeImage(key: string, blob: Blob) {
  await transact<IDBValidKey>('images', 'readwrite', (transaction) =>
    transaction.objectStore('images').put(blob, key),
  );
}

export function loadRecipeImage(key: string) {
  return transact<Blob | undefined>('images', 'readonly', (transaction) =>
    transaction.objectStore('images').get(key),
  );
}

export async function removeRecipeImage(key: string) {
  await transact<undefined>('images', 'readwrite', (transaction) =>
    transaction.objectStore('images').delete(key),
  );
}

export async function replaceAllData(
  data: AppData,
  images: Record<string, Blob>,
) {
  const validated = migrateAppData(data);
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(['app', 'images'], 'readwrite');
    const appStore = transaction.objectStore('app');
    const imageStore = transaction.objectStore('images');
    imageStore.clear();
    for (const [key, blob] of Object.entries(images)) imageStore.put(blob, key);
    appStore.put(validated, 'state');
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('RESTORE_TRANSACTION_ABORTED'));
    transaction.onerror = () => undefined;
  });
}

export function queueReplaceAllData(
  data: AppData,
  images: Record<string, Blob>,
) {
  const dataSnapshot = structuredClone(data);
  const imageSnapshot = { ...images };
  const queued = saveQueue
    .catch(() => undefined)
    .then(() => replaceAllData(dataSnapshot, imageSnapshot));
  saveQueue = queued;
  return queued.then(() => undefined);
}

function readUint24LE(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function ascii(bytes: Uint8Array, offset: number, length: number) {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}

function imageDimensions(bytes: Uint8Array) {
  if (bytes.length >= 24 && bytes[0] === 0x89 && ascii(bytes, 1, 3) === 'PNG') {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return {
      type: 'image/png',
      width: view.getUint32(16),
      height: view.getUint32(20),
    };
  }
  if (
    bytes.length >= 30 &&
    ascii(bytes, 0, 4) === 'RIFF' &&
    ascii(bytes, 8, 4) === 'WEBP'
  ) {
    const chunk = ascii(bytes, 12, 4);
    if (chunk === 'VP8X')
      return {
        type: 'image/webp',
        width: readUint24LE(bytes, 24) + 1,
        height: readUint24LE(bytes, 27) + 1,
      };
    if (chunk === 'VP8L' && bytes[20] === 0x2f)
      return {
        type: 'image/webp',
        width: 1 + bytes[21] + ((bytes[22] & 0x3f) << 8),
        height:
          1 +
          ((bytes[22] & 0xc0) >> 6) +
          (bytes[23] << 2) +
          ((bytes[24] & 0x0f) << 10),
      };
    if (
      chunk === 'VP8 ' &&
      bytes[23] === 0x9d &&
      bytes[24] === 0x01 &&
      bytes[25] === 0x2a
    )
      return {
        type: 'image/webp',
        width: (bytes[26] | (bytes[27] << 8)) & 0x3fff,
        height: (bytes[28] | (bytes[29] << 8)) & 0x3fff,
      };
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 8 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1];
      if (
        [
          0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd,
          0xce, 0xcf,
        ].includes(marker)
      )
        return {
          type: 'image/jpeg',
          height: (bytes[offset + 5] << 8) | bytes[offset + 6],
          width: (bytes[offset + 7] << 8) | bytes[offset + 8],
        };
      const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
      if (length < 2) break;
      offset += length + 2;
    }
  }
  throw new Error('INVALID_IMAGE_FILE');
}

export async function validateImageFile(blob: Blob) {
  if (
    !imageTypes.has(blob.type) ||
    blob.size === 0 ||
    blob.size > MAX_IMAGE_INPUT_BYTES
  )
    throw new Error('INVALID_IMAGE_FILE');
  const dimensions = imageDimensions(new Uint8Array(await blob.arrayBuffer()));
  if (
    dimensions.type !== blob.type ||
    dimensions.width < 1 ||
    dimensions.height < 1 ||
    dimensions.width > MAX_IMAGE_EDGE ||
    dimensions.height > MAX_IMAGE_EDGE ||
    dimensions.width * dimensions.height > MAX_IMAGE_PIXELS
  )
    throw new Error('INVALID_IMAGE_DIMENSIONS');
}

export async function optimizeImage(file: Blob): Promise<Blob> {
  await validateImageFile(file);
  const bitmap = await createImageBitmap(file);
  try {
    if (
      !Number.isInteger(bitmap.width) ||
      !Number.isInteger(bitmap.height) ||
      bitmap.width < 1 ||
      bitmap.height < 1 ||
      bitmap.width > MAX_IMAGE_EDGE ||
      bitmap.height > MAX_IMAGE_EDGE ||
      bitmap.width * bitmap.height > MAX_IMAGE_PIXELS
    )
      throw new Error('INVALID_IMAGE_DIMENSIONS');
    const max = 1600;
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('IMAGE_PROCESSING_FAILED');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const output = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) =>
          blob ? resolve(blob) : reject(new Error('IMAGE_ENCODING_FAILED')),
        'image/webp',
        0.82,
      ),
    );
    // Safari may fall back to PNG when WebP encoding is unavailable.
    await validateImageFile(output);
    return output;
  } finally {
    bitmap.close();
  }
}
