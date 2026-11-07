// better-auth's log lines (docs/specs/014-identity/auth-and-guest-access.md,
// "Observability"). A secret changed without BETTER_AUTH_SECRETS keeping the old one leaves the session-token keys
// undecryptable: better-auth throws on every token it signs, and that failure is logged under its own fingerprint.
// Every other line passes through at its own level.
import type { BetterAuthOptions } from 'better-auth';

type IdentityLogger = Required<Pick<NonNullable<BetterAuthOptions['logger']>, 'log'>>;

// The start of the message better-auth throws when the stored private key does not decrypt.
const UNDECRYPTABLE_KEY = 'Failed to decrypt private key';

const isUndecryptableKey = (arg: unknown) =>
  arg instanceof Error && arg.message.startsWith(UNDECRYPTABLE_KEY);

export const identityLogger: IdentityLogger = {
  log: (level, message, ...args: unknown[]) => {
    if (level === 'error' && args.some(isUndecryptableKey)) {
      console.error('[auth] jwks_undecryptable');
      return;
    }
    const line = `[Better Auth] ${message}`;
    if (level === 'error') console.error(line, ...args);
    else if (level === 'warn') console.warn(line, ...args);
    else console.info(line, ...args);
  },
};
