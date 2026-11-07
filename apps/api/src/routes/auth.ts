// /api/auth/* (docs/specs/014-identity/auth-and-guest-access.md): better-auth's
// own routes, behind LiveDoc's gates. Off (404) on a guest-only host. Every POST is rate limited per IP, a code send
// per address too, and linking or unlinking a sign-in method needs a fresh session.
import { sha256Hex } from '@livedoc/api-schema';
import { clientRateKey } from '../client-ip';
import {
  createIdentity,
  FRESH_SESSION_AGE_S,
  type CodeSend,
  type ExecutionContextLike,
} from '../auth/identity';
import { json, notFound } from '../responses';
import { readOptionalBody } from './context';
import type { Env } from '../types';

const CODE_SEND_PATH = '/api/auth/email-otp/send-verification-otp';
const FRESH_PATHS = new Set(['/api/auth/link-social', '/api/auth/unlink-account']);

function rateLimited(limiter: string, path: string): Response {
  console.warn(`[auth] rate_limited route=${path} limiter=${limiter}`);
  return json(
    { code: 'RATE_LIMITED', message: 'Too many attempts. Wait a minute and try again.' },
    {
      status: 429,
    },
  );
}

async function emailOf(request: Request): Promise<string | null> {
  const body = await readOptionalBody(request.clone());
  // An unreadable body names no address: the route answers it as better-auth does.
  if (body instanceof Response) return null;
  const { email } = body;
  return typeof email === 'string' && email.trim() ? email.trim().toLowerCase() : null;
}

export async function handleAuth(
  request: Request,
  env: Env,
  executionCtx?: ExecutionContextLike,
): Promise<Response> {
  const codeSend: CodeSend = { failed: false };
  const identity = createIdentity(env, executionCtx, codeSend);
  if (!identity) return notFound();
  const path = new URL(request.url).pathname.replace(/\/+$/, '');

  if (request.method === 'POST') {
    if (env.AUTH_RATE_LIMITER) {
      const { success } = await env.AUTH_RATE_LIMITER.limit({
        key: `auth:${clientRateKey(request)}`,
      });
      if (!success) return rateLimited('ip', path);
    }
    if (path === CODE_SEND_PATH && env.AUTH_EMAIL_RATE_LIMITER) {
      const email = await emailOf(request);
      if (email) {
        const key = `auth-email:${await sha256Hex(new TextEncoder().encode(email))}`;
        const { success } = await env.AUTH_EMAIL_RATE_LIMITER.limit({ key });
        if (!success) return rateLimited('email', path);
      }
    }
    if (FRESH_PATHS.has(path)) {
      const current = await identity.api.getSession({ headers: request.headers });
      const created = current ? new Date(current.session.createdAt).getTime() : 0;
      if (current && Date.now() - created > FRESH_SESSION_AGE_S * 1000) {
        console.info(`[auth] session_not_fresh route=${path}`);
        return json(
          { code: 'SESSION_NOT_FRESH', message: 'Verify it is you, then try again.' },
          {
            status: 403,
          },
        );
      }
    }
  }
  const response = await identity.handler(request);
  if (codeSend.failed) {
    return json(
      { code: 'EMAIL_SEND_FAILED', message: "We couldn't send the code. Try again in a minute." },
      { status: 502 },
    );
  }
  return response;
}
