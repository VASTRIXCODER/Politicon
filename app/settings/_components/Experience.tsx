'use client';

import { useId, type ReactNode } from 'react';
import { BookOpen, Check, Zap } from 'lucide-react';
import RadioGroup from '@/components/forms/RadioGroup';
import { TileEdge, tileClass } from '@/components/onboarding/ChoiceTile';
import { useReadingMode } from '@/components/providers/ReadingModeProvider';
import EffectsChoice from '@/components/ui/EffectsChoice';
import ThemeChoice from '@/components/ui/ThemeChoice';
import { useMotionPaused } from '@/lib/motion';
import { playCue, useSoundEnabled } from '@/lib/sound';
import { cn } from '@/lib/utils';
import { ChoiceMark } from './ProfileFields';
import { SettingsPane } from './SettingsSection';

/*
 * Settings → Experience: how Politicon looks, moves, sounds and reads.
 *
 * The first pane is this device's: the theme, how much 3D and moving light it
 * draws, pausing all motion, and the optional sounds (the same preferences
 * as the navbar's quick toggles, here with a sentence each on what they do).
 * The second is the account's reading mode, which follows the user across
 * devices.
 *
 * Every control renders its server value (Light, Full, playing, off) until
 * hydration reads the saved choice; the page itself only renders this once
 * the user's settings have loaded, in the browser.
 */

const READING_MODES = [
  {
    value: 'simple' as const,
    icon: BookOpen,
    label: 'Simple Mode',
    description: 'Plain English, grade-8 reading level. Numbers translated into everyday examples.',
  },
  {
    value: 'expert' as const,
    icon: Zap,
    label: 'Expert Mode',
    description: 'Full financial terminology, detailed metrics, technical breakdowns.',
  },
];

/** One preference: its name and a plain sentence on the left, its control on the right (below on phones). */
function PreferenceRow({ title, titleId, description, descriptionId, children, stacked = false }: {
  title: string;
  titleId: string;
  description: ReactNode;
  descriptionId: string;
  children: ReactNode;
  /** The control sits under the text at every width (wide controls such as the reading-mode cards). */
  stacked?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-4 px-5 py-6 sm:px-7',
        !stacked && 'sm:flex-row sm:items-center sm:justify-between sm:gap-8'
      )}
    >
      <div className="min-w-0 max-w-xl">
        <h3 id={titleId} className="text-[0.9375rem] font-semibold text-ink">
          {title}
        </h3>
        <p id={descriptionId} className="mt-1.5 text-sm leading-relaxed text-muted [text-wrap:pretty]">
          {description}
        </p>
      </div>
      <div className={cn('min-w-0', !stacked && 'sm:flex-shrink-0')}>{children}</div>
    </div>
  );
}

/**
 * An on/off switch (WAI-ARIA switch pattern): named and described by its
 * row's text, the state in aria-checked, and on screen as the thumb's side,
 * the track's light and an "On"/"Off" word, never by colour alone. In forced
 * colours (which drop fills) the thumb and the "on" track take system colours.
 */
export function Switch({ checked, onCheckedChange, labelledBy, describedBy }: {
  checked: boolean;
  onCheckedChange: (_checked: boolean) => void;
  labelledBy: string;
  describedBy?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      onClick={() => onCheckedChange(!checked)}
      className="group -m-1.5 inline-flex min-h-11 items-center gap-3 rounded-full p-1.5"
    >
      <span
        aria-hidden="true"
        className={cn(
          'w-7 text-right font-mono-data text-meta font-medium uppercase tracking-[0.14em] transition-colors duration-200 ease-civic',
          checked ? 'text-primary-300' : 'text-muted'
        )}
      >
        {checked ? 'On' : 'Off'}
      </span>
      <span
        aria-hidden="true"
        className={cn(
          'relative inline-flex h-7 w-12 flex-shrink-0 items-center rounded-full border',
          'transition-[background-color,border-color,box-shadow] duration-200 ease-civic',
          checked
            ? 'border-primary-fill bg-primary-fill shadow-[inset_0_1px_0_rgb(255_255_255/0.25),0_0_16px_-2px_rgb(var(--c-glow)/0.7)] forced-colors:border-[color:Highlight] forced-colors:bg-[color:Highlight]'
            : 'border-fg/45 bg-fg/6 group-hover:border-fg/60'
        )}
      >
        <span
          className={cn(
            'absolute left-[3px] h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgb(21_18_31/0.3)]',
            'transition-transform duration-200 ease-civic',
            checked ? 'translate-x-5 forced-colors:bg-[color:HighlightText]' : 'translate-x-0 forced-colors:bg-[color:CanvasText]'
          )}
        />
      </span>
    </button>
  );
}

