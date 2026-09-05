export type SheetGestureSample = {
  distance: number;
  elapsedMs: number;
  viewportHeight: number;
};

export function shouldDismissSheet({
  distance,
  elapsedMs,
  viewportHeight,
}: SheetGestureSample) {
  if (
    !Number.isFinite(distance) ||
    !Number.isFinite(elapsedMs) ||
    !Number.isFinite(viewportHeight) ||
    distance <= 0 ||
    elapsedMs <= 0 ||
    viewportHeight <= 0
  )
    return false;
  const distanceThreshold = Math.min(110, viewportHeight * 0.16);
  const velocity = distance / elapsedMs;
  return distance >= distanceThreshold || (distance >= 36 && velocity >= 0.7);
}
