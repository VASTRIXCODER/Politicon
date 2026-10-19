'use client';

import SegmentedControl from '@/components/ui/SegmentedControl';
import { useEffectsPreference, type EffectsPref } from '@/lib/three/tier';

const OPTIONS = [
  { value: 'full', label: 'Full' },
  { value: 'reduced', label: 'Reduced' },
  { value: 'off', label: 'Off' },
] as const satisfies readonly { value: EffectsPref; label: string }[];

/**
 * "Visual effects: Full / Reduced / Off" (lib/three/tier.ts): how much 3D
 * and moving light this device draws. Reduced keeps scenes simpler (tier 1),
 * Off shows their still pictures instead. Saved on this device, applied at once.
 * Named by `labelledBy` (a visible title) or "Visual effects"; `describedBy`
 * links it to the visible sentence that explains the choice.
 */
export default function EffectsChoice({ className, labelledBy, describedBy }: { className?: string; labelledBy?: string; describedBy?: string }) {
  const [pref, setPref] = useEffectsPreference();
  return (
    <SegmentedControl
      label={labelledBy ? undefined : 'Visual effects'}
      labelledBy={labelledBy}
      describedBy={describedBy}
      value={pref}
      onValueChange={setPref}
      options={OPTIONS}
      className={className}
    />
  );
}
