import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Sign-in is LiveDoc's own (docs/specs/014-identity/auth-and-guest-access.md): the
// earlier sign-in provider is gone from the code, its identifiers, env vars, comments and copy alike. This guard
// fails on any mention of it, in any case, in a tracked file's path or text under the code roots.
//
// Outside its reach, on purpose: `docs/` (specs may tell the history), CHANGELOG files, generated files (their
// source is checked instead), and the api's migrations from before sign-in moved in (0000 to 0099): an applied
// migration is history, and is never edited.

// Spelled in pieces, so this file does not trip itself.
const PROVIDER = new RegExp(['cl', 'erk'].join(''), 'i');

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const CODE_ROOTS = ['apps', 'packages', '.github', 'scripts'];

// Files whose bytes are not text worth reading.
const BINARY =
  /\.(png|jpe?g|gif|webp|avif|ico|svgz|woff2?|ttf|otf|wasm|onnx|bin|pdf|zip|gz|mp4|webm)$/i;

// This guard's own path, which names what it looks for.
const SELF = 'packages/source-ast/src/clerk-free.test.ts';

function exempt(path: string): boolean {
  if (path === SELF) return true;
  const name = posix.basename(path);
  if (/^changelog/i.test(name)) return true;
  if (/\.generated\./.test(name)) return true;
  return /^apps\/api\/migrations\/00\d\d_/.test(path);
}

function trackedFiles(): string[] {
  const out = execFileSync('git', ['ls-files', '-z', '--', ...CODE_ROOTS], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return out.split('\0').filter((path) => path !== '' && !exempt(path));
}

function mentions(path: string): boolean {
  if (PROVIDER.test(path)) return true;
  if (BINARY.test(path)) return false;
  let text: string;
  try {
    text = readFileSync(join(ROOT, path), 'utf8');
  } catch {
    // Tracked but gone from the working tree (deleted, not yet committed): nothing to read.
    return false;
  }
  return PROVIDER.test(text);
}

describe('the earlier sign-in provider', () => {
  it('is named nowhere in the code, its paths or its workflows', () => {
    expect(trackedFiles().filter(mentions)).toEqual([]);
  });

  it('is looked for where the code lives', () => {
    const files = trackedFiles();
    expect(files.some((path) => path.startsWith('apps/live/'))).toBe(true);
    expect(files.some((path) => path.startsWith('.github/workflows/'))).toBe(true);
    expect(exempt('apps/api/migrations/0047_auth_sightings.sql')).toBe(true);
    expect(exempt('apps/api/migrations/0102_drop_auth_sightings.sql')).toBe(false);
    expect(exempt(SELF)).toBe(true);
  });
});
