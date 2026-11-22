// docs/specs/035-pdf-documents/reading-surface.md "Menus", "The toolbar": the spec's tables are the source of a PDF
// document's menus and toolbar. This reads them and holds the catalogue to every item they name, in their order, at
// their level, so a row added to the spec is an item owed, and an item added here is a row owed.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AccessLevel } from '@livedoc/api-schema';
import type { OfficeEntry, OfficeMenu } from '@/lib/office/office-catalogue';
import { PDF_MENUS } from './pdf-menus';
import { PDF_MODES, type PdfMode } from './pdf-modes';
import { pdfToolbar } from './pdf-toolbar';

const SPEC = readFileSync(
  resolve(__dirname, '../../../../docs/specs/035-pdf-documents/reading-surface.md'),
  'utf8',
);

const between = (from: string, to: string): string => {
  const start = SPEC.indexOf(`\n${from}\n`);
  const end = SPEC.indexOf(`\n${to}\n`, start + 1);
  if (start < 0 || end < 0) throw new Error(`reading-surface.md: no section ${from} before ${to}`);
  return SPEC.slice(start, end);
};

/** A table's rows, each cell under its column's name. */
function tableRows(text: string): Record<string, string>[] {
  const cells = (line: string) =>
    line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());
  const [head, , ...rows] = text.split('\n').filter((line) => line.startsWith('|'));
  if (!head) throw new Error('reading-surface.md: a section with no table');
  const names = cells(head);
  return rows.map((row) => Object.fromEntries(cells(row).map((cell, i) => [names[i]!, cell])));
}

// "Menus": a list's names are separated by semicolons, up to the first full stop; round brackets are a note.
const listed = (cell: string): string[] =>
  cell
    .split(/\.(?:\s|$)/)[0]!
    .replace(/\s*\([^)]*\)/g, '')
    .split(';')
    .map((name) => name.trim());

// One entry of a menu: an item, or a submenu with its items' names; the level is the least that sees it.
type Shape = { label: string; level: string; items: string[] | null };

const MENUS = between('## Menus', '## The toolbar')
  .split('\n### ')
  .slice(1)
  .map((part) => ({ name: part.slice(0, part.indexOf('\n')), rows: tableRows(part) }));

// A row names one item, or several by commas; ▸ marks a submenu, whose Does cell lists its items.
const shapesOfRow = (row: Record<string, string>): Shape[] =>
  row.Item!.endsWith(' ▸')
    ? [{ label: row.Item!.slice(0, -2), level: row.Level!, items: listed(row.Does!) }]
    : row.Item!.split(', ').map((label) => ({ label, level: row.Level!, items: null }));

const levelsOf = (entries: readonly OfficeEntry[]): AccessLevel[] =>
  entries.flatMap((entry) =>
    entry.kind === 'item' ? [entry.level] : entry.kind === 'submenu' ? levelsOf(entry.entries) : [],
  );

const namesOf = (entries: readonly OfficeEntry[]): string[] =>
  entries.flatMap((entry) => (entry.kind === 'separator' ? [] : [entry.label]));

// A submenu's level is its items', which share one; where they do not, the levels are listed and match no row.
const shapesOfMenu = (menu: OfficeMenu): Shape[] =>
  menu.entries.flatMap((entry): Shape[] => {
    if (entry.kind === 'separator') return [];
    if (entry.kind === 'item') return [{ label: entry.label, level: entry.level, items: null }];
    const levels = [...new Set(levelsOf(entry.entries))].join(' and ');
    return [{ label: entry.label, level: levels, items: namesOf(entry.entries) }];
  });

describe("a PDF document's menus, held to the spec's tables", () => {
  it('reads every menu of the spec', () => {
    expect(MENUS.map((menu) => menu.name)).toEqual([
      'File',
      'Edit',
      'View',
      'Insert',
      'Format',
      'Pages',
      'Tools',
      'Help',
    ]);
    expect(MENUS.flatMap((menu) => menu.rows).length).toBeGreaterThan(80);
  });

  // "Layout, top to bottom": the menu bar's menus, in order.
  it('declares the spec’s menus in its order', () => {
    expect(PDF_MENUS.map((menu) => menu.label)).toEqual(MENUS.map((menu) => menu.name));
    expect(between('## Layout, top to bottom', '## The title row')).toContain(
      `| ${PDF_MENUS.map((menu) => menu.label).join(', ')} `,
    );
  });

  it.each(MENUS.map((menu) => [menu.name, menu] as const))(
    'holds %s to its table: every item, in order, at its level',
    (name, spec) => {
      const menu = PDF_MENUS.find((candidate) => candidate.label === name)!;
      expect(shapesOfMenu(menu)).toEqual(spec.rows.flatMap(shapesOfRow));
    },
  );

  // "Mode names the first editing mode that lists the item: the mode drawn for the item's level."
  it('names for each row the mode its level is drawn in', () => {
    const modeOf = Object.fromEntries(PDF_MODES.map((mode) => [mode.drawnAt, mode.label]));
    const rows = MENUS.flatMap((menu) => menu.rows).filter((row) => row.Mode !== undefined);
    expect(rows.length).toBeGreaterThan(40);
    for (const row of rows) expect(row.Mode, row.Item).toBe(modeOf[row.Level!]);
  });
});

describe("a PDF document's toolbar, held to the spec's table", () => {
  const ROWS = tableRows(between('## The toolbar', '## Notices'));
  const rowsOf = (mode: string) =>
    ROWS.filter((row) => row['Editing mode'] === mode).map((row) => ({
      group: row.Group!,
      controls: listed(row.Controls!),
    }));
  // The zoom field sits in the toolbar until the page bar is built (the spec's Status): no row of the table.
  const groupsOf = (mode: PdfMode) => pdfToolbar(mode).filter((group) => group.id !== 'zoom');

  it.each(PDF_MODES.map((mode) => [mode.label, mode] as const))(
    'shows every mode’s groups, then %s’s own',
    (label, mode) => {
      const own = rowsOf(`**${label}**`);
      expect(own.length).toBeGreaterThan(0);
      expect(
        groupsOf(mode.mode).map((group) => ({
          group: group.label,
          controls: group.controls.map((control) => control.label),
        })),
      ).toEqual([...rowsOf('Every mode'), ...own]);
    },
  );

  // "A mode's own controls are at the level the mode is drawn for."
  it('draws a mode’s own controls at the mode’s level', () => {
    const shared = rowsOf('Every mode').length;
    for (const mode of PDF_MODES)
      for (const group of groupsOf(mode.mode).slice(shared))
        for (const control of group.controls)
          expect(control.level, `${mode.label}: ${control.label}`).toBe(mode.drawnAt);
  });

  // "Undo and Redo are a person who may review's, so hidden in Viewing; every other control of every mode is a
  // Viewer's too."
  it('hides Undo and Redo from a Viewer, and no other control of every mode', () => {
    const controls = pdfToolbar('viewing')
      .slice(0, rowsOf('Every mode').length + 1)
      .flatMap((group) => group.controls);
    expect(
      controls.filter((control) => control.level !== 'view').map((control) => control.label),
    ).toEqual(['Undo', 'Redo']);
    for (const control of controls.filter((c) => c.level !== 'view'))
      expect(control.level).toBe('participate');
  });

  it('hands the shell the same toolbar for a mode every time', () => {
    for (const mode of PDF_MODES) expect(pdfToolbar(mode.mode)).toBe(pdfToolbar(mode.mode));
  });
});
