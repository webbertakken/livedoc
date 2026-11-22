// The oracle's Drive, with an hour's access token from the refresh token oracle:google:consent saved; never says
// either. Shared by the oracle's answers (make-answers.oracle.ts) and the corpus (corpus/make-corpus.make.ts).
import { oracleDrive, type OracleDrive } from './google-drive.ts';
import { accessTokenOf, readOAuthClient } from './google-oauth.ts';
import { oracleSecretPaths, readSecret } from './secrets.ts';

export async function googleDrive(): Promise<OracleDrive> {
  const paths = oracleSecretPaths();
  const file = readSecret(paths.client);
  if (file === null)
    throw new Error(`the oracle's Drive needs the OAuth client file at ${paths.client}`);
  const client = readOAuthClient(JSON.parse(file));
  if (!client.ok) throw new Error(client.problem);
  const refreshToken = readSecret(paths.refreshToken);
  if (refreshToken === null)
    throw new Error(`no refresh token at ${paths.refreshToken}: run oracle:google:consent first`);
  const access = await accessTokenOf(globalThis.fetch, client.client, refreshToken);
  if (!access.ok) throw new Error(access.problem);
  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
  return oracleDrive(globalThis.fetch, access.token, sleep, (line) => console.info(line));
}
