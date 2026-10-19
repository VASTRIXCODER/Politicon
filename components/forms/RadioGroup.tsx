'use client';

import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface RadioOption<T extends string = string> {
  value: T;
  label: string;
  /**
   * A sentence that explains the option. The radio is then named by its
   * label alone and described by this (aria-labelledby / aria-describedby),
   * so a screen reader says the short name first and the detail after.
   */
  description?: string;
}

/** The ids a custom option must put on its label and description (see `renderOption`). */
export interface RadioOptionIds {
  label: string;
  description: string;
}

export interface RadioGroupProps<T extends string> {
  options: readonly RadioOption<T>[];
  /** The selected value, or '' for none. */
  value: T | '';
  onChange: (_value: T | '') => void;
  /** Accessible name: visible text's id (preferred) or a plain label. */
  labelledBy?: string;
  label?: string;
  describedBy?: string;
  /** Choosing the selected option again clears it (for optional questions). */
  allowDeselect?: boolean;
  className?: string;
  /** Classes for each option button, by state. */
  optionClassName?: (_selected: boolean) => string;
  /**
   * Option content; defaults to its label (and its description, if any). An
   * option with a description must put `ids.label` on the element holding
   * its label and `ids.description` on the one holding its description.
   */
  renderOption?: (_option: RadioOption<T>, _selected: boolean, _ids: RadioOptionIds) => ReactNode;
}

/**
 * Single-choice buttons with WAI-ARIA radio semantics
 * (https://www.w3.org/WAI/ARIA/apg/patterns/radio/): the group is one Tab
 * stop, arrow keys move and select, and the state is exposed as aria-checked
 * rather than by colour alone. An option with a description is named by its
 * label and described by the rest, rather than read as one long name.
 */
export default function RadioGroup<T extends string>({
  options, value, onChange, labelledBy, label, describedBy, allowDeselect = false, className, optionClassName, renderOption,
}: RadioGroupProps<T>) {
  const ref = useRef<HTMLDivElement>(null);
  const uid = useId();
  const idsFor = (i: number): RadioOptionIds => ({ label: `${uid}-${i}-label`, description: `${uid}-${i}-description` });
  const selectedIndex = options.findIndex((o) => o.value === value);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    const radios = Array.from(ref.current?.querySelectorAll<HTMLElement>('[role="radio"]') ?? []);
    const current = radios.indexOf(document.activeElement as HTMLElement);
    if (current === -1) return;
    e.preventDefault();
    const next = (current + step + radios.length) % radios.length;
    radios[next].focus();
    onChange(options[next].value);
  };

  return (
    <div
      ref={ref}
      role="radiogroup"
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : label}
      aria-describedby={describedBy}
      onKeyDown={onKeyDown}
      className={className}
    >
      {options.map((o, i) => {
        const selected = o.value === value;
        const ids = idsFor(i);
        const described = !!o.description;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-labelledby={described ? ids.label : undefined}
            aria-describedby={described ? ids.description : undefined}
            // Roving tabindex: the selected option, or the first when none is.
            tabIndex={(selectedIndex === -1 ? i === 0 : selected) ? 0 : -1}
            onClick={() => onChange(allowDeselect && selected ? '' : o.value)}
            className={cn('text-left transition-all', optionClassName?.(selected))}
          >
            {renderOption ? (
              renderOption(o, selected, ids)
            ) : described ? (
              <>
                <span id={ids.label} className="block">{o.label}</span>
                <span id={ids.description} className="block">{o.description}</span>
              </>
            ) : (
              o.label
            )}
          </button>
        );
      })}
    </div>
  );
}
