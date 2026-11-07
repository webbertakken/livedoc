import { describe, expect, it } from 'vitest';
import { actionLine, totalsLine, type LineContext } from './sync-lines';

// What a pass prints (docs/specs/027-repositories/repository-link.md): final copy, paths
// relative to the working directory.

const lc = (over: Partial<LineContext> = {}): LineContext => ({
  pathOf: (rel) => `docs/diagrams/${rel}`,
  level: 'files',
  relocate: false,
  linkHost: 'https://docs.nu',
  ...over,
});
const doc = { documentId: 'd1', name: 'Home screen' };

describe('actionLine', () => {
  it('words writes, new and behind, with or without a file', () => {
    const tabs = [
      { id: 't1', name: 'Flow', from: 3, to: 4 },
      { id: 't2', name: 'Menu', from: 2, to: 2 },
      { id: 't3', name: 'Added', from: null, to: 1 },
    ];
    expect(
      actionLine({ kind: 'write', ...doc, reason: 'new', path: 'home.livedoc.json', tabs }, lc()),
    ).toBe('+ docs/diagrams/home.livedoc.json  "Home screen" · 3 tabs · rev 4,2,1');
    expect(
      actionLine({ kind: 'write', ...doc, reason: 'new', path: null, tabs: [tabs[0]!] }, lc()),
    ).toBe('+ "Home screen" · 1 tab · rev 4');
    expect(actionLine({ kind: 'write', ...doc, reason: 'new', path: null, tabs: [] }, lc())).toBe(
      '+ "Home screen" · 0 tabs',
    );
    expect(
      actionLine(
        { kind: 'write', ...doc, reason: 'behind', path: 'home.livedoc.json', tabs },
        lc(),
      ),
    ).toBe('~ docs/diagrams/home.livedoc.json  "Home screen" · Flow, Added · rev 3→4, 1');
    expect(
      actionLine(
        {
          kind: 'write',
          ...doc,
          reason: 'behind',
          path: 'home.livedoc.json',
          tabs: [tabs[1]!],
        },
        lc(),
      ),
    ).toBe('~ docs/diagrams/home.livedoc.json  "Home screen"');
  });

  it('words removals, lowered files and relocations', () => {
    expect(
      actionLine({ kind: 'remove', ...doc, path: 'h.livedoc.json', reason: 'trashed' }, lc()),
    ).toBe('- docs/diagrams/h.livedoc.json  "Home screen" · in the Trash');
    expect(actionLine({ kind: 'remove', ...doc, path: null, reason: 'outside' }, lc())).toBe(
      '- "Home screen" · outside the link',
    );
    expect(
      actionLine({ kind: 'lower', ...doc, path: 'h.livedoc.json' }, lc({ level: 'index' })),
    ).toBe('- docs/diagrams/h.livedoc.json  "Home screen" · level index keeps no mirror files');
    const move = {
      kind: 'relocate' as const,
      ...doc,
      path: 'h.livedoc.json',
      to: 'home.livedoc.json',
    };
    expect(actionLine(move, lc())).toBe(
      '» docs/diagrams/h.livedoc.json would move to docs/diagrams/home.livedoc.json: livedoc sync --relocate',
    );
    expect(actionLine(move, lc({ relocate: true }))).toBe(
      '» docs/diagrams/h.livedoc.json → docs/diagrams/home.livedoc.json',
    );
  });

  it('words reports, transient failures, and nothing for a document in step', () => {
    expect(
      actionLine(
        { kind: 'report', reason: 'unreadable', documentId: 'd1', path: 'h.livedoc.json' },
        lc(),
      ),
    ).toBe('? docs/diagrams/h.livedoc.json: no document this account can open; left as it is');
    expect(
      actionLine({ kind: 'report', reason: 'unreadable', documentId: 'd1', path: null }, lc()),
    ).toBe('? d1: no document this account can open; left as it is');
    expect(
      actionLine(
        { kind: 'report', reason: 'local-new', documentId: null, path: 'n.livedoc.json' },
        lc(),
      ),
    ).toBe(
      '? docs/diagrams/n.livedoc.json: a document written by hand; this version of livedoc does not create it',
    );
    expect(
      actionLine(
        {
          kind: 'transient',
          ...doc,
          failure: 'https://docs.nu is rate limiting this token',
          exit: 6,
          reason: '429',
        },
        lc(),
      ),
    ).toBe('! "Home screen": https://docs.nu is rate limiting this token; files kept');
    expect(actionLine({ kind: 'none', ...doc, path: null }, lc())).toBeNull();
  });

  it('words every refusal', () => {
    const refuse = (reason: string, detail: string | null = null) =>
      actionLine(
        { kind: 'refuse', documentId: 'd1', path: 'h.livedoc.json', reason, detail } as never,
        lc(),
      );
    const p = 'docs/diagrams/h.livedoc.json';
    expect(refuse('ahead')).toBe(`! ${p}: changed here; send it: livedoc push ${p}`);
    expect(refuse('diverged')).toBe(
      `! ${p}: changed here and in LiveDoc; send it: livedoc push ${p}`,
    );
    expect(refuse('gone-changed')).toBe(
      `! ${p}: gone from the link, but changed here and not sent; kept. Send it: livedoc push ${p}, or delete it`,
    );
    expect(refuse('lowered-changed', 'none')).toBe(
      `! ${p}: level none keeps no mirror files, but this one changed here and is not sent; kept. Send it: livedoc push ${p}, or delete it`,
    );
    expect(refuse('conflicted')).toBe(
      `! ${p}: holds git conflict markers. Keep one side: git checkout --ours ${p} (or --theirs), then livedoc sync`,
    );
    expect(refuse('invalid', 'not JSON')).toBe(`! ${p}: not JSON`);
    expect(refuse('foreign-host', 'https://self.example')).toBe(
      `! ${p}: synced from https://self.example, not this link's https://docs.nu`,
    );
    expect(refuse('duplicate', 'other.livedoc.json')).toBe(
      `! ${p}: names the same document as docs/diagrams/other.livedoc.json`,
    );
  });
});

describe('totalsLine', () => {
  it('leaves zero counts out, and says when there was nothing to do', () => {
    expect(totalsLine({ inStep: 3, written: 1, removed: 0, refused: 2, unreadable: 1 })).toBe(
      '3 in step · 1 written · 2 refused · 1 unreadable',
    );
    expect(totalsLine({ inStep: 0, written: 0, removed: 4, refused: 0, unreadable: 0 })).toBe(
      '4 removed',
    );
    expect(totalsLine({ inStep: 0, written: 0, removed: 0, refused: 0, unreadable: 0 })).toBe(
      'nothing to do',
    );
  });
});

describe('a held document', () => {
  it('names the broken file and its fix', () => {
    const held = {
      kind: 'held' as const,
      documentId: 'd1',
      name: 'Home screen',
      path: 'h.livedoc.json',
    };
    const p = 'docs/diagrams/h.livedoc.json';
    expect(actionLine({ ...held, broken: 'conflicted', message: null }, lc())).toBe(
      `! "Home screen": not written while ${p} holds git conflict markers. Keep one side: git checkout --ours ${p} (or --theirs), then livedoc sync`,
    );
    expect(actionLine({ ...held, broken: 'invalid', message: 'not JSON' }, lc())).toBe(
      `! "Home screen": not written while ${p} is invalid (not JSON); fix or delete it, then livedoc sync`,
    );
  });
});
