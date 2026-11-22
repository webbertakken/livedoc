// A PDF document's menus (docs/specs/035-pdf-documents/reading-surface.md "Menus"), as the office shell's catalogue
// (office-shell.md "Menus as data"). Each item names the least share level that sees it; an item whose phase has not
// landed is `comingSoon`, drawn dimmed. The rows join as their phases are built.
import type { AccessLevel } from '@livedoc/api-schema';
import type {
  OfficeCatalogue,
  OfficeEntry,
  OfficeItem,
  OfficeMenu,
} from '@/lib/office/office-catalogue';

type ItemOptions = Partial<Pick<OfficeItem, 'shortcut' | 'keywords' | 'checkable' | 'status'>>;

const item = (
  id: string,
  label: string,
  level: AccessLevel,
  options: ItemOptions = {},
): OfficeItem => ({ kind: 'item', id, label, level, status: 'comingSoon', ...options });

const submenu = (id: string, label: string, entries: OfficeEntry[]): OfficeEntry => ({
  kind: 'submenu',
  id,
  label,
  entries,
});

const SEPARATOR: OfficeEntry = { kind: 'separator' };

const menu = (id: string, label: string, entries: OfficeEntry[]): OfficeMenu => ({
  id,
  label,
  entries,
});

const BUILT = { status: 'built' } as const;

/** File > Download > PDF: the bake, every live change in the file (files-print-and-sync.md "Downloading"). */
export const DOWNLOAD_PDF = 'download-pdf';
export const UNDO = 'undo';
export const REDO = 'redo';
export const TOOL_SELECT = 'tool-select';
export const TOOL_HIGHLIGHT = 'tool-highlight';

export const PDF_MENUS: OfficeCatalogue = [
  menu('file', 'File', [
    item('make-a-copy', 'Make a copy', 'view'),
    SEPARATOR,
    submenu('share', 'Share', [item('share-with-others', 'Share with others', 'edit', BUILT)]),
    submenu('download', 'Download', [
      item(DOWNLOAD_PDF, 'PDF', 'view', { status: 'built', keywords: ['save', 'export'] }),
      item('download-pdf-flattened', 'PDF, flattened', 'view'),
      item('download-pdf-without-comments', 'PDF without comments', 'view'),
      item('download-pictures', 'Pages as pictures', 'view'),
      item('download-text', 'Text', 'view'),
      item('download-field-data', 'Field data', 'view'),
    ]),
    item('replace-file', 'Replace file', 'edit'),
    SEPARATOR,
    item('rename', 'Rename', 'edit', BUILT),
    item('move', 'Move', 'edit', { keywords: ['folder'], status: 'built' }),
    item('move-to-trash', 'Move to trash', 'edit', { keywords: ['delete'] }),
    SEPARATOR,
    item('properties', 'Properties', 'view'),
    item('print', 'Print', 'view'),
  ]),
  menu('edit', 'Edit', [
    item(UNDO, 'Undo', 'participate', { shortcut: 'undo', status: 'built' }),
    item(REDO, 'Redo', 'participate', { shortcut: 'redo', status: 'built' }),
    SEPARATOR,
    item('find', 'Find', 'view'),
  ]),
  menu('view', 'View', [
    submenu('mode', 'Mode', [
      item('mode-reviewing', 'Reviewing', 'view', {
        shortcut: 'switch-to-reviewing',
        checkable: 'radio',
        status: 'built',
      }),
      item('mode-editing', 'Editing', 'view', {
        shortcut: 'switch-to-editing',
        checkable: 'radio',
      }),
      item('mode-viewing', 'Viewing', 'view', {
        shortcut: 'switch-to-viewing',
        checkable: 'radio',
        status: 'built',
      }),
    ]),
  ]),
  // The tools' keys are single letters the surface hears itself, never in a text field: they name no registry row.
  menu('tools', 'Tools', [
    item(TOOL_SELECT, 'Select', 'view', {
      checkable: 'radio',
      status: 'built',
    }),
    item(TOOL_HIGHLIGHT, 'Highlight', 'participate', {
      checkable: 'radio',
      status: 'built',
      keywords: ['mark', 'marker'],
    }),
  ]),
  menu('help', 'Help', [
    item('search-the-menus', 'Search the menus', 'view', {
      shortcut: 'tool-finder',
      status: 'built',
    }),
    item('keyboard-shortcuts', 'Keyboard shortcuts', 'view', {
      shortcut: 'show-common-keyboard-shortcuts',
      status: 'built',
    }),
  ]),
];
