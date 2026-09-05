import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

const outputDirectory = 'dist/client';

function deploymentBase() {
  if (process.env.VITE_BASE_PATH) return process.env.VITE_BASE_PATH;
  const [owner, repository] = (process.env.GITHUB_REPOSITORY ?? '').split('/');
  if (!owner || !repository) return '/';
  return repository.toLowerCase() === `${owner.toLowerCase()}.github.io`
    ? '/'
    : `/${repository}/`;
}

function serviceWorkerPrecache() {
  return {
    name: 'mampffred-service-worker-precache',
    apply: 'build' as const,
    async closeBundle() {
      const assetDirectory = join(outputDirectory, 'assets');
      const builtAssets = (await readdir(assetDirectory))
        .filter((file) => file.endsWith('.js') || file.endsWith('.css'))
        .map((file) => `assets/${file}`);
      const serviceWorkerPath = join(outputDirectory, 'sw.js');
      const source = await readFile(serviceWorkerPath, 'utf8');
      const appShell = [
        '',
        'manifest.webmanifest',
        'assets/app-icon-192.png',
        'assets/app-icon-512.png',
        'assets/apple-touch-icon.png',
        'assets/mampffred-mascot-small.png',
        'assets/recipe-sprite-optimized.jpg',
        ...builtAssets,
      ];
      const cacheVersion = createHash('sha256')
        .update(appShell.join('|'))
        .digest('hex')
        .slice(0, 12);
      await writeFile(
        serviceWorkerPath,
        source
          .replace('__MAMPFFRED_PRECACHE__', JSON.stringify(appShell))
          .replace('__MAMPFFRED_CACHE__', cacheVersion),
      );
    },
  };
}

export default defineConfig({
  base: deploymentBase(),
  plugins: [react(), serviceWorkerPrecache()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
  build: {
    outDir: outputDirectory,
    emptyOutDir: true,
  },
});
