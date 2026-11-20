import { describe, expect, it } from 'vitest';
import {
  catalogueFaults,
  catalogueItems,
  visibleMenus,
  type OfficeCatalogue,
} from './office-catalogue';
import { findTools } from './tool-finder';

const CATALOGUE: OfficeCatalogue = [
  {
    id: 'file',
    label: 'File',
    entries: [
      { kind: 'item', id: 'copy-doc', label: 'Make a copy', level: 'view', status: 'built' },
      { kind: 'separator' },
      { kind: 'item', id: 'rename', label: 'Rename', level: 'edit', status: 'comingSoon' },
      { kind: 'separator' },
      {
        kind: 'submenu',
        id: 'download',
        label: 'Download',
        entries: [
          {
            kind: 'item',
            id: 'download-odt',
            label: 'OpenDocument (.odt)',
            level: 'view',
            status: 'built',
            keywords: ['export', 'save as'],
          },
        ],
      },
    ],
  },
  {
    id: 'format',
    label: 'Format',
    entries: [
      {
        kind: 'submenu',
        id: 'text',
        label: 'Text',
        entries: [
          {
            kind: 'item',
            id: 'bold',
            label: 'Bold',
            level: 'edit',
            status: 'comingSoon',
            shortcut: 'bold',
          },
          {
            kind: 'item',
            id: 'strike',
            label: 'Strikethrough',
            level: 'edit',
            status: 'comingSoon',
          },
        ],
      },
      { kind: 'item', id: 'clear', label: 'Clear formatting', level: 'edit', status: 'comingSoon' },
    ],
  },
];

// docs/specs/004-interface-design/office-shell.md "Menus as data".
describe('visibleMenus', () => {
  it('keeps every item at or below the level', () => {
    expect(visibleMenus(CATALOGUE, 'edit')).toEqual(CATALOGUE);
  });

  it('drops what a level may not see, then empty submenus and menus, then stray separators', () => {
    const shown = visibleMenus(CATALOGUE, 'view');
    expect(shown.map((m) => m.id)).toEqual(['file']);
    expect(shown[0]!.entries.map((e) => (e.kind === 'separator' ? '—' : e.id))).toEqual([
      'copy-doc',
      '—',
      'download',
    ]);
  });

  it('never leads or trails with a separator', () => {
    const shown = visibleMenus(
      [
        {
          id: 'm',
          label: 'M',
          entries: [
            { kind: 'separator' },
            { kind: 'item', id: 'a', label: 'A', level: 'edit', status: 'built' },
            { kind: 'separator' },
            { kind: 'item', id: 'b', label: 'B', level: 'view', status: 'built' },
            { kind: 'separator' },
          ],
        },
      ],
      'view',
    );
    expect(shown[0]!.entries).toEqual([
      { kind: 'item', id: 'b', label: 'B', level: 'view', status: 'built' },
    ]);
  });

  // office-shell.md "Menus as data": the binding is the session's permission; a built item is never shown dimmed.
  it('drops a built item the session leaves unbound, keeping the coming-soon ones', () => {
    const run = () => {};
    const shown = visibleMenus(CATALOGUE, 'edit', { 'download-odt': { run } });
    expect(shown.map((m) => m.id)).toEqual(['file', 'format']);
    expect(shown[0]!.entries.map((e) => (e.kind === 'separator' ? '—' : e.id))).toEqual([
      'rename',
      '—',
      'download',
    ]);
  });
});

describe('catalogueItems', () => {
  it('lists every item with the path of menus it sits in, in order', () => {
    expect(catalogueItems(CATALOGUE).map((f) => [f.item.id, f.path.join(' › ')])).toEqual([
      ['copy-doc', 'File'],
      ['rename', 'File'],
      ['download-odt', 'File › Download'],
      ['bold', 'Format › Text'],
      ['strike', 'Format › Text'],
      ['clear', 'Format'],
    ]);
  });
});

describe('catalogueFaults', () => {
  it('names a built item nothing runs, and a shortcut the registry does not hold', () => {
    expect(catalogueFaults(CATALOGUE, { bound: ['copy-doc'], shortcuts: [] })).toEqual([
      'download-odt: built but nothing runs it',
      'bold: shortcut bold is not in the registry',
    ]);
    expect(
      catalogueFaults(CATALOGUE, { bound: ['copy-doc', 'download-odt'], shortcuts: ['bold'] }),
    ).toEqual([]);
  });

  it('names an id used twice', () => {
    const twice: OfficeCatalogue = [
      {
        id: 'a',
        label: 'A',
        entries: [{ kind: 'item', id: 'x', label: 'X', level: 'view', status: 'comingSoon' }],
      },
      {
        id: 'b',
        label: 'B',
        entries: [{ kind: 'item', id: 'x', label: 'Y', level: 'view', status: 'comingSoon' }],
      },
    ];
    expect(catalogueFaults(twice, { bound: [], shortcuts: [] })).toEqual(['x: used twice']);
  });
});

// docs/specs/004-interface-design/office-shell.md "Tool finder".
describe('findTools', () => {
  const items = catalogueItems(CATALOGUE);

  it('finds nothing for nothing typed', () => {
    expect(findTools(items, '   ', 12)).toEqual([]);
  });

  it('matches every word typed to the start of a word of the label, keywords or path', () => {
    expect(findTools(items, 'str', 12).map((f) => f.item.id)).toEqual(['strike']);
    expect(findTools(items, 'format cle', 12).map((f) => f.item.id)).toEqual(['clear']);
    expect(findTools(items, 'export', 12).map((f) => f.item.id)).toEqual(['download-odt']);
    expect(findTools(items, 'rike', 12)).toEqual([]);
  });

  it('puts labels that start with the query first, then the catalogue order', () => {
    expect(findTools(items, 'te', 12).map((f) => f.item.id)).toEqual(['bold', 'strike']);
    expect(findTools(items, 'c', 12).map((f) => f.item.id)).toEqual(['clear', 'copy-doc']);
  });

  it('lists no more than asked', () => {
    expect(findTools(items, 'format', 1)).toHaveLength(1);
  });

  it('ignores case', () => {
    expect(findTools(items, 'BOLD', 12).map((f) => f.item.id)).toEqual(['bold']);
  });
});
