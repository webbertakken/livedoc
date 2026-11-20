import { describe, expect, it } from 'vitest';
import { catalogueItems } from '@/lib/office/office-catalogue';
import { textDocumentMenus } from './text-document-menus';
import { TEXT_DOCUMENT_SHORTCUTS } from './text-document-shortcuts';
import { TEXT_DOCUMENT_TOOLBAR } from './text-document-toolbar';

// docs/specs/034-text-documents/editing-surface.md "The toolbar".
describe('TEXT_DOCUMENT_TOOLBAR', () => {
  const controls = TEXT_DOCUMENT_TOOLBAR.flatMap((g) => g.controls);

  it("holds Google's groups in Google's order", () => {
    expect(TEXT_DOCUMENT_TOOLBAR.map((g) => g.label)).toEqual([
      'Find',
      'History',
      'Zoom',
      'Styles',
      'Font',
      'Text',
      'Insert',
      'Paragraph',
      'Clear',
      'View',
    ]);
  });

  it('names each control once, by a shortcut the registry holds', () => {
    const ids = controls.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    const registry = new Set(TEXT_DOCUMENT_SHORTCUTS.map((r) => r.id));
    for (const c of controls) if (c.shortcut) expect(registry.has(c.shortcut), c.id).toBe(true);
  });

  it('runs a menu item under the same shortcut as the item', () => {
    const items = new Map(
      catalogueItems(textDocumentMenus('odf')).map(({ item }) => [item.id, item]),
    );
    for (const c of controls) {
      const item = items.get(c.id);
      if (item?.shortcut) expect(c.shortcut, c.id).toBe(item.shortcut);
    }
  });

  it('shows a Viewer the zoom and View alone, and a Participant Add comment too', () => {
    const at = (level: 'view' | 'participate') =>
      controls
        .filter((c) => c.level === 'view' || (level === 'participate' && c.level === 'participate'))
        .map((c) => c.id);
    expect(at('view')).toEqual(['zoom', 'hide-the-menus']);
    expect(at('participate')).toEqual(['zoom', 'comment', 'hide-the-menus']);
  });
});
