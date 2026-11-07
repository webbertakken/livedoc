// What LiveDoc does when better-auth creates an account, a session or a sign-in method , and how a sign-in
// code is sent. Sign-up and sign-in are counted here, from the server's own
// writes, so every method counts once (docs/specs/017-telemetry/telemetry.md "Session").
import { sendEmailNow } from '../email/client';
import { welcomeOnSighting } from '../email/lifecycle';
import { signInCodeEmail } from '../email/templates';
import { reportServerEvent } from '../server-telemetry';
import type { Env } from '../types';
import type { ExecutionContextLike } from './identity';

// A session created within this long of its account is the sign-up's own, not a sign-in (D20).
export const SIGN_UP_SESSION_WINDOW_MS = 60_000;

type Hookable = { waitUntil?: (p: Promise<unknown>) => void };

function inBackground(ctx: Hookable | undefined, work: Promise<unknown>): void {
  if (ctx?.waitUntil) ctx.waitUntil(work);
  else void work;
}

// A hook never throws into the sign-in: what it does is bookkeeping, never a reason to refuse someone.
async function guarded(name: string, work: () => Promise<unknown>): Promise<void> {
  try {
    await work();
  } catch (err) {
    console.error(`[auth] hook_failed hook=${name}`, err);
  }
}

// Sign-in keeps no Google access, refresh or id token: it only needs who the person is
// (docs/specs/014-identity/auth-and-guest-access.md "Privacy").
function withoutProviderTokens<T extends Record<string, unknown>>(account: T): T {
  return { ...account, accessToken: null, refreshToken: null, idToken: null };
}

export function identityHooks(env: Env, executionCtx?: ExecutionContextLike) {
  return {
    user: {
      create: {
        after: async (user: { id: string; email: string }) => {
          console.info('[auth] signed_up');
          inBackground(
            executionCtx,
            guarded('user.create.after', async () => {
              await reportServerEvent(env, 'Session', 'SignedUp');
              await welcomeOnSighting(env, user.id, user.email.toLowerCase());
            }),
          );
        },
      },
    },
    session: {
      create: {
        after: async (session: { userId: string }) => {
          inBackground(
            executionCtx,
            guarded('session.create.after', async () => {
              const row = await env.DB.prepare('SELECT createdAt FROM identity_users WHERE id = ?')
                .bind(session.userId)
                .first<{ createdAt: string | number }>();
              const age = row ? Date.now() - new Date(row.createdAt).getTime() : 0;
              if (age < SIGN_UP_SESSION_WINDOW_MS) return;
              console.info('[auth] signed_in');
              await reportServerEvent(env, 'Session', 'SignedIn');
            }),
          );
        },
      },
    },
    account: {
      create: {
        before: async (account: Record<string, unknown>) => ({
          data: withoutProviderTokens(account),
        }),
      },
      update: {
        before: async (account: Record<string, unknown>) => ({
          data: withoutProviderTokens(account),
        }),
      },
    },
  };
}

// Send a sign-in code; answers whether it left (docs/specs/014-identity/auth-and-guest-access.md "Email for sign-in").
export async function sendSignInCode(
  env: Env,
  { email, otp }: { email: string; otp: string },
): Promise<boolean> {
  const outcome = await sendEmailNow(env, { to: email, ...signInCodeEmail(env, otp) });
  if (outcome.ok) {
    console.info('[auth] code_sent');
    return true;
  }
  console.error(`[auth] code_send_failed status=${outcome.status}`);
  return false;
}
