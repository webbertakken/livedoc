import { describe, expect, it } from 'vitest';
import { folderPathSegments, mirrorPathFor, outlinePathOf } from './mirror-paths';

// Paths (docs/specs/027-repositories/repository-link.md, RL7, CLI27, CLI85).

const folders = new Map(
  [
    { id: 'root-folder', name: 'Minigames', parentId: null },
    { id: 'screens-01', name: 'Screens & Menus', parentId: 'root-folder' },
    { id: 'deep-0001', name: '***', parentId: 'screens-01' },
    { id: 'elsewhere', name: 'Elsewhere', parentId: null },
  ].map((f) => [f.id, f]),
);

describe('folderPathSegments', () => {
  it('slugs the folders below the covered folder down to the document’s', () => {
    expect(folderPathSegments('deep-0001', 'root-folder', folders)).toEqual([
      'screens-menus',
      'deep-000',
    ]);
    expect(folderPathSegments('screens-01', 'root-folder', folders)).toEqual(['screens-menus']);
  });

  it('is empty in the covered folder itself, outside it, or without one', () => {
    expect(folderPathSegments('root-folder', 'root-folder', folders)).toEqual([]);
    expect(folderPathSegments('elsewhere', 'root-folder', folders)).toEqual([]);
    expect(folderPathSegments(null, 'root-folder', folders)).toEqual([]);
    expect(folderPathSegments('screens-01', null, folders)).toEqual([]);
    expect(folderPathSegments('gone', 'root-folder', folders)).toEqual([]);
  });
});

describe('mirrorPathFor', () => {
  const doc = { id: 'abcdef12-3456', name: 'Home screen' };

  it('names the file by its slug under its folder path', () => {
    expect(mirrorPathFor(doc, ['screens'], new Set())).toBe('screens/home-screen.livedoc.json');
    expect(mirrorPathFor(doc, [], new Set())).toBe('home-screen.livedoc.json');
  });

  it('steps aside for a path another document holds: its short id, then its whole id', () => {
    const taken = new Set(['home-screen.livedoc.json']);
    expect(mirrorPathFor(doc, [], taken)).toBe('home-screen-abcdef12.livedoc.json');
    taken.add('home-screen-abcdef12.livedoc.json');
    expect(mirrorPathFor(doc, [], taken)).toBe('home-screen-abcdef12-3456.livedoc.json');
    taken.add('home-screen-abcdef12-3456.livedoc.json');
    expect(mirrorPathFor(doc, [], taken)).toBe('home-screen-abcdef12-3456.livedoc.json');
  });

  it('keeps a whole id that names another folder inside its own', () => {
    const hostile = { id: '../../etc/x', name: 'Home screen' };
    const taken = new Set([
      'screens/home-screen.livedoc.json',
      mirrorPathFor(hostile, ['screens'], new Set(['screens/home-screen.livedoc.json'])),
    ]);
    const path = mirrorPathFor(hostile, ['screens'], taken);
    expect(path.startsWith('screens/')).toBe(true);
    expect(path).not.toContain('..');
    expect(path.split('/')).toHaveLength(2);
  });

  it('keeps an id inside its folder when the name leaves no slug', () => {
    const hostile = { id: '../../etc/x', name: '!!!' };
    for (const taken of [new Set<string>(), new Set(['screens/------et.livedoc.json'])]) {
      const path = mirrorPathFor(hostile, ['screens'], taken);
      expect(path).not.toContain('..');
      expect(path.split('/')).toHaveLength(2);
    }
  });
});

describe('outlinePathOf', () => {
  it('sits beside the mirror file as <slug>.md', () => {
    expect(outlinePathOf('screens/home-screen.livedoc.json')).toBe('screens/home-screen.md');
  });
});
