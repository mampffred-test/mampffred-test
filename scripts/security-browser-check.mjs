// Run with PLAYWRIGHT_MODULE pointing at the installed Playwright package and
// BROWSER_EXECUTABLE pointing at a local Chromium browser. No downloads required.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, relative, extname } from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
import {
  createSharedRecipeUrl,
  parseSharedRecipe,
} from '../lib/recipe-sharing.ts';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = process.cwd();
let emergency = false;
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (emergency && (pathname === '/sw.js' || pathname === '/recovery.html')) {
      response.setHeader(
        'Content-Type',
        pathname === '/sw.js' ? 'text/javascript' : 'text/html',
      );
      response.setHeader('Cache-Control', 'no-store');
      response.end(
        await readFile(
          resolve(
            root,
            pathname === '/sw.js'
              ? 'scripts/emergency-sw.js'
              : 'scripts/emergency-recovery.html',
          ),
        ),
      );
      return;
    }
    if (pathname === '/__test') {
      response.setHeader('Content-Type', 'text/html');
      response.end('<!doctype html><title>Local security tests</title>');
      return;
    }
    const sourceModule = pathname.startsWith('/__modules/');
    const base = sourceModule ? root : resolve(root, 'dist/client');
    const target = resolve(
      base,
      sourceModule
        ? pathname.slice('/__modules/'.length)
        : pathname === '/'
          ? 'index.html'
          : pathname.slice(1),
    );
    if (relative(base, target).startsWith('..'))
      throw new Error('outside fixture');
    let content = await readFile(target);
    if (sourceModule && target.endsWith('.ts'))
      content = ts.transpileModule(content.toString(), {
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
        },
      }).outputText;
    response.setHeader(
      'Content-Type',
      sourceModule || target.endsWith('.js')
        ? 'text/javascript'
        : {
            '.html': 'text/html',
            '.css': 'text/css',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.webmanifest': 'application/manifest+json',
          }[extname(target)] || 'application/octet-stream',
    );
    response.end(content);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.BROWSER_EXECUTABLE,
  });
  const page = await browser.newPage();
  await page.goto(`${origin}/__test`);
  const result = await page.evaluate(async () => {
    const storage = await import('/__modules/lib/storage.ts');
    const { createEmptyData, createSampleRecipes } =
      await import('/__modules/lib/model.ts');
    const ok = (condition, message) => {
      if (!condition) throw new Error(message);
    };
    const data = createEmptyData();
    data.recipes = [{ ...createSampleRecipes()[0], imageKey: 'shared' }];
    const { shareId: _, ...draft } = data.recipes[0];
    data.recipeDrafts = [
      {
        ...draft,
        id: 'draft',
        foodOverrides: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    await storage.queueSaveData(data, {
      shared: new Blob(['original'], { type: 'image/png' }),
    });
    const onlyDraft = { ...data, recipes: [] };
    await storage.queueSaveData(onlyDraft);
    ok(
      (await (await storage.loadRecipeImage('shared')).text()) === 'original',
      'shared image deleted',
    );
    const broken = {
      ...onlyDraft,
      recipeDrafts: onlyDraft.recipeDrafts.map((d) => ({
        ...d,
        imageKey: 'missing',
      })),
    };
    let rejected = false;
    try {
      await storage.queueSaveData(broken, { unreferenced: new Blob(['leak']) });
    } catch {
      rejected = true;
    }
    ok(rejected, 'missing image must abort');
    ok(
      (await storage.loadData()).recipeDrafts[0].imageKey === 'shared',
      'metadata rollback failed',
    );
    ok(
      await storage.loadRecipeImage('shared'),
      'image deletion rollback failed',
    );
    ok(
      !(await storage.loadRecipeImage('unreferenced')),
      'unreferenced new image leaked',
    );
    await storage.queueSaveData(createEmptyData(), {}, ['shared']);
    ok(await storage.loadRecipeImage('shared'), 'undo retention failed');
    await storage.queueSaveData(createEmptyData());
    ok(!(await storage.loadRecipeImage('shared')), 'discard GC failed');
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 3;
    const png = await new Promise((r) => canvas.toBlob(r, 'image/png'));
    const input = new Blob([png, 'hidden trailing bytes'], {
      type: 'image/png',
    });
    const clean = await storage.optimizeImage(input);
    ok(
      !(await clean.text()).includes('hidden trailing bytes'),
      'image was not reencoded',
    );
    const actualBitmap = await createImageBitmap(clean);
    ok(
      actualBitmap.width === 4 && actualBitmap.height === 3,
      'valid image changed dimensions',
    );
    actualBitmap.close();
    const realDecoder = window.createImageBitmap;
    let closed = false;
    window.createImageBitmap = async () => ({
      width: 20000,
      height: 20000,
      close() {
        closed = true;
      },
    });
    rejected = false;
    try {
      await storage.optimizeImage(png);
    } catch {
      rejected = true;
    } finally {
      window.createImageBitmap = realDecoder;
    }
    ok(rejected && closed, 'decoded dimensions did not fail before canvas');
    return 'PASS: atomic rollback, shared image retention, undo retention, orphan cleanup, reencoding, decoded dimension guard';
  });
  console.log(result);
  await page.close();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: 'reduce',
  });
  const app = await context.newPage();
  const errors = [];
  app.on('pageerror', (error) => errors.push(error.message));
  await app.goto(origin);
  await app
    .getByRole('button', { name: /Los geht|Start|Ohne Installation|Direkt/i })
    .first()
    .click({ timeout: 10000 });
  await app.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await app
    .getByRole('button', { name: 'Beispielrezepte ausprobieren' })
    .click();
  await app
    .getByText('Haferporridge mit Beeren', { exact: true })
    .first()
    .waitFor();
  assert.equal(errors.length, 0, errors.join('\n'));
  await context.setOffline(true);
  await app.reload();
  await app
    .getByText('Haferporridge mit Beeren', { exact: true })
    .first()
    .waitFor();
  assert.equal(errors.length, 0, errors.join('\n'));
  await app.screenshot({ path: 'outputs/security/mobile-offline.png' });
  console.log(
    'PASS: mobile Chromium production startup, service-worker registration and offline reload',
  );
  await context.setOffline(false);
  const storedRecipes = () =>
    app.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const request = indexedDB.open('mampffred');
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const db = request.result;
            const tx = db.transaction('app');
            const read = tx.objectStore('app').get('state');
            read.onsuccess = () => resolve(read.result.recipes);
            tx.oncomplete = () => db.close();
          };
        }),
    );
  const initialRecipeCount = (await storedRecipes()).length;
  await app
    .getByRole('navigation', { name: 'Hauptnavigation' })
    .getByRole('button', { name: 'Rezepte', exact: true })
    .click();
  await app.evaluate(() => {
    window.__shareMode = 'success';
    window.__clipboardBlocked = false;
    window.__clipboardWrites = [];
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (data) => {
        window.__lastShare = {
          ...data,
          active: navigator.userActivation.isActive,
        };
        if (window.__shareMode !== 'success')
          throw new DOMException('Simulated native result', window.__shareMode);
      },
    });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text) => {
          if (window.__clipboardBlocked)
            throw new DOMException(
              'Simulated clipboard denial',
              'NotAllowedError',
            );
          window.__clipboardWrites.push(text);
        },
      },
    });
  });
  await app
    .getByText('Haferporridge mit Beeren', { exact: true })
    .first()
    .click();
  await app.getByRole('button', { name: 'Rezept teilen', exact: true }).click();
  const shared = await app.evaluate(() => window.__lastShare);
  assert.equal(
    shared.active,
    true,
    'native share must be called within click activation',
  );
  assert.match(shared.url, /#recipe=gzip\./);
  await app.evaluate(() => {
    window.__shareMode = 'AbortError';
  });
  await app.getByRole('button', { name: 'Rezept teilen', exact: true }).click();
  assert.deepEqual(await app.evaluate(() => window.__clipboardWrites), []);
  await app.evaluate(() => {
    window.__shareMode = 'NotAllowedError';
    window.__clipboardBlocked = true;
  });
  await app.getByRole('button', { name: 'Rezept teilen', exact: true }).click();
  const copyDialog = app.getByRole('dialog', {
    name: 'Rezeptlink kopieren',
    exact: true,
  });
  await copyDialog.waitFor();
  assert.match(
    await copyDialog
      .getByRole('textbox', { name: 'Rezeptlink', exact: true })
      .inputValue(),
    /#recipe=gzip\./,
  );
  await copyDialog
    .getByRole('button', { name: 'Link kopieren', exact: true })
    .click();
  await copyDialog.getByRole('status').waitFor();
  await app.evaluate(() => {
    window.__clipboardBlocked = false;
  });
  await copyDialog
    .getByRole('button', { name: 'Link kopieren', exact: true })
    .click();
  await copyDialog.waitFor({ state: 'hidden' });
  assert.equal((await app.evaluate(() => window.__clipboardWrites)).length, 1);
  const downloadReady = app.waitForEvent('download');
  await app
    .getByRole('button', { name: 'Als Rezeptdatei sichern', exact: true })
    .click();
  const download = await downloadReady;
  assert.match(
    download.suggestedFilename(),
    /^mampffred-.+\.mampffred-rezept$/,
  );
  const exportedBytes = await readFile(await download.path());
  const exported = await parseSharedRecipe(exportedBytes.toString());
  assert.equal(exported.name, 'Haferporridge mit Beeren');
  await app.getByRole('button', { name: 'Zurück', exact: true }).click();
  const importFile = () =>
    app
      .locator('input[accept*=".mampffred-rezept"]')
      .setInputFiles({
        name: download.suggestedFilename(),
        mimeType: 'application/json',
        buffer: exportedBytes,
      });
  const preview = app
    .getByRole('dialog')
    .filter({ hasText: 'Mit dir über Mampffred geteilt' });
  await importFile();
  await preview.waitFor();
  assert.equal(
    (await storedRecipes()).length,
    initialRecipeCount,
    'file preview must not save',
  );
  await preview.getByRole('button', { name: 'Abbrechen', exact: true }).click();
  assert.equal((await storedRecipes()).length, initialRecipeCount);
  await importFile();
  await preview
    .getByRole('button', { name: 'Rezept hinzufügen', exact: true })
    .click();
  await preview.waitFor({ state: 'hidden' });
  assert.equal((await storedRecipes()).length, initialRecipeCount + 1);
  await app.getByRole('button', { name: 'Zurück', exact: true }).click();
  await app.evaluate((url) => {
    window.location.hash = new URL(url).hash;
  }, shared.url);
  await preview.waitFor();
  await app.waitForFunction(() => window.location.hash === '');
  await preview
    .getByRole('button', { name: 'Rezept hinzufügen', exact: true })
    .click();
  await preview.waitFor({ state: 'hidden' });
  assert.equal(
    (await storedRecipes()).length,
    initialRecipeCount + 1,
    'link/file reimport must deduplicate',
  );
  await app.getByRole('button', { name: 'Zurück', exact: true }).click();
  const longEnvelope = JSON.parse(exportedBytes.toString());
  longEnvelope.recipe.name = 'L'.repeat(200);
  longEnvelope.recipe.description = 'D'.repeat(5000);
  const longLink = await createSharedRecipeUrl(
    JSON.stringify(longEnvelope),
    origin,
  );
  await app.setViewportSize({ width: 844, height: 390 });
  await app.evaluate((url) => {
    window.location.hash = new URL(url).hash;
  }, longLink);
  await preview.waitFor();
  const previewBounds = await preview.boundingBox();
  assert.ok(
    previewBounds.y >= 0 && previewBounds.y + previewBounds.height <= 390,
    'preview stays inside landscape viewport',
  );
  await preview
    .getByRole('button', { name: 'Abbrechen', exact: true })
    .scrollIntoViewIfNeeded();
  await app.screenshot({
    path: 'outputs/security/share-preview-landscape.png',
  });
  await preview.getByRole('button', { name: 'Abbrechen', exact: true }).click();
  await app.setViewportSize({ width: 390, height: 844 });
  await app.evaluate(() => {
    window.location.hash = 'recipe=gzip.invalid';
  });
  await app
    .getByText('Dieser Rezeptlink ist ungültig oder unvollständig.', {
      exact: true,
    })
    .waitFor();
  await app.waitForFunction(() => window.location.hash === '');
  assert.equal((await storedRecipes()).length, initialRecipeCount + 1);
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log(
    'PASS: share activation, abort, clipboard retry, actual file download, preview/cancel/confirm, link/file deduplication, malformed link and landscape layout',
  );
  await app
    .getByRole('button', { name: 'Rezept hinzufügen', exact: true })
    .click();
  // Keep the storage writer occupied past the editor debounce, then discard.
  await app.evaluate(() => {
    const request = indexedDB.open('mampffred');
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(['app', 'images'], 'readwrite');
      const until = performance.now() + 1500;
      const pump = () => {
        const get = tx.objectStore('app').get('state');
        get.onsuccess = () => {
          if (performance.now() < until) pump();
        };
      };
      pump();
      tx.oncomplete = () => db.close();
    };
  });
  await app
    .getByLabel('Rezeptname', { exact: true })
    .fill('Entwurf darf nicht zurückkehren');
  app.once('dialog', (dialog) => dialog.accept());
  await app
    .getByRole('button', { name: 'Entwurf verwerfen', exact: true })
    .click();
  await app
    .getByRole('dialog', { name: 'Rezept anlegen', exact: true })
    .waitFor({ state: 'hidden' });
  const drafts = await app.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open('mampffred');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('app', 'readonly');
          const read = tx.objectStore('app').get('state');
          read.onsuccess = () => resolve(read.result.recipeDrafts);
          tx.oncomplete = () => db.close();
        };
      }),
  );
  assert.deepEqual(drafts, []);
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log(
    'PASS: delayed draft discard cannot be undone by pending autosave',
  );
  await app
    .getByRole('button', { name: 'Rezept hinzufügen', exact: true })
    .click();
  await app.evaluate(() => {
    window.__failWrites = true;
    const original = Object.getOwnPropertyDescriptor(
      IDBObjectStore.prototype,
      'put',
    ).value;
    IDBObjectStore.prototype.put = function (...args) {
      if (window.__failWrites && this.name === 'app')
        throw new DOMException('Injected quota failure', 'QuotaExceededError');
      return original.apply(this, args);
    };
  });
  await app
    .getByLabel('Rezeptname', { exact: true })
    .fill('Ungespeicherter Entwurf');
  await app
    .getByRole('heading', { name: 'Änderungen sind noch nicht gespeichert.' })
    .waitFor();
  assert.equal(
    await app.getByLabel('Rezeptname', { exact: true }).inputValue(),
    'Ungespeicherter Entwurf',
  );
  await app.evaluate(() => {
    window.__failWrites = false;
  });
  await app
    .getByRole('button', { name: 'Speichern erneut versuchen', exact: true })
    .click();
  await app
    .getByRole('heading', { name: 'Änderungen sind noch nicht gespeichert.' })
    .waitFor({ state: 'hidden' });
  assert.equal(
    await app.getByLabel('Rezeptname', { exact: true }).inputValue(),
    'Ungespeicherter Entwurf',
  );
  app.once('dialog', (dialog) => dialog.accept());
  await app
    .getByRole('button', { name: 'Entwurf verwerfen', exact: true })
    .click();
  await app
    .getByRole('dialog', { name: 'Rezept anlegen', exact: true })
    .waitFor({ state: 'hidden' });
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log(
    'PASS: quota failure stays visible, retains editor input, and retries successfully',
  );
  const importEnvelope = await app.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open('mampffred');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('app', 'readwrite');
          const store = tx.objectStore('app');
          const read = store.get('state');
          let envelope;
          read.onsuccess = () => {
            const data = read.result;
            const recipe = data.recipes[0];
            envelope = {
              format: 'mampffred-recipe',
              version: 1,
              shareId: 'untrusted',
              recipe,
            };
            data.recipes = Array.from({ length: 1000 }, (_, i) => ({
              ...recipe,
              id: `full-${i}`,
              shareId: `full-${i}`,
              name: `Rezept ${i}`,
            }));
            data.plan = [];
            store.put(data, 'state');
          };
          tx.oncomplete = () => {
            db.close();
            resolve(envelope);
          };
          tx.onabort = () => reject(tx.error);
        };
      }),
  );
  await app.reload();
  await app
    .getByRole('navigation', { name: 'Hauptnavigation' })
    .getByRole('button', { name: 'Rezepte', exact: true })
    .click();
  await app
    .locator('input[accept*=".mampffred-rezept"]')
    .setInputFiles({
      name: 'extra.mampffred-rezept',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(importEnvelope)),
    });
  await app
    .getByRole('dialog')
    .filter({ hasText: 'Mit dir über Mampffred geteilt' })
    .getByRole('button', { name: 'Rezept hinzufügen', exact: true })
    .click();
  await app
    .getByRole('alert')
    .filter({ hasText: 'höchstens 1.000 Rezepte' })
    .waitFor();
  await app.getByRole('button', { name: 'Verstanden', exact: true }).click();
  assert.equal(
    await app.evaluate(
      () =>
        new Promise((resolve) => {
          const req = indexedDB.open('mampffred');
          req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction('app');
            const read = tx.objectStore('app').get('state');
            read.onsuccess = () => resolve(read.result.recipes.length);
            tx.oncomplete = () => db.close();
          };
        }),
    ),
    1000,
  );
  console.log(
    'PASS: full collection rejects imported growth without changing stored state',
  );
  emergency = true;
  await app.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    await registration.update();
  });
  await app.waitForURL(`${origin}/recovery.html`);
  await app
    .getByRole('heading', { name: 'Mampffred wird gewartet.' })
    .waitFor();
  assert.equal(
    await app.evaluate(
      async () => (await navigator.serviceWorker.getRegistrations()).length,
    ),
    0,
  );
  console.log(
    'PASS: real emergency-worker update unregisters and reaches a non-registering recovery page',
  );
} finally {
  await browser?.close();
  await new Promise((r) => server.close(r));
}
