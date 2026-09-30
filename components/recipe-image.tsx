/* oxlint-disable jsx-a11y/prefer-tag-over-role, react/set-state-in-effect */
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { Recipe } from '@/lib/model';
import { loadRecipeImage } from '@/lib/storage';
import { FramedImage } from './image-framing';

export const assetUrl = (path: string) => `${import.meta.env.BASE_URL}${path}`;

export const RecipeImageRequestContext = createContext<(key: string) => void>(
  () => undefined,
);

// Sharp for list tiles up to ~170 CSS px on 3x displays, ~10x less memory.
const THUMBNAIL_EDGE = 480;
// Image keys change whenever an image changes, so a key never goes stale.
const thumbnails = new Map<string, Promise<string | undefined>>();
/**
 * Thumbnails survive app restarts in Cache Storage, so full-size photos are
 * decoded once per image instead of once per launch. The name deliberately
 * avoids the service worker's prefix, whose cleanup would delete it.
 */
export const THUMBNAIL_CACHE = `mampffred-thumbnails-v1-${encodeURIComponent(import.meta.env.BASE_URL)}`;
const thumbnailRequest = (key: string) =>
  new Request(
    new URL(
      `${import.meta.env.BASE_URL}__thumbnails/${encodeURIComponent(key)}`,
      window.location.origin,
    ),
  );

// Decoding several large photos at once spikes memory on weak phones.
const MAX_PARALLEL_DECODES = 2;
let activeDecodes = 0;
const waiting: Array<() => void> = [];
async function withDecodeSlot<T>(task: () => Promise<T>) {
  if (activeDecodes >= MAX_PARALLEL_DECODES)
    await new Promise<void>((resolve) => waiting.push(resolve));
  activeDecodes++;
  try {
    return await task();
  } finally {
    activeDecodes--;
    waiting.shift()?.();
  }
}

async function cachedThumbnail(key: string) {
  try {
    if (!('caches' in window)) return undefined;
    const cache = await caches.open(THUMBNAIL_CACHE);
    const hit = await cache.match(thumbnailRequest(key));
    return hit ? await hit.blob() : undefined;
  } catch {
    return undefined;
  }
}

async function storeThumbnail(key: string, blob: Blob) {
  try {
    if (!('caches' in window)) return;
    const cache = await caches.open(THUMBNAIL_CACHE);
    await cache.put(
      thumbnailRequest(key),
      new Response(blob, { headers: { 'content-type': blob.type } }),
    );
  } catch {
    // A missing cache only costs another decode next time.
  }
}

async function renderThumbnail(blob: Blob) {
  const bitmap = await createImageBitmap(blob);
  try {
    const scale = Math.min(
      1,
      THUMBNAIL_EDGE / Math.max(bitmap.width, bitmap.height),
    );
    if (scale === 1) return blob;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) return undefined;
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', 0.8),
    );
  } finally {
    bitmap.close();
  }
}

async function createThumbnail(key: string) {
  const cached = await cachedThumbnail(key);
  if (cached) return URL.createObjectURL(cached);
  if (!('createImageBitmap' in window)) return undefined;
  const small = await withDecodeSlot(async () => {
    const blob = await loadRecipeImage(key);
    return blob ? renderThumbnail(blob) : undefined;
  });
  if (!small) return undefined;
  void storeThumbnail(key, small);
  return URL.createObjectURL(small);
}

/**
 * Small list images decode full-size photos only once and then keep a
 * lightweight copy, which keeps scrolling smooth on older phones.
 */
function useThumbnail(key: string | undefined, enabled: boolean) {
  const [result, setResult] = useState<{ key: string; url?: string }>();
  useEffect(() => {
    if (!enabled || !key) return;
    let cancelled = false;
    let pending = thumbnails.get(key);
    if (!pending) {
      pending = createThumbnail(key).catch(() => undefined);
      thumbnails.set(key, pending);
    }
    void pending.then((url) => {
      if (!cancelled) setResult({ key, url });
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, key]);
  if (!enabled || !key || result?.key !== key)
    return { state: 'pending' as const };
  return result.url
    ? { state: 'ready' as const, url: result.url }
    : { state: 'failed' as const };
}

export function RecipeImage({
  recipe,
  imageUrls,
  className = '',
  thumbnail = false,
  cover = false,
  eager = false,
}: {
  recipe: Recipe;
  imageUrls: Record<string, string>;
  className?: string;
  /** Use a downscaled copy for small list images. */
  thumbnail?: boolean;
  /** Fill the box even for manually cropped images. */
  cover?: boolean;
  /** Load right away, e.g. for carousel pages next to the visible one. */
  eager?: boolean;
}) {
  const requestImage = useContext(RecipeImageRequestContext);
  const placeholderRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(!thumbnail);
  const storedImageUrl = recipe.imageKey
    ? imageUrls[recipe.imageKey]
    : undefined;
  const small = useThumbnail(recipe.imageKey, thumbnail && visible);
  // A failed thumbnail falls back to the full image rather than no image.
  const useFullImage = !thumbnail || small.state === 'failed';
  const displayUrl =
    small.state === 'ready'
      ? small.url
      : useFullImage
        ? storedImageUrl
        : undefined;
  useEffect(() => {
    if (!recipe.imageKey || displayUrl) return;
    const placeholder = placeholderRef.current;
    const load = () => {
      if (useFullImage) requestImage(recipe.imageKey!);
      else setVisible(true);
    };
    if (eager || !placeholder || !('IntersectionObserver' in window)) {
      load();
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        load();
        observer.disconnect();
      },
      { rootMargin: '160px 0px' },
    );
    observer.observe(placeholder);
    return () => observer.disconnect();
  }, [recipe.imageKey, requestImage, displayUrl, useFullImage, eager]);

  if (displayUrl)
    return (
      <FramedImage
        className={`recipe-photo ${className}`}
        src={displayUrl}
        alt={`Foto von ${recipe.name}`}
        frame={recipe.imageFrame}
        cover={cover}
      />
    );
  // Stored photos get a calm placeholder instead of an unrelated sprite image.
  if (recipe.imageKey)
    return (
      <div
        ref={placeholderRef}
        className={`recipe-photo recipe-photo-loading ${className}`}
        role="img"
        aria-label={`Foto von ${recipe.name}`}
      />
    );
  return (
    <div
      ref={placeholderRef}
      className={`recipe-photo recipe-sprite ${className}`}
      role="img"
      aria-label={`Foto von ${recipe.name}`}
      style={
        {
          '--cell-x': recipe.imageCell % 3,
          '--cell-y': Math.floor(recipe.imageCell / 3),
          '--recipe-sprite-url': `url("${assetUrl('assets/recipe-sprite-optimized.jpg')}")`,
        } as React.CSSProperties
      }
    />
  );
}
