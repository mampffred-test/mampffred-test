import { CANNELLONI_IMAGE_KEY } from './standard-recipes.ts';

const loaders: Record<string, () => Promise<Blob>> = {
  [CANNELLONI_IMAGE_KEY]: async () =>
    (await import('./standard-recipe-image.ts')).cannelloniImage(),
  'standard-pistazien-zitronen-spaghetti-image-v1': async () =>
    (
      await import('./standard-image-pistazien-zitronen-spaghetti.ts')
    ).recipeImage(),
  'standard-rote-bete-feta-auflauf-image-v1': async () =>
    (await import('./standard-image-rote-bete-feta-auflauf.ts')).recipeImage(),
  'standard-selbst-belegte-pizza-image-v1': async () =>
    (await import('./standard-image-selbst-belegte-pizza.ts')).recipeImage(),
};

/** JS chunks are precached by the service worker; no network fetch is required. */
export async function loadStandardRecipeImages(
  keys: string[],
): Promise<Record<string, Blob>> {
  return Object.fromEntries(
    await Promise.all(
      [...new Set(keys)].map(async (key) => {
        const load = loaders[key];
        if (!load) throw new Error('UNKNOWN_STANDARD_IMAGE');
        return [key, await load()] as const;
      }),
    ),
  );
}
