import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { oracleSecretPaths, readSecret, writeSecret } from './secrets.ts';

// formulas.md "The oracle": the client file and the refresh token, both mode 600.

const dirs: string[] = [];
const home = () => {
  const dir = mkdtempSync(join(tmpdir(), 'oracle-secrets-'));
  dirs.push(dir);
  return dir;
};
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

describe('the oracle secrets', () => {
  it('live under ~/.secrets', () => {
    expect(oracleSecretPaths('/h')).toEqual({
      client: '/h/.secrets/google-oracle-oauth-client.json',
      refreshToken: '/h/.secrets/google-oracle-refresh-token',
    });
    expect(oracleSecretPaths().client).toMatch(/\.secrets\/google-oracle-oauth-client\.json$/);
  });

  it('are written mode 600 in a folder made mode 700, and read back trimmed', () => {
    const { refreshToken } = oracleSecretPaths(home());
    expect(readSecret(refreshToken)).toBeNull();
    writeSecret(refreshToken, '1//token');
    expect(statSync(refreshToken).mode & 0o777).toBe(0o600);
    expect(statSync(join(refreshToken, '..')).mode & 0o777).toBe(0o700);
    expect(readSecret(refreshToken)).toBe('1//token');
  });

  it('tighten a file that was there before', () => {
    const path = join(home(), 'token');
    writeFileSync(path, 'old', { mode: 0o644 });
    writeSecret(path, 'new');
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });
});
