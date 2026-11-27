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

// The categories whose defaults several lanes write at once: every `- **D22**` line in any of their files, Defaults
// section or not, so a default written anywhere else still clashes.
const SHARED_LEDGERS = ['029-sheets', '035-pdf-documents'];
const DEFAULT_LINE = /^- \*\*(D\d+)\*\* /gm;

function defaultLines(category: string): string[] {
  return readdirSync(join(SPECS, category))
    .filter((entry) => entry.endsWith('.md'))
    .flatMap((entry) => {
      const text = readFileSync(join(SPECS, category, entry), 'utf8');
      return [...text.matchAll(DEFAULT_LINE)].map((m) => m[1]!);
    });
}

// A category README's blocks of default ids, one lane each: `- **D440-D599**: ...`.
const BLOCK = /^- \*\*D(\d+)-D(\d+)\*\*/gm;
// Ids below it were given before blocks were (029-sheets README "Default ids").
const FIRST_BLOCKED = 440;

function blocksOf(readme: string): [number, number][] {
  return [...readme.matchAll(BLOCK)].map((m) => [Number(m[1]), Number(m[2])]);
}

/** The ids at or past FIRST_BLOCKED in no block, and the blocks that overlap another. */
function blockProblems(
  ids: readonly string[],
  blocks: readonly [number, number][],
): string[] {
  const out: string[] = [];
  for (const id of ids) {
    const n = Number(id.slice(1));
    if (n >= FIRST_BLOCKED && !blocks.some(([a, b]) => n >= a && n <= b))
      out.push(`${id} is in no block`);
  }
  blocks.forEach(([a, b], i) => {
    if (a > b) out.push(`D${a}-D${b} runs backwards`);
    for (const [c, d] of blocks.slice(i + 1))
      if (a <= d && c <= b) out.push(`D${a}-D${b} overlaps D${c}-D${d}`);
  });
  return out;
}

describe('docs ledgers and indexes', () => {
  it('give every default line of the shared ledgers its own id, wherever in the category it is', () => {
    expect(
      SHARED_LEDGERS.flatMap((c) => duplicates(defaultLines(c)).map((d) => `${c}: ${d}`)),
    ).toEqual([]);
  });

  it("keep each new 029-sheets default inside a lane's block, the blocks apart", () => {
    const readme = readFileSync(join(SPECS, '029-sheets', 'README.md'), 'utf8');
    const blocks = blocksOf(readme);
    expect(blocks.length).toBeGreaterThan(1);
    expect(blockProblems(defaultLines('029-sheets'), blocks)).toEqual([]);
  });

  it('finds an id outside every block, and blocks that overlap or run backwards', () => {
    expect(blocksOf('- **D440-D599**: a\n- **D600-D699**: b')).toEqual([
      [440, 599],
      [600, 699],
    ]);
    expect(blockProblems(['D12', 'D450', 'D700'], [[440, 599]])).toEqual(['D700 is in no block']);
    expect(
      blockProblems(
        [],
        [
          [440, 599],
          [500, 650],
          [9, 1],
        ],
      ),
    ).toEqual(['D440-D599 overlaps D500-D650', 'D9-D1 runs backwards']);
  });

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
