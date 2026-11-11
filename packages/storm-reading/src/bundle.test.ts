import { describe, expect, it } from 'vitest';
import { renderBrief } from './brief/convert';
import { DOMAIN_EXPORT_LANGUAGES, detectDomainLanguage, isDomainLanguage } from './brief/languages';
import {
  buildExportBundle,
  bundleFolderName,
  parseManifest,
  parsePreviousReading,
  EXPORT_MANIFEST_SCHEMA,
} from './bundle';
import { diffReadings, formatChanges, hasChanges } from './changes';
import { readBoard } from './reading';
import { board } from './testing';

const before = readBoard(
  board(
    { id: 'c', kind: 'command', col: 0, words: 'Place Order' },
    { id: 'e', kind: 'domain-event', col: 1, words: 'Order Placed' },
    { id: 'gone', kind: 'hotspot', col: 4, words: 'Refunds?' },
    { id: 'p', kind: 'policy', col: 6, words: 'Notify' },
  ),
);
const after = readBoard(
  board(
    { id: 'c', kind: 'command', col: 0, words: 'Submit Order' },
    { id: 'e', kind: 'domain-event', col: 1, words: 'Order Placed' },
    { id: 'p', kind: 'read-model', col: 6, words: 'Notify' },
    { id: 'new', kind: 'actor', col: 0, lane: 1, words: 'Guest' },
  ),
);

describe('diffReadings', () => {
  it('follows notes by id: added, removed, reworded, re-kinded, related and no longer related', () => {
    const changes = diffReadings(before, after);
    expect(changes.added.map((n) => n.id)).toEqual(['new']);
    expect(changes.removed.map((n) => n.id)).toEqual(['gone']);
    expect(changes.reworded).toEqual([
      { note: expect.objectContaining({ id: 'c' }), was: 'Place Order' },
    ]);
    expect(changes.rekinded).toEqual([
      { note: expect.objectContaining({ id: 'p' }), was: 'policy' },
    ]);
    expect(changes.related).toEqual([{ relation: 'issues', from: 'new', to: 'c' }]);
    expect(changes.unrelated).toEqual([
      { relation: 'triggers', from: 'p', to: 'e' },
      { relation: 'flags', from: 'gone', to: 'p' },
    ]);
    expect(hasChanges(changes)).toBe(true);
  });

  it('notices a relation broken', () => {
    expect(diffReadings(after, before).unrelated).toEqual([
      { relation: 'issues', from: 'new', to: 'c' },
    ]);
  });

  it('prints CHANGES.md by id, with the words now and before', () => {
    const text = formatChanges(diffReadings(before, after), before, after);
    expect(text).toContain('- actor new "Guest"');
    expect(text).toContain('## Removed\n\n- hotspot gone "Refunds?"');
    expect(text).toContain('- command c "Submit Order", was "Place Order"');
    expect(text).toContain('- read-model p "Notify", was a policy');
    expect(text).toContain('- actor new "Guest" issues command c "Submit Order"');
    expect(text).toContain(
      '## No longer related\n\n- read-model p "Notify" is triggered by domain-event e "Order Placed"',
    );
  });

  it('says so when nothing changed', () => {
    const same = diffReadings(after, after);
    expect(hasChanges(same)).toBe(false);
    expect(formatChanges(same, after, after)).toContain('Nothing changed on the board.');
  });
});

describe('buildExportBundle', () => {
  const input = {
    reading: after,
    language: 'typescript' as const,
    because: 'tsconfig.json at its root',
    board: { documentId: 'd', tabId: 't', name: 'Board', rev: 7 },
    livedoc: '0.6.0',
    exportedAt: '2026-01-01T00:00:00.000Z',
  };

  it('writes the reading, the text, the brief and the manifest, and no CHANGES.md on a first export', () => {
    const bundle = buildExportBundle({ ...input, previous: null });
    expect(Object.keys(bundle.files)).toEqual([
      'storm.json',
      'storm.md',
      'CONVERT.md',
      'export.json',
    ]);
    expect(parsePreviousReading(bundle.files['storm.json']!)).toEqual(after);
    expect(bundle.files['storm.md']).toContain('board "Board"');
    expect(bundle.files['CONVERT.md']).toContain('domain types** in TypeScript');
    expect(parseManifest(bundle.files['export.json']!)).toEqual(bundle.manifest);
    expect(bundle.manifest).toMatchObject({
      schema: EXPORT_MANIFEST_SCHEMA,
      language: 'typescript',
      brief: 1,
    });
    expect(bundle.changes).toBeNull();
  });

  it('adds CHANGES.md against an earlier reading', () => {
    const bundle = buildExportBundle({ ...input, previous: before });
    expect(Object.keys(bundle.files)).toContain('CHANGES.md');
    expect(bundle.changes?.added).toHaveLength(1);
  });
});

describe('parsing earlier exports', () => {
  it('refuses what is not a reading or a manifest', () => {
    expect(parsePreviousReading('nope')).toBeNull();
    expect(parsePreviousReading('{"schema":"other"}')).toBeNull();
    expect(parseManifest('nope')).toBeNull();
    expect(parseManifest('{"schema":"other"}')).toBeNull();
  });
});

describe('bundleFolderName', () => {
  it('slugs the board name, and falls back to the tab id', () => {
    expect(bundleFolderName('Kéuken & Orders!', 't1')).toBe('keuken-orders');
    expect(bundleFolderName('★★', 't1')).toBe('t1');
  });
});

describe('detectDomainLanguage', () => {
  it('names the one language a repository root says', () => {
    expect(detectDomainLanguage(['README.md', 'go.mod'])).toEqual({
      language: 'go',
      because: 'go.mod at its root',
    });
    expect(detectDomainLanguage(['App.csproj'])).toMatchObject({ language: 'csharp' });
    expect(detectDomainLanguage(['package.json', 'tsconfig.json'])).toMatchObject({
      language: 'typescript',
    });
  });

  it('takes Kotlin over Java when Gradle says Kotlin', () => {
    expect(detectDomainLanguage(['build.gradle.kts', 'pom.xml'])).toMatchObject({
      language: 'kotlin',
    });
  });

  it('gives the candidates when there are none or several', () => {
    expect(detectDomainLanguage(['README.md'])).toEqual({ language: null, candidates: [] });
    expect(detectDomainLanguage(['package.json', 'Cargo.toml'])).toEqual({
      language: null,
      candidates: ['typescript', 'rust'],
    });
  });

  it('knows its languages', () => {
    expect(isDomainLanguage('rust')).toBe(true);
    expect(isDomainLanguage('cobol')).toBe(false);
  });
});

describe('renderBrief', () => {
  it.each(DOMAIN_EXPORT_LANGUAGES)(
    'fills in %s and its idioms, leaving no placeholder',
    (language) => {
      const brief = renderBrief(language);
      expect(brief).not.toMatch(/\{\{/);
      expect(brief).toContain('## Iterating');
      expect(brief.split('\n').filter((l) => l.startsWith('### '))).toHaveLength(1);
    },
  );
});

describe('renderBrief without a language', () => {
  it('asks the agent to identify it, and carries every language section', () => {
    const brief = renderBrief(null);
    expect(brief).toContain('domain types** in the language the repository is written in');
    expect(brief.split('\n').filter((l) => l.startsWith('### '))).toHaveLength(
      DOMAIN_EXPORT_LANGUAGES.length,
    );
    expect(brief).not.toMatch(/\{\{/);
  });
});
