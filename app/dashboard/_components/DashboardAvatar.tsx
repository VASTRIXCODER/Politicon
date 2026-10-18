'use client';

import { useMemo } from 'react';
import HouseholdAvatar from '@/components/avatar/HouseholdAvatar';
import type { DashboardProfileRow } from './dashboardModel';
import { householdFromRow } from './profileHousehold';

/*
 * The header's avatar: the user's household (the diorama they built in
 * onboarding), from their saved profile. Nothing at all when the profile
 * doesn't say enough to draw it. Loaded by GreetingHeader with next/dynamic,
 * so the household's drawing and scene stay off the page's first load.
 */
export default function DashboardAvatar({ profile, className }: { profile: DashboardProfileRow | null; className?: string }) {
  const model = useMemo(() => householdFromRow(profile), [profile]);
  return model ? <HouseholdAvatar model={model} size="md" className={className} /> : null;
}
