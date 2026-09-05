export type BackupReminder = {
  kind: 'missing' | 'recent' | 'stale';
  ageDays?: number;
  title: string;
  description: string;
  buttonLabel: string;
};

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const STALE_AFTER_DAYS = 7;

export function getBackupReminder(
  lastBackup: string | undefined,
  now = new Date(),
): BackupReminder {
  const backupDate = lastBackup ? new Date(lastBackup) : undefined;
  const elapsed = backupDate ? now.getTime() - backupDate.getTime() : Number.NaN;

  if (!backupDate || !Number.isFinite(elapsed) || elapsed < 0) {
    return {
      kind: 'missing',
      ageDays: undefined,
      title: 'Sicherung empfohlen',
      description:
        'Lade eine Sicherungsdatei direkt auf dein Gerät. Mampffred sendet dabei nichts in die Cloud.',
      buttonLabel: 'Sicherungsdatei herunterladen',
    };
  }

  const ageDays = Math.floor(elapsed / DAY_IN_MS);
  if (ageDays >= STALE_AFTER_DAYS) {
    return {
      kind: 'stale',
      ageDays,
      title: `Sicherung ist ${ageDays} Tage her`,
      description:
        'Deine Daten können sich seitdem geändert haben. Lade eine aktuelle Sicherungsdatei auf dein Gerät.',
      buttonLabel: 'Aktuelle Sicherung herunterladen',
    };
  }

  return {
    kind: 'recent',
    ageDays,
    title:
      ageDays === 0
        ? 'Heute gesichert'
        : ageDays === 1
          ? 'Vor einem Tag gesichert'
          : `Vor ${ageDays} Tagen gesichert`,
    description:
      'Die Sicherungsdatei wurde lokal auf dein Gerät heruntergeladen. Mampffred speichert nichts in der Cloud.',
    buttonLabel: 'Neue Sicherung herunterladen',
  };
}
