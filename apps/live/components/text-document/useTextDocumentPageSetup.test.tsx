// @vitest-environment jsdom
// docs/specs/034-text-documents/page-layout.md "Page setup", "Share roles", "Telemetry": File > Page setup and Format >
// Page orientation open their dialogs for an Editor only; OK sets what changed and counts it; Set as default keeps it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { ySyncPlugin } from 'y-prosemirror';
import type * as Y from 'yjs';
import { PageSetup, TextDocumentState } from '@livedoc/text-documents';
import { track } from '@/lib/telemetry';
import { textDocumentSchema } from '@/lib/text-document/text-document-schema';
import { textDocumentUndoPlugins } from '@/lib/text-document/text-document-undo';
import { readDefaultPageSetup } from '@/lib/text-document/text-document-page-defaults';
import {
  PAGE_ORIENTATION_ITEM,
  PAGE_SETUP_ITEM,
  useTextDocumentPageSetup,
} from './useTextDocumentPageSetup';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));
vi.mock('@/lib/preferences-sync', async (original) => ({
  ...(await original<typeof import('@/lib/preferences-sync')>()),
  savePreferences: vi.fn(),
}));
vi.mock('@/hooks/ui/useDocumentColours', () => ({ useDocumentColours: () => [] }));

let doc: Y.Doc;
let view: EditorView;
// The surface holds its live state in a ref, the same object every render.
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
  window.localStorage.clear();
  vi.mocked(track).mockClear();
});

function Harness({
  writes,
  onPage,
}: {
  writes: boolean;
  onPage?: (page: ReturnType<typeof useTextDocumentPageSetup>) => void;
}) {
  const page = useTextDocumentPageSetup({
    view,
    liveDoc,
    format: 'odf',
    ready: true,
    writes,
    ownerId: null,
  });
  onPage?.(page);
  return (
    <div>
      {Object.entries(page.actions).map(([id, action]) => (
        <button key={id} type="button" onClick={() => action!.run()}>
          {id}
        </button>
      ))}
      <span data-testid="width">{page.section.setup.width}</span>
      {page.dialog}
    </div>
  );
}

describe('useTextDocumentPageSetup', () => {
  it('offers neither item to a session that cannot edit', () => {
    render(<Harness writes={false} />);
    expect(screen.queryByRole('button', { name: PAGE_SETUP_ITEM })).toBeNull();
  });

  it('sets a page setup changed on OK, counts it and gives the writing focus back', () => {
    render(<Harness writes />);
    fireEvent.click(screen.getByRole('button', { name: PAGE_SETUP_ITEM }));
    fireEvent.click(screen.getByRole('radio', { name: 'Landscape' }));
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(TextDocumentState.section(doc, 'odf').setup).toEqual(
      PageSetup.oriented(PageSetup.of('letter'), 'landscape'),
    );
    expect(screen.getByTestId('width').textContent).toBe('792');
    expect(track).toHaveBeenCalledWith('Tab', 'Changed', 'TextDocumentPageSetup');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(view.dom);
  });

  it('changes nothing and counts nothing for OK on the setup there is', () => {
    render(<Harness writes />);
    fireEvent.click(screen.getByRole('button', { name: PAGE_SETUP_ITEM }));
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(TextDocumentState.metaType(doc).has('section')).toBe(false);
    expect(track).not.toHaveBeenCalled();
  });

  it('keeps Set as default with the person, counted before it is kept', () => {
    render(<Harness writes />);
    fireEvent.click(screen.getByRole('button', { name: PAGE_SETUP_ITEM }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Paper size' }), {
      target: { value: 'a4' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Set as default' }));
    expect(track).toHaveBeenCalledWith('UI', 'Changed', 'TextDocumentPageDefault');
    expect(readDefaultPageSetup()).toEqual(PageSetup.of('a4'));
    expect(TextDocumentState.metaType(doc).has('section')).toBe(false);
  });

  it('turns the page by Format > Page orientation', () => {
    render(<Harness writes />);
    fireEvent.click(screen.getByRole('button', { name: PAGE_ORIENTATION_ITEM }));
    fireEvent.click(screen.getByRole('radio', { name: 'Landscape' }));
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(TextDocumentState.section(doc, 'odf').setup.orientation).toBe('landscape');
    expect(track).toHaveBeenCalledWith('Tab', 'Changed', 'TextDocumentPageOrientation');
  });

  it('sets a margin dragged on the ruler, for an Editor only', () => {
    let page: ReturnType<typeof useTextDocumentPageSetup> | undefined;
    const { rerender } = render(<Harness writes={false} onPage={(p) => (page = p)} />);
    const narrow = {
      ...PageSetup.of('letter'),
      margins: { top: 72, bottom: 72, left: 36, right: 72 },
    };
    act(() => page!.setSetup(narrow));
    expect(TextDocumentState.metaType(doc).has('section')).toBe(false);
    rerender(<Harness writes onPage={(p) => (page = p)} />);
    act(() => page!.setSetup(narrow));
    expect(TextDocumentState.section(doc, 'odf').setup).toEqual(narrow);
  });
});
