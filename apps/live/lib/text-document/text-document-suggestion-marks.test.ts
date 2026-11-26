// @vitest-environment jsdom
// docs/specs/034-text-documents/review.md "While suggesting": a suggested paragraph break or join is drawn as a pilcrow
// at the end of the paragraph before it, in its author's colour, struck through for a join.
import { describe, expect, it } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { textDocumentSchema as schema } from './text-document-schema';
import { suggestedBreaks, suggestedBreaksPlugin } from './text-document-suggestion-marks';

const mark = (colour = '#0284c7') => ({
  id: 's1',
  at: 1,
  author: { key: 'k', name: 'Ada', colour },
});
const p = (text: string, attrs: Record<string, unknown> = {}) =>
  schema.nodes.paragraph!.create(attrs, schema.text(text));

describe('suggestedBreaks', () => {
  it('places a break’s and a join’s pilcrow at the end of the paragraph before', () => {
    const doc = schema.nodes.doc!.create(null, [
      p('one', { insertion: mark() }),
      p('two', { insertion: mark() }),
      p('three', { deletion: mark('nope') }),
    ]);
    expect(suggestedBreaks(doc)).toEqual([
      { at: 4, kind: 'insertion', ink: expect.any(String) },
      { at: 9, kind: 'deletion' },
    ]);
  });

  it('draws the pilcrows in the view', () => {
    const doc = schema.nodes.doc!.create(null, [p('one'), p('two', { deletion: mark() })]);
    const view = new EditorView(document.createElement('div'), {
      state: EditorState.create({ doc, plugins: [suggestedBreaksPlugin()] }),
    });
    const drawn = view.dom.querySelector('.text-document-suggested-break-deletion') as HTMLElement;
    expect(drawn.textContent).toBe('¶');
    expect(drawn.style.textDecorationLine).toBe('line-through');
    view.destroy();
  });
});
