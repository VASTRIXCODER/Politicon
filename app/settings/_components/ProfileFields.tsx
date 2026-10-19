import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import RadioGroup from '@/components/forms/RadioGroup';
import { TileEdge, TileMark, tileClass } from '@/components/onboarding/ChoiceTile';
import Badge from '@/components/ui/Badge';
import Surface from '@/components/ui/Surface';
import { cn } from '@/lib/utils';
import type { ProfileField } from './ProfileModel';
import { SECTION_SCROLL_MARGIN } from './SettingsSection';

/*
 * The pieces of the household editor (ProfileSection): its answers as
 * onboarding's porcelain tiles, packed into wrapping rows (a form with every
 * question at once needs them denser than onboarding's one question per
 * screen), each field's label row, the pane for each of onboarding's four
 * sections and an index of them. Only looks: the semantics are RadioGroup's (role="radio",
 * aria-checked, one Tab stop per group) and aria-pressed toggle buttons, as
 * before the redesign.
 */

export type Choice = { value: string; label: string };

/** An optional question's blank answer, as a choice of its own. */
export const PREFER_NOT: Choice = { value: '', label: 'Prefer not to say' };

/**
 * A choice tile sized to its label; at least 44px tall, wrapping when the
 * label is longer than the row. A chosen one keeps a Highlight rim in forced
 * colours (tileClass), with ChoiceMark's dot or check drawn again.
 */
const choiceClass = (selected: boolean) =>
  tileClass(selected, 'inline-flex w-auto max-w-full min-h-11 items-center gap-2.5 py-2.5 pl-3.5 pr-4 text-sm');

const ROW = 'flex flex-wrap gap-2';

/**
 * A tile's mark (onboarding's ring or box), with its dot or check drawn again
 * in the text colour for forced colours, where the lit fill disappears.
 */
export function ChoiceMark({ on, multiple = false }: { on: boolean; multiple?: boolean }) {
  return (
    <span className="relative flex flex-shrink-0">
      <TileMark on={on} multiple={multiple} />
      {on && (
        <span aria-hidden="true" className="absolute inset-0 hidden items-center justify-center forced-colors:flex">
          {multiple ? <Check className="h-3 w-3" strokeWidth={3} /> : <span className="h-2 w-2 rounded-full bg-[color:CanvasText]" />}
        </span>
      )}
    </span>
  );
}

function ChoiceBody({ label, on, multiple = false }: { label: string; on: boolean; multiple?: boolean }) {
  return (
    <>
      <TileEdge on={on} />
      <ChoiceMark on={on} multiple={multiple} />
      <span className="min-w-0">{label}</span>
    </>
  );
}

/** Pick one: a radio group of tiles. Blank ('') is a choice when the options include PREFER_NOT. */
export function ChoiceRadios({ options, value, onChange, labelledBy, describedBy, className }: {
  options: readonly Choice[];
  value: string;
  onChange: (_value: string) => void;
  labelledBy: string;
  describedBy?: string;
  className?: string;
}) {
  return (
    <RadioGroup
      options={options}
      value={value}
      onChange={onChange}
      labelledBy={labelledBy}
      describedBy={describedBy}
      className={cn(ROW, className)}
      optionClassName={choiceClass}
      renderOption={(o, selected) => <ChoiceBody label={o.label} on={selected} />}
    />
  );
}

/** Pick several: a labelled group of toggle buttons (aria-pressed); with `max`, the rest disable once it's reached. */
export function ChoiceToggles({ options, selected, onToggle, labelledBy, describedBy, max }: {
  options: readonly Choice[];
  selected: readonly string[];
  onToggle: (_value: string) => void;
  labelledBy: string;
  describedBy?: string;
  max?: number;
}) {
  const full = max !== undefined && selected.length >= max;
  return (
    <div role="group" aria-labelledby={labelledBy} aria-describedby={describedBy} className={ROW}>
      {options.map((o) => {
        const on = selected.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            disabled={!on && full}
            onClick={() => onToggle(o.value)}
            className={choiceClass(on)}
          >
            <ChoiceBody label={o.label} on={on} multiple />
          </button>
        );
      })}
    </div>
  );
}

