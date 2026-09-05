// Texthygiene für Inhalte aus fremden Quellen: geteilte Rezeptlinks, Rezeptdateien
// und Sicherungsdateien. Selbst getippte Inhalte laufen bewusst nicht hier durch,
// damit etwa Richtungsmarken in fremdsprachigen Rezepten erhalten bleiben.

// C0-/C1-Steuerzeichen ohne Zeilenumbruch und Tabulator, Bidi-Steuerzeichen,
// Zero-Width-Space und BOM. U+200C/U+200D bleiben erhalten, weil sie
// Emoji-Sequenzen und Schriften wie Persisch oder Devanagari tragen.
const unsafeImportedTextPattern =
  // oxlint-disable-next-line no-control-regex -- Steuerzeichen sind hier das Ziel.
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u061C\u200B\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/gu;

export function sanitizeImportedText(value: unknown) {
  if (typeof value !== 'string') return value;
  return value
    .replaceAll('\r\n', '\n')
    .replaceAll('\r', '\n')
    .replace(unsafeImportedTextPattern, '');
}

export function sanitizeImportedTextList(value: unknown) {
  return Array.isArray(value) ? value.map(sanitizeImportedText) : value;
}

// Object.fromEntries legt eigene Dateneigenschaften an und löst dabei keine
// Setter aus, sodass ein „__proto__“-Schlüssel im Backup nichts verändert.
export function sanitizeImportedData(value: unknown): unknown {
  if (typeof value === 'string') return sanitizeImportedText(value);
  if (Array.isArray(value)) return value.map(sanitizeImportedData);
  if (typeof value === 'object' && value !== null)
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        sanitizeImportedData(entry),
      ]),
    );
  return value;
}
