// Whether sign-in is on, and with which methods (docs/specs/014-identity/auth-and-guest-access.md "Deployment
// modes"). Pure and total: every combination of keys maps to one answer, so the
// worker, the capabilities route and the tests all read the same table.
import type { SignInMethod } from '@livedoc/api-schema';
import { emailTransportKind } from '../email/transport';
import type { Env } from '../types';

// better-auth warns below 32 characters; a shorter secret is refused outright here rather than warned about.
export const MIN_SECRET_LENGTH = 32;

export type IdentityConfig = {
  enabled: boolean;
  methods: SignInMethod[];
  googleClientId: string | null;
  // The deployment's origin (sign-in's base URL and token issuer) and the signing secret; null when off.
  origin: string | null;
  secret: string | null;
  // Why sign-in is off, or a half-made configuration worth a log line; null when nothing is wrong.
  problem:
    | 'secret_too_short'
    | 'secret_without_methods'
    | 'google_half_configured'
    | 'base_url_missing'
    | null;
};

const OFF: IdentityConfig = {
  enabled: false,
  methods: [],
  googleClientId: null,
  origin: null,
  secret: null,
  problem: null,
};

export function identityConfigOf(env: Env): IdentityConfig {
  const secret = currentSecret(env);
  if (!secret) return OFF;
  if (secret.length < MIN_SECRET_LENGTH) return { ...OFF, problem: 'secret_too_short' };
  if (!env.APP_BASE_URL) return { ...OFF, problem: 'base_url_missing' };
  const id = env.GOOGLE_AUTH_CLIENT_ID?.trim() || null;
  const googleSecret = env.GOOGLE_AUTH_CLIENT_SECRET?.trim() || null;
  const google = id !== null && googleSecret !== null;
  const methods: SignInMethod[] = [];
  if (google) methods.push('google');
  if (emailTransportKind(env) !== null) methods.push('email-code');
  if (methods.length === 0) return { ...OFF, problem: 'secret_without_methods' };
  const half = (id === null) !== (googleSecret === null);
  return {
    enabled: true,
    methods,
    googleClientId: google ? id : null,
    origin: new URL(env.APP_BASE_URL).origin,
    secret,
    problem: half ? 'google_half_configured' : null,
  };
}

export type VersionedSecret = { version: number; value: string };

// BETTER_AUTH_SECRETS ("2:new,1:old") in the order given, better-auth's own reading: the first entry signs today,
// the rest still decrypt. A value may itself hold a colon. Empty when the variable is unset.
export function versionedSecrets(env: Env): VersionedSecret[] {
  const rotated = env.BETTER_AUTH_SECRETS?.trim();
  if (!rotated) return [];
  return rotated.split(',').map((entry) => {
    const [version, ...value] = entry.split(':');
    return { version: Number(version), value: value.join(':').trim() };
  });
}

// The secret that signs today: the first of BETTER_AUTH_SECRETS when set, else BETTER_AUTH_SECRET.
export function currentSecret(env: Env): string | null {
  const rotated = versionedSecrets(env)[0]?.value;
  if (rotated) return rotated;
  return env.BETTER_AUTH_SECRET?.trim() || null;
}

// One log line per isolate for a configuration problem, so a misconfigured host says why sign-in is off.
let reported = false;
export function reportIdentityConfig(config: IdentityConfig): void {
  if (reported || !config.problem) return;
  reported = true;
  console.warn(`[auth] ${config.problem}`);
}

// For tests only: forget that the problem was reported.
export function resetIdentityConfigReport(): void {
  reported = false;
}
