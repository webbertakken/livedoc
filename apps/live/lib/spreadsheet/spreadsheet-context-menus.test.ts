// surface.md "Context menus": each place's items, Google's order and words, the menus' own by id.
import { describe, expect, it } from 'vitest';
import type { OfficeEntry } from '@/lib/office/office-catalogue';
import { SPREADSHEET_CONTEXT_MENUS } from './spreadsheet-context-menus';

// An entry as words: an item's label, a submenu's with its items, a separator as a bar.
const words = (entries: readonly OfficeEntry[]): unknown[] =>
  entries.map((e) =>
    e.kind === 'item' ? e.label : e.kind === 'submenu' ? { [e.label]: words(e.entries) } : '|',
  );

const PASTE_SPECIAL = {
  'Paste Special': [
    'Values Only',
    'Format Only',
    'Formula Only',
    'Conditional Formatting Only',
    'Data Validation Only',
    'Transposed',
    'Column Widths Only',
    'All Except Borders',
  ],
};

describe('SPREADSHEET_CONTEXT_MENUS', () => {
  it("draws a cell's menu as Google's, a link's, a picture's and a pivot table's items heading it", () => {
    expect(words(SPREADSHEET_CONTEXT_MENUS.cell)).toEqual([
      'Open Link',
      'Edit Link',
      'Remove Link',
      'Show Details',
      'Alt Text',
      'Place Image over Cells',
      {
        'Create Pivot Date Group': [
          'Second',
          'Minute',
          'Hour',
          'Hour-Minute',
          'Hour-Minute (12 Hour)',
          'Day of the Week',
          'Day of the Year',
          'Day of the Month',
          'Day-Month',
          'Month',
          'Quarter',
          'Year',
          'Year-Quarter',
          'Year-Month',
          'Year-Month-Day',
        ],
      },
      'Create Pivot Group Rule',
      'Create Pivot Group',
      'Ungroup Pivot Items',
      '|',
      'Cut',
      'Copy',
      'Paste',
      PASTE_SPECIAL,
      '|',
      'Insert 1 Row Above',
      'Insert 1 Column Left',
      { 'Insert Cells': ['Shift Right', 'Shift Down'] },
      '|',
      'Delete Row',
      'Delete Column',
      { 'Delete Cells': ['Shift Left', 'Shift Up'] },
      '|',
      'Create a Filter',
      'Filter by Cell Value',
      '|',
      'Show Edit History',
      '|',
      'Conditional Formatting',
      'Data Validation',
      '|',
      'Insert Link',
      'Comment',
      'Insert Note',
      '|',
      'Convert to Table',
      {
        'View More Cell Actions': [
          'Get Link to This Cell',
          'Define Named Range',
          'Protect Range',
          'Randomise Range',
          'Column Stats',
        ],
      },
    ]);
  });

  it("draws a row number's menu as Google's", () => {
    expect(words(SPREADSHEET_CONTEXT_MENUS.row)).toEqual([
      'Cut',
      'Copy',
      'Paste',
      PASTE_SPECIAL,
      '|',
      'Insert 1 Row Above',
      'Insert 1 Row Below',
      'Delete Row',
      'Clear Row',
      'Hide Row',
      'Resize Row',
      '|',
      'Create a Filter',
      '|',
      'Conditional Formatting',
      'Data Validation',
      '|',
      {
        'View More Row Actions': [
          'Group Rows',
          'Ungroup Rows',
          'Freeze Up to Row',
          'Get Link to This Range',
          'Define Named Range',
          'Protect Range',
        ],
      },
    ]);
  });

  it("draws a column letter's menu as Google's", () => {
    expect(words(SPREADSHEET_CONTEXT_MENUS.column)).toEqual([
      'Cut',
      'Copy',
      'Paste',
      PASTE_SPECIAL,
      '|',
      'Insert 1 Column Left',
      'Insert 1 Column Right',
      'Delete Column',
      'Clear Column',
      'Hide Column',
      'Resize Column',
      '|',
      'Create a Filter',
      '|',
      'Sort Sheet A to Z',
      'Sort Sheet Z to A',
      '|',
      'Conditional Formatting',
      'Data Validation',
      'Column Stats',
      '|',
      'Convert to Table',
      {
        'View More Column Actions': [
          'Group Columns',
          'Ungroup Columns',
          'Freeze Up to Column',
          'Randomise Range',
          'Define Named Range',
          'Protect Range',
        ],
      },
    ]);
  });

  it('keeps the menus\u2019 status and level, and holds no menu check', () => {
    const items = SPREADSHEET_CONTEXT_MENUS.cell.filter((e) => e.kind === 'item');
    expect(items.find((e) => e.id === 'cut')).toMatchObject({
      status: 'built',
      level: 'participate',
    });
    expect(items.find((e) => e.id === 'insert-link')).toMatchObject({ status: 'built' });
    expect(items.find((e) => e.id === 'remove-link')).toMatchObject({
      contextual: true,
      level: 'edit',
    });
    expect(items.find((e) => e.id === 'open-link')).toMatchObject({
      contextual: true,
      level: 'view',
    });
    expect(items.find((e) => e.id === 'show-pivot-details')).toMatchObject({
      label: 'Show Details',
      contextual: true,
      level: 'view',
    });
    expect(items.find((e) => e.id === 'create-a-filter')).not.toHaveProperty('checkable');
  });
});
