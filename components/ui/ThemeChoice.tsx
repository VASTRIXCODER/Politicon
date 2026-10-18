'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import SegmentedControl from '@/components/ui/SegmentedControl';
import { useThemePreference } from '@/lib/useTheme';
import type { ThemePreference } from '@/lib/theme';

const OPTIONS = [
  { value: 'light', label: 'Light', icon: <Sun className="h-3.5 w-3.5" /> },
  { value: 'dark', label: 'Dark', icon: <Moon className="h-3.5 w-3.5" /> },
  { value: 'system', label: 'System', icon: <Monitor className="h-3.5 w-3.5" /> },
] as const satisfies readonly { value: ThemePreference; label: string; icon: React.ReactNode }[];

/**
 * The Light / Dark / System choice, for settings. Its own module (not part of
 * the navbar's ThemeToggle), so the radio group stays out of every page's
 * first load.
 */
export default function ThemeChoice({ className }: { className?: string }) {
  const [preference, setPreference] = useThemePreference();
  return (
    <SegmentedControl label="Theme" value={preference} onValueChange={setPreference} options={OPTIONS} className={className} />
  );
}
