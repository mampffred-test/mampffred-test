import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import { readFileSync, readdirSync } from 'node:fs';

const outputDirectory = 'dist/client';

// Include worker and static assets as well: every shipped change gets a new identity.
function buildIdentity() {
  const hash = createHash('sha256');
  const visit = (path: string) => {
    for (const entry of readdirSync(path, { withFileTypes: true }).sort(
      (a, b) => a.name.localeCompare(b.name, 'en'),
    )) {
      const file = join(path, entry.name);
      if (entry.isDirectory()) visit(file);
      else {
        const bytes = readFileSync(file);
        hash.update(file.replaceAll('\\', '/'));
        hash.update(
          /\.(ts|tsx|js|css|html|json|webmanifest)$/.test(file)
            ? bytes.toString('utf8').replaceAll('\r\n', '\n')
            : bytes,
        );
      }
    }
  };
  for (const directory of ['src', 'components', 'lib', 'app', 'public'])
    visit(directory);
  for (const file of [
    'package.json',
    'package-lock.json',
    'vite.config.ts',
    'index.html',
  ])
    hash.update(readFileSync(file, 'utf8').replaceAll('\r\n', '\n'));
  return hash.digest('hex').slice(0, 12);
}
const buildId = buildIdentity();
const appVersion = (
  JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }
).version;

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
        'assets/basil-header-leaves.png',
        'assets/basil-card-leaves.png',
        'assets/recipe-sprite-optimized.jpg',
        ...builtAssets,
      ];
      const cacheVersion = createHash('sha256')
        .update(buildId)
        .update(appShell.join('|'))
        .digest('hex')
        .slice(0, 12);
      await writeFile(
        serviceWorkerPath,
        source
          .replace('__MAMPFFRED_PRECACHE__', JSON.stringify(appShell))
          .replace('__MAMPFFRED_CACHE__', cacheVersion)
          .replace('__MAMPFFRED_BUILD__', buildId),
      );
      await writeFile(
        join(outputDirectory, 'version.json'),
        JSON.stringify({ buildId, version: appVersion }),
      );
    },
  };
}

export default defineConfig({
  define: {
    __APP_BUILD_ID__: JSON.stringify(buildId),
    __APP_VERSION__: JSON.stringify(appVersion),
  },
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
