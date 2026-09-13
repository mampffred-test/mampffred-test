/* oxlint-disable next/no-img-element, jsx-a11y/prefer-tag-over-role, jsx-a11y/no-noninteractive-element-interactions -- Local images; canvas group captures pointers from accessible buttons. */
import { useId, useLayoutEffect, useRef, useState } from 'react';
import { Check, Minus, Plus, RotateCcw, Move, ZoomIn } from 'lucide-react';
import { defaultImageFrame, type ImageFrame } from '../lib/image-frame';
import {
  cropSelection,
  fitCropScene,
  panCropImage,
  zoomCropImage,
  resizeCrop,
  setCropFormat,
  cropFormatAspect,
  type CropScene,
  type CropSelection,
  type CropFormat,
  type CropCorner,
} from '../lib/image-crop';

export function FramedImage({
  src,
  alt,
  frame = defaultImageFrame,
  className = '',
}: {
  src: string;
  alt: string;
  frame?: ImageFrame;
  className?: string;
}) {
  const cropId = useId();
  if (frame.crop) {
    const c = frame.crop;
    const x = c.x * c.sourceAspect,
      width = c.width * c.sourceAspect;
    return (
      <span
        className={`framed-image has-crop ${className}`}
        style={{ '--crop-aspect': width / c.height } as React.CSSProperties}
      >
        <svg
          role="img"
          aria-label={alt}
          viewBox={`${x} ${c.y} ${width} ${c.height}`}
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <clipPath id={cropId}>
              <rect x={x} y={c.y} width={width} height={c.height} />
            </clipPath>
          </defs>
          <image
            href={src}
            width={c.sourceAspect}
            height="1"
            preserveAspectRatio="none"
            clipPath={`url(#${cropId})`}
          />
        </svg>
      </span>
    );
  }
  return (
    <span className={`framed-image ${className}`}>
      <img
        src={src}
        alt={alt}
        draggable={false}
        style={{
          objectPosition: `${frame.x * 100}% ${frame.y * 100}%`,
          transform: `scale(${frame.zoom})`,
          transformOrigin: `${frame.x * 100}% ${frame.y * 100}%`,
        }}
      />
    </span>
  );
}

