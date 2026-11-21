// The oracle's one-time Google consent: `pnpm --filter @livedoc/sheets oracle:google:consent`
// (docs/specs/029-sheets/formulas.md "The oracle", Consent). Reads the operator's client file, prints Google's consent
// URL, and saves the refresh token mode 600. Says where it saved it, never what.
import { awaitConsent } from './google-consent-server.ts';
import { randomBytes, readOAuthClient } from './google-oauth.ts';
import { oracleSecretPaths, readSecret, writeSecret } from './secrets.ts';

const paths = oracleSecretPaths();
const file = readSecret(paths.client);
if (file === null) {
  console.error(`[sheets oracle] no client file at ${paths.client}`);
  process.exit(1);
}
const read = readOAuthClient(JSON.parse(file));
if (!read.ok) {
  console.error(`[sheets oracle] ${read.problem}`);
  process.exit(1);
}
const result = await awaitConsent({
  client: read.client,
  fetch: globalThis.fetch,
  random: randomBytes,
  print: (url) => console.info(`Open this address to let the oracle use Drive:\n\n${url}\n`),
  log: (line) => console.info(line),
});
if (!result.ok) {
  console.error(`[sheets oracle] consent failed: ${result.problem}`);
  process.exit(1);
}
writeSecret(paths.refreshToken, result.token);
console.info(`[sheets oracle] consent saved to ${paths.refreshToken}`);
