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

/**
 * Release decision for a sheet that follows the finger. A quick flick closes
 * even over a short distance; a slow drag must cover a third of the sheet.
 * A flick back upwards always keeps the sheet open.
 */
export function shouldDismissDraggedSheet({
  distance,
  releaseVelocity,
  sheetHeight,
}: {
  distance: number;
  /** px/ms, positive when moving down. */
  releaseVelocity: number;
  sheetHeight: number;
}) {
  if (
    !Number.isFinite(distance) ||
    !Number.isFinite(releaseVelocity) ||
    !Number.isFinite(sheetHeight) ||
    distance <= 0 ||
    sheetHeight <= 0
  )
    return false;
  if (releaseVelocity < -0.2) return false;
  if (releaseVelocity >= 0.5 && distance >= 24) return true;
  return distance >= Math.min(220, sheetHeight * 0.32);
}

/** Pulling a sheet upwards past its rest position meets growing resistance. */
export function rubberBand(offset: number) {
  if (offset >= 0) return offset;
  return -Math.min(28, Math.sqrt(-offset) * 2.2);
}
