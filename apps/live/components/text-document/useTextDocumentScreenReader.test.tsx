// @vitest-environment jsdom
// docs/specs/034-text-documents/tools.md "Accessibility settings": the dialog (the switch, the sentence in the tab
// order, OK), the switch said aloud and kept per person, telemetry before it is kept, and the verbalise commands heard
// only while screen reader support is on, each saying through the surface's own polite live region.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { textDocumentSchema } from '@/lib/text-document/text-document-schema';
import { readUserPreferences } from '@/lib/user-preferences';
import { track } from '@/lib/telemetry';
import {
  ACCESSIBILITY_ITEM,
  ACCESSIBILITY_SETTINGS_ITEM,
  NATIVE_SUPPORT_SENTENCE,
  SCREEN_READER_DISABLED,
  SCREEN_READER_ENABLED,
  SCREEN_READER_KEY,
  writeScreenReaderSupport,
} from '@/lib/text-document/text-document-screen-reader';
import { NO_COMMENT_HERE, NOT_IN_A_TABLE } from '@/lib/text-document/text-document-verbalise';
import { useTextDocumentScreenReader, VERBALISE_ITEMS } from './useTextDocumentScreenReader';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

const s = textDocumentSchema;
const views: EditorView[] = [];
beforeEach(() => localStorage.clear());
afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
  vi.mocked(track).mockClear();
});

function editor(text = 'one two three') {
  const doc = s.node('doc', null, [s.node('paragraph', null, [s.text(text)])]);
  const view = new EditorView(document.createElement('div'), {
    state: EditorState.create({ doc, selection: TextSelection.create(doc, 5, 8) }),
  });
  views.push(view);
  return view;
}

function setup({
  pages = true,
  view = editor(),
}: { pages?: boolean; view?: EditorView | null } = {}) {
  let result: ReturnType<typeof useTextDocumentScreenReader> | null = null;
  const pageAt = () => (pages ? { page: 1, pages: 3 } : null);
  const threads = { threads: [], stretches: [] };
  function Harness() {
    result = useTextDocumentScreenReader({
      view,
      activeView: view,
      liveDoc: { current: null },
      format: 'odf',
      pageAt,
      threads,
      ownerId: null,
    });
    return (
      <>
        {result.dialog}
        {result.region}
      </>
    );
  }
  render(<Harness />);
  const run = (id: string) => act(() => result!.actions[id]!.run());
  const said = () => document.querySelector('[data-screen-reader-region]')!.textContent?.trim();
  return { run, said, result: () => result!, view };
}

