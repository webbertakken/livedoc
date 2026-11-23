// The context menu on a PDF's pages (docs/specs/035-pdf-documents/reading-surface.md "The pages": The context menu),
// as the office shell's context entries (office-shell.md "Context menus"): the menus' items by id, so one binding
// serves both, and two items of its own that act on the selected text.
import { contextEntries, type OfficeEntry, type OfficeItem } from '@/lib/office/office-catalogue';
import { COPY, INSERT_COMMENT, PDF_MENUS, SELECT_ALL } from './pdf-menus';

/** Highlight on the selected text: a mark made of the selection. */
export const HIGHLIGHT_SELECTION = 'highlight-selection';
/** Find "…": Find opened with the selected text. */
export const FIND_SELECTION = 'find-selection';

const FIND_LABEL_CHARS = 30;

/** Find's label in the context menu: the selection's first characters, its breaks read as spaces. */
export const findSelectionLabel = (text: string): string => {
  const plain = text.replace(/\s+/gu, ' ').trim();
  const shown = plain.length > FIND_LABEL_CHARS ? `${plain.slice(0, FIND_LABEL_CHARS)}…` : plain;
  return `Find “${shown}”`;
};

const own = (id: string, label: string, level: OfficeItem['level']): OfficeItem => ({
  kind: 'item',
  id,
  label,
  level,
  status: 'built',
  contextual: true,
});

const submenuOf = (id: string): OfficeEntry => {
  const found = PDF_MENUS.flatMap((menu) => menu.entries).find(
    (entry) => entry.kind === 'submenu' && entry.id === id,
  );
  if (!found) throw new Error(`context menu: no submenu ${id}`);
  return found;
};

const SEPARATOR = { kind: 'separator' } as const;

export const PDF_PAGE_CONTEXT_MENU: readonly OfficeEntry[] = contextEntries(PDF_MENUS, [
  COPY,
  SELECT_ALL,
  SEPARATOR,
  { id: INSERT_COMMENT, label: 'Add comment' },
  own(HIGHLIGHT_SELECTION, 'Highlight', 'participate'),
  own(FIND_SELECTION, 'Find', 'view'),
  SEPARATOR,
  submenuOf('go-to'),
  submenuOf('rotate-view'),
]);
