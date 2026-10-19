'use client';

import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { playCue } from '@/lib/sound';
import { cn } from '@/lib/utils';

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  /** Decorative icon before the label. */
  icon?: ReactNode;
  disabled?: boolean;
  /** Accessible name, when the label alone isn't one (an icon-only option). */
  ariaLabel?: string;
}

export interface SegmentedControlProps<T extends string> {
  options: readonly SegmentedOption<T>[];
  /** The selected option (controlled). */
  value: T | undefined;
  onValueChange: (_value: T) => void;
  /** Accessible name for the group. Use this or `labelledBy`. */
  label?: string;
  /** id of a visible label that names the group. */
  labelledBy?: string;
  /** id(s) of visible text that says more about the choice (a hint): the group's aria-describedby. */
  describedBy?: string;
  size?: 'sm' | 'md';
  /** Stretch to the container's width (segments share it equally either way). */
  fullWidth?: boolean;
  className?: string;
}

/**
 * Picks option `index`, unless it's disabled or already picked: a soft tick
 * (lib/sound: silent unless the visitor turned sound on), then onValueChange.
 */
export function pickSegment<T extends string>(
  options: readonly SegmentedOption<T>[],
  index: number,
  value: T | undefined,
  onValueChange: (_value: T) => void
) {
  const option = options[index];
  if (!option || option.disabled || option.value === value) return;
  playCue('tick');
  onValueChange(option.value);
}

const sizes = {
  sm: 'min-h-8 px-3 text-xs gap-1.5',
  md: 'min-h-10 px-4 text-sm gap-2',
};

/**
 * A row of mutually exclusive choices: a WAI-ARIA radio group
 * (https://www.w3.org/WAI/ARIA/apg/patterns/radio/).
 *
 *   <SegmentedControl label="Theme" value={pref} onValueChange={setPref}
 *     options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
 *
 * Only the selected option is a Tab stop (roving tabindex); arrow keys move
 * and select, Home/End jump to the ends, disabled options are skipped. The
 * selection thumb is a CSS transform, so it needs no layout animation, and
 * it only glides once the control has been used (no slide on page load).
 * A change plays a soft tick (silent unless sound is on). `describedBy`
 * links the group to a visible hint, read after its name.
 */
export default function SegmentedControl<T extends string>({
  options,
  value,
  onValueChange,
  label,
  labelledBy,
  describedBy,
  size = 'md',
  fullWidth = false,
  className,
}: SegmentedControlProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const [used, setUsed] = useState(false);

  const selected = options.findIndex((o) => o.value === value);
  // With nothing selected, the first enabled option takes the Tab stop.
  const tabStop = selected >= 0 && !options[selected].disabled ? selected : options.findIndex((o) => !o.disabled);

  const choose = (index: number) => pickSegment(options, index, value, onValueChange);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const current = refs.current.indexOf(e.target as HTMLButtonElement);
    if (current === -1) return;
    const enabled = options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0);
    if (!enabled.length) return;
    const at = Math.max(0, enabled.indexOf(current));

    let next: number;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = enabled[(at + 1) % enabled.length];
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = enabled[(at - 1 + enabled.length) % enabled.length];
    else if (e.key === 'Home') next = enabled[0];
    else if (e.key === 'End') next = enabled[enabled.length - 1];
    else return;

    e.preventDefault();
    setUsed(true);
    refs.current[next]?.focus();
    choose(next);
  };

  return (
    <div
      role="radiogroup"
      aria-label={labelledBy ? undefined : label}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      onKeyDown={onKeyDown}
      onPointerDown={() => setUsed(true)}
      className={cn(
        'relative grid grid-flow-col auto-cols-fr rounded-full border border-fg/10 bg-fg/5 p-1',
        fullWidth ? 'w-full' : 'w-fit max-w-full',
        className
      )}
    >
      {selected >= 0 && (
        <span
          aria-hidden="true"
          data-decorative=""
          className={cn(
            // A violet rim marks the choice (3:1 or more against the track in
            // both themes, WCAG 1.4.11); the raised pill is the finish.
            'pointer-events-none absolute inset-y-1 left-1 rounded-full border border-primary bg-raised',
            'shadow-[0_1px_2px_rgb(var(--c-fg)/0.1),0_6px_16px_-8px_rgb(var(--c-violet)/0.45)]',
            'dark:shadow-[inset_0_1px_0_rgb(var(--c-fg)/0.08),0_6px_16px_-8px_rgb(var(--c-violet)/0.6)]',
            used && 'transition-transform duration-300 ease-civic motion-reduce:transition-none'
          )}
          style={{
            width: `calc((100% - 0.5rem) / ${options.length})`,
            transform: `translateX(${selected * 100}%)`,
          }}
        />
      )}
      {options.map((option, i) => {
        const checked = i === selected;
        return (
          <button
            key={option.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={option.ariaLabel}
            tabIndex={i === tabStop ? 0 : -1}
            disabled={option.disabled}
            onClick={() => choose(i)}
            className={cn(
              'relative inline-flex items-center justify-center whitespace-nowrap rounded-full font-medium',
              'transition-colors duration-200 ease-civic disabled:cursor-not-allowed disabled:opacity-50',
              checked ? 'text-ink' : 'text-muted hover:text-ink',
              sizes[size]
            )}
          >
            {option.icon && (
              <span className="flex-shrink-0" aria-hidden="true">
                {option.icon}
              </span>
            )}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
