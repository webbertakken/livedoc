// @vitest-environment jsdom
import { textDocumentBreakActions } from './text-document-breaks';
import { horizontalLineActions } from './text-document-horizontal-line';
import { TAB_ITEM, TAB_STEP_KEYS } from './text-document-tabs';
import { equationActions } from './text-document-equation-insert';
import { BUILDING_BLOCKS } from './text-document-building-blocks';
import { CODE_BLOCK_ITEMS } from './text-document-code-blocks';
import { characterDialogActions } from './text-document-special-characters';
import { textDocumentTableActions } from './text-document-tables';
import { TABLE_EDIT_ITEMS } from './text-document-table-actions';
import { TABLE_NAVIGATION } from './text-document-table-navigation';
import { PICTURE_TURN_KEYS } from './text-document-picture-rotate';
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useRef } from 'react';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { ySyncPlugin } from 'y-prosemirror';
import { TextDocument, TextDocumentState } from '@livedoc/text-documents';
import { OfficeTitleRow } from '@/components/office/OfficeTitleRow';
import { TEXT_DOCUMENT_MODES } from './text-document-modes';
import { track } from '@/lib/telemetry';
import { SHELL_BOUND_ITEMS, catalogueFaults, catalogueItems } from '@/lib/office/office-catalogue';
import { textDocumentEditorActions } from './text-document-editor-actions';
import { clipboardActions } from './text-document-clipboard';
import { STRETCH_KEY_ROW } from './text-document-stretches';
import { PREFERENCES_ITEM } from '@/components/text-document/useTextDocumentPreferences';
import {
  PAGE_ORIENTATION_ITEM,
  PAGE_SETUP_ITEM,
  PAGELESS_ITEM,
} from '@/components/text-document/useTextDocumentPageSetup';
import { COLUMN_ITEMS, COLUMNS_MORE_ITEM } from '@/components/text-document/useTextDocumentColumns';
import { FOOTER_ITEM, HEADER_ITEM } from '@/components/text-document/useTextDocumentHeaderEditing';
import { HEADER_OPTIONS_ITEM } from '@/components/text-document/useTextDocumentHeaderOptions';
import { SECURITY_LIMITATIONS_ITEM } from '@/components/text-document/useTextDocumentReport';
import {
  DOWNLOAD_PDF_ITEM,
  KEEP_PDF_COPY_ITEM,
} from '@/components/text-document/useTextDocumentPdf';
import { PRINT_ITEM, PRINT_PREVIEW_ITEM } from '@/components/text-document/useTextDocumentPrint';
import {
  PAGE_COUNT_ITEM,
  PAGE_NUMBERS_MORE_ITEM,
  PAGE_NUMBERS_OPTIONS_ITEM,
} from '@/components/text-document/useTextDocumentPageNumbers';
import { PAGE_NUMBER_PRESETS } from './text-document-page-numbers';
import {
  TEXT_DOCUMENT_FORMAT_ITEMS,
  TEXT_DOCUMENT_KEY_ACTIONS,
  textDocumentFormatActions,
} from './text-document-format-actions';
import { paintFormatPlugin } from './text-document-paint-format';
import {
  CONTINUE_NUMBERING,
  LIST_ITEMS,
  MORE_BULLETS,
  RESTART_NUMBERING,
  TOGGLE_CHECKBOX,
} from './text-document-list-actions';
import {
  PARAGRAPH_STYLE_ITEMS,
  STYLE_OPTIONS,
  textDocumentParagraphStyleActions,
} from './text-document-paragraph-styles';
import { textDocumentMenus } from './text-document-menus';
import {
  ALIGNMENTS,
  BORDERS_ITEM,
  INDENT_ITEMS,
  LINE_SPACING_ENTRIES,
} from './text-document-paragraph-actions';
import { COMMENTS_PANEL, TEXT_DOCUMENT_PANELS } from './text-document-panels';
import { textDocumentSchema } from './text-document-schema';
import { TEXT_DOCUMENT_SHORTCUTS } from './text-document-shortcuts';
import {
  EQUATION_TOOLBAR_TOGGLE,
  NON_PRINTING_TOGGLE,
  PRINT_LAYOUT_TOGGLE,
  RULER_TOGGLE,
} from './useTextDocumentViewToggle';
import { TEXT_WIDTH_ITEMS } from './useTextDocumentTextWidth';
import { FOOTNOTE_ITEM } from './text-document-footnotes-edit';
import { FOOTNOTE_KEY_ACTIONS } from '@/components/text-document/useTextDocumentNoteEditing';
import { COMMENT_KEY_ACTIONS } from '@/components/text-document/useTextDocumentThreadKeys';
import { SUGGESTION_KEY_ACTIONS } from '@/components/text-document/useTextDocumentSuggestionCards';
import { REVIEW_SUGGESTED_EDITS } from '@/components/text-document/useTextDocumentReviewPanel';
import { COMPARE_DOCUMENTS } from '@/components/text-document/useTextDocumentCompare';
import { WORD_COUNT_ITEM } from '@/components/text-document/useTextDocumentWordCount';
import { DETAILS_ITEM } from '@/components/text-document/useTextDocumentDetails';
import { TEXT_DOCUMENT_NEW_ACTIONS } from './text-document-new-actions';
import { VERBALISE_ITEMS } from '@/components/text-document/useTextDocumentScreenReader';
import {
  ACCESSIBILITY_ITEM,
  ACCESSIBILITY_SETTINGS_ITEM,
  SCREEN_READER_KEY,
} from '@/lib/text-document/text-document-screen-reader';
import {
  MISSPELLING_KEY_ACTIONS,
  PERSONAL_DICTIONARY_ITEM,
  SPELLING_ADD_ITEM,
  SPELLING_CHECK_ITEM,
  SPELLING_IGNORE_ITEM,
  SPELLING_SHOW_ITEM,
  SPELLING_SUGGESTION_ITEMS,
} from '@/components/text-document/useTextDocumentSpelling';
import { NOTIFICATION_SETTINGS_ITEM } from '@/components/text-document/useTextDocumentNotifications';
import {
  SEE_VERSION_HISTORY,
  VERSION_CHANGE_KEY_ROWS,
} from '@/components/text-document/useTextDocumentVersionHistory';
import { NAME_CURRENT_VERSION } from '@/components/text-document/useTextDocumentVersionWrites';
import { textDocumentUndoPlugins } from './text-document-undo';
import { LINK_ITEM, OPEN_LINK } from './text-document-links';
import { BOOKMARK_ITEM } from './text-document-bookmarks';
import { COMMENT_ITEM } from '@/components/text-document/useTextDocumentThreads';
import { CONTENTS_LOOK_ITEMS } from './text-document-contents-build';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

