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
  parseSharedRecipeFile,
} from '../lib/recipe-sharing.ts';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = process.cwd();
let emergency = false;
const postedToServer = [];
const server = createServer(async (request, response) => {
  if (request.method === 'POST') postedToServer.push(request.url);
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
  const photoFixture = await page.evaluate(async () => {
    const sharing = await import('/__modules/lib/recipe-sharing.ts');
    const { createSampleRecipes } = await import('/__modules/lib/model.ts');
    const canvas = document.createElement('canvas');
    canvas.width = 1600;
    canvas.height = 1000;
    const painter = canvas.getContext('2d');
    painter.fillStyle = '#e36e42';
    painter.fillRect(0, 0, 800, 1000);
    painter.fillStyle = '#72a144';
    painter.fillRect(800, 0, 800, 1000);
    const photo = await new Promise((resolve) =>
      canvas.toBlob(resolve, 'image/png'),
    );
    const recipe = {
      ...createSampleRecipes()[0],
      name: 'Foto-Testrezept',
      imageKey: 'private-key-never-exported',
      imageFrame: { x: 0.2, y: 0.7, zoom: 1.5 },
    };
    const exported = await sharing.createSharedRecipeTransferFile(
      recipe,
      photo,
    );
    const contents = await exported.text();
    const parsed = await sharing.parseSharedRecipeFile(contents);
    if (
      !parsed.image ||
      parsed.image.type !== 'image/jpeg' ||
      parsed.recipe.imageFrame.zoom !== 1.5 ||
      contents.includes(recipe.imageKey)
    )
      throw new Error('image roundtrip failed');
    const bitmap = await createImageBitmap(parsed.image);
    if (bitmap.width > 1200 || bitmap.height > 1200)
      throw new Error('image not resized');
    bitmap.close();
    const invalid = JSON.parse(contents);
    invalid.image.data = 'YWJj';
    let rejected = false;
    try {
      await sharing.parseSharedRecipeFile(JSON.stringify(invalid));
    } catch {
      rejected = true;
    }
    if (!rejected) throw new Error('invalid image accepted');
    const text = JSON.parse(contents);
    delete text.image;
    text.version = 1;
    return { contents, text: JSON.stringify(text), frame: recipe.imageFrame };
  });
  console.log(
    'PASS: versioned image-file roundtrip, resize, framing, private-key omission and malformed-image rejection',
  );
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
    Object.defineProperty(navigator, 'canShare', {
      configurable: true,
      value: (data) =>
        data.files?.every(
          (file) => file.type === 'text/plain' && file.name.endsWith('.txt'),
        ),
    });
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
  assert.match(shared.text, /gedrückt halten → ⋮ → Teilen → Mampffred/);
  assert.equal(
    shared.active,
    true,
    'native share must be called within click activation',
  );
  const transfer = await app.evaluate(async () => ({
    name: window.__lastShare.files[0].name,
    type: window.__lastShare.files[0].type,
    data: JSON.parse(await window.__lastShare.files[0].text()),
  }));
  assert.match(transfer.name, /\.mampffred-rezept\.txt$/);
  assert.equal(transfer.type, 'text/plain');
  assert.equal(transfer.data.recipe.name, 'Haferporridge mit Beeren');
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
  await app
    .getByRole('dialog', { name: 'Rezept teilen', exact: true })
    .getByRole('button', { name: 'Rezeptlink teilen', exact: true })
    .click();
  const copyDialog = app.getByRole('dialog', {
    name: 'Rezeptlink kopieren',
    exact: true,
  });
  await copyDialog.waitFor();
  shared.url = await app.evaluate(() => window.__lastShare.url);
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
  const { recipe: exported } = await parseSharedRecipeFile(
    exportedBytes.toString(),
  );
  assert.equal(exported.name, 'Haferporridge mit Beeren');
  await app.getByRole('button', { name: 'Zurück', exact: true }).click();
  const importFile = () =>
    app.locator('input[accept*=".mampffred-rezept"]').setInputFiles({
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
  longEnvelope.version = 1;
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
  const choosePhotoFile = (contents) =>
    app.locator('input[accept*=".mampffred-rezept"]').setInputFiles({
      name: 'foto.mampffred-rezept',
      mimeType: 'application/json',
      buffer: Buffer.from(contents),
    });
  await choosePhotoFile(photoFixture.contents);
  await preview.getByAltText('Geteiltes Rezeptbild').waitFor();
  await app.screenshot({ path: 'outputs/security/photo-import-preview.png' });
  await preview.getByRole('button', { name: 'Abbrechen', exact: true }).click();
  assert.equal(
    (await storedRecipes()).some((recipe) => recipe.name === 'Foto-Testrezept'),
    false,
  );
  await choosePhotoFile(photoFixture.text);
  await preview
    .getByRole('button', { name: 'Rezept hinzufügen', exact: true })
    .click();
  await preview.waitFor({ state: 'hidden' });
  await app.getByRole('button', { name: 'Zurück', exact: true }).click();
  await choosePhotoFile(photoFixture.contents);
  await preview.getByAltText('Geteiltes Rezeptbild').waitFor();
  await preview
    .getByRole('button', { name: 'Rezept hinzufügen', exact: true })
    .click();
  await preview.waitFor({ state: 'hidden' });
  const importedPhotos = (await storedRecipes()).filter(
    (recipe) => recipe.name === 'Foto-Testrezept',
  );
  assert.equal(
    importedPhotos.length,
    1,
    'photo upgrade must not duplicate text import',
  );
  assert.ok(importedPhotos[0].imageKey);
  assert.deepEqual(importedPhotos[0].imageFrame, photoFixture.frame);
  await app
    .getByRole('button', { name: 'Rezept bearbeiten', exact: true })
    .click();
  await app
    .getByRole('button', { name: 'Ausschnitt anpassen', exact: false })
    .click();
  const zoom = app.getByRole('slider', { name: 'Bild vergrößern' });
  await zoom.focus();
  await zoom.press('End');
  const pan = app.getByRole('button', {
    name: 'Bild verschieben; alternativ Pfeiltasten verwenden',
    exact: true,
  });
  await pan.press('ArrowLeft');
  const panBounds = await pan.boundingBox();
  const beforeDrag = await pan.locator('img').getAttribute('style');
  await app.mouse.move(panBounds.x + 100, panBounds.y + 100);
  await app.mouse.down();
  await app.mouse.move(panBounds.x + 140, panBounds.y + 110, { steps: 4 });
  await app.mouse.up();
  assert.notEqual(await pan.locator('img').getAttribute('style'), beforeDrag);
  await app.locator('.image-framing-editor').scrollIntoViewIfNeeded();
  await app.screenshot({ path: 'outputs/security/photo-framing-mobile.png' });
  await app.getByRole('button', { name: 'Übernehmen', exact: true }).click();
  const unit = app.getByRole('button', {
    name: 'Einheit für Zutat 1',
    exact: true,
  });
  await unit.click();
  const units = app.getByRole('listbox', {
    name: 'Einheit für Zutat 1',
    exact: true,
  });
  await units.waitFor();
  const bounds = await units.boundingBox();
  assert.ok(
    bounds.width <= 280 && bounds.x >= 0 && bounds.x + bounds.width <= 390,
  );
  assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= 844);
  await app.screenshot({ path: 'outputs/security/units-mobile.png' });
  await units.getByRole('option', { name: 'EL', exact: true }).click();
  assert.equal(await unit.textContent(), 'EL');
  await unit.click();
  await units.getByRole('option', { name: 'EL', exact: true }).press('Escape');
  await units.waitFor({ state: 'hidden' });
  await app.getByRole('dialog', { name: /^Rezept bearbeiten/ }).waitFor();
  await app
    .getByRole('button', { name: 'Rezept speichern', exact: true })
    .first()
    .click();
  await app
    .getByRole('dialog', { name: /^Rezept bearbeiten/ })
    .waitFor({ state: 'hidden' });
  const framed = (await storedRecipes()).find(
    (recipe) => recipe.name === 'Foto-Testrezept',
  );
  assert.equal(framed.imageFrame.zoom, 3);
  assert.notEqual(framed.imageFrame.x, photoFixture.frame.x);
  assert.equal(
    framed.imageKey,
    importedPhotos[0].imageKey,
    'framing preserves original blob',
  );
  const photoDownloadReady = app.waitForEvent('download');
  await app
    .getByRole('button', { name: 'Als Rezeptdatei sichern', exact: true })
    .click();
  const photoDownload = await photoDownloadReady;
  const photoExport = JSON.parse(
    (await readFile(await photoDownload.path())).toString(),
  );
  assert.equal(photoExport.version, 2);
  assert.equal(photoExport.image.type, 'image/jpeg');
  assert.deepEqual(photoExport.image.frame, framed.imageFrame);
  await app.evaluate(() => {
    window.__shareMode = 'success';
  });
  await app.getByRole('button', { name: 'Rezept teilen', exact: true }).click();
  const sentPhoto = await app.evaluate(async () =>
    JSON.parse(await window.__lastShare.files[0].text()),
  );
  assert.deepEqual(sentPhoto.image.frame, framed.imageFrame);
  assert.equal(sentPhoto.image.type, 'image/jpeg');
  await app
    .getByRole('button', { name: 'Rezept bearbeiten', exact: true })
    .click();
  await app
    .getByRole('button', { name: 'Ausschnitt anpassen', exact: false })
    .click();
  await app.getByRole('button', { name: 'Zurücksetzen', exact: true }).click();
  await app
    .locator('.image-framing-editor')
    .getByRole('button', { name: 'Abbrechen', exact: true })
    .click();
  await app
    .getByRole('button', { name: 'Rezept speichern', exact: true })
    .first()
    .click();
  await app
    .getByRole('dialog', { name: /^Rezept bearbeiten/ })
    .waitFor({ state: 'hidden' });
  assert.deepEqual(
    (await storedRecipes()).find((recipe) => recipe.name === 'Foto-Testrezept')
      .imageFrame,
    framed.imageFrame,
  );
  await app.getByRole('button', { name: 'Zurück', exact: true }).click();
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log(
    'PASS: image preview/cancel, image upgrade, persistent nondestructive framing, unit picker and keyboard escape, image download and crop cancellation',
  );
  // Simulate the OS multipart navigation through the real installed worker.
  // The app CSP blocks fetch, so this deliberately uses the share-target form path.
  const receiveFile = async (contents, target = app, mode = 'file') => {
    await target.evaluate(
      ({ text, mode }) => {
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = '/receive-share';
        form.enctype = 'multipart/form-data';
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.name = 'recipe';
        const transfer = new DataTransfer();
        if (mode === 'legacy-caption' || mode === 'caption-only')
          transfer.items.add(
            new File(
              ['Rezept für Mampffred – ein vorhandenes Foto ist enthalten.'],
              'shared.txt',
              { type: 'text/plain' },
            ),
          );
        if (mode !== 'caption-only' && mode !== 'missing')
          transfer.items.add(
            new File([text], 'rezept.mampffred-rezept.txt', {
              type: 'text/plain',
            }),
          );
        if (mode === 'multiple')
          transfer.items.add(
            new File([text], 'zweites.txt', { type: 'text/plain' }),
          );
        input.files = transfer.files;
        form.append(input);
        if (mode === 'caption-fields') {
          for (const name of ['text', 'title']) {
            const field = document.createElement('input');
            field.name = name;
            field.value = 'Nachricht mit Begleittext';
            form.append(field);
          }
        }
        document.body.append(form);
        form.submit();
      },
      { text: contents, mode },
    );
    await target.waitForURL(/\?incoming=/);
  };
  await context.setOffline(true);
  await receiveFile(photoFixture.contents);
  const receivedDialog = app
    .getByRole('dialog')
    .filter({ hasText: 'Mit dir über Mampffred geteilt' });
  await receivedDialog.waitFor();
  await receivedDialog.locator('.framed-image img').waitFor();
  await app.reload();
  await receivedDialog.waitFor();
  await receivedDialog
    .getByRole('button', { name: 'Rezept hinzufügen', exact: true })
    .click();
  await receivedDialog.waitFor({ state: 'hidden' });
  assert.equal(new URL(app.url()).searchParams.has('incoming'), false);
  const inboxCount = () =>
    app.evaluate(
      async () =>
        (await (await caches.open('mampffred-%2F-inbox')).keys()).length,
    );
  await app.waitForFunction(
    async () =>
      (await (await caches.open('mampffred-%2F-inbox')).keys()).length === 0,
  );
  await receiveFile(photoFixture.contents);
  await receivedDialog.waitFor();
  await receivedDialog
    .getByRole('button', { name: 'Abbrechen', exact: true })
    .click();
  await app.waitForFunction(
    async () =>
      (await (await caches.open('mampffred-%2F-inbox')).keys()).length === 0,
  );
  for (const mode of ['legacy-caption', 'caption-fields']) {
    await receiveFile(photoFixture.contents, app, mode);
    await receivedDialog.waitFor();
    await receivedDialog.locator('.framed-image img').waitFor();
    await receivedDialog
      .getByRole('button', { name: 'Abbrechen', exact: true })
      .click();
  }
  const importError = app.getByRole('dialog', {
    name: 'Rezept konnte nicht geöffnet werden',
  });
  for (const [mode, message] of [
    ['caption-only', 'Es ist nur Text angekommen'],
    ['missing', 'Es ist keine Rezeptdatei angekommen'],
    ['multiple', 'Es sind mehrere Rezepte angekommen'],
  ]) {
    await receiveFile(photoFixture.contents, app, mode);
    await importError.getByText(new RegExp(message)).waitFor();
    await importError
      .getByRole('button', { name: 'Schließen', exact: true })
      .click();
  }
  await receiveFile('{invalid');
  await importError.getByText(/keine gültige oder unterstützte/).waitFor();
  await new Promise((resolve) => setTimeout(resolve, 4500));
  assert.equal(
    await importError.isVisible(),
    true,
    'import errors must remain visible',
  );
  await app.screenshot({ path: 'outputs/security/recipe-import-error.png' });
  const chooser = app.waitForEvent('filechooser');
  await importError
    .getByRole('button', { name: 'Rezeptdatei auswählen', exact: true })
    .click();
  await (
    await chooser
  ).setFiles({
    name: 'rezept.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(photoFixture.contents),
  });
  await receivedDialog.waitFor();
  await receivedDialog.locator('.framed-image img').waitFor();
  await receivedDialog
    .getByRole('button', { name: 'Abbrechen', exact: true })
    .click();
  await app.waitForFunction(
    async () =>
      (await (await caches.open('mampffred-%2F-inbox')).keys()).length === 0,
  );
  assert.equal(await inboxCount(), 0);
  const otherWindow = await context.newPage();
  await otherWindow.goto(origin);
  await otherWindow
    .getByRole('heading', { name: 'Mampffred ist bereits geöffnet.' })
    .waitFor();
  await receiveFile(photoFixture.contents, otherWindow);
  await receivedDialog.waitFor();
  await otherWindow
    .getByRole('heading', { name: 'Deine Nachricht ist angekommen.' })
    .waitFor();
  await otherWindow.getByRole('button', { name: 'Zur geöffneten App' }).click();
  await receivedDialog
    .getByRole('button', { name: 'Abbrechen', exact: true })
    .click();
  await receiveFile(photoFixture.contents, otherWindow, 'caption-only');
  await importError.getByText(/Es ist nur Text angekommen/).waitFor();
  await otherWindow
    .getByRole('button', { name: 'Zur geöffneten App' })
    .waitFor();
  await importError
    .getByRole('button', { name: 'Schließen', exact: true })
    .click();
  await otherWindow.close();
  await app.waitForFunction(
    async () =>
      (await (await caches.open('mampffred-%2F-inbox')).keys()).length === 0,
  );
  assert.deepEqual(
    postedToServer,
    [],
    'incoming contents must never reach the server',
  );
  await context.setOffline(false);
  await app.goto(origin);
  await app
    .getByRole('navigation', { name: 'Hauptnavigation' })
    .getByRole('button', { name: 'Rezepte', exact: true })
    .click();
  console.log(
    'PASS: offline share-target POST, photo preview, reload recovery, confirm/cancel cleanup, existing-window handoff, invalid file rejection and zero server POSTs',
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
              imageKey: undefined,
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
  await app.locator('input[accept*=".mampffred-rezept"]').setInputFiles({
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