describe('useTextDocumentScreenReader', () => {
  it('opens the dialog from Tools > Accessibility, with the switch, the sentence in the tab order and OK', () => {
    const { run } = setup();
    run(ACCESSIBILITY_ITEM);
    expect(screen.getByRole('dialog', { name: 'Accessibility settings' })).toBeTruthy();
    const box = screen.getByRole('checkbox', { name: 'Turn on screen reader support' });
    expect((box as HTMLInputElement).checked).toBe(false);
    const sentence = screen.getByText(NATIVE_SUPPORT_SENTENCE);
    expect(sentence.tabIndex).toBe(0);
    // No braille or magnifier switch, dimmed or otherwise.
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /^OK$/ }));
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('turns on from the checkbox: counted before it is kept, said aloud, the menu’s items bound', () => {
    const { run, said, result } = setup();
    run(ACCESSIBILITY_ITEM);
    vi.mocked(track).mockImplementationOnce(() => {
      expect(readUserPreferences().screenReaderSupport).toBeUndefined();
    });
    act(() => {
      fireEvent.click(screen.getByRole('checkbox', { name: 'Turn on screen reader support' }));
    });
    expect(track).toHaveBeenCalledWith('UI', 'Toggled', 'TextDocumentScreenReaderOn');
    expect(readUserPreferences().screenReaderSupport).toBe(true);
    expect(said()).toBe(SCREEN_READER_ENABLED);
    expect(result().on).toBe(true);
    expect(result().actions[ACCESSIBILITY_SETTINGS_ITEM]).toBeTruthy();
    expect(result().actions[VERBALISE_ITEMS.selection]).toBeTruthy();
  });

  it('turns on and off with the key, saying each, and leaves nothing kept when off', () => {
    const { run, said, result } = setup();
    run(SCREEN_READER_KEY);
    expect(said()).toBe(SCREEN_READER_ENABLED);
    run(SCREEN_READER_KEY);
    expect(track).toHaveBeenLastCalledWith('UI', 'Toggled', 'TextDocumentScreenReaderOff');
    expect(said()).toBe(SCREEN_READER_DISABLED);
    expect('screenReaderSupport' in readUserPreferences()).toBe(false);
    expect(result().actions[VERBALISE_ITEMS.selection]).toBeUndefined();
  });

  it('hears no verbalise command while off', () => {
    const { result } = setup();
    expect(Object.keys(result().actions).sort()).toEqual(
      [ACCESSIBILITY_ITEM, SCREEN_READER_KEY].sort(),
    );
  });

  it('says what each command reads while on, through the live region', () => {
    writeScreenReaderSupport(true, null);
    const { run, said } = setup();
    const region = document.querySelector('[data-screen-reader-region]')!;
    expect(region.getAttribute('role')).toBe('status');
    expect(region.getAttribute('aria-live')).toBe('polite');
    run(VERBALISE_ITEMS.selection);
    expect(said()).toBe('two');
    run(VERBALISE_ITEMS.fromCursor);
    expect(said()).toBe('two three');
    run(VERBALISE_ITEMS.cursorLocation);
    expect(said()).toBe('Page 1 of 3, Normal text');
    run(VERBALISE_ITEMS.announceCursorLocation);
    expect(said()).toBe('Page 1 of 3, Normal text');
    run(VERBALISE_ITEMS.selectionFormatting);
    expect(said()).toMatch(/, 11 point, Left aligned$/);
    run(VERBALISE_ITEMS.announceFormatting);
    expect(said()).toMatch(/Left aligned$/);
    run(VERBALISE_ITEMS.wordCount);
    expect(said()).toBe('1 of 3 words selected');
    run(VERBALISE_ITEMS.tableCell);
    expect(said()).toBe(NOT_IN_A_TABLE);
    for (const id of [
      VERBALISE_ITEMS.tableHeaders,
      VERBALISE_ITEMS.tableRowHeader,
      VERBALISE_ITEMS.tableColumnHeader,
    ]) {
      run(id);
      expect(said()).toBe(NOT_IN_A_TABLE);
    }
    run(VERBALISE_ITEMS.comment);
    expect(said()).toBe(NO_COMMENT_HERE);
    run(VERBALISE_ITEMS.commentAnchor);
    expect(said()).toBe(NO_COMMENT_HERE);
  });

  it('says a repeated sentence again by changing the region', () => {
    writeScreenReaderSupport(true, null);
    const { run } = setup();
    const region = document.querySelector('[data-screen-reader-region]')!;
    run(VERBALISE_ITEMS.selection);
    const first = region.textContent;
    run(VERBALISE_ITEMS.selection);
    expect(region.textContent).not.toBe(first);
  });

  it('says no page where none are laid out, and opens the dialog from the menu’s own item', () => {
    writeScreenReaderSupport(true, null);
    const { run, said } = setup({ pages: false });
    run(VERBALISE_ITEMS.cursorLocation);
    expect(said()).toBe('Normal text');
    run(ACCESSIBILITY_SETTINGS_ITEM);
    expect(
      screen.getByRole<HTMLInputElement>('checkbox', { name: 'Turn on screen reader support' })
        .checked,
    ).toBe(true);
  });

  it('skips a command whose editor has gone, and binds none without an editor', () => {
    writeScreenReaderSupport(true, null);
    const { run, said, view } = setup();
    view?.destroy();
    run(VERBALISE_ITEMS.selection);
    expect(said()).toBe('');
    const none = setup({ view: null });
    expect(none.result().actions[VERBALISE_ITEMS.selection]).toBeUndefined();
  });
});