const LABEL = 'text-sm font-medium text-ink';

/**
 * One question: its label (a <label> for a single control, else the text
 * its group is named by), a "Needed" mark while a required answer is
 * missing, an optional hint, then the control. `name` lets the editor find
 * the field to move focus to.
 */
export function Field({ name, label, id, htmlFor, needed = false, neededId, hint, hintId, meta, className, children }: {
  name: ProfileField;
  label: string;
  /** The group label's id (for aria-labelledby), when the control is a group. */
  id?: string;
  /** The control's id, when the label is a <label>. */
  htmlFor?: string;
  needed?: boolean;
  neededId?: string;
  hint?: string;
  hintId?: string;
  /** Beside the label, after the "Needed" mark (e.g. "2 of 3 chosen"). */
  meta?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div data-field={name} className={cn('py-5 first:pt-0 last:pb-0', className)}>
      <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1.5', hint ? 'mb-1' : 'mb-3')}>
        {htmlFor ? (
          <label htmlFor={htmlFor} className={LABEL}>{label}</label>
        ) : (
          <p id={id} className={LABEL}>{label}</p>
        )}
        {needed && (
          <span id={neededId}>
            <Badge variant="warning">
              Needed<span className="sr-only"> before you can save</span>
            </Badge>
          </span>
        )}
        {meta}
      </div>
      {hint && <p id={hintId} className="mb-3 max-w-prose text-meta text-muted">{hint}</p>}
      {children}
    </div>
  );
}

/**
 * One of onboarding's four sections as a paper pane: its number in the
 * mono type of onboarding's rail, its name, what the answers are used for,
 * and whether any are still needed. Not a landmark of its own (the h3 gives
 * the structure; "Your household" is the region).
 */
const number = (index: number) => String(index + 1).padStart(2, '0');

/** "Complete", or how many answers a section still needs. */
function StageStatus({ missing }: { missing: number }) {
  return missing > 0 ? (
    <span className="text-meta font-medium text-caution">{missing} needed</span>
  ) : (
    <span className="inline-flex items-center gap-1 text-meta text-muted">
      <Check className="h-3.5 w-3.5" aria-hidden="true" /> Complete
    </span>
  );
}

export function StagePane({ id, index, title, purpose, missing, children }: {
  /** The pane's id, for the section index's links. */
  id: string;
  index: number;
  title: string;
  purpose: string;
  /** How many required answers in this section are blank. */
  missing: number;
  children: ReactNode;
}) {
  return (
    // A link jumping here stops clear of the floating navbar (and, on phones, the sticky section bar under it).
    <Surface as="section" id={id} pad="none" className={cn(SECTION_SCROLL_MARGIN, 'p-5 sm:p-7')}>
      <div className="mb-6 flex items-start gap-4">
        <span aria-hidden="true" className="mt-1 font-mono-data text-meta font-medium tracking-[0.16em] text-primary-300">
          {number(index)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h3 className="font-display text-xl font-medium text-ink">{title}</h3>
            <StageStatus missing={missing} />
          </div>
          <p className="mt-1 text-sm leading-relaxed text-muted [text-wrap:pretty]">{purpose}</p>
        </div>
      </div>
      <div className="divide-y divide-fg/8">{children}</div>
    </Surface>
  );
}

/**
 * The four sections as links down the form, each with its status, like
 * onboarding's rail: for the column beside a long form.
 */
export function StageIndex({ stages, className }: {
  stages: readonly { id: string; href: string; label: string; missing: number }[];
  className?: string;
}) {
  return (
    <nav aria-label="Profile sections" className={className}>
      <ol className="space-y-0.5">
        {stages.map((s, i) => (
          <li key={s.id}>
            <a
              href={s.href}
              className="flex min-h-11 items-center gap-3 rounded-tile px-3 py-2 text-sm text-ink transition-colors duration-200 ease-civic hover:bg-fg/4"
            >
              <span aria-hidden="true" className="font-mono-data text-meta font-medium tracking-[0.16em] text-primary-300">
                {number(i)}
              </span>
              <span className="min-w-0 flex-1 font-medium">{s.label}</span>
              <StageStatus missing={s.missing} />
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
