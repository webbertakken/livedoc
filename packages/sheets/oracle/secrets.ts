// Where the oracle keeps its Google secrets (docs/specs/029-sheets/formulas.md "The oracle"): the operator's client
// file and the refresh token, mode 600 in a folder only the operator reads. Never prints what they hold.
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export function oracleSecretPaths(home = homedir()): { client: string; refreshToken: string } {
  return {
    client: join(home, '.secrets', 'google-oracle-oauth-client.json'),
    refreshToken: join(home, '.secrets', 'google-oracle-refresh-token'),
  };
}

/** A secret file's text, trimmed, or null when there is none. */
export function readSecret(path: string): string | null {
  if (!existsSync(path)) return null;
  return readFileSync(path, 'utf8').trim();
}

/** Writes a secret file, mode 600 (also when it was there before), its folder made mode 700. */
export function writeSecret(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${text}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
}
