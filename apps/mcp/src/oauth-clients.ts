// The OAuth clients the authorization server knows (docs/specs/015-api/cli.md).

import {
  CLI_CLIENT_ID,
  CLI_CLIENT_NAME,
  CLI_REDIRECT_URIS,
  RUNA_CLIENT_ID,
  RUNA_CLIENT_NAME,
} from '@livedoc/api-schema';
import type { Env } from './env';

export type ClientReg = { redirectUris: readonly string[]; clientName: string };

// The clients LiveDoc ships (docs/specs/015-api/cli.md, CLI35): looked up before any
// registration. Registration mints random hex ids, so it can never take one of these.
export const BUILT_IN_CLIENTS: Readonly<Record<string, ClientReg>> = {
  [CLI_CLIENT_ID]: { clientName: CLI_CLIENT_NAME, redirectUris: CLI_REDIRECT_URIS },
  // Device grant only: no redirect URI matches, so the authorisation-code flow refuses it.
  [RUNA_CLIENT_ID]: { clientName: RUNA_CLIENT_NAME, redirectUris: [] },
};

export async function lookupClient(env: Env, clientId: string): Promise<ClientReg | null> {
  return (
    BUILT_IN_CLIENTS[clientId] ?? (await env.OAUTH_KV.get<ClientReg>(`client:${clientId}`, 'json'))
  );
}
