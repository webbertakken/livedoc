// docs/specs/034-text-documents/review.md "How a suggestion is kept" ("Where"): headers', footers' and notes' writing
// takes suggestions as a body does. A story's suggestion belongs to the tab that shows it (a header's or footer's, the
// first tab whose sections name it; a note's, the tab whose body holds its mark), read after that tab's body, headers
// before notes, and settled with the rest, by Accept all too. A fragment nothing names is no story.
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { DOCUMENT_MAP, FOOTNOTE, INSERTION_MARK, DELETION_MARK } from './live-names';
import { LiveSuggestions, type SuggestionMark } from './live-suggestions';
import { storyFragment } from './live-stories';

const ADA = { key: 'k-ada', name: 'Ada', colour: '#0284c7' };
const BEN = { key: 'k-ben', name: 'Ben', colour: '#16a34a' };
const mark = (id: string, author = ADA): SuggestionMark => ({ id, at: 10, author });

type Runs = (string | [string, Record<string, unknown>])[];

/** A paragraph of runs, with a footnote mark naming `note` after them when given. */
function paragraph(runs: Runs, note?: string): Y.XmlElement {
  const p = new Y.XmlElement('paragraph');
  const text = new Y.XmlText();
  p.insert(0, [text]);
  if (note !== undefined) {
    const footnote = new Y.XmlElement(FOOTNOTE);
    footnote.setAttribute('story', note);
    p.push([footnote]);
  }
  return Object.assign(p, { runs });
}

function fill(fragment: Y.XmlFragment, ...paragraphs: Y.XmlElement[]): void {
  fragment.push(paragraphs);
  for (const p of paragraphs) {
    const runs = (p as Y.XmlElement & { runs: Runs }).runs;
    (p.get(0) as Y.XmlText).applyDelta(
      runs.map((r) => (typeof r === 'string' ? { insert: r } : { insert: r[0], attributes: r[1] })),
    );
  }
}

/**
 * Two tabs: the first's body with a suggestion and a note mark ('n1'), the second's body with a note mark ('n2'); the
 * first section's header 'h' (shown in both tabs). Each story holds one suggested insertion; 'orphan' is named by none.
 */
function storied() {
  const doc = new Y.Doc({ gc: false });
  doc.getMap('tabs').set('t.0', { name: 'One', order: 0 });
  doc.getMap('tabs').set('t.1', { name: 'Two', order: 1 });
  doc
    .getMap<unknown>(DOCUMENT_MAP)
    .set('section', { headers: { header: { default: { story: 'h' } } } });
  fill(
    doc.getXmlFragment('body'),
    paragraph(['a', ['B', { [INSERTION_MARK]: mark('s-body') }]], 'n1'),
  );
  fill(doc.getXmlFragment('tab:t.1'), paragraph(['c'], 'n2'));
  fill(
    storyFragment(doc, 'h'),
    paragraph(['Head', [' new', { [INSERTION_MARK]: mark('s-head') }]]),
  );
  fill(
    storyFragment(doc, 'n1'),
    paragraph(['Note one', [' gone', { [DELETION_MARK]: mark('s-n1', BEN) }]]),
  );
  fill(storyFragment(doc, 'n2'), paragraph([['Two', { [INSERTION_MARK]: mark('s-n2') }]]));
  fill(storyFragment(doc, 'orphan'), paragraph([['x', { [INSERTION_MARK]: mark('s-orphan') }]]));
  return doc;
}

const textOf = (fragment: Y.XmlFragment): string =>
  fragment
    .toArray()
    .map((p) =>
      ((p as Y.XmlElement).get(0) as Y.XmlText)
        .toDelta()
        .map((op: { insert: unknown }) => op.insert)
        .join(''),
    )
    .join('|');

describe('LiveSuggestions in stories', () => {
  it('reads each story’s suggestions with the tab that shows it, after its body, headers before notes', () => {
    expect(LiveSuggestions.read(storied()).map((s) => [s.id, s.tab, s.story])).toEqual([
      ['s-body', 't.0', undefined],
      ['s-head', 't.0', 'h'],
      ['s-n1', 't.0', 'n1'],
      ['s-n2', 't.1', 'n2'],
    ]);
  });

  it('reads a story suggestion’s parts as a body’s', () => {
    const head = LiveSuggestions.read(storied()).find((s) => s.id === 's-head')!;
    expect(head.parts).toEqual([{ kind: 'insertion', text: ' new' }]);
    expect(LiveSuggestions.count(storied())).toBe(4);
  });

  it('accepts and rejects a suggestion in a story', () => {
    const doc = storied();
    expect(LiveSuggestions.accept(doc, 's-head', 'test')).toBe(true);
    expect(textOf(storyFragment(doc, 'h'))).toBe('Head new');
    expect(LiveSuggestions.reject(doc, 's-n1', 'test')).toBe(true);
    expect(textOf(storyFragment(doc, 'n1'))).toBe('Note one gone');
    expect(LiveSuggestions.read(doc).map((s) => s.id)).toEqual(['s-body', 's-n2']);
  });

  it('settles every story’s suggestions with Accept all, leaving a fragment nothing names', () => {
    const doc = storied();
    expect(LiveSuggestions.settleAll(doc, false, 'test')).toBe(4);
    expect(textOf(storyFragment(doc, 'h'))).toBe('Head');
    expect(textOf(storyFragment(doc, 'n1'))).toBe('Note one gone');
    expect(textOf(storyFragment(doc, 'n2'))).toBe('');
    expect(textOf(storyFragment(doc, 'orphan'))).toBe('x');
  });

  it('settles a copy’s stories for a preview, the document untouched', () => {
    const doc = storied();
    const copy = LiveSuggestions.settledCopy(doc, true);
    expect(textOf(storyFragment(copy, 'n1'))).toBe('Note one');
    expect(LiveSuggestions.count(doc)).toBe(4);
  });
});
