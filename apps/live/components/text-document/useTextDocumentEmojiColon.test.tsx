// @vitest-environment jsdom
// docs/specs/034-text-documents/objects.md "Emoji" ("Insert emoji using the colon character"): the list under the
// caret, Up and Down through it, Enter, Tab or a press inserting in place of what was typed, Escape sending it away,
// the writing keeping the focus with the option chosen as its active descendant.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useCallback, useState } from 'react';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { track } from '@/lib/telemetry';
import { readRecentEmoji, saveEmojiTone } from '@/lib/office/emoji-preferences';
import { textDocumentSchema as schema } from '@/lib/text-document/text-document-schema';
import { TextDocumentEmojiColonList, useTextDocumentEmojiColon } from './useTextDocumentEmojiColon';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect = () => new DOMRect();

let view: EditorView | null = null;
let enabled = true;

function Harness() {
  const list = useTextDocumentEmojiColon(() => enabled);
  const [editor, setEditor] = useState<EditorView | null>(null);
  // The editor made as its mount is attached, and destroyed as it is taken away.
  const mount = useCallback(
    (element: HTMLDivElement | null) => {
      if (!element) return;
      const doc = schema.node('doc', null, [
        schema.nodes.paragraph!.create(null, schema.text('Hi ')),
      ]);
      const made = new EditorView(element, {
        state: EditorState.create({
          doc,
          selection: TextSelection.create(doc, 4),
          plugins: [list.plugin],
        }),
      });
      view = made;
      setEditor(made);
      return () => made.destroy();
    },
    [list.plugin],
  );
  return (
    <>
      <div ref={mount} />
      <TextDocumentEmojiColonList view={editor} list={list} />
    </>
  );
}

const type = (text: string) => act(() => view!.dispatch(view!.state.tr.insertText(text)));
const press = (key: string) =>
  act(() => {
    view!.someProp('handleKeyDown', (f) => f(view!, new KeyboardEvent('keydown', { key })));
  });
const options = () => screen.queryAllByRole('option');
const text = () => view!.state.doc.textContent;

beforeEach(() => {
  enabled = true;
  localStorage.clear();
  vi.mocked(track).mockClear();
});
afterEach(cleanup);

describe('the emoji colon list', () => {
  it('lists the emoji whose shortcodes begin with what was typed, the first chosen', async () => {
    render(<Harness />);
    type(':thumbs');
    await waitFor(() => expect(options().length).toBeGreaterThan(0));
    expect(screen.getByRole('listbox', { name: 'Emoji' })).toBeTruthy();
    expect(options()[0]!.getAttribute('aria-label')).toBe('Thumbs up');
    expect(options()[0]!.getAttribute('aria-selected')).toBe('true');
    // The editor learns the chosen option in an effect after the list draws: waited for, as the list is.
    await waitFor(() =>
      expect(view!.dom.getAttribute('aria-activedescendant')).toBe(options()[0]!.id),
    );
  });

  it('moves with Up and Down, and Enter puts the chosen one in place of what was typed', async () => {
    render(<Harness />);
    type(':thumbs');
    await waitFor(() => expect(options().length).toBe(2));
    press('ArrowDown');
    expect(options()[1]!.getAttribute('aria-selected')).toBe('true');
    press('ArrowDown');
    expect(options()[0]!.getAttribute('aria-selected')).toBe('true');
    press('ArrowUp');
    press('Enter');
    expect(text()).toBe('Hi 👎');
    expect(options()).toHaveLength(0);
    expect(view!.dom.hasAttribute('aria-activedescendant')).toBe(false);
    expect(track).toHaveBeenCalledWith('Element', 'Added', 'TextDocumentEmoji');
    expect(readRecentEmoji()).toEqual(['👎']);
  });

  it('inserts in the skin tone chosen, on Tab or a press', async () => {
    saveEmojiTone('dark');
    render(<Harness />);
    type(':wave');
    await waitFor(() => expect(options().length).toBeGreaterThan(0));
    press('Tab');
    expect(text()).toBe('Hi 👋🏿');
    type(' :ok_h');
    await waitFor(() => expect(options().length).toBeGreaterThan(0));
    fireEvent.mouseDown(options()[0]!);
    expect(text()).toBe('Hi 👋🏿 👌🏿');
  });

  it('goes away on Escape until the word is left, the text as typed', async () => {
    render(<Harness />);
    type(':smil');
    await waitFor(() => expect(options().length).toBeGreaterThan(0));
    press('Escape');
    expect(options()).toHaveLength(0);
    type('e');
    expect(options()).toHaveLength(0);
    expect(text()).toBe('Hi :smile');
    type(' :smil');
    await waitFor(() => expect(options().length).toBeGreaterThan(0));
  });

  it('shows nothing for no match, or with the preference off, and leaves Enter to the writing', async () => {
    render(<Harness />);
    type(':zzzzqq');
    await act(async () => {});
    expect(options()).toHaveLength(0);
    expect(
      view!.someProp('handleKeyDown', (f) =>
        f(view!, new KeyboardEvent('keydown', { key: 'Enter' })),
      ),
    ).toBeFalsy();
    enabled = false;
    type(' :smile');
    expect(options()).toHaveLength(0);
  });
});
