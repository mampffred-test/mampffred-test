/* oxlint-disable jsx-a11y/prefer-tag-over-role -- Custom keyboard-accessible listbox avoids the OS-sized select popup. */
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

const units = [
  'g',
  'kg',
  'ml',
  'l',
  'TL',
  'EL',
  'Prise',
  'Stück',
  'Scheibe',
  'Scheiben',
  'Bund',
  'Dose',
  'Packung',
  'Becher',
  'Glas',
  'Tasse',
  'Zehe',
  'Handvoll',
  'Spritzer',
];

export function UnitPicker({
  value,
  label,
  onChange,
  buttonRef,
}: {
  value: string;
  label: string;
  onChange: (value: string) => void;
  buttonRef: (node: HTMLButtonElement | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  const choices = [
    '',
    ...units,
    ...(value && !units.includes(value) ? [value] : []),
  ];
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  useLayoutEffect(() => {
    if (!open || !trigger.current || !panel.current) return;
    const bounds = trigger.current.getBoundingClientRect();
    const height = panel.current.offsetHeight;
    const width = panel.current.offsetWidth;
    setPosition({
      top: Math.max(
        8,
        bounds.bottom + height + 8 < window.innerHeight
          ? bounds.bottom + 6
          : bounds.top - height - 6,
      ),
      left: Math.max(
        8,
        Math.min(bounds.right - width, window.innerWidth - width - 8),
      ),
    });
    panel.current
      .querySelector<HTMLButtonElement>('[aria-selected="true"]')
      ?.focus();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (
        !panel.current?.contains(event.target as Node) &&
        !trigger.current?.contains(event.target as Node)
      )
        setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setOpen(false);
      trigger.current?.focus();
    };
    const scroll = (event: Event) => {
      if (!panel.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', escape, true);
    document.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', escape, true);
      document.removeEventListener('scroll', scroll, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);
  return (
    <>
      <button
        type="button"
        className="unit-picker-trigger"
        ref={(node) => {
          trigger.current = node;
          buttonRef(node);
        }}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen(!open)}
      >
        <span>{value || 'Ohne Einheit'}</span>
        <ChevronDown size={16} />
      </button>
      {open &&
        createPortal(
          <div
            className="unit-picker-panel"
            ref={panel}
            id={id}
            role="listbox"
            tabIndex={-1}
            aria-label={label}
            style={position}
            onKeyDown={(event) => {
              const options = [
                ...(panel.current?.querySelectorAll<HTMLButtonElement>(
                  '[role="option"]',
                ) ?? []),
              ];
              const current = options.indexOf(
                document.activeElement as HTMLButtonElement,
              );
              let target: number | undefined;
              if (event.key === 'ArrowRight' || event.key === 'ArrowDown')
                target = (current + 1) % options.length;
              if (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
                target = (current - 1 + options.length) % options.length;
              if (event.key === 'Home') target = 0;
              if (event.key === 'End') target = options.length - 1;
              if (target !== undefined) {
                event.preventDefault();
                options[target]?.focus();
              }
              if (event.key === 'Tab') {
                event.preventDefault();
                close();
              }
            }}
          >
            {choices.map((unit) => (
              <button
                key={unit}
                type="button"
                role="option"
                aria-selected={value === unit}
                onClick={() => {
                  onChange(unit);
                  close();
                }}
              >
                {unit || 'Ohne'}
                {value === unit && <Check size={13} />}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
