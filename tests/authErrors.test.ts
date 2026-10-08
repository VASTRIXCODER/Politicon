import { describe, expect, it } from 'vitest';
import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';
import { friendlyAuthError, GENERIC_AUTH_ERROR } from '@/components/auth/authErrors';

describe('friendlyAuthError', () => {
  it('maps Supabase error codes to plain language', () => {
    expect(friendlyAuthError(new AuthApiError('Invalid login credentials', 400, 'invalid_credentials')))
      .toMatch(/email and password don’t match/);
    expect(friendlyAuthError(new AuthApiError('Email not confirmed', 400, 'email_not_confirmed')))
      .toMatch(/confirm your email/);
    expect(friendlyAuthError(new AuthApiError('User already registered', 422, 'user_already_exists')))
      .toMatch(/already exists/);
  });

  it('treats rate limits and server failures by status when there is no known code', () => {
    expect(friendlyAuthError(new AuthApiError('slow down', 429, undefined))).toMatch(/Too many attempts/);
    expect(friendlyAuthError(new AuthApiError('upstream exploded', 503, undefined))).toMatch(/can’t reach our servers/);
  });

  it('reports network failures without the raw fetch error', () => {
    const msg = friendlyAuthError(new AuthRetryableFetchError('Failed to fetch', 0));
    expect(msg).toMatch(/can’t reach our servers/);
    expect(msg).not.toMatch(/fetch/i);
    expect(friendlyAuthError(new TypeError('Failed to fetch'))).toMatch(/can’t reach our servers/);
  });

  it('falls back to message matching for older servers', () => {
    expect(friendlyAuthError(new Error('Invalid login credentials'))).toMatch(/don’t match/);
    expect(friendlyAuthError('For security purposes, you can only request this after 42 seconds.')).toMatch(/Too many/);
    expect(friendlyAuthError(new Error('New password should be different from the old password.'))).toMatch(/haven’t used/);
  });

  it('never shows unrecognised backend text', () => {
    expect(friendlyAuthError(new Error('duplicate key value violates unique constraint "users_pkey"'))).toBe(GENERIC_AUTH_ERROR);
    expect(friendlyAuthError(new Error('weird'), 'Custom fallback')).toBe('Custom fallback');
    expect(friendlyAuthError(null, 'Custom fallback')).toBe('Custom fallback');
  });
});
