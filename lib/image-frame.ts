import { validateCropSelection, type CropSelection } from './image-crop.ts';

export type ImageFrame = {
  x: number;
  y: number;
  zoom: number;
  crop?: CropSelection;
};

export const defaultImageFrame: ImageFrame = { x: 0.5, y: 0.5, zoom: 1 };

// Keep the image point beneath a gesture's midpoint stationary while zooming.
export function zoomImageFrame(
  frame: ImageFrame,
  requestedZoom: number,
  from: { x: number; y: number },
  to: { x: number; y: number },
  imageWidth: number,
  imageHeight: number,
  width: number,
  height: number,
): ImageFrame {
  if (!imageWidth || !imageHeight || !width || !height) return frame;
  const zoom = Math.max(1, Math.min(3, requestedZoom));
  const scale = Math.max(width / imageWidth, height / imageHeight);
  const axis = (
    position: number,
    image: number,
    viewport: number,
    start: number,
    end: number,
  ) => {
    const before = image * scale * frame.zoom;
    const after = image * scale * zoom;
    const source = (start + Math.max(0, before - viewport) * position) / before;
    return after - viewport > 0.5
      ? Math.max(0, Math.min(1, (source * after - end) / (after - viewport)))
      : 0.5;
  };
  return {
    zoom,
    x: axis(frame.x, imageWidth, width, from.x, to.x),
    y: axis(frame.y, imageHeight, height, from.y, to.y),
  };
}

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
  return {
    x,
    y,
    zoom,
    ...(frame.crop !== undefined
      ? { crop: validateCropSelection(frame.crop) }
      : {}),
  };
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
