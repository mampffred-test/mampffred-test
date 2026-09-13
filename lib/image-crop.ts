export type CropFormat = 'free' | 'original' | 'square' | '4:3';
export type Rect = { x: number; y: number; width: number; height: number };
export type CropSelection = Rect & { sourceAspect: number; format: CropFormat };
export type CropScene = { image: Rect; crop: Rect };
export type CropCorner = 'nw' | 'ne' | 'sw' | 'se';
const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));

export function validateCropSelection(value: unknown): CropSelection {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('INVALID_IMAGE_CROP');
  const c = value as CropSelection;
  if (
    ![c.x, c.y, c.width, c.height, c.sourceAspect].every(
      (n) => typeof n === 'number' && Number.isFinite(n),
    ) ||
    c.x < 0 ||
    c.y < 0 ||
    c.width <= 0 ||
    c.height <= 0 ||
    c.x + c.width > 1 + 1e-9 ||
    c.y + c.height > 1 + 1e-9 ||
    c.sourceAspect < 0.0001 ||
    c.sourceAspect > 10000 ||
    !['free', 'original', 'square', '4:3'].includes(c.format)
  )
    throw new Error('INVALID_IMAGE_CROP');
  return {
    x: c.x,
    y: c.y,
    width: c.width,
    height: c.height,
    sourceAspect: c.sourceAspect,
    format: c.format,
  };
}

export function cropSelection(
  scene: CropScene,
  format: CropFormat,
): CropSelection {
  const { image, crop } = scene;
  const x = clamp((crop.x - image.x) / image.width, 0, 1);
  const y = clamp((crop.y - image.y) / image.height, 0, 1);
  return {
    x,
    y,
    width: Math.min(1 - x, crop.width / image.width),
    height: Math.min(1 - y, crop.height / image.height),
    sourceAspect: image.width / image.height,
    format,
  };
}

export function fitCropScene(
  selection: CropSelection,
  width: number,
  height: number,
): CropScene {
  const scale = Math.min(
    Math.max(1, width - 48) / (selection.width * selection.sourceAspect),
    Math.max(1, height - 48) / selection.height,
  );
  const crop = {
    x: 0,
    y: 0,
    width: selection.width * selection.sourceAspect * scale,
    height: selection.height * scale,
  };
  crop.x = (width - crop.width) / 2;
  crop.y = (height - crop.height) / 2;
  return {
    crop,
    image: {
      x: crop.x - selection.x * selection.sourceAspect * scale,
      y: crop.y - selection.y * scale,
      width: selection.sourceAspect * scale,
      height: scale,
    },
  };
}

export function containCropImage(scene: CropScene): CropScene {
  const { crop, image } = scene;
  return {
    crop,
    image: {
      ...image,
      x: clamp(image.x, crop.x + crop.width - image.width, crop.x),
      y: clamp(image.y, crop.y + crop.height - image.height, crop.y),
    },
  };
}

export function panCropImage(
  scene: CropScene,
  dx: number,
  dy: number,
): CropScene {
  return containCropImage({
    ...scene,
    image: { ...scene.image, x: scene.image.x + dx, y: scene.image.y + dy },
  });
}

export function zoomCropImage(
  scene: CropScene,
  factor: number,
  from: { x: number; y: number },
  to = from,
): CropScene {
  const { image, crop } = scene;
  const minimum = Math.max(
    crop.width / image.width,
    crop.height / image.height,
  );
  const ratio = clamp(factor, minimum, minimum * 8);
  return containCropImage({
    crop,
    image: {
      x: to.x - (from.x - image.x) * ratio,
      y: to.y - (from.y - image.y) * ratio,
      width: image.width * ratio,
      height: image.height * ratio,
    },
  });
}

export function resizeCrop(
  scene: CropScene,
  corner: CropCorner,
  point: { x: number; y: number },
  bounds: { width: number; height: number },
  aspect?: number,
): CropScene {
  const { crop, image } = scene;
  const west = corner.includes('w'),
    north = corner.includes('n');
  const anchorX = west ? crop.x + crop.width : crop.x;
  const anchorY = north ? crop.y + crop.height : crop.y;
  const maxW = west
    ? anchorX - Math.max(12, image.x)
    : Math.min(bounds.width - 12, image.x + image.width) - anchorX;
  const maxH = north
    ? anchorY - Math.max(12, image.y)
    : Math.min(bounds.height - 12, image.y + image.height) - anchorY;
  let width = clamp(
    west ? anchorX - point.x : point.x - anchorX,
    Math.min(48, maxW),
    maxW,
  );
  let height = clamp(
    north ? anchorY - point.y : point.y - anchorY,
    Math.min(48, maxH),
    maxH,
  );
  if (aspect) {
    // Project the dragged point onto the line of the locked aspect ratio.
    width = (width + height / aspect) / (1 + 1 / (aspect * aspect));
    width = clamp(
      width,
      Math.min(Math.max(48, 48 * aspect), maxW, maxH * aspect),
      Math.min(maxW, maxH * aspect),
    );
    height = width / aspect;
  }
  return {
    image,
    crop: {
      x: west ? anchorX - width : anchorX,
      y: north ? anchorY - height : anchorY,
      width,
      height,
    },
  };
}

export function cropFormatAspect(
  format: CropFormat,
  sourceAspect: number,
): number | undefined {
  return format === 'square'
    ? 1
    : format === '4:3'
      ? 4 / 3
      : format === 'original'
        ? sourceAspect
        : undefined;
}

export function setCropFormat(scene: CropScene, format: CropFormat): CropScene {
  const ratio = cropFormatAspect(
    format,
    scene.image.width / scene.image.height,
  );
  if (!ratio) return scene;
  const { crop, image } = scene;
  // Preserve the source-image fraction (and therefore zoom), instead of
  // inscribing each new format inside the previous, already reduced crop.
  const fraction = Math.max(
    crop.width / image.width,
    crop.height / image.height,
  );
  const width = Math.min(image.width, image.height * ratio) * fraction;
  const height = width / ratio;
  return {
    image,
    crop: {
      x: clamp(
        crop.x + (crop.width - width) / 2,
        image.x,
        image.x + image.width - width,
      ),
      y: clamp(
        crop.y + (crop.height - height) / 2,
        image.y,
        image.y + image.height - height,
      ),
      width,
      height,
    },
  };
}
