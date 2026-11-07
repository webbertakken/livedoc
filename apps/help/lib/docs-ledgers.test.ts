import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The docs' ledgers and indexes stay unique (AGENTS.md "Organisation process").
//
// Several branches add defaults to the same spec category and entries to the same README.md index
// at once. A merge that keeps both sides leaves two defaults called D22, or one index entry twice;
// nothing compiles prose, so each was found by someone reading. These checks make that a red test
// instead. Lives beside repo-paths-in-docs.test.ts for the same reason: this suite owns
// documentation correctness.

const DOCS = fileURLToPath(new URL('../../../docs', import.meta.url));
const SPECS = join(DOCS, 'specs');

// A default in a spec's Defaults section: `- **D22** ...`. Code cites it by id within its category.
// Invariants and edge cases carry ids too, but per spec, so only the Defaults section is read.
const DEFAULT_ID = /^- \*\*([A-Z]+\d+)\*\* /gm;
const DEFAULTS_SECTION = /^## Defaults\n([\s\S]*?)(?=^## |(?![\s\S]))/m;

function filesNamed(dir: string, name: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...filesNamed(path, name));
    else if (entry === name) out.push(path);
  }
  return out;
}

function duplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const v of values) (seen.has(v) ? dup : seen).add(v);
  return [...dup];
}

function report(name: string, find: (text: string) => string[]): string[] {
  return filesNamed(DOCS, name).flatMap((file) =>
    duplicates(find(readFileSync(file, 'utf8'))).map((d) => `${relative(DOCS, file)}: ${d}`),
  );
}

function categories(): string[] {
  return readdirSync(SPECS).filter((entry) => statSync(join(SPECS, entry)).isDirectory());
}

function defaultIds(category: string): string[] {
  return readdirSync(join(SPECS, category))
    .filter((entry) => entry.endsWith('.md'))
    .flatMap((entry) => {
      const text = readFileSync(join(SPECS, category, entry), 'utf8');
      const section = text.match(DEFAULTS_SECTION)?.[1] ?? '';
      return [...section.matchAll(DEFAULT_ID)].map((m) => m[1]!);
    });
}

describe('docs ledgers and indexes', () => {
  it('give every default in a spec category its own id', () => {
    expect(categories().flatMap((c) => duplicates(defaultIds(c)).map((d) => `${c}: ${d}`))).toEqual(
      [],
    );
  });

  it('read the defaults at all (guard against this test going blind)', () => {
    expect(categories().flatMap(defaultIds).length).toBeGreaterThan(1000);
  });

  it('keep blueprints out of the specs: a blueprint is a per-change brief in plans/', () => {
    const committed = categories().filter((c) =>
      readdirSync(join(SPECS, c)).includes('blueprints'),
    );
    expect(committed).toEqual([]);
  });

  it('list every file once in a README.md index', () => {
    expect(report('README.md', (t) => [...t.matchAll(/^- (\.\/\S+)/gm)].map((m) => m[1]!))).toEqual(
      [],
    );
  });

  it('finds a duplicate it is meant to catch', () => {
    expect(duplicates(['D1', 'D2', 'D1'])).toEqual(['D1']);
  });
});
