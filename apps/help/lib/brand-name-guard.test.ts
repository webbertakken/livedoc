import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The product is LiveDoc (docs/specs/001-project-vision/purpose.md). It began as a fork of livediagram, and that
// name stays only where something means the upstream project
// (docs/specs/002-project-scope/livediagram-upstream.md) or where renaming would orphan stored data. Everywhere
// else a "livediagram" is a leftover a person can see, so this guard fails on any mention it does not know about.
//
// It lives in apps/help beside the other repo-wide documentation guards (repo-paths-in-docs.test.ts): it reads
// every tracked file, docs and root files included, which belong to no workspace.

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));

/** Files that are about livediagram, or carry its notice, as a whole. */
const UPSTREAM_FILES = new Set([
  'THIRD_PARTY_NOTICES.md',
  'docs/specs/002-project-scope/livediagram-upstream.md',
  'apps/help/lib/brand-name-guard.test.ts',
]);

/** Strings allowed anywhere; each is removed before counting what is left. */
const ALLOWED_TOKENS = [
  // Hash domains whose outputs are stored (adder keys, votes, poll proofs, person ids): renaming orphans them.
  'livediagram:adder:v1',
  'livediagram:qa-vote:v1',
  'livediagram:poll-proof:v1',
  'livediagram:vote-network:v1',
  'livediagram-item-person:',
  // The avatar config saved before the figure choice, read once and removed (docs/specs/008-canvas/avatar-mode.md).
  'livediagram:v2:avatar-config',
  // The upstream project: its repository, and the spec about it.
  'livediagram-app/livediagram.app',
  'livediagram-upstream',
];

/**
 * Pages that speak of the upstream project in prose, with how many mentions each holds. A new mention changes
 * the count and fails, so it is looked at rather than waved through.
 */
const UPSTREAM_MENTIONS: Record<string, number> = {
  'AGENTS.md': 3, // the parallel product it grew from, and the upstream spec's link
  'apps/api/src/email/email-brand.test.ts': 1, // asserts no email names livediagram
  'apps/marketing/components/licences/LicencesView.tsx': 1, // "LiveDoc began as a fork of livediagram"
  'apps/marketing/components/licences/LicencesView.test.tsx': 5,
  'docs/operations/docs-nu.md': 3, // nothing reaches livediagram's infrastructure or names
  'docs/specs/001-project-vision/purpose.md': 4, // "It grew out of livediagram"
  'docs/specs/002-project-scope/README.md': 1,
  'docs/specs/002-project-scope/third-party-licences.md': 3, // the licences page's origin credit
  'docs/specs/README.md': 1,
};

/** Every mention left once the allowed tokens are removed, counted per tracked text file. */
function leftoverMentions(): Record<string, number> {
  const out = execFileSync(
    'git',
    ['grep', '--untracked', '-I', '-i', '-l', '-e', 'livediagram', '--', '.'],
    {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  const files = out.split('\n').filter(Boolean);
  const counts: Record<string, number> = {};
  for (const file of files) {
    if (UPSTREAM_FILES.has(file)) continue;
    let text = readFileSync(join(ROOT, file), 'utf8');
    for (const token of ALLOWED_TOKENS) text = text.split(token).join('');
    const count = text.match(/livediagram/gi)?.length ?? 0;
    if (count > 0) counts[file] = count;
  }
  return counts;
}

// The old name split across two elements ("live" in one, "diagram" in the next), as a wordmark is set, which the
// plain search above cannot see. The share card carried it that way after the rename.
function splitWordmarks(): string[] {
  const out = execFileSync(
    'git',
    ['grep', '--untracked', '-I', '-i', '-l', '-e', '>live<', '--', '.'],
    {
      cwd: ROOT,
      encoding: 'utf8',
    },
  );
  return out
    .split('\n')
    .filter(Boolean)
    .filter((file) =>
      /live\s*<\/[a-z]+>\s*<[a-z]+[^>]*>\s*diagram/i.test(readFileSync(join(ROOT, file), 'utf8')),
    );
}

// The product written in lower case in a help article's prose (outside code and quoted names), where only the
// command line is `livedoc`. The rebrand left "the livedoc API" and "a file livedoc did not write" that way.
function lowerCaseProductName(): string[] {
  const out = execFileSync(
    'git',
    ['grep', '--untracked', '-l', '-w', 'livedoc', '--', 'apps/help/app/*.mdx'],
    {
      cwd: ROOT,
      encoding: 'utf8',
    },
  );
  const found: string[] = [];
  for (const file of out.split('\n').filter(Boolean)) {
    const prose = readFileSync(join(ROOT, file), 'utf8')
      .split(/(```[\s\S]*?```|`[^`\n]*`|"livedoc")/g)
      .filter((_, i) => i % 2 === 0)
      .join(' ');
    for (const m of prose.matchAll(/.{0,30}(?<![@\w/.:-])livedoc(?![\w:/.-]|_).{0,30}/g))
      found.push(`${file}: ${m[0]}`);
  }
  return found;
}

describe('the brand name', () => {
  it('says livediagram only where it means the upstream project', () => {
    expect(leftoverMentions()).toEqual(UPSTREAM_MENTIONS);
  });

  it('never sets the old name as a split wordmark', () => {
    expect(splitWordmarks()).toEqual([]);
  });

  it('writes the product as LiveDoc in help prose', () => {
    expect(lowerCaseProductName()).toEqual([]);
  });
});