// jsdom lays nothing out: a selection scrolled into view (a style applied) has no rectangles.
Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect = () => new DOMRect();

// File > Download in every format and File > Convert (useTextDocumentConversion), bound by the title row.
const FILES = {
  odf: [
    'download-docx',
    'download-odt',
    'download-fodt',
    'download-rtf',
    'download-txt',
    'download-html',
    'download-epub',
    'download-md',
    'convert-to-word',
  ],
  ooxml: [
    'download-docx',
    'download-odt',
    'download-fodt',
    'download-rtf',
    'download-txt',
    'download-html',
    'download-epub',
    'download-md',
    'convert-to-opendocument',
  ],
} as const;

// docs/specs/004-interface-design/office-shell.md "Menus as data": the text document's catalogue has no faults.
describe('the text document menus', () => {
  it.each(['odf', 'ooxml'] as const)(
    'bind every built item and name only registry shortcuts (%s)',
    (format) => {
      const bound = [
        ...Object.keys(textDocumentEditorActions(null, { canEdit: true })),
        // Edit > Cut, Copy, Paste (text-document-clipboard), bound by the surface.
        ...Object.keys(clipboardActions(null, { canEdit: true, onRefused: () => {} })),
        // Insert > Break (text-document-breaks), bound by the surface.
        ...Object.keys(
          textDocumentBreakActions(null, { canEdit: true, liveDoc: { current: null }, format }),
        ),
        // Insert > Tab (useTextDocumentTabs), bound by the surface.
        TAB_ITEM,
        // Insert > Horizontal line (text-document-horizontal-line), bound by the surface.
        ...Object.keys(horizontalLineActions(null, true)),
        // Insert > Symbols > Equation (text-document-equation-insert), bound by the surface.
        ...Object.keys(equationActions(null, true)),
        // Insert > Symbols > Special characters and Insert > Emoji (text-document-special-characters), bound by the surface.
        ...Object.keys(characterDialogActions(null, true, () => {})),
        // Insert > Table (text-document-tables), bound by the surface.
        ...Object.keys(textDocumentTableActions(null, { canEdit: true, sectionWidth: 468 })),
        ...TABLE_EDIT_ITEMS.map((t) => t.item),
        // Insert > Building blocks (useTextDocumentBuildingBlocks), bound by the surface.
        ...BUILDING_BLOCKS.map((block) => block.item),
        ...CODE_BLOCK_ITEMS.map((block) => block.item),
        // Insert > Image (useTextDocumentPictures), bound by the surface.
        'image-upload',
        'image-search',
        'image-gallery',
        // Insert > Drawing > New (useTextDocumentDrawings), bound by the surface.
        'drawing-new',
        // Format > Image (useTextDocumentPictureEditing), bound by the surface.
        'image-alt-text',
        'image-replace-upload',
        'image-replace-search',
        'image-replace-gallery',
        // Format > Image > Reset image and Crop image (useTextDocumentPictureSize), bound by the surface.
        'image-reset',
        'image-crop',
        // Tools > Preferences (useTextDocumentPreferences), bound by the surface.
        PREFERENCES_ITEM,
        // File > Page setup, Format > Page orientation and Switch to pageless (useTextDocumentPageSetup), by the surface.
        PAGE_SETUP_ITEM,
        PAGE_ORIENTATION_ITEM,
        PAGELESS_ITEM,
        // Format > Columns (useTextDocumentColumns), by the surface.
        ...Object.keys(COLUMN_ITEMS),
        COLUMNS_MORE_ITEM,
        // Insert > Headers & footers (useTextDocumentHeaderEditing), bound by the surface.
        HEADER_ITEM,
        FOOTER_ITEM,
        // Format > Headers & footers (useTextDocumentHeaderOptions), bound by the surface.
        HEADER_OPTIONS_ITEM,
        // Insert > Page numbers and Format > Page numbers (useTextDocumentPageNumbers), bound by the surface.
        ...PAGE_NUMBER_PRESETS.map((p) => p.item),
        PAGE_COUNT_ITEM,
        PAGE_NUMBERS_MORE_ITEM,
        PAGE_NUMBERS_OPTIONS_ITEM,
        ...FILES[format],
        // Format > Text (text-document-format-actions), bound by the surface.
        ...TEXT_DOCUMENT_FORMAT_ITEMS,
        // Format > Paragraph styles and its Options (text-document-paragraph-styles), bound by the surface.
        ...PARAGRAPH_STYLE_ITEMS.flatMap((s) => [s.item, s.update]),
        ...STYLE_OPTIONS.entries.flatMap((e) => (e.kind === 'item' ? [e.id] : [])),
        // Format > Align & indent (text-document-paragraph-actions), bound by the surface.
        ...ALIGNMENTS.map((a) => a.item),
        ...INDENT_ITEMS,
        // Format > Line & paragraph spacing (text-document-paragraph-actions), bound by the surface.
        ...LINE_SPACING_ENTRIES.flatMap((e) => (e.kind === 'item' ? [e.id] : [])),
        BORDERS_ITEM,
        // Format > Bullets & numbering (text-document-list-actions), bound by the surface.
        ...LIST_ITEMS.map((l) => l.item),
        RESTART_NUMBERING,
        CONTINUE_NUMBERING,
        MORE_BULLETS,
        ...SHELL_BOUND_ITEMS,
        // The editing modes (useOfficeMode), bound by the surface.
        ...TEXT_DOCUMENT_MODES.filter((m) => m.status === 'built').map((m) => m.item),
        // The panels' items (useOfficePanels), bound by the surface.
        ...TEXT_DOCUMENT_PANELS.flatMap((p) => [p.item, ...(p.alsoItems ?? [])]),
        // View > Show ruler and Show non-printing characters (useTextDocumentViewToggle), bound by the surface.
        RULER_TOGGLE.item,
        NON_PRINTING_TOGGLE.item,
        PRINT_LAYOUT_TOGGLE.item,
        EQUATION_TOOLBAR_TOGGLE.item,
        // View > Text width (useTextDocumentTextWidth), bound by the surface.
        ...Object.values(TEXT_WIDTH_ITEMS),
        // Insert > Footnote (useTextDocumentNoteEditing), bound by the surface.
        FOOTNOTE_ITEM,
        // Insert > Link (useTextDocumentLinks), bound by the surface.
        LINK_ITEM,
        // Insert > Bookmark (useTextDocumentBookmarks), bound by the surface.
        BOOKMARK_ITEM,
        // Insert > Comment (useTextDocumentThreads), bound by the surface for whoever comments.
        COMMENT_ITEM,
        // Insert > Table of contents (useTextDocumentContents), bound by the surface.
        ...Object.keys(CONTENTS_LOOK_ITEMS),
        // Tools > Review suggested edits (useTextDocumentReviewPanel), bound by the surface.
        REVIEW_SUGGESTED_EDITS,
        // Tools > Compare documents (useTextDocumentCompare), bound by the surface.
        COMPARE_DOCUMENTS,
        // Tools > Word count (useTextDocumentWordCount), bound by the surface.
        WORD_COUNT_ITEM,
        // Tools > Spelling and grammar and the context menu on a misspelt word (useTextDocumentSpelling).
        SPELLING_CHECK_ITEM,
        SPELLING_SHOW_ITEM,
        PERSONAL_DICTIONARY_ITEM,
        SPELLING_ADD_ITEM,
        SPELLING_IGNORE_ITEM,
        ...SPELLING_SUGGESTION_ITEMS,
        // Tools > Notification settings (useTextDocumentNotifications), bound by the surface where it applies.
        NOTIFICATION_SETTINGS_ITEM,
        // File > Version history > See version history (useTextDocumentVersionHistory), bound by the surface.
        SEE_VERSION_HISTORY,
        // File > Version history > Name current version (useTextDocumentVersionWrites), bound by the surface.
        NAME_CURRENT_VERSION,
        // File > Details (useTextDocumentDetails), bound by the surface.
        DETAILS_ITEM,
        // File > New > Document and From template gallery (text-document-new-actions), bound by the surface.
        ...Object.keys(TEXT_DOCUMENT_NEW_ACTIONS),
        // File > Security limitations (useTextDocumentReport), bound by the surface.
        SECURITY_LIMITATIONS_ITEM,
        // File > Download > PDF document (useTextDocumentPdf), bound by the surface.
        DOWNLOAD_PDF_ITEM,
        KEEP_PDF_COPY_ITEM,
        // File > Print and Print preview (useTextDocumentPrint), bound by the surface.
        PRINT_ITEM,
        PRINT_PREVIEW_ITEM,
        // Tools > Accessibility and the Accessibility menu (useTextDocumentScreenReader), bound by the surface.
        ACCESSIBILITY_ITEM,
        ACCESSIBILITY_SETTINGS_ITEM,
        ...Object.values(VERBALISE_ITEMS),
      ];
      expect(
        // With screen reader support on, so the Accessibility menu is among the menus.
        catalogueFaults(textDocumentMenus(format, { screenReader: true }), {
          bound,
          shortcuts: TEXT_DOCUMENT_SHORTCUTS.map((r) => r.id),
        }),
      ).toEqual([]);
    },
  );

  it('says built for exactly the keyboard-shortcuts rows whose item is built', () => {
    const builtItems = catalogueItems(textDocumentMenus('odf', { screenReader: true }))
      .map(({ item }) => item)
      .filter((item) => item.status === 'built' && item.shortcut)
      .map((item) => item.shortcut!)
      // Keys left to the browser (Copy, Paste) are its rows, built though their items are.
      .filter((id) => TEXT_DOCUMENT_SHORTCUTS.find((r) => r.id === id)?.status !== 'browser');
    const shellRows = [
      'tool-finder',
      'context-right-click-menu',
      ...['file', 'edit', 'view', 'insert', 'format', 'tools', 'help', 'accessibility'].map(
        (m) => `${m}-menu`,
      ),
    ];
    const builtRows = TEXT_DOCUMENT_SHORTCUTS.filter((r) => r.status === 'built').map((r) => r.id);
    // Rows no item names, bound by their own id (office-shell.md "Shortcut layer").
    // The keys of several stretches, answered by the writing's own plugin (text-and-paragraphs.md "Selection").
    // Moving between footnotes (useTextDocumentNoteEditing).
    const keyRows = [
      ...TEXT_DOCUMENT_KEY_ACTIONS,
      TOGGLE_CHECKBOX,
      STRETCH_KEY_ROW,
      ...FOOTNOTE_KEY_ACTIONS,
      // Moving through tables (text-document-table-navigation).
      ...Object.keys(TABLE_NAVIGATION),
      // Turning a selected picture (useTextDocumentPictureSize).
      ...Object.keys(PICTURE_TURN_KEYS),
      // Open link at the caret (useTextDocumentLinks).
      OPEN_LINK,
      // Stepping between document tabs (the surface's keymap, text-document-tabs).
      ...Object.keys(TAB_STEP_KEYS),
      // Between comment threads (useTextDocumentThreadKeys), and the comments panel (useOfficePanels).
      ...COMMENT_KEY_ACTIONS,
      COMMENTS_PANEL.item,
      // Between suggestions (useTextDocumentSuggestionCards).
      ...SUGGESTION_KEY_ACTIONS,
      // Between a version's changes, inside the version history (useTextDocumentVersionHistory).
      ...Object.values(VERSION_CHANGE_KEY_ROWS),
      // The next and previous misspelling (useTextDocumentSpelling).
      ...Object.values(MISSPELLING_KEY_ACTIONS),
      // Screen reader support, and the two announce rows no item names (useTextDocumentScreenReader).
      SCREEN_READER_KEY,
      VERBALISE_ITEMS.announceCursorLocation,
      VERBALISE_ITEMS.announceFormatting,
    ];
    expect(builtRows.sort()).toEqual(
      [...new Set([...builtItems, ...shellRows, ...keyRows])].sort(),
    );
  });
});

