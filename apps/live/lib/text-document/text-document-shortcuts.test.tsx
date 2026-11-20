// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useRef } from 'react';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { ySyncPlugin } from 'y-prosemirror';
import { TextDocumentState } from '@livedoc/text-documents';
import { OfficeTitleRow } from '@/components/office/OfficeTitleRow';
import { OFFICE_MODES } from '@/lib/office/office-mode';
import { track } from '@/lib/telemetry';
import { SHELL_BOUND_ITEMS, catalogueFaults, catalogueItems } from '@/lib/office/office-catalogue';
import { textDocumentEditorActions } from './text-document-editor-actions';
import { TEXT_DOCUMENT_FORMAT_ITEMS } from './text-document-format-actions';
import { textDocumentMenus } from './text-document-menus';
import { TEXT_DOCUMENT_PANELS } from './text-document-panels';
import { textDocumentSchema } from './text-document-schema';
import { TEXT_DOCUMENT_SHORTCUTS } from './text-document-shortcuts';
import { textDocumentUndoPlugins } from './text-document-undo';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

const DOWNLOADS = { odf: ['download-odt', 'download-fodt'], ooxml: ['download-docx'] } as const;

// docs/specs/004-interface-design/office-shell.md "Menus as data": the text document's catalogue has no faults.
describe('the text document menus', () => {
  it.each(['odf', 'ooxml'] as const)(
    'bind every built item and name only registry shortcuts (%s)',
    (format) => {
      const bound = [
        ...Object.keys(textDocumentEditorActions(null, { canEdit: true })),
        ...DOWNLOADS[format],
        // Format > Text (text-document-format-actions), bound by the surface.
        ...TEXT_DOCUMENT_FORMAT_ITEMS,
        ...SHELL_BOUND_ITEMS,
        // The editing modes (useOfficeMode), bound by the surface.
        ...OFFICE_MODES.filter((m) => m.status === 'built').map((m) => m.item),
        // The panels' items (useOfficePanels), bound by the surface.
        ...TEXT_DOCUMENT_PANELS.map((p) => p.item),
      ];
      expect(
        catalogueFaults(textDocumentMenus(format), {
          bound,
          shortcuts: TEXT_DOCUMENT_SHORTCUTS.map((r) => r.id),
        }),
      ).toEqual([]);
    },
  );

  it('says built for exactly the keyboard-shortcuts rows whose item is built', () => {
    const builtItems = catalogueItems(textDocumentMenus('odf'))
      .map(({ item }) => item)
      .filter((item) => item.status === 'built' && item.shortcut)
      .map((item) => item.shortcut!);
    const shellRows = [
      'tool-finder',
      'context-right-click-menu',
      ...['file', 'edit', 'view', 'insert', 'format', 'tools', 'help'].map((m) => `${m}-menu`),
    ];
    const builtRows = TEXT_DOCUMENT_SHORTCUTS.filter((r) => r.status === 'built').map((r) => r.id);
    expect(builtRows.sort()).toEqual([...new Set([...builtItems, ...shellRows])].sort());
  });
});

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
        actions={textDocumentEditorActions(view, { canEdit: true })}
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
      plugins: [ySyncPlugin(TextDocumentState.body(doc)), ...textDocumentUndoPlugins()],
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
