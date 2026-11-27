// docs/specs/034-text-documents/review.md "How a suggestion is kept": the room judges a Participant's change to a
// header's, footer's or note's writing as a body's. Their own suggestions there are theirs; plain writing, settling
// another's suggestion, or writing in a fragment nothing names asks for Editing.
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { textDocumentLevelAsked } from './level-asked';
import { DOCUMENT_MAP, FOOTNOTE } from './live/live-names';
import { LiveSuggestions } from './live/live-suggestions';
import { storyFragment } from './live/live-stories';

const ADA = { key: 'k-ada', name: 'Ada', colour: '#0284c7' };
const BEN = { key: 'k-ben', name: 'Ben', colour: '#16a34a' };
const mark = (id: string, author = ADA) => ({ id, at: 5, author });

function paragraphOf(fragment: Y.XmlFragment, text: string, note?: string): Y.XmlText {
  const paragraph = new Y.XmlElement('paragraph');
  const run = new Y.XmlText();
  paragraph.insert(0, [run]);
  if (note) {
    const footnote = new Y.XmlElement(FOOTNOTE);
    footnote.setAttribute('story', note);
    paragraph.push([footnote]);
  }
  fragment.push([paragraph]);
  run.insert(0, text);
  return run;
}

const runOf = (fragment: Y.XmlFragment): Y.XmlText =>
  (fragment.get(0) as Y.XmlElement).get(0) as Y.XmlText;

/** A body with a note mark ('n1'), the first section's header ('h'), Ben's suggested insertion in the note. */
function askedOn(
  change: (doc: Y.Doc, header: Y.XmlText, note: Y.XmlText) => void,
  key: string | null = ADA.key,
) {
  const doc = new Y.Doc({ gc: false });
  paragraphOf(doc.getXmlFragment('body'), 'Body', 'n1');
  doc
    .getMap<unknown>(DOCUMENT_MAP)
    .set('section', { headers: { header: { default: { story: 'h' } } } });
  paragraphOf(storyFragment(doc, 'h'), 'Header');
  paragraphOf(storyFragment(doc, 'n1'), 'Note text').format(0, 4, {
    insertion: mark('ben-1', BEN),
  });
  const stored = [Y.encodeStateAsUpdate(doc)];
  const replica = new Y.Doc({ gc: false });
  Y.applyUpdate(replica, stored[0]!);
  const vector = Y.encodeStateVector(replica);
  change(replica, runOf(storyFragment(replica, 'h')), runOf(storyFragment(replica, 'n1')));
  return textDocumentLevelAsked(stored, Y.encodeStateAsUpdate(replica, vector), key);
}

describe('textDocumentLevelAsked on suggestions in stories', () => {
  it('lets a Participant suggest in a header and in a note', () => {
    expect(askedOn((_, header) => header.insert(6, ' new', { insertion: mark('a1') }))).toBe(
      'participate',
    );
    expect(askedOn((_, __, note) => note.format(5, 4, { deletion: mark('a2') }))).toBe(
      'participate',
    );
  });

  it('lets a Participant reject all their own, stories included', () => {
    expect(
      askedOn((doc) => LiveSuggestions.settleAll(doc, false, null, { only: BEN.key }), BEN.key),
    ).toBe('participate');
  });

  it('asks for Editing to write plainly in a story, or to settle another’s suggestion there', () => {
    expect(askedOn((_, header) => header.insert(0, 'x'))).toBe('edit');
    expect(askedOn((doc) => LiveSuggestions.accept(doc, 'ben-1', null))).toBe('edit');
  });

  it('asks for Editing to write in a fragment nothing names', () => {
    expect(
      askedOn((doc) =>
        paragraphOf(storyFragment(doc, 'zz'), '').insert(0, 'x', { insertion: mark('a3') }),
      ),
    ).toBe('edit');
  });

  // review.md "Headers, footers and notes": Insert > Footnote while suggesting, the note and its mark in one update.
  describe('a footnote put in while suggesting', () => {
    const addNote = (doc: Y.Doc, author = ADA, written = '') => {
      const body = doc.getXmlFragment('body');
      const paragraph = body.get(0) as Y.XmlElement;
      const footnote = new Y.XmlElement(FOOTNOTE);
      footnote.setAttribute('story', 'n9');
      footnote.setAttribute('insertion', mark('a-note', author) as unknown as string);
      paragraphOf(storyFragment(doc, 'n9'), '');
      paragraph.push([footnote]);
      if (written)
        runOf(storyFragment(doc, 'n9')).insert(0, written, { insertion: mark('a-text') });
    };

    it('lets a Participant put in a note whose mark is their own suggestion, and write in it', () => {
      expect(askedOn((doc) => doc.transact(() => addNote(doc)))).toBe('participate');
      expect(askedOn((doc) => doc.transact(() => addNote(doc, ADA, 'why')))).toBe('participate');
    });

    it('asks for Editing for a new note named by a plain mark or another’s, or written in plainly', () => {
      expect(askedOn((doc) => doc.transact(() => addNote(doc, BEN)))).toBe('edit');
      expect(
        askedOn((doc) =>
          doc.transact(() => {
            addNote(doc);
            runOf(storyFragment(doc, 'n9')).insert(0, 'plain');
          }),
        ),
      ).toBe('edit');
    });
  });
});
