/** Keep unspecified amounts and free text intact when changing portions. */
export function scaledIngredientAmount(value: string, factor: number): string {
  const trimmed = value.trim();
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
