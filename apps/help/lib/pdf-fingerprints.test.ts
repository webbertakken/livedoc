import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// docs/specs/035-pdf-documents: every decision point and failure of a PDF document is logged under `[pdf]` with a
// fingerprint a spec names, so a log line is found from the spec and a spec's line from the log. This guard holds
// the two to each other: what the storage spec names is logged, and what the code logs is named by a spec. It reads
// specs and every source, so it lives beside the other repo-wide guards.

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const SPECS = 'docs/specs/035-pdf-documents/';

/** The spec whose every fingerprint is built, or listed below. A phase adds its spec here as it lands. */
const BUILT_SPECS = ['live-editing-and-storage.md'];

/** Fingerprints a built spec names for what is not built yet: none may be logged until its phase takes it off here. */
const NOT_BUILT: Record<string, string> = {
  'server-made': 'the engine in the api Worker',
  'server-declined': 'the engine in the api Worker',
};

/** A fingerprint's name: its words before the first value (`bytes=<n>`), as `saved in this browser`. */
function nameOf(fingerprint: string): string {
  const words: string[] = [];
  for (const word of fingerprint.trim().split(/\s+/)) {
    if (!/^[a-z][a-z-]*$/.test(word)) break;
    words.push(word);
  }
  return words.join(' ');
}

/** Every fingerprint a spec names: each `[pdf] …` it writes as code. */
function namedBy(spec: string): Set<string> {
  const text = readFileSync(`${ROOT}${SPECS}${spec}`, 'utf8');
  return new Set(
    [...text.matchAll(/`\[pdf\] ([^`]+)`/g)].map((found) => nameOf(found[1]!)).filter(Boolean),
  );
}

/** Source that ships: no test, no spec of a browser run, no guard, no prose. */
const SOURCES = [
  'apps',
  'packages',
  ':!*.test.*',
  ':!*.spec.*',
  ':!*.md',
  ':!*.mdx',
  ':!apps/help/lib/',
];

function grep(args: string[]): string[] {
  try {
    return execFileSync('git', ['grep', '--untracked', '-I', ...args, '--', ...SOURCES], {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    })
      .split('\n')
      .filter((line) => line !== '');
  } catch (error) {
    // git grep exits 1 when nothing matches.
    if ((error as { status?: number }).status !== 1) throw error;
    return [];
  }
}

/**
 * The pattern of a source logging the fingerprint: after the kind's tag as written (`[pdf] `), after a tag a shared
 * module was handed (`${kind.tag} `), or as the start of a line a module hands the room to log.
 */
const logging = (name: string): string => `(\\[pdf\\] |[tT]ag\\} |[\`'"])${name}([ \`'"$]|$)`;

/** Which of the fingerprints a source logs: one read of the sources for them all. */
function loggedAmong(names: readonly string[]): Set<string> {
  const lines = grep(['-h', '-E', ...names.flatMap((name) => ['-e', logging(name)])]);
  return new Set(
    names.filter((name) => lines.some((line) => new RegExp(logging(name)).test(line))),
  );
}

/** Every fingerprint the code writes after `[pdf] `. */
function loggedNames(): Set<string> {
  return new Set(
    grep(['-h', '-o', '-E', '-e', '\\[pdf\\] [a-z][a-z =-]*'])
      .map((found) => nameOf(found.slice('[pdf] '.length)))
      .filter(Boolean),
  );
}

describe('a PDF’s fingerprints', () => {
  const built = new Set(BUILT_SPECS.flatMap((spec) => [...namedBy(spec)]));
  // One read of the sources for every fingerprint: each read walks the whole working tree.
  const logged = loggedAmong([...built]);

  it('are read from the specs', () => {
    expect(built.size).toBeGreaterThan(40);
    expect(built).toContain('saved in this browser');
    expect(built).toContain('parting-copy written');
  });

  it('are each logged by the code, once their spec is built', () => {
    const due = [...built].filter((name) => !(name in NOT_BUILT));
    expect(due.filter((name) => !logged.has(name)).sort()).toEqual([]);
  });

  it('are not logged before the phase that builds them', () => {
    for (const name of Object.keys(NOT_BUILT)) expect(built.has(name), name).toBe(true);
    expect(Object.keys(NOT_BUILT).filter((name) => logged.has(name))).toEqual([]);
  });

  it('are each named by a spec, whatever the code logs', () => {
    const named = new Set(
      readdirSync(`${ROOT}${SPECS}`)
        .filter((file) => file.endsWith('.md'))
        .flatMap((spec) => [...namedBy(spec)]),
    );
    const written = loggedNames();
    expect(written.size).toBeGreaterThan(30);
    expect([...written].filter((name) => !named.has(name)).sort()).toEqual([]);
  });
});
