import { describe, expect, it } from 'vitest';
import { catalogueItems } from '@/lib/office/office-catalogue';
import { visibleToolbar } from '@/lib/office/office-toolbar';
import { spreadsheetMenus } from './spreadsheet-menus';
import { SPREADSHEET_SHORTCUTS } from './spreadsheet-shortcuts';
import { SPREADSHEET_TOOLBAR } from './spreadsheet-toolbar';

const controls = SPREADSHEET_TOOLBAR.flatMap((g) => g.controls);
const NO_FIELDS = { zoom: false, fontSize: false, font: false, colour: false, choice: false };

// docs/specs/029-sheets/surface.md "Toolbar".
describe('SPREADSHEET_TOOLBAR', () => {
  it('lays Google’s groups out in Google’s order', () => {
    expect(SPREADSHEET_TOOLBAR.map((g) => g.label)).toEqual([
      'History',
      'View',
      'Number',
      'Font',
      'Text',
      'Cell',
      'Alignment',
      'Insert',
      'View',
    ]);
    expect(controls.map((c) => c.label)).toEqual([
      'Search the Menus',
      'Undo',
      'Redo',
      'Print',
      'Paint Format',
      'Zoom',
      'Format as Currency',
      'Format as Percent',
      'Decrease Decimal Places',
      'Increase Decimal Places',
      'More Formats',
      'Font',
      'Decrease Font Size',
      'Font Size',
      'Increase Font Size',
      'Bold',
      'Italic',
      'Strikethrough',
      'Text Colour',
      'Fill Colour',
      'Borders',
      'Merge Cells',
      'Horizontal Align',
      'Vertical Align',
      'Text Wrapping',
      'Text Rotation',
      'Insert Link',
      'Insert Comment',
      'Insert Chart',
      'Create a Filter',
      'Functions',
      'Hide the Menus',
    ]);
  });

  it('shares its menu item’s id and level where it runs one, and names only registry shortcuts', () => {
    const items = new Map(
      catalogueItems(spreadsheetMenus('ods')).map(({ item }) => [item.id, item]),
    );
    for (const id of [
      'undo',
      'redo',
      'number-currency',
      'number-percent',
      'bold',
      'italic',
      'create-a-filter',
    ])
      expect(controls.find((c) => c.id === id)!.level).toBe(items.get(id)!.level);
    const registry = SPREADSHEET_SHORTCUTS.map((r) => r.id);
    for (const c of controls) if (c.shortcut) expect(registry).toContain(c.shortcut);
  });

  it('shows a Viewer Search the Menus and the dimmed Print, Zoom and Hide the Menus', () => {
    const seen = visibleToolbar(
      SPREADSHEET_TOOLBAR,
      'view',
      { 'search-the-menus': { run: () => {} } },
      NO_FIELDS,
    )
      .flatMap((g) => g.controls)
      .map((c) => c.label);
    expect(seen).toEqual(['Search the Menus', 'Print', 'Zoom', 'Hide the Menus']);
  });

  it('shows a Participant also Undo, Redo, and the dimmed Insert Comment and Functions', () => {
    const run = () => {};
    const seen = visibleToolbar(
      SPREADSHEET_TOOLBAR,
      'participate',
      { 'search-the-menus': { run }, undo: { run }, redo: { run } },
      NO_FIELDS,
    )
      .flatMap((g) => g.controls)
      .map((c) => c.label);
    expect(seen).toEqual([
      'Search the Menus',
      'Undo',
      'Redo',
      'Print',
      'Zoom',
      'Insert Comment',
      'Functions',
      'Hide the Menus',
    ]);
  });
});
