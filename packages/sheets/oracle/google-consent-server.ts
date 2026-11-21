// The oracle's one-time consent (docs/specs/029-sheets/formulas.md "The oracle", Consent, D95): a server on
// 127.0.0.1 at a free port takes Google's redirect, refuses a state not its own, exchanges its code once, and stops;
// at most CONSENT_TIMEOUT_MS. Prints the consent URL only, never the code or a token.
import { createServer, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  consentSecrets,
  consentUrl,
  exchangeCode,
  redirectOutcome,
  type Fetch,
  type OAuthClient,
  type Random,
  type TokenResult,
} from './google-oauth.ts';

export const CONSENT_TIMEOUT_MS = 600_000;
export const CONSENT_HOST = '127.0.0.1';

export type ConsentOptions = {
  client: OAuthClient;
  fetch: Fetch;
  random: Random;
  // Shows the consent URL to the operator; `log` says what happened.
  print: (line: string) => void;
  log: (line: string) => void;
  timeoutMs?: number;
  host?: string;
};

function page(res: ServerResponse, status: number, text: string): void {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', Connection: 'close' });
  res.end(`${text}\n`);
}

/** The refresh token the operator's consent gives, or why there is none. */
export async function awaitConsent(options: ConsentOptions): Promise<TokenResult> {
  const { verifier, challenge, state } = await consentSecrets(options.random);
  const host = options.host ?? CONSENT_HOST;
  return new Promise((resolve) => {
    let redirectUri = '';
    let taken = false;
    let settled = false;
    const server = createServer((req, res) => {
      const url = new URL(String(req.url), redirectUri);
      if (url.pathname !== '/') return page(res, 404, 'Not found.');
      if (taken) return page(res, 410, 'This consent is already answered.');
      const outcome = redirectOutcome(url, state);
      if (outcome.kind === 'foreign') {
        options.log('[sheets oracle] consent refused state');
        return page(res, 400, 'This is not the consent the oracle script asked for.');
      }
      taken = true;
      if (outcome.kind === 'refused') {
        page(res, 400, `No consent: ${outcome.problem}.`);
        return finish({ ok: false, problem: outcome.problem });
      }
      void exchangeCode(options.fetch, {
        client: options.client,
        code: outcome.code,
        verifier,
        redirectUri,
      }).then(
        (result) => {
          page(
            res,
            result.ok ? 200 : 502,
            result.ok ? 'Saved. You can close this tab.' : 'Not saved.',
          );
          finish(result);
        },
        (err: unknown) => {
          page(res, 502, 'Not saved.');
          finish({ ok: false, problem: `the token endpoint failed: ${(err as Error).message}` });
        },
      );
    });
    const finish = (result: TokenResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      server.close();
      server.closeIdleConnections();
      resolve(result);
    };
    const timeoutMs = options.timeoutMs ?? CONSENT_TIMEOUT_MS;
    const timer = setTimeout(
      () => finish({ ok: false, problem: `no consent within ${timeoutMs / 60_000} minutes` }),
      timeoutMs,
    );
    server.on('error', (err) =>
      finish({ ok: false, problem: `the server failed: ${err.message}` }),
    );
    server.listen(0, host, () => {
      redirectUri = `http://${host}:${(server.address() as AddressInfo).port}`;
      options.log(`[sheets oracle] consent listening on ${redirectUri}`);
      options.print(
        consentUrl({ clientId: options.client.clientId, redirectUri, challenge, state }),
      );
    });
  });
}
