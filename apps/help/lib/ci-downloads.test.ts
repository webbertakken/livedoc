import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// docs/specs/016-platform/deployment.md "Downloads in CI": a fetch from an outside host fails loudly and retries.
const dir = fileURLToPath(new URL('../../../.github/workflows/', import.meta.url));
const curlLines = readdirSync(dir)
  .filter((file) => /\.ya?ml$/.test(file))
  .flatMap((file) =>
    readFileSync(`${dir}${file}`, 'utf8')
      .split('\n')
      .filter((line) => /(^|\s)curl\s/.test(line) && !line.trim().startsWith('#'))
      .map((line) => ({ file, line: line.trim() })),
  );

describe('downloads in CI', () => {
  it('finds the workflows’ downloads', () => {
    expect(curlLines.length).toBeGreaterThan(0);
  });

  it.each(curlLines)('$file fails on an HTTP error and retries: $line', ({ line }) => {
    expect(line).toMatch(/\s-[a-zA-Z]*f[a-zA-Z]*\s|--fail\b/);
    expect(line).toMatch(/--retry \d+/);
    expect(line).toContain('--retry-all-errors');
    expect(line).not.toMatch(/\|\s*tar\b/);
  });
});
