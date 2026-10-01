import { formatQuantity, parseQuantity } from './quantity.ts';

/** Keep unspecified amounts and free text intact when changing portions. */
export function scaledIngredientAmount(
  value: string,
  factor: number,
  scaleWithServings = true,
): string {
  if (!scaleWithServings) return value;
  const trimmed = value.trim();
  if (/[½⅓⅔¼¾⅕⅛/]/.test(trimmed)) {
    const quantity = parseQuantity(trimmed);
    if (quantity === undefined || !Number.isFinite(factor) || factor < 0)
      return value;
    if (factor === 1) return value;
    return formatQuantity(quantity * factor);
  }
  const range = trimmed.match(/^(\d+(?:[.,]\d+)?)\s*[–-]\s*(\d+(?:[.,]\d+)?)$/);
  if (range && Number.isFinite(factor) && factor >= 0)
    return `${scaledIngredientAmount(range[1], factor)}–${scaledIngredientAmount(range[2], factor)}`;
  const normalized = /^\d{1,3}(?:\.\d{3})+$/.test(trimmed)
    ? trimmed.replaceAll('.', '')
    : trimmed.replace(',', '.');
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(normalized)) return value;
  const scaled = Number(normalized) * factor;
  if (!Number.isFinite(scaled) || factor < 0) return value;
  return (Math.round(scaled * 100) / 100).toLocaleString('de-DE', {
    useGrouping: false,
    maximumFractionDigits: 2,
  });
}
