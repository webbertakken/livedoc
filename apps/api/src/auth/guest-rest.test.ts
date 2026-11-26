import { describe, it, expect } from 'vitest';
import type { Env } from '../types';
import { guestSignatureEnforced, OWNER_SCOPED_SEGMENTS } from './guest-rest';

describe('guestSignatureEnforced', () => {
  it('is off on a guest-only host, which signs nothing', () => {
    expect(guestSignatureEnforced({} as Env)).toBe(false);
  });
  it('is off for a secret too short to sign with', () => {
    expect(guestSignatureEnforced({ BETTER_AUTH_SECRET: 'short' } as Env)).toBe(false);
  });
  it('is on whenever the host has a sign-in secret, with no cutoff', () => {
    expect(guestSignatureEnforced({ BETTER_AUTH_SECRET: 's'.repeat(32) } as Env)).toBe(true);
    expect(guestSignatureEnforced({ BETTER_AUTH_SECRETS: `1:${'s'.repeat(32)}` } as Env)).toBe(
      true,
    );
  });
});

describe('OWNER_SCOPED_SEGMENTS', () => {
  it('includes the owner-keyed resources', () => {
    for (const s of [
      'documents',
      'folders',
      'images',
      'custom-themes',
      'custom-stamps',
      'participants',
      'preferences',
      'shared',
      'timeline',
      'activity',
      'favourites',
    ])
      expect(OWNER_SCOPED_SEGMENTS.has(s)).toBe(true);
  });
  it('excludes public / auth-bootstrap / session-only routes', () => {
    for (const s of [
      'guest-id',
      'share',
      'migrate',
      'events',
      'telemetry',
      'tokens',
      'teams',
      'account',
    ])
      expect(OWNER_SCOPED_SEGMENTS.has(s)).toBe(false);
  });
});
