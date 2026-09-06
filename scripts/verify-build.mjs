import { access, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const outputDirectory = 'dist/client';
const serviceWorker = await readFile(join(outputDirectory, 'sw.js'), 'utf8');
const builtIndex = await readFile(join(outputDirectory, 'index.html'), 'utf8');

if (!builtIndex.includes("connect-src 'none'"))
  throw new Error(
    'Die lokale App blockiert externe Laufzeitverbindungen nicht.',
  );

if (serviceWorker.includes('__MAMPFFRED_')) {
  throw new Error('Service Worker enthält noch einen Build-Platzhalter.');
}

const shellMatch = /const APP_SHELL = (\[[^;]+\])\.map/.exec(serviceWorker);
if (!shellMatch) throw new Error('App-Shell-Liste wurde nicht gefunden.');

const appShell = JSON.parse(shellMatch[1]);
for (const path of appShell) {
  if (path) await access(join(outputDirectory, path));
}

const manifest = JSON.parse(
  await readFile(join(outputDirectory, 'manifest.webmanifest'), 'utf8'),
);
if (
  manifest.share_target?.action !== './receive-share' ||
  manifest.share_target?.method !== 'POST' ||
  manifest.share_target?.enctype !== 'multipart/form-data' ||
  manifest.share_target?.params?.files?.[0]?.name !== 'recipe'
)
  throw new Error('Lokaler Rezeptempfang ist nicht korrekt registriert.');
for (const icon of manifest.icons ?? []) {
  await access(join(outputDirectory, icon.src));
}

const builtScripts = (
  await Promise.all(
    (await readdir(join(outputDirectory, 'assets')))
      .filter((file) => file.endsWith('.js'))
      .map((file) => readFile(join(outputDirectory, 'assets', file), 'utf8')),
  )
).join('\n');
if (
  !builtScripts.includes('Max Rubner-Institut') ||
  !builtScripts.includes(
    '12b7a6ba62807ec9b301eb276f897dc85f99b2292311618dec3749a12d984c91',
  ) ||
  !builtScripts.includes(
    'e95695243c7f593d6ddcaa4b819680a93c9788a933ac4887b8623c91a1dee50a',
  )
)
  throw new Error('BLS-Attribution oder Quelldigest fehlt im Build.');

console.log(`Build verifiziert: ${appShell.length} Offline-Dateien vorhanden.`);
