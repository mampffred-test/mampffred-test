import assert from 'node:assert/strict';
import test from 'node:test';
import {
  workerBuild,
  inspectAppUpdate,
  activateAppUpdate,
  waitForInstallation,
} from '../lib/app-updates.ts';
import { createEmptyData } from '../lib/model.ts';
import {
  installStandardRecipes,
  restoreStandardRecipes,
  standardRecipeCount,
} from '../lib/standard-recipes.ts';

function worker(buildId = '111111111111', state = 'activated') {
  const target = Object.assign(new EventTarget(), {
    state,
    messages: [] as string[],
    postMessage(message: { type: string }, ports?: MessagePort[]) {
      target.messages.push(message.type);
      if (message.type === 'MAMPFFRED_VERSION')
        ports?.[0].postMessage({ buildId });
      if (message.type === 'MAMPFFRED_ACTIVATE') {
        target.state = 'activated';
        target.dispatchEvent(new Event('statechange'));
      }
    },
  });
  return target as unknown as ServiceWorker & { messages: string[] };
}
function registration(active: ServiceWorker, waiting?: ServiceWorker) {
  return {
    active,
    waiting,
    update: async () => {},
    installing: null,
  } as unknown as ServiceWorkerRegistration;
}
test('Version der aktiven App wird verifiziert und ein alter geöffneter Client erkannt', async () => {
  const active = worker();
  assert.equal(await workerBuild(active), '111111111111');
  assert.equal(
    await inspectAppUpdate(registration(active), '111111111111'),
    'current',
  );
  assert.equal(
    await inspectAppUpdate(registration(active), '222222222222'),
    'available',
  );
  assert.equal(active.messages.includes('MAMPFFRED_ACTIVATE'), false);
});
test('vorbereitetes Update wird nur durch die explizite Aktion aktiviert', async () => {
  const waiting = worker('222222222222', 'installed');
  const reg = registration(worker(), waiting);
  assert.equal(await inspectAppUpdate(reg, '111111111111'), 'available');
  assert.deepEqual(waiting.messages, []);
  await activateAppUpdate(reg);
  assert.deepEqual(waiting.messages, ['MAMPFFRED_ACTIVATE']);
});
test('Netzwerk- und Installationsfehler werden nicht als aktuelle Version ausgegeben', async () => {
  const reg = registration(worker());
  reg.update = async () => {
    throw new Error('OFFLINE');
  };
  await assert.rejects(inspectAppUpdate(reg, '111111111111'), /OFFLINE/);
  await assert.rejects(
    waitForInstallation(worker('', 'redundant')),
    /INSTALL_FAILED/,
  );
  await assert.rejects(
    waitForInstallation(worker('', 'installing'), 5),
    /TIMEOUT/,
  );
  await assert.rejects(workerBuild(worker('invalid')), /INVALID/);
});
test('manuelle Wiederherstellung ergänzt gelöschte Standards, bewahrt eigene Rezepte und Änderungen', () => {
  const original = installStandardRecipes(createEmptyData());
  const edited = { ...original.recipes[0], name: 'Meine Cannelloni' };
  const custom = {
    ...original.recipes[1],
    id: 'custom',
    shareId: 'local:custom',
    name: 'Mein Gericht',
  };
  const before = { ...original, recipes: [edited, custom] };
  const repaired = restoreStandardRecipes(before);
  assert.equal(standardRecipeCount(repaired), 4);
  assert.equal(repaired.recipes.length, 5);
  assert.strictEqual(repaired.recipes[0], edited);
  assert.strictEqual(repaired.recipes[1], custom);
});
test('ein frischer Datenbestand enthält ausschließlich Standards und keine persönlichen Daten', () => {
  const fresh = installStandardRecipes(createEmptyData());
  assert.equal(standardRecipeCount(fresh), 4);
  assert.deepEqual(fresh.plan, []);
  assert.deepEqual(fresh.recipeDrafts, []);
  assert.deepEqual(fresh.customFoods, []);
  assert.deepEqual(fresh.shopping, []);
  assert.equal(fresh.onboardingDone, false);
  assert.equal(fresh.lastBackup, undefined);
});
