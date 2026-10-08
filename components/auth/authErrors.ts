import { isAuthError, isAuthRetryableFetchError } from '@supabase/supabase-js';

/** Shown when we can't tell what went wrong. */
export const GENERIC_AUTH_ERROR = 'Something went wrong. Please try again.';

const NETWORK = 'We can’t reach our servers right now. Check your connection and try again in a minute.';

// Supabase auth error codes (error.code), in plain language.
const BY_CODE: Record<string, string> = {
  invalid_credentials: 'That email and password don’t match. Check them and try again.',
  email_not_confirmed: 'Please confirm your email first. Check your inbox for the link.',
  over_request_rate_limit: 'Too many attempts. Please wait a minute and try again.',
  over_email_send_rate_limit: 'We’ve sent several emails already. Please wait a minute before asking for another.',
  user_already_exists: 'An account with this email already exists. Sign in instead, or reset your password.',
  email_exists: 'An account with this email already exists. Sign in instead, or reset your password.',
  weak_password: 'That password is too weak. Use at least 8 characters with a mix of letters, numbers and symbols.',
  same_password: 'Choose a password you haven’t used for this account before.',
  email_address_invalid: 'That email address doesn’t look right. Check it and try again.',
  email_address_not_authorized: 'We can’t send email to that address. Try a different one.',
  signup_disabled: 'New sign-ups are paused right now. Please try again later.',
  email_provider_disabled: 'New sign-ups are paused right now. Please try again later.',
  user_banned: 'This account can’t sign in right now. Contact support for help.',
  session_not_found: 'Your session expired. Please sign in again.',
  session_expired: 'Your session expired. Please sign in again.',
  refresh_token_not_found: 'Your session expired. Please sign in again.',
  reauthentication_needed: 'For your security, please sign in again before making this change.',
  request_timeout: NETWORK,
};

// Older servers (and some endpoints) send only a message, so fall back to matching it.
const BY_MESSAGE: [RegExp, string][] = [
  [/invalid login credentials/i, BY_CODE.invalid_credentials],
  [/email not confirmed/i, BY_CODE.email_not_confirmed],
  [/rate limit|too many|only request this after|\d+ seconds/i, BY_CODE.over_request_rate_limit],
  [/already (been )?registered|already exists/i, BY_CODE.user_already_exists],
  [/should be different from the old/i, BY_CODE.same_password],
  [/password (should|must)|weak password/i, BY_CODE.weak_password],
  [/invalid email|unable to validate email|email address .* is invalid/i, BY_CODE.email_address_invalid],
  [/signups? not allowed|signups? (are )?disabled/i, BY_CODE.signup_disabled],
  [/auth session missing|session.*expired|jwt expired/i, BY_CODE.session_expired],
  [/failed to fetch|network ?error|load failed|fetch failed/i, NETWORK],
];

/**
 * Turns a Supabase auth error (or any thrown error) into a sentence a person
 * can act on. Raw backend text is never shown; anything unrecognised gets
 * `fallback`.
 */
export function friendlyAuthError(error: unknown, fallback: string = GENERIC_AUTH_ERROR): string {
  if (!error) return fallback;
  if (isAuthRetryableFetchError(error)) return NETWORK;

  if (isAuthError(error)) {
    if (error.code && BY_CODE[error.code]) return BY_CODE[error.code];
    if (error.status === 429) return BY_CODE.over_request_rate_limit;
    if ((error.status ?? 0) >= 500) return NETWORK;
  }

  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  for (const [pattern, copy] of BY_MESSAGE) {
    if (pattern.test(message)) return copy;
  }
  return fallback;
}
