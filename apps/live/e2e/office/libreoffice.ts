// LibreOffice, headless, for the office specs (docs/specs/020-import-export/office-packages.md "Validation"): a file
// LiveDoc wrote is opened and saved again by another suite. Each call has its own profile, so specs run in parallel.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const SOFFICE = process.env.SOFFICE ?? 'soffice';
const CONVERT_TIMEOUT_MS = 90_000;

/** The file converted by LibreOffice (`odt`, `txt:Text`, ...): its bytes. */
export function libreOfficeConvert(file: string, to: string): Buffer {
  const out = mkdtempSync(join(tmpdir(), 'lo-out-'));
  const profile = mkdtempSync(join(tmpdir(), 'lo-profile-'));
  execFileSync(
    SOFFICE,
    [
      `-env:UserInstallation=${pathToFileURL(profile).href}`,
      '--headless',
      '--convert-to',
      to,
      '--outdir',
      out,
      file,
    ],
    { timeout: CONVERT_TIMEOUT_MS, stdio: 'pipe' },
  );
  const [written] = readdirSync(out);
  if (!written) throw new Error(`LibreOffice wrote nothing converting to ${to}`);
  return readFileSync(join(out, written));
}
