// docs/specs/034-text-documents/review.md "Editing modes" (Viewing draws every pending suggestion as not yet made,
// followed as others change the document) and "Reviewing suggestions" (Preview): the settled writing reads as a copy
// made now, whatever is written, suggested, settled or taken back, keeping every paragraph that did not change.
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { DELETION_MARK, INSERTION_MARK, LiveSuggestions } from './live-suggestions';
import { SettledWriting } from './settled-writing';

const ADA = { key: 'k-ada', name: 'Ada', colour: '#0284c7' };

function writtenDoc() {
  const doc = new Y.Doc({ gc: false });
  const body = doc.getXmlFragment('body');
  const first = new Y.XmlElement('paragraph');
  first.insert(0, [new Y.XmlText()]);
  const second = new Y.XmlElement('paragraph');
  second.insert(0, [new Y.XmlText()]);
  body.push([first, second]);
  const text = first.get(0) as Y.XmlText;
  text.insert(0, 'kept ');
  text.insert(5, 'new', { [INSERTION_MARK]: { id: 's1', at: 1, author: ADA } });
  (second.get(0) as Y.XmlText).insert(0, 'second');
  return { doc, text };
}

const bodyOf = (doc: Y.Doc) => doc.getXmlFragment('body').toJSON();

describe('SettledWriting', () => {
  it('says whether anything is pending', () => {
    const { doc } = writtenDoc();
    expect(SettledWriting.pending(doc)).toBe(true);
    LiveSuggestions.settleAll(doc, true, null);
    expect(SettledWriting.pending(doc)).toBe(false);
  });

  it('makes the document settled either way, the document untouched', () => {
    const { doc } = writtenDoc();
    expect(bodyOf(SettledWriting.make(doc, false))).toContain('>kept </');
    expect(bodyOf(SettledWriting.make(doc, true))).toContain('>kept new</');
    expect(SettledWriting.pending(doc)).toBe(true);
  });

  it('reads as a copy made now after writing, suggesting, settling and taking back, keeping what did not change', () => {
    const { doc, text } = writtenDoc();
    const drawn = SettledWriting.make(doc, false);
    const untouched = drawn.getXmlFragment('body').get(1);
    text.insert(0, 'more ');
    text.insert(text.length, ' added', { [INSERTION_MARK]: { id: 's2', at: 2, author: ADA } });
    text.format(0, 4, { [DELETION_MARK]: { id: 's3', at: 3, author: ADA } });
    SettledWriting.refresh(drawn, doc, false);
    expect(bodyOf(drawn)).toBe(bodyOf(LiveSuggestions.settledCopy(doc, false)));
    LiveSuggestions.accept(doc, 's1', null);
    SettledWriting.refresh(drawn, doc, false);
    expect(bodyOf(drawn)).toBe(bodyOf(LiveSuggestions.settledCopy(doc, false)));
    expect(bodyOf(drawn)).toContain('>more kept new</');
    // Taking one's own insertion back: its text deleted.
    const at = String(text.toString()).indexOf(' added');
    text.delete(at, ' added'.length);
    LiveSuggestions.settleAll(doc, true, null);
    SettledWriting.refresh(drawn, doc, false);
    expect(bodyOf(drawn)).toBe(bodyOf(doc));
    expect(drawn.getXmlFragment('body').get(1)).toBe(untouched);
  });

  it('follows typing inside a pending insertion, where a copy that followed updates would not', () => {
    const { doc, text } = writtenDoc();
    const drawn = SettledWriting.make(doc, false);
    // Typed between the suggestion's characters: formatted by where it lands.
    text.insert(6, 'zz');
    SettledWriting.refresh(drawn, doc, false);
    expect(bodyOf(drawn)).toBe(bodyOf(LiveSuggestions.settledCopy(doc, false)));
  });
});
