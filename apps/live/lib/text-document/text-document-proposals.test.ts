import { describe, expect, it } from 'vitest';
import { levelAtLeast } from '@livedoc/api-schema';
import { catalogueItems, type OfficeActions } from '@/lib/office/office-catalogue';
import { levelInMode, proposalsInMode } from '@/lib/office/office-mode';
import { officeItemLevels, proposalActions } from '@/lib/office/office-proposals';
import { textDocumentMenus, textDocumentTextContextMenu } from './text-document-menus';
import { SUGGESTING_PROPOSALS, TEXT_DOCUMENT_MODES } from './text-document-modes';
import { TEXT_DOCUMENT_TOOLBAR } from './text-document-toolbar';

// The guard (docs/specs/034-text-documents/review.md "While suggesting", "A Participant"; office-shell.md "Modes"): a
// Participant in Suggesting sees an Editor's menus, toolbar and context menu, and nothing an Editor alone may change
// becomes runnable for them; only what can be suggested runs above their level.

// What only an Editor changes: kept beside the writing, structure, or the document itself.
const EDITOR_ONLY = [
  /^page-setup$/,
  // Insert's Header and Footer open the section's to suggest in; putting one in, a section's setting, is refused in
  // their hook for a Participant (review.md "Headers, footers and notes").
  /^headers-and-footers-options$/,
  /^page-numbers/,
  /^page-count$/,
  /^page-orientation$/,
  /^switch-to-pageless$/,
  /^tab$/,
  /^style-/,
  /^update-style-/,
  /-default-styles$/,
  /^reset-styles$/,
  /^(numbered-list|bulleted-list|checklist|restart-numbering|continue-numbering|more-bullets)$/,
  /^columns-/,
  // Format > Table's dialog, templates and the table of contents' options: kept as an Editor's (review.md "Not yet").
  /^table-(properties|templates|pin-header-rows|of-contents-options)$/,
  // Format > Image's: a picture's size, crop, colours and placing; putting one in can be suggested.
  /^image-(?!upload$|search$|gallery$)/,
  /^drawing-/,
  /^building-block-/,
  /^code-block-/,
  /^watermark$/,
  /^line-numbers$/,
  /^preferences$/,
  /^(rename|move|share-with-others)$/,
  /^convert/,
];

const isEditorOnly = (id: string) => EDITOR_ONLY.some((pattern) => pattern.test(id));

describe('a Participant’s actions in Suggesting', () => {
  for (const format of ['odf', 'ooxml'] as const) {
    it(`run only what can be suggested above their level (${format})`, () => {
      const catalogue = textDocumentMenus(format);
      const context = textDocumentTextContextMenu(catalogue);
      const levels = officeItemLevels(catalogue, TEXT_DOCUMENT_TOOLBAR, context);
      // The worst case: every item and control bound and runnable.
      const every: OfficeActions = Object.fromEntries(
        [...levels.keys()].map((id) => [id, { run: () => undefined }]),
      );

      expect(levelInMode(TEXT_DOCUMENT_MODES, 'participate', 'suggesting')).toBe('edit');
      const out = proposalActions(
        every,
        levels,
        proposalsInMode(TEXT_DOCUMENT_MODES, 'participate', 'suggesting'),
      );

      const runnableAbove = Object.entries(out)
        .filter(
          ([id, action]) =>
            action && !action.disabled && !levelAtLeast('participate', levels.get(id)!),
        )
        .map(([id]) => id);
      expect(runnableAbove.length).toBeGreaterThan(0);
      expect(runnableAbove.filter((id) => !SUGGESTING_PROPOSALS.includes(id))).toEqual([]);
      expect(runnableAbove.filter(isEditorOnly)).toEqual([]);
    });
  }

  it('names no item an Editor alone changes', () => {
    expect(SUGGESTING_PROPOSALS.filter(isEditorOnly)).toEqual([]);
  });

  it('names only built items and controls an Editor’s menus or toolbar draw', () => {
    const catalogue = textDocumentMenus('odf');
    const built = new Set([
      ...catalogueItems(catalogue)
        .filter(({ item }) => item.status === 'built' && item.level === 'edit')
        .map(({ item }) => item.id),
      ...TEXT_DOCUMENT_TOOLBAR.flatMap((group) => group.controls)
        .filter((control) => control.status === 'built' && control.level === 'edit')
        .map((control) => control.id),
    ]);
    expect(SUGGESTING_PROPOSALS.filter((id) => !built.has(id))).toEqual([]);
    expect(new Set(SUGGESTING_PROPOSALS).size).toBe(SUGGESTING_PROPOSALS.length);
  });

  it('leaves an Editor in Suggesting drawn at their own level, unnarrowed', () => {
    expect(levelInMode(TEXT_DOCUMENT_MODES, 'edit', 'suggesting')).toBe('edit');
    expect(proposalsInMode(TEXT_DOCUMENT_MODES, 'edit', 'suggesting')).toBeNull();
  });

  it('never draws a Viewer’s menus above their level', () => {
    expect(levelInMode(TEXT_DOCUMENT_MODES, 'view', 'viewing')).toBe('view');
    expect(proposalsInMode(TEXT_DOCUMENT_MODES, 'view', 'suggesting')).toBeNull();
  });
});
