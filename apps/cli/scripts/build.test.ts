import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// The package npm publishes, as build.mjs writes it (docs/specs/015-api/cli.md,
// "Supply chain", CLI2, CLI31, CLI54): built afresh into a temporary directory, never a stale dist.

// The most the unpacked package may weigh (CLI54): the wasm and fonts take about 3 MB, the bundle the rest.
const CLI_PACKAGE_MAX_BYTES = 8 * 1024 * 1024;
const BUILD_TIMEOUT_MS = 60_000;

const build = join(dirname(fileURLToPath(import.meta.url)), 'build.mjs');
let out = '';

beforeAll(async () => {
  out = await mkdtemp(join(tmpdir(), 'livedoc-cli-build-'));
  await promisify(execFile)(process.execPath, [build, '--out', out]);
}, BUILD_TIMEOUT_MS);

afterAll(() => rm(out, { recursive: true, force: true }));

const manifest = async () =>
  JSON.parse(await readFile(join(out, 'package.json'), 'utf8')) as {
    bin: Record<string, string>;
    files: string[];
    engines: { node: string };
  };

describe('the built CLI package', () => {
  it('is one executable ESM file for Node 22 and later', async () => {
    const pkg = await manifest();
    const bundle = await readFile(join(out, pkg.bin.livedoc), 'utf8');
    expect(pkg.bin).toEqual({ livedoc: 'livedoc.mjs' });
    expect(bundle.startsWith('#!/usr/bin/env node\n')).toBe(true);
    expect(bundle).toMatch(/^import /m);
    expect((await stat(join(out, 'livedoc.mjs'))).mode & 0o111).toBe(0o111);
    expect(pkg.engines.node).toBe('>=22');
  });

  it('ships exactly its allowlist: the bundle, the wasm, the fonts, the licences and the README', async () => {
    const pkg = await manifest();
    expect([...pkg.files, 'package.json'].sort()).toEqual((await readdir(out)).sort());
    expect(pkg.files).toEqual(
      expect.arrayContaining([
        'resvg.wasm',
        'Inter-Regular.ttf',
        'Inter-Bold.otf',
        'Inter-OFL.txt',
      ]),
    );
  });

  it(`weighs at most CLI_PACKAGE_MAX_BYTES (${CLI_PACKAGE_MAX_BYTES}) unpacked`, async () => {
    const names = await readdir(out);
    const sizes = await Promise.all(names.map(async (name) => (await stat(join(out, name))).size));
    expect(names).toContain('livedoc.mjs');
    const unpacked = sizes.reduce((sum, size) => sum + size, 0);
    expect(unpacked).toBeLessThanOrEqual(CLI_PACKAGE_MAX_BYTES);
  });
});
