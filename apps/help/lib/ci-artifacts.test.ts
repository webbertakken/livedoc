import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// docs/specs/016-platform/deployment.md "Build artifacts keep hidden files": a site's `out/` crosses from the build
// job to its deploy job whole, `.well-known/security.txt` included. upload-artifact leaves hidden files out unless
// told otherwise.
const dir = fileURLToPath(new URL('../../../.github/workflows/', import.meta.url));

type Upload = { file: string; path: string; step: string };

// Each upload-artifact step: its lines from `uses:` to the next step, and the path it uploads.
const uploads: Upload[] = readdirSync(dir)
  .filter((file) => /\.ya?ml$/.test(file))
  .flatMap((file) => {
    const lines = readFileSync(`${dir}${file}`, 'utf8').split('\n');
    return lines.flatMap((line, i) => {
      if (!/uses:\s*actions\/upload-artifact@/.test(line)) return [];
      const rest = lines.slice(i + 1);
      const end = rest.findIndex((l) => /^\s*-\s/.test(l) || /^\S/.test(l));
      const step = rest.slice(0, end === -1 ? undefined : end).join('\n');
      const path = /^\s*path:\s*(\S+)\s*$/m.exec(step)?.[1] ?? '';
      return [{ file, path, step }];
    });
  });

const siteBuilds = uploads.filter((u) => /^apps\/[^/]+\/out$/.test(u.path));

describe('build artifacts in CI', () => {
  it('finds each static site’s build upload', () => {
    expect(siteBuilds.map((u) => u.path).sort()).toEqual([
      'apps/help/out',
      'apps/live/out',
      'apps/marketing/out',
      'apps/telemetry/out',
    ]);
  });

  it.each(siteBuilds)('$file keeps the hidden files of $path', ({ step }) => {
    expect(step).toMatch(/^\s*include-hidden-files:\s*true\s*$/m);
  });
});
