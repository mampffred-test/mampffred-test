/* oxlint-disable next/no-img-element -- Local Blob URLs in a Vite app. */
import { useRef, useState } from 'react';
import { Check, Minus, Plus, RotateCcw } from 'lucide-react';
import {
  defaultImageFrame,
  panImageFrame,
  type ImageFrame,
} from '../lib/image-frame';

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
  const [frame, setFrame] = useState(initialFrame ?? defaultImageFrame);
  const imageSize = useRef({ width: 0, height: 0 });
  const drag = useRef<{ id: number; x: number; y: number } | undefined>(
    undefined,
  );
  const zoom = (amount: number) =>
    setFrame((current) => ({
      ...current,
      zoom: Math.max(1, Math.min(3, amount)),
    }));
  return (
    <section
      className="image-framing-editor"
      aria-label="Bildausschnitt anpassen"
    >
      <div className="framing-heading">
        <strong>Bildausschnitt</strong>
        <button type="button" onClick={() => setFrame(defaultImageFrame)}>
          <RotateCcw size={14} /> Zurücksetzen
        </button>
      </div>
      <p>
        Verschiebe das Foto mit dem Finger. Mit dem Regler zoomst du hinein.
      </p>
      <button
        type="button"
        className="framing-viewport"
        aria-label="Bild verschieben; alternativ Pfeiltasten verwenden"
        onPointerDown={(event) => {
          if (!event.isPrimary) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
          };
        }}
        onPointerMove={(event) => {
          const previous = drag.current;
          if (
            !previous ||
            previous.id !== event.pointerId ||
            !imageSize.current.width
          )
            return;
          const bounds = event.currentTarget.getBoundingClientRect();
          setFrame((current) =>
            panImageFrame(
              current,
              event.clientX - previous.x,
              event.clientY - previous.y,
              imageSize.current.width,
              imageSize.current.height,
              bounds.width,
              bounds.height,
            ),
          );
          drag.current = {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
          };
        }}
        onPointerUp={() => {
          drag.current = undefined;
        }}
        onPointerCancel={() => {
          drag.current = undefined;
        }}
        onKeyDown={(event) => {
          const movement: Record<string, [number, number]> = {
            ArrowLeft: [-15, 0],
            ArrowRight: [15, 0],
            ArrowUp: [0, -15],
            ArrowDown: [0, 15],
          };
          const delta = movement[event.key];
          if (!delta || !imageSize.current.width) return;
          event.preventDefault();
          const bounds = event.currentTarget.getBoundingClientRect();
          setFrame((current) =>
            panImageFrame(
              current,
              ...delta,
              imageSize.current.width,
              imageSize.current.height,
              bounds.width,
              bounds.height,
            ),
          );
        }}
      >
        <img
          src={src}
          alt="Vorschau des Bildausschnitts"
          draggable={false}
          onLoad={(event) => {
            imageSize.current = {
              width: event.currentTarget.naturalWidth,
              height: event.currentTarget.naturalHeight,
            };
          }}
          style={{
            objectPosition: `${frame.x * 100}% ${frame.y * 100}%`,
            transform: `scale(${frame.zoom})`,
            transformOrigin: `${frame.x * 100}% ${frame.y * 100}%`,
          }}
        />
        <span className="framing-grid" aria-hidden="true" />
      </button>
      <div className="framing-zoom">
        <button
          type="button"
          aria-label="Herauszoomen"
          onClick={() => zoom(frame.zoom - 0.1)}
          disabled={frame.zoom <= 1}
        >
          <Minus size={17} />
        </button>
        <input
          aria-label="Bild vergrößern"
          type="range"
          min="1"
          max="3"
          step="0.01"
          value={frame.zoom}
          onChange={(event) => zoom(Number(event.target.value))}
        />
        <button
          type="button"
          aria-label="Hineinzoomen"
          onClick={() => zoom(frame.zoom + 0.1)}
          disabled={frame.zoom >= 3}
        >
          <Plus size={17} />
        </button>
        <output>{Math.round(frame.zoom * 100)} %</output>
      </div>
      <div className="dialog-actions">
        <button type="button" onClick={onCancel}>
          Abbrechen
        </button>
        <button
          type="button"
          className="primary-button"
          onClick={() => onApply(frame)}
        >
          <Check size={16} /> Übernehmen
        </button>
      </div>
    </section>
  );
}
