// @vitest-environment jsdom
// docs/specs/034-text-documents/page-layout.md "Columns", "Share roles", "Telemetry": Format > Columns for an Editor
// only, the caret's section's count checked, dimmed while pageless; a change sets the columns and counts it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { ySyncPlugin } from 'y-prosemirror';
import type * as Y from 'yjs';
import { PageSetup, TextDocumentState, type PageSetup as Setup } from '@livedoc/text-documents';
import { track } from '@/lib/telemetry';
import { textDocumentSchema } from '@/lib/text-document/text-document-schema';
import { textDocumentUndoPlugins } from '@/lib/text-document/text-document-undo';
import { COLUMNS_MORE_ITEM, useTextDocumentColumns } from './useTextDocumentColumns';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

let doc: Y.Doc;
let view: EditorView;
let liveDoc: { current: Y.Doc | null };

beforeEach(async () => {
  doc = TextDocumentState.load();
  liveDoc = { current: doc };
  view = new EditorView(document.body.appendChild(document.createElement('div')), {
    state: EditorState.create({
      schema: textDocumentSchema,
      plugins: [ySyncPlugin(TextDocumentState.body(doc)), ...textDocumentUndoPlugins()],
    }),
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
});
afterEach(() => {
  view.destroy();
  vi.mocked(track).mockClear();
});

function Harness({
  writes,
  pageless = false,
  caretSetup = PageSetup.of('letter'),
}: {
  writes: boolean;
  pageless?: boolean;
  caretSetup?: Setup;
}) {
  const columns = useTextDocumentColumns({
    view,
    liveDoc,
    format: 'odf',
    writes,
    pageless,
    caretSetup,
  });
  return (
    <div>
      {Object.entries(columns.actions).map(([id, action]) => (
        <button
          key={id}
          type="button"
          data-checked={action!.checked ? 'true' : 'false'}
          disabled={action!.disabled}
          onClick={() => action!.run()}
        >
          {id}
        </button>
      ))}
      {columns.dialog}
    </div>
  );
}

const firstColumns = () => TextDocumentState.section(doc, 'odf').setup.columns;

describe('useTextDocumentColumns', () => {
  it('binds no item for a session that does not write (a Participant, a Viewer)', () => {
    render(<Harness writes={false} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it("checks the caret's section's count and sets two columns from the submenu, counted", () => {
    render(<Harness writes />);
    expect(screen.getByRole('button', { name: 'columns-one' }).dataset.checked).toBe('true');
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'columns-two' }));
    });
    expect(firstColumns()).toEqual({ count: 2, gap: 36 });
    expect(track).toHaveBeenCalledWith('Tab', 'Changed', 'TextDocumentColumns');
  });

  it('counts nothing when the count chosen is the one there is', () => {
    render(<Harness writes />);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'columns-one' }));
    });
    expect(track).not.toHaveBeenCalled();
  });

  it('keeps the spacing and line when a count is chosen from the submenu', () => {
    const caretSetup = {
      ...PageSetup.of('letter'),
      columns: { count: 2, gap: 20, separator: true as const },
    };
    render(<Harness writes caretSetup={caretSetup} />);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'columns-three' }));
    });
    expect(firstColumns()).toEqual({ count: 3, gap: 20, separator: true });
  });

  it('dims every item while pageless', () => {
    render(<Harness writes pageless />);
    for (const button of screen.getAllByRole<HTMLButtonElement>('button'))
      expect(button.disabled).toBe(true);
  });

  it('opens Column options from More options and applies it', () => {
    render(<Harness writes />);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: COLUMNS_MORE_ITEM }));
    });
    fireEvent.click(screen.getByRole('radio', { name: 'Three columns' }));
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    });
    expect(firstColumns()).toEqual({ count: 3, gap: 36 });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