export function ImageFramingEditor({
  src,
  initialFrame,
  onApply,
  onCancel,
}: {
  src: string;
  initialFrame?: ImageFrame;
  onApply: (frame: ImageFrame) => void;
  onCancel: () => void;
}) {
  const canvas = useRef<HTMLDivElement>(null);
  const [scene, setScene] = useState<CropScene>();
  const sceneRef = useRef<CropScene | undefined>(undefined);
  const [format, setFormat] = useState<CropFormat>(
    initialFrame?.crop?.format ?? '4:3',
  );
  const formatRef = useRef(format);
  const sourceAspect = useRef(0);
  const size = useRef({ width: 0, height: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const cornerDrag = useRef<
    | {
        pointer: number;
        corner: CropCorner;
        before: CropScene;
        start: { x: number; y: number };
      }
    | undefined
  >(undefined);
  const [announcement, setAnnouncement] = useState('');
  const update = (next: CropScene) => {
    sceneRef.current = next;
    setScene(next);
  };
  const initialize = (aspect: number) => {
    sourceAspect.current = aspect;
    const element = canvas.current;
    if (!element) return;
    size.current = { width: element.clientWidth, height: element.clientHeight };
    const legacy = initialFrame ?? defaultImageFrame;
    const scale = Math.max(4 / 3 / aspect, 1) * legacy.zoom;
    const selection: CropSelection = legacy.crop ?? {
      x: ((aspect * scale - 4 / 3) * legacy.x) / (aspect * scale),
      y: ((scale - 1) * legacy.y) / scale,
      width: 4 / 3 / (aspect * scale),
      height: 1 / scale,
      sourceAspect: aspect,
      format: '4:3',
    };
    update(fitCropScene(selection, size.current.width, size.current.height));
  };
  useLayoutEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      const bounds = {
        width: element.clientWidth,
        height: element.clientHeight,
      };
      if (
        bounds.width === size.current.width &&
        bounds.height === size.current.height
      )
        return;
      size.current = bounds;
      if (sceneRef.current)
        update(
          fitCropScene(
            cropSelection(sceneRef.current, formatRef.current),
            bounds.width,
            bounds.height,
          ),
        );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const localPoint = (event: React.PointerEvent) => {
    const bounds = canvas.current!.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  };
  const release = (event: React.PointerEvent, cancelled = false) => {
    pointers.current.delete(event.pointerId);
    const drag = cornerDrag.current;
    if (drag?.pointer === event.pointerId) {
      if (cancelled) update(drag.before);
      cornerDrag.current = undefined;
      const current = sceneRef.current;
      if (current)
        setAnnouncement(
          `Ausschnitt ${Math.round(current.crop.width)} mal ${Math.round(current.crop.height)}.`,
        );
    }
  };
  const zoom = (factor: number) => {
    const current = sceneRef.current;
    if (!current) return;
    update(
      zoomCropImage(current, factor, {
        x: current.crop.x + current.crop.width / 2,
        y: current.crop.y + current.crop.height / 2,
      }),
    );
  };
  const zoomLevel = scene
    ? 1 /
      Math.max(
        scene.crop.width / scene.image.width,
        scene.crop.height / scene.image.height,
      )
    : 1;
  const corners: { corner: CropCorner; label: string }[] = [
    { corner: 'nw', label: 'oben links' },
    { corner: 'ne', label: 'oben rechts' },
    { corner: 'sw', label: 'unten links' },
    { corner: 'se', label: 'unten rechts' },
  ];
  return (
    <div className="image-framing-editor">
      <header className="image-editor-header">
        <button type="button" onClick={onCancel}>
          Abbrechen
        </button>
        <h2 id="image-editor-title">Bild bearbeiten</h2>
      </header>
      <div className="crop-formats" role="group" aria-label="Bildformat">
        {(
          [
            { value: 'free', label: 'Frei' },
            { value: 'original', label: 'Original' },
            { value: 'square', label: 'Quadrat' },
            { value: '4:3', label: '4:3' },
          ] as const
        ).map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={format === option.value}
            disabled={!scene}
            onClick={() => {
              if (option.value === formatRef.current) return;
              setFormat(option.value);
              formatRef.current = option.value;
              if (sceneRef.current && option.value !== 'free') {
                const next = setCropFormat(sceneRef.current, option.value);
                update(
                  fitCropScene(
                    cropSelection(next, option.value),
                    size.current.width,
                    size.current.height,
                  ),
                );
              }
              setAnnouncement(`Format ${option.label} gewählt.`);
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
      <div
        ref={canvas}
        className="image-editor-canvas crop-canvas"
        role="group"
        aria-label="Bildausschnitt anpassen"
        onPointerMove={(event) => {
          const current = sceneRef.current;
          if (!current) return;
          const drag = cornerDrag.current;
          if (drag?.pointer === event.pointerId) {
            const p = localPoint(event);
            const edge = {
              x:
                drag.before.crop.x +
                (drag.corner.includes('e') ? drag.before.crop.width : 0),
              y:
                drag.before.crop.y +
                (drag.corner.includes('s') ? drag.before.crop.height : 0),
            };
            update(
              resizeCrop(
                drag.before,
                drag.corner,
                {
                  x: edge.x + p.x - drag.start.x,
                  y: edge.y + p.y - drag.start.y,
                },
                size.current,
                cropFormatAspect(formatRef.current, sourceAspect.current),
              ),
            );
            return;
          }
          const previous = pointers.current.get(event.pointerId);
          if (!previous) return;
          const before = [...pointers.current.values()];
          const point = localPoint(event);
          pointers.current.set(event.pointerId, point);
          const after = [...pointers.current.values()];
          if (before.length === 2) {
            const distance = (p: typeof before) =>
              Math.hypot(p[1].x - p[0].x, p[1].y - p[0].y);
            const midpoint = (p: typeof before) => ({
              x: (p[0].x + p[1].x) / 2,
              y: (p[0].y + p[1].y) / 2,
            });
            if (distance(before) >= 1)
              update(
                zoomCropImage(
                  current,
                  distance(after) / distance(before),
                  midpoint(before),
                  midpoint(after),
                ),
              );
          } else
            update(
              panCropImage(current, point.x - previous.x, point.y - previous.y),
            );
        }}
        onPointerUp={(event) => release(event)}
        onPointerCancel={(event) => release(event, true)}
        onLostPointerCapture={(event) => release(event)}
      >
        <div
          className="image-editor-ambient"
          aria-hidden="true"
          style={{ backgroundImage: `url(${JSON.stringify(src)})` }}
        />
        <img
          className="crop-source-image"
          src={src}
          alt="Vorschau des Bildausschnitts"
          draggable={false}
          onLoad={(event) =>
            initialize(
              event.currentTarget.naturalWidth /
                event.currentTarget.naturalHeight,
            )
          }
          style={
            scene
              ? {
                  left: scene.image.x,
                  top: scene.image.y,
                  width: scene.image.width,
                  height: scene.image.height,
                }
              : { visibility: 'hidden' }
          }
        />
        {scene && (
          <>
            <button
              type="button"
              className="crop-pan-surface"
              aria-label="Bild verschieben und mit zwei Fingern zoomen; alternativ Pfeiltasten verwenden"
              style={{
                left: scene.crop.x,
                top: scene.crop.y,
                width: scene.crop.width,
                height: scene.crop.height,
              }}
              onPointerDown={(event) => {
                if (
                  cornerDrag.current ||
                  pointers.current.size >= 2 ||
                  (event.pointerType === 'mouse' && event.button !== 0)
                )
                  return;
                canvas.current!.setPointerCapture(event.pointerId);
                pointers.current.set(event.pointerId, localPoint(event));
              }}
              onKeyDown={(event) => {
                const delta: Record<string, [number, number]> = {
                  ArrowLeft: [-12, 0],
                  ArrowRight: [12, 0],
                  ArrowUp: [0, -12],
                  ArrowDown: [0, 12],
                };
                if (delta[event.key]) {
                  event.preventDefault();
                  update(panCropImage(sceneRef.current!, ...delta[event.key]));
                }
              }}
            >
              <span className="framing-grid" aria-hidden="true" />
            </button>
            {corners.map(({ corner, label }) => (
              <button
                key={corner}
                type="button"
                className={`crop-corner crop-${corner}`}
                aria-label={`Ausschnitt ${label} ändern; ziehen oder Pfeiltasten verwenden`}
                style={{
                  left:
                    scene.crop.x +
                    (corner.includes('e') ? scene.crop.width : 0) -
                    24,
                  top:
                    scene.crop.y +
                    (corner.includes('s') ? scene.crop.height : 0) -
                    24,
                }}
                onPointerDown={(event) => {
                  if (
                    cornerDrag.current ||
                    pointers.current.size ||
                    (event.pointerType === 'mouse' && event.button !== 0)
                  )
                    return;
                  event.preventDefault();
                  canvas.current!.setPointerCapture(event.pointerId);
                  cornerDrag.current = {
                    pointer: event.pointerId,
                    corner,
                    before: sceneRef.current!,
                    start: localPoint(event),
                  };
                }}
                onKeyDown={(event) => {
                  const delta: Record<string, [number, number]> = {
                    ArrowLeft: [-8, 0],
                    ArrowRight: [8, 0],
                    ArrowUp: [0, -8],
                    ArrowDown: [0, 8],
                  };
                  if (!delta[event.key]) return;
                  event.preventDefault();
                  const current = sceneRef.current!;
                  update(
                    resizeCrop(
                      current,
                      corner,
                      {
                        x:
                          current.crop.x +
                          (corner.includes('e') ? current.crop.width : 0) +
                          delta[event.key][0],
                        y:
                          current.crop.y +
                          (corner.includes('s') ? current.crop.height : 0) +
                          delta[event.key][1],
                      },
                      size.current,
                      cropFormatAspect(formatRef.current, sourceAspect.current),
                    ),
                  );
                }}
              >
                <span aria-hidden="true" />
              </button>
            ))}
          </>
        )}
      </div>
      <footer className="image-editor-footer">
        <div className="image-gesture-hints">
          <p>
            <Move size={23} aria-hidden="true" />
            <span>Ecken ziehen, um den Ausschnitt zu ändern.</span>
          </p>
          <p>
            <ZoomIn size={23} aria-hidden="true" />
            <span>Bild verschieben · mit zwei Fingern zoomen.</span>
          </p>
        </div>
        <div className="image-zoom-actions">
          <button
            type="button"
            aria-label="Herauszoomen"
            disabled={!scene || zoomLevel <= 1.001}
            onClick={() => zoom(1 / 1.1)}
          >
            <Minus size={20} />
          </button>
          <output aria-live="off">{Math.round(zoomLevel * 100)} %</output>
          <button
            type="button"
            aria-label="Hineinzoomen"
            disabled={!scene || zoomLevel >= 7.999}
            onClick={() => zoom(1.1)}
          >
            <Plus size={20} />
          </button>
          <button
            type="button"
            disabled={!scene}
            onClick={() => {
              setFormat('original');
              formatRef.current = 'original';
              update(
                fitCropScene(
                  {
                    x: 0,
                    y: 0,
                    width: 1,
                    height: 1,
                    sourceAspect: sourceAspect.current,
                    format: 'original',
                  },
                  size.current.width,
                  size.current.height,
                ),
              );
            }}
          >
            <RotateCcw size={16} /> Zurücksetzen
          </button>
        </div>
        <span className="sr-only" role="status">
          {announcement}
        </span>
        <button
          type="button"
          className="image-apply"
          disabled={!scene}
          onClick={() => {
            if (sceneRef.current)
              onApply({
                ...defaultImageFrame,
                crop: cropSelection(sceneRef.current, formatRef.current),
              });
          }}
        >
          <Check size={24} /> Übernehmen
        </button>
      </footer>
    </div>
  );
}
