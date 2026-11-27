// @vitest-environment jsdom
// review.md "Editing modes": the writing takes the keyboard back in Viewing too, where it is read only.
import { describe, expect, it } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { textDocumentSchema } from './text-document-schema';
import { focusWriting } from './text-document-focus';

function viewOf(editable: boolean) {
  const host = document.createElement('div');
  document.body.append(host);
  return new EditorView(host, {
    state: EditorState.create({ schema: textDocumentSchema }),
    editable: () => editable,
    attributes: { tabindex: '0' },
  });
}

describe('focusWriting', () => {
  it('focuses a read-only writing on its element, and an editable one', () => {
    const readOnly = viewOf(false);
    focusWriting(readOnly);
    expect(document.activeElement).toBe(readOnly.dom);
    const editable = viewOf(true);
    focusWriting(editable);
    expect(document.activeElement).toBe(editable.dom);
    readOnly.destroy();
    editable.destroy();
  });

  it('does nothing without a view, or once it is gone', () => {
    const view = viewOf(false);
    view.destroy();
    expect(() => {
      focusWriting(view);
      focusWriting(null);
    }).not.toThrow();
  });
});
