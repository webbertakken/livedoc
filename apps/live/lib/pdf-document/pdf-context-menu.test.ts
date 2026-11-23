// docs/specs/035-pdf-documents/reading-surface.md "The pages": the context menu on a page: Copy, Select all, Add
// comment, Highlight, Find "…", Go to ▸ and Rotate view ▸; Highlight and Find drawn only while they can run.
import { describe, expect, it } from 'vitest';
import { contextualEntries, visibleMenus } from '@/lib/office/office-catalogue';
import {
  FIND_SELECTION,
  HIGHLIGHT_SELECTION,
  PDF_PAGE_CONTEXT_MENU,
  findSelectionLabel,
} from './pdf-context-menu';
import { COPY, GO_TO_NEXT_VIEW, ROTATE_VIEW_CLOCKWISE, SELECT_ALL } from './pdf-menus';

const labels = (entries: readonly { kind: string; label?: string }[]) =>
  entries.map((entry) => (entry.kind === 'separator' ? '—' : entry.label));

describe('a page’s context menu', () => {
  it('holds the spec’s items in its order', () => {
    expect(labels(PDF_PAGE_CONTEXT_MENU)).toEqual([
      'Copy',
      'Select all',
      '—',
      'Add comment',
      'Highlight',
      'Find',
      '—',
      'Go to',
      'Rotate view',
    ]);
    const submenus = PDF_PAGE_CONTEXT_MENU.filter((entry) => entry.kind === 'submenu');
    expect(
      submenus.flatMap((entry) => entry.entries.map((item) => 'id' in item && item.id)),
    ).toEqual(expect.arrayContaining([GO_TO_NEXT_VIEW, ROTATE_VIEW_CLOCKWISE]));
  });

  it('draws Highlight and Find only while they can run', () => {
    const run = { run: () => {} };
    const bound = { [COPY]: run, [SELECT_ALL]: run };
    const without = contextualEntries(PDF_PAGE_CONTEXT_MENU, bound).map((entry) =>
      'id' in entry ? entry.id : entry.kind,
    );
    expect(without).not.toContain(HIGHLIGHT_SELECTION);
    expect(without).not.toContain(FIND_SELECTION);
    const all = { ...bound, [HIGHLIGHT_SELECTION]: run, [FIND_SELECTION]: run };
    const withThem = contextualEntries(PDF_PAGE_CONTEXT_MENU, all).map((entry) =>
      'id' in entry ? entry.id : entry.kind,
    );
    expect(withThem).toEqual(expect.arrayContaining([HIGHLIGHT_SELECTION, FIND_SELECTION]));
  });

  it('offers a Viewer no Highlight', () => {
    const run = { run: () => {} };
    const seen = visibleMenus(
      [{ id: 'context', label: 'Context menu', entries: [...PDF_PAGE_CONTEXT_MENU] }],
      'view',
      { [HIGHLIGHT_SELECTION]: run, [FIND_SELECTION]: run },
    )[0]!.entries.map((entry) => ('id' in entry ? entry.id : entry.kind));
    expect(seen).not.toContain(HIGHLIGHT_SELECTION);
    expect(seen).toContain(FIND_SELECTION);
  });

  it('names Find by the selection, its first 30 characters', () => {
    expect(findSelectionLabel('quick fox')).toBe('Find “quick fox”');
    expect(findSelectionLabel('  a\nb  ')).toBe('Find “a b”');
    expect(findSelectionLabel('x'.repeat(40))).toBe(`Find “${'x'.repeat(30)}…”`);
  });
});
