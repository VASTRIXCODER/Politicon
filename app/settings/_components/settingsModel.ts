/*
 * The settings page's rules, kept apart from its components so they can be
 * tested without a browser: the sections and their anchors, the notices
 * email links land with, and the checks behind the account forms. (The
 * financial profile's are in ProfileModel.ts.)
 */

// ─── sections ────────────────────────────────────────────────────────────────

/** The page's sections, in order: the section nav's links and each section's anchor (#profile…). */
export const SETTINGS_SECTIONS = [
  { id: 'profile', label: 'Profile', description: 'Your household and finances' },
  { id: 'experience', label: 'Experience', description: 'Theme, motion, sound, reading' },
  { id: 'account', label: 'Account', description: 'Sign-in, your data, deletion' },
] as const;

export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]['id'];

export function isSettingsSection(id: string): id is SettingsSectionId {
  return SETTINGS_SECTIONS.some((s) => s.id === id);
}

/** The id of a section's heading (focused when the nav jumps to it). */
export const sectionHeadingId = (id: SettingsSectionId) => `settings-${id}-title`;

// ─── notices ─────────────────────────────────────────────────────────────────

export interface Notice {
  message: string;
  type: 'success' | 'error';
}

/** Messages for ?notice=… (set by email links that land here). */
export const NOTICES: Readonly<Record<string, Notice>> = {
  email_change_pending: { message: 'Address confirmed. To finish changing your email, also open the link we sent to your other address.', type: 'success' },
  link_invalid: { message: 'That link is invalid or has expired. You’re still signed in.', type: 'error' },
};

/** The notice a page URL's query string asks for, if it's one we know. */
export function noticeFor(search: string): Notice | null {
  const key = new URLSearchParams(search).get('notice') || '';
  return Object.prototype.hasOwnProperty.call(NOTICES, key) ? NOTICES[key] : null;
}

// ─── the account ─────────────────────────────────────────────────────────────

/** Who is signed in, as the page loads it from Supabase auth and user_profiles. */
export interface SettingsAccount {
  email: string;
  firstName: string;
  /** False for accounts that only sign in with a provider (no password to confirm with). */
  hasPassword: boolean;
}

/** Two letters for the identity mark: from the first name, else the email. */
export function initialsFor(firstName: string, email: string): string {
  return (firstName ? firstName.slice(0, 2) : email.slice(0, 2)).toUpperCase();
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A plausible email address (Supabase has the final say). */
export function isValidEmail(value: string): boolean {
  return EMAIL.test(value.trim());
}

export const PASSWORD_MIN_LENGTH = 8;

export type StrengthLabel = 'Weak' | 'Fair' | 'Good' | 'Strong';

export interface PasswordStrength {
  checks: { label: string; pass: boolean }[];
  /** How many checks pass, 0–4. */
  score: number;
  label: StrengthLabel;
}

/** The password-strength meter's reading: four plain checks and a word for the result. */
export function passwordStrength(password: string): PasswordStrength {
  const checks = [
    { label: '8+ characters', pass: password.length >= PASSWORD_MIN_LENGTH },
    { label: 'Uppercase letter', pass: /[A-Z]/.test(password) },
    { label: 'Number', pass: /\d/.test(password) },
    { label: 'Special character', pass: /[^A-Za-z0-9]/.test(password) },
  ];
  const score = checks.filter((c) => c.pass).length;
  const label: StrengthLabel = score <= 1 ? 'Weak' : score === 2 ? 'Fair' : score === 3 ? 'Good' : 'Strong';
  return { checks, score, label };
}

/** Why a password change can't go ahead yet (the toast it shows), or null. */
export function passwordChangeProblem(p: { current: string; next: string; confirm: string; hasPassword: boolean }): string | null {
  if (p.next.length < PASSWORD_MIN_LENGTH) return 'Password must be at least 8 characters';
  if (p.next !== p.confirm) return 'Passwords do not match';
  if (p.hasPassword && !p.current) return 'Enter your current password';
  return null;
}

/** The word typed to confirm deleting the account. */
export const DELETE_PHRASE = 'DELETE';

/** Why the account can't be deleted yet, or null once the typed confirmation (and password) are in. */
export function deleteProblem(p: { confirm: string; password: string; hasPassword: boolean }): string | null {
  if (p.confirm !== DELETE_PHRASE) return 'Type DELETE to confirm';
  if (p.hasPassword && !p.password) return 'Enter your password to confirm';
  return null;
}

/** Removes everything this app keeps in the browser (politicon* keys) after the account is deleted. */
export function clearLocalData(storage: Pick<Storage, 'removeItem'> & { [key: string]: unknown }): void {
  Object.keys(storage).filter((k) => k.startsWith('politicon')).forEach((k) => storage.removeItem(k));
}