const blank = TextDocument.blank({ format: 'odf' });
const readBlank = () => ({ styles: blank.styles, defaults: blank.defaults });

// The format bindings these tests press; Ctrl+B stays unbound for the test that leaves it alone.
const pickFormatting = (view: EditorView | null) => {
  const { actions } = textDocumentFormatActions(view, readBlank, { canEdit: true });
  const ids = ['copy-text-formatting', 'paste-text-formatting', 'clear-formatting'];
  return Object.fromEntries(ids.flatMap((id) => (actions[id] ? [[id, actions[id]]] : [])));
};

function Harness({ view }: { view: EditorView | null }) {
  const root = useRef<HTMLDivElement | null>(null);
  return (
    <div ref={root} data-testid="surface">
      <OfficeTitleRow
        name="Notes"
        format=".ODT"
        formatTitle="OpenDocument format"
        problem={null}
        catalogue={textDocumentMenus('odf')}
        level="edit"
        actions={{
          ...textDocumentEditorActions(view, { canEdit: true }),
          ...clipboardActions(view, { canEdit: true, onRefused: () => {} }),
          ...textDocumentParagraphStyleActions({
            view,
            readFormatting: readBlank,
            styles: { add: () => {}, set: () => {} },
            defaultStyles: { read: () => ({}), save: () => {} },
            format: 'odf',
            canEdit: true,
          }).actions,
          // Copy, paste and clear formatting, but not bold: the test below leaves Ctrl+B unbound.
          ...pickFormatting(view),
        }}
        shortcuts={TEXT_DOCUMENT_SHORTCUTS}
        keyScope={root}
        opening={{ accept: '.odt', onFile: () => {} }}
        telemetryKind="TextDocument"
      />
      <div data-testid="editor" />
    </div>
  );
}

