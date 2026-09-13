const button = document.getElementById('update');
const updateStatus = document.getElementById('status');
const openLink = document.getElementById('open');

function waitForWorker(worker, target) {
  return new Promise((resolve, reject) => {
    const finish = (error) => {
      clearTimeout(timer);
      worker.removeEventListener('statechange', inspect);
      if (error) reject(error);
      else resolve();
    };
    const inspect = () => {
      if (target.includes(worker.state)) finish();
      if (worker.state === 'redundant') finish(new Error('INSTALL_FAILED'));
    };
    const timer = setTimeout(() => finish(new Error('TIMEOUT')), 45000);
    worker.addEventListener('statechange', inspect);
    inspect();
  });
}
button.addEventListener('click', async () => {
  button.disabled = true;
  updateStatus.textContent = 'Aktuelle App wird vollständig heruntergeladen …';
  try {
    const scope = new URL('./', window.location.href);
    const registration = await navigator.serviceWorker.register(
      new URL('sw.js', scope),
      {
        scope: scope.pathname,
        updateViaCache: 'none',
      },
    );
    await registration.update();
    if (registration.installing)
      await waitForWorker(registration.installing, [
        'installed',
        'activating',
        'activated',
      ]);
    const waiting = registration.waiting;
    if (waiting) {
      waiting.postMessage({ type: 'MAMPFFRED_ACTIVATE' });
      await waitForWorker(waiting, ['activated']);
    }
    if (!registration.active) throw new Error('NO_ACTIVE_WORKER');
    updateStatus.textContent =
      'Die aktuelle App ist bereit. Deine persönlichen Daten sind erhalten.';
    openLink.href = scope.href;
    openLink.hidden = false;
  } catch {
    updateStatus.textContent =
      'Aktualisierung nicht abgeschlossen. Bitte prüfe die Internetverbindung und versuche es erneut. Deine Daten bleiben erhalten.';
  } finally {
    button.disabled = false;
  }
});
