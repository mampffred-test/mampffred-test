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
  'standard-gemueselasagne-image-v1': async () =>
    (await import('./standard-images/gemueselasagne.ts')).recipeImage(),
  'standard-couscous-salat-mit-gebratenem-gemuese-und-raeuchertofu-image-v1':
    async () =>
      (
        await import('./standard-images/couscous-salat-mit-gebratenem-gemuese-und-raeuchertofu.ts')
      ).recipeImage(),
  'standard-ofen-risotto-mit-brechbohnen-image-v1': async () =>
    (
      await import('./standard-images/ofen-risotto-mit-brechbohnen.ts')
    ).recipeImage(),
  'standard-feta-pasta-aus-dem-ofen-image-v1': async () =>
    (
      await import('./standard-images/feta-pasta-aus-dem-ofen.ts')
    ).recipeImage(),
  'standard-halloumi-wraps-image-v1': async () =>
    (await import('./standard-images/halloumi-wraps.ts')).recipeImage(),
  'standard-halloumi-burger-image-v1': async () =>
    (await import('./standard-images/halloumi-burger.ts')).recipeImage(),
  'standard-sommerrollen-mit-raeuchertofu-image-v1': async () =>
    (
      await import('./standard-images/sommerrollen-mit-raeuchertofu.ts')
    ).recipeImage(),
  'standard-mildes-gemuesecurry-mit-reis-image-v1': async () =>
    (
      await import('./standard-images/mildes-gemuesecurry-mit-reis.ts')
    ).recipeImage(),
  'standard-gnocchi-auflauf-mit-gruenem-spargel-tomaten-und-feta-image-v1':
    async () =>
      (
        await import('./standard-images/gnocchi-auflauf-mit-gruenem-spargel-tomaten-und-feta.ts')
      ).recipeImage(),
  'standard-ofengemuese-mit-raeuchertofu-feta-und-quark-image-v1': async () =>
    (
      await import('./standard-images/ofengemuese-mit-raeuchertofu-feta-und-quark.ts')
    ).recipeImage(),
  'standard-toast-hawaii-image-v1': async () =>
    (await import('./standard-images/toast-hawaii.ts')).recipeImage(),
  'standard-sandwichmaker-sandwiches-image-v1': async () =>
    (
      await import('./standard-images/sandwichmaker-sandwiches.ts')
    ).recipeImage(),
  'standard-vegetarisches-huehnerfrikassee-mit-kraeuterseitlingen-image-v1':
    async () =>
      (
        await import('./standard-images/vegetarisches-huehnerfrikassee-mit-kraeuterseitlingen.ts')
      ).recipeImage(),
  'standard-kuerbissuppe-mit-raeuchertofu-image-v1': async () =>
    (
      await import('./standard-images/kuerbissuppe-mit-raeuchertofu.ts')
    ).recipeImage(),
  'standard-zucchini-feta-roellchen-mit-cherrytomaten-image-v1': async () =>
    (
      await import('./standard-images/zucchini-feta-roellchen-mit-cherrytomaten.ts')
    ).recipeImage(),
  'standard-gemuesesuppe-mit-brokkoli-image-v1': async () =>
    (
      await import('./standard-images/gemuesesuppe-mit-brokkoli.ts')
    ).recipeImage(),
  'standard-salat-mit-raeuchertofu-oder-halloumi-image-v1': async () =>
    (
      await import('./standard-images/salat-mit-raeuchertofu-oder-halloumi.ts')
    ).recipeImage(),
  'standard-vegetarisches-huehnerfrikassee-mit-kraeuterseitlingen-image-v2':
    async () =>
      (
        await import('./standard-images/vegetarisches-huehnerfrikassee-mit-kraeuterseitlingen.ts')
      ).recipeImage(),
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
