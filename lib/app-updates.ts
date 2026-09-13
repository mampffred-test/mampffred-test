export type UpdateStatus =
  | 'checking'
  | 'current'
  | 'available'
  | 'offline'
  | 'error'
  | 'development';

export function workerBuild(
  worker: ServiceWorker,
  timeoutMs = 5000,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const finish = (error?: Error, buildId?: string) => {
      clearTimeout(timer);
      channel.port1.close();
      channel.port2.close();
      if (error) reject(error);
      else resolve(buildId!);
    };
    const timer = setTimeout(
      () => finish(new Error('UPDATE_VERSION_TIMEOUT')),
      timeoutMs,
    );
    channel.port1.onmessage = ({ data }) => {
      if (
        typeof data?.buildId !== 'string' ||
        !/^[a-f0-9]{12}$/.test(data.buildId)
      )
        finish(new Error('INVALID_UPDATE_VERSION'));
      else finish(undefined, data.buildId);
    };
    worker.postMessage({ type: 'MAMPFFRED_VERSION' }, [channel.port2]);
  });
}

export function waitForInstallation(
  worker: ServiceWorker,
  timeoutMs = 30000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timer);
      worker.removeEventListener('statechange', inspect);
      if (error) reject(error);
      else resolve();
    };
    const inspect = () => {
      if (['installed', 'activating', 'activated'].includes(worker.state))
        finish();
      else if (worker.state === 'redundant')
        finish(new Error('UPDATE_INSTALL_FAILED'));
    };
    const timer = setTimeout(
      () => finish(new Error('UPDATE_INSTALL_TIMEOUT')),
      timeoutMs,
    );
    worker.addEventListener('statechange', inspect);
    inspect();
  });
}

export async function inspectAppUpdate(
  registration: ServiceWorkerRegistration,
  buildId: string,
): Promise<'current' | 'available'> {
  await registration.update();
  if (registration.installing)
    await waitForInstallation(registration.installing);
  // The waiting worker has already installed its complete offline release.
  if (registration.waiting) return 'available';
  if (!registration.active) throw new Error('UPDATE_WORKER_MISSING');
  return (await workerBuild(registration.active)) === buildId
    ? 'current'
    : 'available';
}

export async function activateAppUpdate(
  registration: ServiceWorkerRegistration,
): Promise<void> {
  const waiting = registration.waiting;
  if (!waiting) return; // A previous skipWaiting worker may already control the old page.
  await new Promise<void>((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timer);
      waiting.removeEventListener('statechange', inspect);
      if (error) reject(error);
      else resolve();
    };
    const inspect = () => {
      if (waiting.state === 'activated') finish();
      else if (waiting.state === 'redundant')
        finish(new Error('UPDATE_ACTIVATION_FAILED'));
    };
    const timer = setTimeout(
      () => finish(new Error('UPDATE_ACTIVATION_TIMEOUT')),
      15000,
    );
    waiting.addEventListener('statechange', inspect);
    waiting.postMessage({ type: 'MAMPFFRED_ACTIVATE' });
    inspect();
  });
}
