// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { TextDocument } from '@livedoc/text-documents';
import { createTextDocumentChanges } from '@/lib/text-document/text-document-changes';
import { textDocumentSchema } from '@/lib/text-document/text-document-schema';
import { OUTLINE_EMPTY, TextDocumentOutline } from './TextDocumentOutline';

const STYLES = TextDocument.blank({ format: 'odf' }).styles;
const readStyles = () => STYLES;
const { paragraph } = textDocumentSchema.nodes;
const p = (text: string, style: string | null = null) =>
  paragraph!.create({ style }, text ? textDocumentSchema.text(text) : null);

function outlineOf(...blocks: ReturnType<typeof p>[]) {
  const changes = createTextDocumentChanges();
  const view = new EditorView(document.body.appendChild(document.createElement('div')), {
    state: EditorState.create({
      doc: textDocumentSchema.node('doc', null, blocks),
      plugins: [changes.plugin],
    }),
  });
  render(<TextDocumentOutline view={view} changes={changes} readStyles={readStyles} />);
  return view;
}

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

// docs/specs/034-text-documents/links-and-navigation.md "The outline".
describe('TextDocumentOutline', () => {
  it('lists the headings indented by level', () => {
    outlineOf(p('Plan', 'Heading_20_1'), p('Words'), p('Steps', 'Heading_20_2'));
    const items = within(screen.getByRole('list', { name: 'Headings' })).getAllByRole('button');
    expect(items.map((b) => b.textContent)).toEqual(['Plan', 'Steps']);
    expect(items[1]!.style.paddingLeft).toBe('20px');
  });

  it('puts the caret at a heading pressed, and gives the writing the keyboard', () => {
    const view = outlineOf(p('Words'), p('Steps', 'Heading_20_2'));
    fireEvent.click(screen.getByRole('button', { name: 'Steps' }));
    expect(view.state.selection.from).toBe(8);
    expect(document.activeElement).toBe(view.dom);
  });

  it('says where headings will show while there are none', () => {
    outlineOf(p('Words'));
    expect(screen.getByText(OUTLINE_EMPTY)).toBeDefined();
  });

  it('follows the writing as it changes', () => {
    const view = outlineOf(p('Words'));
    act(() => {
      view.dispatch(view.state.tr.insert(view.state.doc.content.size, p('Later', 'Heading_20_1')));
    });
    expect(screen.getByRole('button', { name: 'Later' })).toBeDefined();
  });
});
