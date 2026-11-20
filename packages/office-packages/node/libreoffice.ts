// LibreOffice, headless, for the office specs (docs/specs/020-import-export/office-packages.md "Validation") and the
// sheets oracle (docs/specs/029-sheets/formulas.md "The oracle"): a file LiveDoc wrote is opened and saved again by
// another suite. Node only, never shipped. Each call has its own profile, so callers run in parallel.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const SOFFICE = process.env.SOFFICE ?? 'soffice';
const CONVERT_TIMEOUT_MS = 90_000;

// Calc's "Recalculation on file load" for ODF set to Always (0), so a spreadsheet's values are LibreOffice's own,
// never the cached ones the file carries.
const RECALCULATE_ON_LOAD = `<?xml version="1.0" encoding="UTF-8"?>
<oor:items xmlns:oor="http://openoffice.org/2001/registry" xmlns:xs="http://www.w3.org/2001/XMLSchema">
<item oor:path="/org.openoffice.Office.Calc/Formula/Load"><prop oor:name="ODFRecalcMode" oor:op="fuse"><value>0</value></prop></item>
</oor:items>
`;

/** The file converted by LibreOffice (`odt`, `txt:Text`, `csv`, ...): its bytes. `recalculate` works every formula out afresh. */
export function libreOfficeConvert(
  file: string,
  to: string,
  opts: { recalculate?: boolean } = {},
): Buffer {
  const out = mkdtempSync(join(tmpdir(), 'lo-out-'));
  const profile = mkdtempSync(join(tmpdir(), 'lo-profile-'));
  if (opts.recalculate) {
    mkdirSync(join(profile, 'user'));
    writeFileSync(join(profile, 'user', 'registrymodifications.xcu'), RECALCULATE_ON_LOAD);
  }
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