async function surfaceWithEditor() {
  const { rerender } = render(<Harness view={null} />);
  const doc = TextDocumentState.load();
  const view = new EditorView(screen.getByTestId('editor'), {
    state: EditorState.create({
      schema: textDocumentSchema,
      plugins: [
        ySyncPlugin(TextDocumentState.body(doc)),
        ...textDocumentUndoPlugins(),
        paintFormatPlugin(),
      ],
    }),
  });
  rerender(<Harness view={view} />);
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
  return view;
}

// docs/specs/034-text-documents/keyboard-shortcuts.md "Common actions", "Text selection with the keyboard".
describe('the text document shortcuts', () => {
  it('undoes and redoes with Ctrl+Z and Ctrl+Shift+Z', async () => {
    const view = await surfaceWithEditor();
    view.dispatch(view.state.tr.insertText('Hello', 1));
    expect(view.state.doc.textContent).toBe('Hello');
    fireEvent.keyDown(view.dom, { code: 'KeyZ', key: 'z', ctrlKey: true });
    expect(view.state.doc.textContent).toBe('');
    fireEvent.keyDown(view.dom, { code: 'KeyZ', key: 'Z', ctrlKey: true, shiftKey: true });
    expect(view.state.doc.textContent).toBe('Hello');
    view.destroy();
  });

  // office-shell.md "Shortcut layer": keys left to the browser are never bound, so its clipboard events reach the
  // writing (text-and-paragraphs.md "Clipboard").
  it('leaves Ctrl+C, Ctrl+X, Ctrl+V and Ctrl+Shift+V to the browser', async () => {
    const view = await surfaceWithEditor();
    view.dispatch(view.state.tr.insertText('Hello', 1));
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 6)));
    const execCommand = vi.fn(() => true);
    Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true });
    for (const [code, key, shiftKey] of [
      ['KeyC', 'c', false],
      ['KeyX', 'x', false],
      ['KeyV', 'v', false],
      ['KeyV', 'V', true],
    ] as const)
      expect(fireEvent.keyDown(view.dom, { code, key, ctrlKey: true, shiftKey })).toBe(true);
    expect(execCommand).not.toHaveBeenCalled();
    view.destroy();
  });

  // text-and-paragraphs.md "Paragraph styles": Ctrl+Alt+0 and Ctrl+Alt+1 to 6.
  it('applies a heading by its number with Ctrl+Alt+1 to 6, and Normal text with Ctrl+Alt+0', async () => {
    const view = await surfaceWithEditor();
    view.dispatch(view.state.tr.insertText('Title', 1));
    const styleNow = () => (view.state.doc.firstChild!.attrs as { style: unknown }).style;
    fireEvent.keyDown(view.dom, { code: 'Digit3', key: '3', ctrlKey: true, altKey: true });
    expect(styleNow()).toBe(blank.styles.find((s) => s.role === 'heading3')!.id);
    fireEvent.keyDown(view.dom, { code: 'Digit0', key: '0', ctrlKey: true, altKey: true });
    expect(styleNow()).toBeNull();
    view.destroy();
  });

  // text-and-paragraphs.md "Paint format", "Clear formatting"; office-shell.md "Shortcut layer" (rows no item names).
  it('copies formatting with Ctrl+Alt+C, pastes it with Ctrl+Alt+V, and clears it with Ctrl+\\ and Ctrl+Space', async () => {
    const view = await surfaceWithEditor();
    const italic = textDocumentSchema.marks.italic!.create({ value: true });
    view.dispatch(view.state.tr.insertText('one two', 1).addMark(1, 4, italic));
    const italicAt = (pos: number) =>
      italic.type.isInSet(view.state.doc.resolve(pos).marks()) !== undefined;
    const select = (from: number, to: number) =>
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)));
    select(1, 2);
    fireEvent.keyDown(view.dom, { code: 'KeyC', key: 'c', ctrlKey: true, altKey: true });
    select(5, 8);
    fireEvent.keyDown(view.dom, { code: 'KeyV', key: 'v', ctrlKey: true, altKey: true });
    expect(italicAt(6)).toBe(true);
    fireEvent.keyDown(view.dom, { code: 'Backslash', key: '\\', ctrlKey: true });
    expect(italicAt(6)).toBe(false);
    select(1, 4);
    fireEvent.keyDown(view.dom, { code: 'Space', key: ' ', ctrlKey: true });
    expect(italicAt(2)).toBe(false);
    view.destroy();
  });

  it('selects the whole body with Ctrl+A', async () => {
    const view = await surfaceWithEditor();
    view.dispatch(view.state.tr.insertText('One two', 1));
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 2)));
    fireEvent.keyDown(view.dom, { code: 'KeyA', key: 'a', ctrlKey: true });
    expect(view.state.selection.from).toBe(0);
    expect(view.state.selection.to).toBe(view.state.doc.content.size);
    view.destroy();
  });

  it('opens the file picker with Ctrl+O', async () => {
    const view = await surfaceWithEditor();
    const picker = screen.getByLabelText<HTMLInputElement>('Open a file');
    const clicked = vi.spyOn(picker, 'click');
    fireEvent.keyDown(view.dom, { code: 'KeyO', key: 'o', ctrlKey: true });
    expect(clicked).toHaveBeenCalled();
    view.destroy();
  });

  // docs/specs/004-interface-design/office-shell.md "Keyboard shortcuts dialog".
  it('opens the Keyboard shortcuts dialog with Ctrl+/', async () => {
    const view = await surfaceWithEditor();
    fireEvent.keyDown(view.dom, { code: 'Slash', key: '/', ctrlKey: true });
    const dialog = screen.getByRole('dialog', { name: 'Keyboard shortcuts' });
    expect(within(dialog).getByRole('region', { name: 'Common actions' })).toBeDefined();
    expect(track).toHaveBeenCalledWith('UI', 'Opened', 'TextDocumentShortcuts');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    view.destroy();
  });

  it('opens the Keyboard shortcuts dialog from Help', async () => {
    const view = await surfaceWithEditor();
    fireEvent.click(within(screen.getByRole('menubar')).getByRole('menuitem', { name: 'Help' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /^Keyboard shortcuts/ }));
    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeDefined();
    view.destroy();
  });

  // docs/specs/034-text-documents/editing-surface.md "Context menus": Delete removes the selection.
  it('deletes the selection, and is dimmed while nothing is selected', async () => {
    const view = await surfaceWithEditor();
    view.dispatch(view.state.tr.insertText('One two', 1));
    const actions = textDocumentEditorActions(view, { canEdit: true });
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 4)));
    expect(actions.delete!.disabled).toBe(true);
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 4, 8)));
    expect(actions.delete!.disabled).toBe(false);
    actions.delete!.run();
    expect(view.state.doc.textContent).toBe('One');
    view.destroy();
  });

  it('leaves a key whose item is not built to the browser and the editor', async () => {
    const view = await surfaceWithEditor();
    const bold = new KeyboardEvent('keydown', {
      code: 'KeyB',
      key: 'b',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    view.dom.dispatchEvent(bold);
    expect(bold.defaultPrevented).toBe(false);
    view.destroy();
  });

  it('runs nothing above the level: a Viewer has no undo', () => {
    const actions = textDocumentEditorActions(null, { canEdit: false });
    expect(actions.undo).toBeUndefined();
    expect(actions['select-all']).toBeDefined();
  });
});
