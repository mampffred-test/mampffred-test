const VULGAR_FRACTIONS: Record<string, number> = {
  '½': 1 / 2,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '¼': 1 / 4,
  '¾': 3 / 4,
  '⅕': 1 / 5,
  '⅛': 1 / 8,
};

const MAX_QUANTITY = 10_000_000;

function parseDecimal(value: string) {
  const normalized = /^\d{1,3}(?:\.\d{3})+$/.test(value)
    ? value.replaceAll('.', '')
    : value.replace(',', '.');
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(normalized)) return undefined;
  return Number(normalized);
}

/** "ca. 200", "etwa 2", "2x" -> the bare number text. */
function stripApproximation(value: string) {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^(?:ca\.?|circa|etwa|ungefähr|rund|knapp)\s*/i, '')
    .replace(/\s*[x×]$/i, '');
}

/**
 * Parses a single German recipe quantity: "2", "1,5", "1.000", "½", "1/2",
 * "1 1/2" or "1½". Returns undefined for free text, ranges and zero.
 */
export function parseQuantity(value: string): number | undefined {
  const trimmed = stripApproximation(value);
  if (!trimmed || trimmed.length > 20) return undefined;
  let result: number | undefined;
  const mixedVulgar = trimmed.match(/^(\d+)? ?([½⅓⅔¼¾⅕⅛])$/);
  const mixedSlash = trimmed.match(/^(?:(\d+) )?(\d+)\/(\d+)$/);
  if (mixedVulgar)
    result = Number(mixedVulgar[1] ?? 0) + VULGAR_FRACTIONS[mixedVulgar[2]];
  else if (mixedSlash) {
    const denominator = Number(mixedSlash[3]);
    if (!denominator) return undefined;
    result = Number(mixedSlash[1] ?? 0) + Number(mixedSlash[2]) / denominator;
  } else result = parseDecimal(trimmed);
  return result !== undefined &&
    Number.isFinite(result) &&
    result > 0 &&
    result <= MAX_QUANTITY
    ? result
    : undefined;
}

/** Parses "2-3", "1–2" or a single quantity into an inclusive range. */
export function parseQuantityRange(
  value: string,
): { min: number; max: number } | undefined {
  const parts = stripApproximation(value).split(/\s*(?:[–-]|\bbis\b)\s*/);
  if (parts.length === 1) {
    const single = parseQuantity(value);
    return single === undefined ? undefined : { min: single, max: single };
  }
  if (parts.length !== 2) return undefined;
  const min = parseQuantity(parts[0]);
  const max = parseQuantity(parts[1]);
  if (min === undefined || max === undefined || min > max) return undefined;
  return { min, max };
}

/** Single number for calculations: the midpoint of a range. */
export function quantityValue(value: string): number | undefined {
  const range = parseQuantityRange(value);
  return range ? (range.min + range.max) / 2 : undefined;
}

const FRACTION_GLYPHS: Array<[number, string]> = [
  [1 / 4, '¼'],
  [1 / 3, '⅓'],
  [1 / 2, '½'],
  [2 / 3, '⅔'],
  [3 / 4, '¾'],
];

/** German display of a quantity; common fractions become glyphs. */
export function formatQuantity(
  value: number,
  { fractions = true, maximumFractionDigits = 2 } = {},
): string {
  if (!Number.isFinite(value)) return '';
  const whole = Math.floor(value + 1e-9);
  const rest = value - whole;
  if (fractions && whole < 100 && rest > 1e-6) {
    const glyph = FRACTION_GLYPHS.find(
      ([fraction]) => Math.abs(fraction - rest) < 0.01,
    );
    if (glyph) return `${whole || ''}${glyph[1]}`;
  }
  return value.toLocaleString('de-DE', {
    useGrouping: false,
    maximumFractionDigits,
  });
}
