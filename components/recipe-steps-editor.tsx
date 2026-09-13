/* oxlint-disable jsx-a11y/prefer-tag-over-role, jsx-a11y/no-noninteractive-element-interactions -- Group captures the drag pointer across reordered cards. */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowDown,
  ArrowUp,
  GripVertical,
  Plus,
  Trash2,
  Undo2,
} from 'lucide-react';

type Step = { id: string; text: string };
type Drag = {
  id: string;
  y: number;
  offset: number;
  left: number;
  width: number;
  before: Step[];
  pointer: number;
};

function GrowingStepInput({
  value,
  label,
  onChange,
}: {
  value: string;
  label: string;
  onChange: (value: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const input = ref.current;
    if (!input) return;
    const fit = () => {
      input.style.height = 'auto';
      input.style.height = `${Math.max(112, input.scrollHeight + 2)}px`;
    };
    fit();
    let width = input.clientWidth;
    const observer = new ResizeObserver(() => {
      if (input.clientWidth !== width) {
        width = input.clientWidth;
        fit();
      }
    });
    observer.observe(input);
    return () => observer.disconnect();
  }, [value]);
  return (
    <textarea
      ref={ref}
      value={value}
      aria-label={label}
      placeholder="Was ist in diesem Schritt zu tun?"
      maxLength={5000}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

export function RecipeStepsEditor({
  initialSteps,
  onChange,
}: {
  initialSteps: string[];
  onChange: (steps: string[]) => void;
}) {
  const [steps, setSteps] = useState<Step[]>(() =>
    initialSteps.map((text) => ({ id: crypto.randomUUID(), text })),
  );
  const current = useRef(steps);
  const [sorting, setSorting] = useState(false);
  const [deleted, setDeleted] = useState<{ step: Step; index: number }>();
  const [announcement, setAnnouncement] = useState('');
  const [dragView, setDragView] = useState<Drag>();
  const drag = useRef<Drag | undefined>(undefined);
  const list = useRef<HTMLDivElement>(null);
  const animation = useRef<number | undefined>(undefined);
  const positions = useRef(new Map<string, number>());
  const commit = (next: Step[]) => {
    positions.current = new Map(
      Array.from(
        list.current?.querySelectorAll<HTMLElement>('[data-step-id]') ?? [],
      ).map((row) => [row.dataset.stepId!, row.getBoundingClientRect().top]),
    );
    current.current = next;
    setSteps(next);
    onChange(next.map((step) => step.text));
  };
  useLayoutEffect(() => {
    if (
      !sorting ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    )
      return;
    list.current
      ?.querySelectorAll<HTMLElement>('[data-step-id]')
      .forEach((row) => {
        const oldTop = positions.current.get(row.dataset.stepId!);
        if (oldTop === undefined || row.dataset.stepId === drag.current?.id)
          return;
        const delta = oldTop - row.getBoundingClientRect().top;
        if (Math.abs(delta) > 1)
          row.animate(
            [
              { transform: `translateY(${delta}px)` },
              { transform: 'translateY(0)' },
            ],
            { duration: 160, easing: 'ease-out' },
          );
      });
    positions.current.clear();
  }, [steps, sorting]);
  useEffect(
    () => () => {
      if (animation.current) cancelAnimationFrame(animation.current);
    },
    [],
  );
  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= current.current.length) return;
    const next = [...current.current];
    const [step] = next.splice(from, 1);
    next.splice(to, 0, step);
    commit(next);
    if (!drag.current)
      setAnnouncement(`Schritt ${from + 1} auf Position ${to + 1} verschoben.`);
  };
  const updateTarget = () => {
    const gesture = drag.current;
    if (!gesture) return;
    const rows = Array.from(
      list.current?.querySelectorAll<HTMLElement>('[data-step-id]') ?? [],
    );
    const from = current.current.findIndex((step) => step.id === gesture.id);
    let to = from;
    rows.forEach((row, index) => {
      const bounds = row.getBoundingClientRect();
      const middle = bounds.top + bounds.height / 2;
      if (index < from && gesture.y < middle) to = Math.min(to, index);
      if (index > from && gesture.y > middle) to = Math.max(to, index);
    });
    move(from, to);
  };
  const scrollDuringDrag = () => {
    const gesture = drag.current;
    const scroller = list.current?.closest<HTMLElement>('.editor-modal');
    if (!gesture || !scroller) return;
    const bounds = scroller.getBoundingClientRect();
    const top = bounds.top + 100,
      bottom = bounds.bottom - 70;
    const speed =
      gesture.y < top
        ? -Math.min(12, (top - gesture.y) / 5)
        : gesture.y > bottom
          ? Math.min(12, (gesture.y - bottom) / 5)
          : 0;
    if (speed) {
      scroller.scrollTop += speed;
      updateTarget();
    }
    animation.current = requestAnimationFrame(scrollDuringDrag);
  };
  const finish = (cancelled = false) => {
    const gesture = drag.current;
    if (!gesture) return;
    drag.current = undefined;
    setDragView(undefined);
    if (animation.current) cancelAnimationFrame(animation.current);
    if (list.current?.hasPointerCapture(gesture.pointer))
      list.current.releasePointerCapture(gesture.pointer);
    if (cancelled) {
      commit(gesture.before);
      setAnnouncement('Verschieben abgebrochen.');
    } else
      setAnnouncement(
        `Schritt auf Position ${current.current.findIndex((step) => step.id === gesture.id) + 1} verschoben.`,
      );
  };
  return (
    <fieldset className="recipe-steps-section">
      <legend>Schritte</legend>
      <div className="steps-mode-bar">
        <span>
          {sorting
            ? 'Am Griff ziehen oder Pfeile nutzen.'
            : 'Beschreibe die Zubereitung Schritt für Schritt.'}
        </span>
        {steps.length > 1 && (
          <button
            type="button"
            className="steps-mode-button"
            aria-pressed={sorting}
            onClick={() => {
              finish(true);
              setSorting(!sorting);
            }}
          >
            {sorting ? 'Zum Text' : 'Umsortieren'}
          </button>
        )}
      </div>
      <div
        ref={list}
        className="step-card-list"
        role="group"
        aria-label="Zubereitungsschritte"
        onPointerMove={(event) => {
          if (drag.current?.pointer !== event.pointerId) return;
          drag.current.y = event.clientY;
          setDragView({ ...drag.current });
          updateTarget();
        }}
        onPointerUp={() => finish()}
        onPointerCancel={() => finish(true)}
        onLostPointerCapture={() => finish(true)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && drag.current) {
            event.preventDefault();
            event.stopPropagation();
            finish(true);
          }
        }}
      >
        {steps.map((step, index) => (
          <section
            key={step.id}
            data-step-id={step.id}
            className={`step-card ${sorting ? 'sorting' : ''} ${dragView?.id === step.id ? 'step-placeholder' : ''}`}
            aria-label={`Schritt ${index + 1}`}
          >
            <div className="step-card-header">
              <strong>Schritt {index + 1}</strong>
              {sorting ? (
                <div className="step-sort-controls">
                  <button
                    type="button"
                    aria-label={`Schritt ${index + 1} nach oben`}
                    disabled={index === 0}
                    onClick={() => move(index, index - 1)}
                  >
                    <ArrowUp size={19} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Schritt ${index + 1} nach unten`}
                    disabled={index === steps.length - 1}
                    onClick={() => move(index, index + 1)}
                  >
                    <ArrowDown size={19} />
                  </button>
                  <button
                    type="button"
                    className="step-sort-grip"
                    aria-label={`Schritt ${index + 1} ziehen; Pfeiltasten zum Verschieben`}
                    onKeyDown={(event) => {
                      if (
                        event.key === 'ArrowUp' ||
                        event.key === 'ArrowDown'
                      ) {
                        event.preventDefault();
                        move(index, index + (event.key === 'ArrowUp' ? -1 : 1));
                      }
                    }}
                    onPointerDown={(event) => {
                      if (
                        drag.current ||
                        (event.pointerType === 'mouse' && event.button !== 0)
                      )
                        return;
                      event.preventDefault();
                      const bounds = event.currentTarget
                        .closest<HTMLElement>('[data-step-id]')!
                        .getBoundingClientRect();
                      const gesture = {
                        id: step.id,
                        y: event.clientY,
                        offset: event.clientY - bounds.top,
                        left: bounds.left,
                        width: bounds.width,
                        before: [...current.current],
                        pointer: event.pointerId,
                      };
                      list.current?.setPointerCapture(event.pointerId);
                      drag.current = gesture;
                      setDragView(gesture);
                      scrollDuringDrag();
                    }}
                  >
                    <GripVertical size={21} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  aria-label={`Schritt ${index + 1} entfernen`}
                  onClick={() => {
                    setDeleted({ step, index });
                    commit(
                      current.current.filter((item) => item.id !== step.id),
                    );
                    setAnnouncement(`Schritt ${index + 1} gelöscht.`);
                  }}
                >
                  <Trash2 size={18} />
                </button>
              )}
            </div>
            {sorting ? (
              <p className="step-sort-summary">
                {step.text || 'Noch kein Text'}
              </p>
            ) : (
              <GrowingStepInput
                label={`Zubereitungsschritt ${index + 1}`}
                value={step.text}
                onChange={(text) =>
                  commit(
                    current.current.map((item) =>
                      item.id === step.id ? { ...item, text } : item,
                    ),
                  )
                }
              />
            )}
          </section>
        ))}
      </div>
      {dragView &&
        createPortal(
          <div
            className="step-drag-preview"
            aria-hidden="true"
            style={{
              top: dragView.y - dragView.offset,
              left: dragView.left,
              width: dragView.width,
            }}
          >
            <strong>
              Schritt {steps.findIndex((step) => step.id === dragView.id) + 1}
            </strong>
            <p>
              {steps.find((step) => step.id === dragView.id)?.text ||
                'Noch kein Text'}
            </p>
          </div>,
          document.body,
        )}
      <button
        type="button"
        className="inline-add"
        onClick={() => {
          const id = crypto.randomUUID();
          setSorting(false);
          commit([...current.current, { id, text: '' }]);
          requestAnimationFrame(() =>
            list.current
              ?.querySelector<HTMLTextAreaElement>(
                `[data-step-id="${id}"] textarea`,
              )
              ?.focus(),
          );
        }}
      >
        <Plus size={16} /> Schritt hinzufügen
      </button>
      <div className="step-feedback">
        <span role="status">{announcement}</span>
        {deleted && (
          <button
            type="button"
            onClick={() => {
              const next = [...current.current];
              next.splice(
                Math.min(deleted.index, next.length),
                0,
                deleted.step,
              );
              commit(next);
              setDeleted(undefined);
              setAnnouncement('Schritt wiederhergestellt.');
            }}
          >
            <Undo2 size={16} /> Rückgängig
          </button>
        )}
      </div>
    </fieldset>
  );
}
