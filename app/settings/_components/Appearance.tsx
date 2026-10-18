'use client';

import ThemeChoice from '@/components/ui/ThemeChoice';
import EffectsChoice from '@/components/ui/EffectsChoice';

/**
 * Settings → Preferences → Appearance: the theme, and how much 3D and moving
 * light this device draws. Loaded with the Preferences tab (not with the
 * page), so its controls stay out of the settings page's first load.
 */
export default function Appearance() {
  return (
    <>
      <ThemeChoice />
      <p className="text-xs text-text-muted">Saved on this device.</p>
      <div className="border-t border-fg/8 pt-5">
        <h3 id="settings-effects" className="text-sm font-medium text-text-primary">
          Visual effects
        </h3>
        <p className="mt-1 mb-3 text-xs leading-relaxed text-text-muted">
          3D scenes and moving light. Reduced keeps them simpler on this device; Off shows still pictures instead.
        </p>
        <EffectsChoice labelledBy="settings-effects" />
      </div>
    </>
  );
}
