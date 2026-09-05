import assert from 'node:assert/strict';
import test from 'node:test';
import { getBackupReminder } from '../lib/backup-reminder.ts';

const now = new Date('2026-09-05T12:00:00.000Z');

test('fordert ohne Sicherung neutral und eindeutig zum lokalen Download auf', () => {
  assert.deepEqual(getBackupReminder(undefined, now), {
    kind: 'missing',
    ageDays: undefined,
    title: 'Sicherung empfohlen',
    description:
      'Lade eine Sicherungsdatei direkt auf dein Gerät. Mampffred sendet dabei nichts in die Cloud.',
    buttonLabel: 'Sicherungsdatei herunterladen',
  });
});

test('bestätigt eine aktuelle Sicherung rein faktisch', () => {
  assert.deepEqual(
    getBackupReminder('2026-09-05T08:00:00.000Z', now),
    {
      kind: 'recent',
      ageDays: 0,
      title: 'Heute gesichert',
      description:
        'Die Sicherungsdatei wurde lokal auf dein Gerät heruntergeladen. Mampffred speichert nichts in der Cloud.',
      buttonLabel: 'Neue Sicherung herunterladen',
    },
  );
});

test('weist ab sieben vergangenen Tagen deutlich auf eine alte Sicherung hin', () => {
  assert.deepEqual(
    getBackupReminder('2026-08-29T11:59:59.000Z', now),
    {
      kind: 'stale',
      ageDays: 7,
      title: 'Sicherung ist 7 Tage her',
      description:
        'Deine Daten können sich seitdem geändert haben. Lade eine aktuelle Sicherungsdatei auf dein Gerät.',
      buttonLabel: 'Aktuelle Sicherung herunterladen',
    },
  );
});

test('behandelt ungültige oder zukünftige Zeitpunkte nicht als vorhandene Sicherung', () => {
  assert.equal(getBackupReminder('kein-datum', now).kind, 'missing');
  assert.equal(
    getBackupReminder('2026-09-06T12:00:00.000Z', now).kind,
    'missing',
  );
});