/**
 * Turns the interface sounds on or off. Turning them on starts the audio
 * inside the click (setSoundEnabled: that's what lets the browser play it at
 * all) and plays one soft chime to confirm it, a moment later if the
 * synthesizer's chunk is still on its way; turning them off is silent.
 */
export function setSoundEffects(next: boolean, setOn: (_on: boolean) => void) {
  setOn(next);
  if (next) playCue('chime');
}

export default function Experience() {
  const uid = useId();
  const ids = {
    theme: `${uid}-theme`, themeHint: `${uid}-theme-hint`,
    effects: 'settings-effects', effectsHint: `${uid}-effects-hint`,
    motion: `${uid}-motion`, motionHint: `${uid}-motion-hint`,
    sound: `${uid}-sound`, soundHint: `${uid}-sound-hint`,
    reading: `${uid}-reading`, readingHint: `${uid}-reading-hint`,
  };

  const [paused, setPaused] = useMotionPaused();
  const [soundOn, setSoundOn] = useSoundEnabled();
  const { mode: readingMode, setMode: setReadingMode } = useReadingMode();

  return (
    <div className="space-y-6">
      <SettingsPane label="On this device">
        <PreferenceRow
          title="Theme"
          titleId={ids.theme}
          description="Light, dark, or the same as your device's setting."
          descriptionId={ids.themeHint}
        >
          <ThemeChoice describedBy={ids.themeHint} />
        </PreferenceRow>

        <PreferenceRow
          title="Visual effects"
          titleId={ids.effects}
          description="3D scenes and moving light. Reduced keeps them simpler on this device; Off shows still pictures instead."
          descriptionId={ids.effectsHint}
        >
          <EffectsChoice labelledBy={ids.effects} describedBy={ids.effectsHint} />
        </PreferenceRow>

        <PreferenceRow
          title="Pause motion"
          titleId={ids.motion}
          description="Holds everything still: 3D scenes stop on a still frame, and animations and smooth scrolling stop. Works whatever your device's motion setting is."
          descriptionId={ids.motionHint}
        >
          <Switch checked={paused} onCheckedChange={setPaused} labelledBy={ids.motion} describedBy={ids.motionHint} />
        </PreferenceRow>

        <PreferenceRow
          title="Sound effects"
          titleId={ids.sound}
          description="Soft sounds alongside what you see, like a chime when an analysis is ready. They never carry information on their own, and nothing plays unless you turn them on."
          descriptionId={ids.soundHint}
        >
          <Switch checked={soundOn} onCheckedChange={(next) => setSoundEffects(next, setSoundOn)} labelledBy={ids.sound} describedBy={ids.soundHint} />
        </PreferenceRow>
      </SettingsPane>

      <SettingsPane label="Across your devices">
        <PreferenceRow
          title="Reading mode"
          titleId={ids.reading}
          description="Controls how complex the AI analysis language is across the entire app."
          descriptionId={ids.readingHint}
          stacked
        >
          <RadioGroup
            labelledBy={ids.reading}
            describedBy={ids.readingHint}
            options={READING_MODES}
            value={readingMode}
            onChange={(v) => {
              if (v) setReadingMode(v);
            }}
            className="grid grid-cols-1 gap-3 sm:grid-cols-2"
            optionClassName={(selected) => tileClass(selected, 'p-5')}
            // Each card is named by its title alone and described by its sentence (RadioGroup's ids).
            renderOption={(o, selected, optionIds) => {
              const opt = READING_MODES.find((r) => r.value === o.value)!;
              const Icon = opt.icon;
              return (
                <>
                  <TileEdge on={selected} />
                  <span className="flex items-start justify-between gap-3">
                    <Icon aria-hidden="true" className={cn('h-5 w-5', selected ? 'text-primary-300' : 'text-muted')} strokeWidth={1.75} />
                    <ChoiceMark on={selected} />
                  </span>
                  <span id={optionIds.label} className="mt-3 block text-sm font-semibold text-ink">{opt.label}</span>
                  <span id={optionIds.description} className="mt-1 block text-sm font-normal leading-relaxed text-muted">{opt.description}</span>
                </>
              );
            }}
          />
          <p className="mt-4 flex items-center gap-2 text-meta text-muted">
            <Check className="h-3.5 w-3.5 text-primary-300" aria-hidden="true" />
            Reading mode is saved automatically and synced across devices
          </p>
        </PreferenceRow>
      </SettingsPane>
    </div>
  );
}
