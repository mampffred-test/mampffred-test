export type ImageFrame = { x: number; y: number; zoom: number };

export const defaultImageFrame: ImageFrame = { x: 0.5, y: 0.5, zoom: 1 };

export function validateImageFrame(value: unknown): ImageFrame {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('INVALID_IMAGE_FRAME');
  const frame = value as Record<string, unknown>;
  const { x, y, zoom } = frame;
  if (
    typeof x !== 'number' ||
    !Number.isFinite(x) ||
    x < 0 ||
    x > 1 ||
    typeof y !== 'number' ||
    !Number.isFinite(y) ||
    y < 0 ||
    y > 1 ||
    typeof zoom !== 'number' ||
    !Number.isFinite(zoom) ||
    zoom < 1 ||
    zoom > 3
  )
    throw new Error('INVALID_IMAGE_FRAME');
  return { x, y, zoom };
}

export function panImageFrame(
  frame: ImageFrame,
  dx: number,
  dy: number,
  imageWidth: number,
  imageHeight: number,
  width: number,
  height: number,
): ImageFrame {
  const scale = Math.max(width / imageWidth, height / imageHeight) * frame.zoom;
  const overflowX = imageWidth * scale - width;
  const overflowY = imageHeight * scale - height;
  const clamp = (value: number) => Math.max(0, Math.min(1, value));
  return {
    ...frame,
    x: overflowX > 0.5 ? clamp(frame.x - dx / overflowX) : frame.x,
    y: overflowY > 0.5 ? clamp(frame.y - dy / overflowY) : frame.y,
  };
}
