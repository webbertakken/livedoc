// docs/specs/034-text-documents/review.md "How a suggestion is kept": suggestions kept in the writing as marks on text,
// objects, paragraphs and blocks; a suggestion every part with one id; accepted and rejected in one change; the writing
// read with one person's suggestions rejected.
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import {
  DELETION_MARK,
  FORMAT_CHANGE_MARK,
  INSERTION_MARK,
  isWellFormedMark,
  LiveSuggestions,
  PARAGRAPH_FORMAT_CHANGE,
  SUGGESTION_ID_MAX,
  type SuggestionMark,
} from './live-suggestions';

const ADA = { key: 'k-ada', name: 'Ada', colour: '#0284c7' };
const BEN = { key: 'k-ben', name: 'Ben', colour: '#16a34a' };

const mark = (id: string, author = ADA, at = 10): SuggestionMark => ({ id, at, author });

type Run = string | [string, Record<string, unknown>];

/** A doc whose first tab's body holds a paragraph per entry, each of runs, with the paragraph's attributes. */
function written(
  ...paragraphs: (
    Run[] | { runs: Run[]; attributes?: Record<string, unknown>; atom?: Record<string, unknown> }
  )[]
) {
  const doc = new Y.Doc({ gc: false });
  const body = doc.getXmlFragment('body');
  for (const entry of paragraphs) {
    const { runs, attributes = {}, atom } = Array.isArray(entry) ? { runs: entry } : entry;
    const paragraph = new Y.XmlElement('paragraph');
    for (const [name, value] of Object.entries(attributes))
      paragraph.setAttribute(name, value as string);
    const text = new Y.XmlText();
    paragraph.insert(0, [text]);
    if (atom) {
      const picture = new Y.XmlElement('picture');
      for (const [name, value] of Object.entries(atom)) picture.setAttribute(name, value as string);
      paragraph.push([picture]);
    }
    body.push([paragraph]);
    text.applyDelta(
      runs.map((run) =>
        typeof run === 'string' ? { insert: run } : { insert: run[0], attributes: run[1] },
      ),
    );
  }
  return { doc, body };
}

/** The body's paragraphs as text, an atom as `[name]`. */
const textOf = (body: Y.XmlFragment): string[] =>
  body.toArray().map((p) =>
    (p as Y.XmlElement)
      .toArray()
      .map((c: unknown) =>
        c instanceof Y.XmlText
          ? (c.toDelta() as { insert: string }[]).map((op) => op.insert).join('')
          : `[${(c as Y.XmlElement).nodeName}]`,
      )
      .join(''),
  );

const runsOf = (body: Y.XmlFragment, index = 0) =>
  ((body.get(index) as Y.XmlElement).get(0) as Y.XmlText).toDelta() as {
    insert: string;
    attributes?: Record<string, unknown>;
  }[];

describe('LiveSuggestions.read', () => {
  it('reads each kind of part, in the writing’s order, with its author and time', () => {
    const { doc } = written(['The ', ['quick', { [INSERTION_MARK]: mark('s1') }], ' fox'], {
      runs: [['lazy', { [DELETION_MARK]: mark('s2', BEN, 20) }], ' dog'],
      attributes: { [INSERTION_MARK]: mark('s3') },
    });
    const read = LiveSuggestions.read(doc);
    expect(read.map((s) => [s.id, s.author.name, s.at, s.tab])).toEqual([
      ['s1', 'Ada', 10, 't.0'],
      ['s3', 'Ada', 10, 't.0'],
      ['s2', 'Ben', 20, 't.0'],
    ]);
    expect(read[0]!.parts).toEqual([{ kind: 'insertion', text: 'quick' }]);
    expect(read[1]!.parts).toEqual([{ kind: 'break', text: '' }]);
    expect(read[2]!.parts).toEqual([{ kind: 'deletion', text: 'lazy' }]);
  });

  it('reads adjacent text of one kind and id as one part, and a format’s text as format', () => {
    const { doc } = written([
      ['ab', { [INSERTION_MARK]: mark('s1') }],
      ['cd', { [INSERTION_MARK]: mark('s1'), bold: { value: true } }],
      ' gap ',
      ['ef', { [INSERTION_MARK]: mark('s1') }],
      [
        'gh',
        { [FORMAT_CHANGE_MARK]: { ...mark('s2'), before: { bold: null } }, bold: { value: true } },
      ],
      [
        'ij',
        {
          [FORMAT_CHANGE_MARK]: { ...mark('s2'), before: { italic: null, bold: null } },
          italic: { value: true },
        },
      ],
    ]);
    const [first, second] = LiveSuggestions.read(doc);
    expect(first!.parts).toEqual([
      { kind: 'insertion', text: 'abcd' },
      { kind: 'insertion', text: 'ef' },
    ]);
    // A format part names the marks it changed, merged parts all of theirs.
    expect(second!.parts).toEqual([{ kind: 'format', text: 'ghij', changed: ['bold', 'italic'] }]);
  });

  it('reads objects, joins, paragraph formats and blocks, and ignores what is no mark', () => {
    const { doc, body } = written(
      { runs: ['one'], atom: { media: 'm1', [INSERTION_MARK]: mark('s1') } },
      {
        runs: ['two'],
        attributes: {
          [DELETION_MARK]: mark('s2'),
          [PARAGRAPH_FORMAT_CHANGE]: { ...mark('s3'), before: {} },
        },
      },
      [['x', { [INSERTION_MARK]: { id: 'no-author' } }]],
    );
    const table = new Y.XmlElement('table');
    table.setAttribute(INSERTION_MARK, mark('s4') as unknown as string);
    body.push([table]);
    expect(LiveSuggestions.read(doc).map((s) => [s.id, s.parts])).toEqual([
      // An object's and a block's parts name their element.
      ['s1', [{ kind: 'insertion', text: 'picture', element: 'picture' }]],
      ['s2', [{ kind: 'join', text: '' }]],
      ['s3', [{ kind: 'paragraph-format', text: '' }]],
      ['s4', [{ kind: 'block-insertion', text: 'table', element: 'table' }]],
    ]);
    expect(LiveSuggestions.count(doc)).toBe(4);
  });

  it('never merges an object into the text beside it', () => {
    const { doc } = written({
      runs: [['x', { [INSERTION_MARK]: mark('s1') }]],
      atom: { media: 'm1', [INSERTION_MARK]: mark('s1') },
    });
    expect(LiveSuggestions.read(doc)[0]!.parts).toEqual([
      { kind: 'insertion', text: 'x' },
      { kind: 'insertion', text: 'picture', element: 'picture' },
    ]);
  });

  it('reads a suggestion in another document tab with that tab', () => {
    const { doc } = written(['first']);
    doc.getMap('tabs').set('t.0', { name: 'One', order: 0 });
    doc.getMap('tabs').set('t.1', { name: 'Two', order: 1 });
    const paragraph = new Y.XmlElement('paragraph');
    const text = new Y.XmlText();
    paragraph.insert(0, [text]);
    doc.getXmlFragment('tab:t.1').push([paragraph]);
    text.insert(0, 'later', { [INSERTION_MARK]: mark('s9') });
    expect(LiveSuggestions.read(doc).map((s) => [s.id, s.tab])).toEqual([['s9', 't.1']]);
  });
});

describe('LiveSuggestions.accept and reject', () => {
  it('accepts an insertion by keeping its text and rejects one by removing it', () => {
    const accepted = written(['a', ['bc', { [INSERTION_MARK]: mark('s1') }], 'd']);
    expect(LiveSuggestions.accept(accepted.doc, 's1', 'test')).toBe(true);
    expect(runsOf(accepted.body)).toEqual([{ insert: 'abcd' }]);
    const rejected = written(['a', ['bc', { [INSERTION_MARK]: mark('s1') }], 'd']);
    expect(LiveSuggestions.reject(rejected.doc, 's1', 'test')).toBe(true);
    expect(runsOf(rejected.body)).toEqual([{ insert: 'ad' }]);
  });

  it('accepts a deletion by removing its text and rejects one by dropping its mark', () => {
    const accepted = written(['a', ['bc', { [DELETION_MARK]: mark('s1') }], 'd']);
    LiveSuggestions.accept(accepted.doc, 's1', 'test');
    expect(runsOf(accepted.body)).toEqual([{ insert: 'ad' }]);
    const rejected = written(['a', ['bc', { [DELETION_MARK]: mark('s1') }], 'd']);
    LiveSuggestions.reject(rejected.doc, 's1', 'test');
    expect(runsOf(rejected.body)).toEqual([{ insert: 'abcd' }]);
  });

  it('accepts a format by dropping its before and rejects one by putting the before back', () => {
    const format = { ...mark('s1'), before: { bold: null, italic: { value: true } } };
    const runs: Run[] = [['bc', { [FORMAT_CHANGE_MARK]: format, bold: { value: true } }]];
    const accepted = written(runs);
    LiveSuggestions.accept(accepted.doc, 's1', 'test');
    expect(runsOf(accepted.body)).toEqual([
      { insert: 'bc', attributes: { bold: { value: true } } },
    ]);
    const rejected = written(runs);
    LiveSuggestions.reject(rejected.doc, 's1', 'test');
    expect(runsOf(rejected.body)).toEqual([
      { insert: 'bc', attributes: { italic: { value: true } } },
    ]);
  });

  it('leaves other suggestions where they are', () => {
    const { doc, body } = written([
      ['ab', { [INSERTION_MARK]: mark('s1') }],
      ['cd', { [INSERTION_MARK]: mark('s2', BEN) }],
    ]);
    LiveSuggestions.reject(doc, 's1', 'test');
    expect(runsOf(body)).toEqual([
      { insert: 'cd', attributes: { [INSERTION_MARK]: mark('s2', BEN) } },
    ]);
  });

  it('keeps a paragraph break on accept and joins it back on reject', () => {
    const paragraphs = () =>
      written(['one '], { runs: ['two'], attributes: { [INSERTION_MARK]: mark('s1') } });
    const accepted = paragraphs();
    LiveSuggestions.accept(accepted.doc, 's1', 'test');
    expect(textOf(accepted.body)).toEqual(['one ', 'two']);
    expect((accepted.body.get(1) as Y.XmlElement).getAttribute(INSERTION_MARK)).toBeUndefined();
    const rejected = paragraphs();
    LiveSuggestions.reject(rejected.doc, 's1', 'test');
    expect(textOf(rejected.body)).toEqual(['one two']);
  });

  it('joins on accepting a join, carrying objects across, and drops the mark on reject', () => {
    const paragraphs = () =>
      written(['one '], {
        runs: ['two'],
        atom: { media: 'm1' },
        attributes: { [DELETION_MARK]: mark('s1') },
      });
    const accepted = paragraphs();
    LiveSuggestions.accept(accepted.doc, 's1', 'test');
    expect(textOf(accepted.body)).toEqual(['one two[picture]']);
    const rejected = paragraphs();
    LiveSuggestions.reject(rejected.doc, 's1', 'test');
    expect(textOf(rejected.body)).toEqual(['one ', 'two[picture]']);
    expect((rejected.body.get(1) as Y.XmlElement).getAttribute(DELETION_MARK)).toBeUndefined();
  });

  it('drops a join’s mark when no paragraph stands before it', () => {
    const { doc, body } = written({ runs: ['only'], attributes: { [DELETION_MARK]: mark('s1') } });
    LiveSuggestions.accept(doc, 's1', 'test');
    expect(textOf(body)).toEqual(['only']);
    expect((body.get(0) as Y.XmlElement).getAttribute(DELETION_MARK)).toBeUndefined();
  });

  it('puts a paragraph’s style, formatting and list back on rejecting its paragraph format', () => {
    const before = { style: 'Normal', props: null, list: null };
    const { doc, body } = written({
      runs: ['text'],
      attributes: {
        style: 'Heading1',
        props: { align: 'center' },
        [PARAGRAPH_FORMAT_CHANGE]: { ...mark('s1'), before },
      },
    });
    LiveSuggestions.reject(doc, 's1', 'test');
    expect((body.get(0) as Y.XmlElement).getAttributes()).toEqual({ style: 'Normal' });
  });

  it('removes an inserted object on reject and a deleted block on accept', () => {
    const { doc, body } = written({
      runs: ['a'],
      atom: { media: 'm1', [INSERTION_MARK]: mark('s1') },
    });
    const table = new Y.XmlElement('table');
    table.setAttribute(DELETION_MARK, mark('s2') as unknown as string);
    body.push([table]);
    LiveSuggestions.reject(doc, 's1', 'test');
    LiveSuggestions.accept(doc, 's2', 'test');
    expect(textOf(body)).toEqual(['a']);
  });

  it('answers false for a suggestion the document does not hold, changing nothing', () => {
    const { doc, body } = written(['abc']);
    expect(LiveSuggestions.accept(doc, 'gone', 'test')).toBe(false);
    expect(LiveSuggestions.reject(doc, 'gone', 'test')).toBe(false);
    expect(textOf(body)).toEqual(['abc']);
  });

  it('is one undo step', () => {
    const { doc, body } = written(['one '], {
      runs: [['two', { [INSERTION_MARK]: mark('s1') }]],
      attributes: { [INSERTION_MARK]: mark('s1') },
    });
    const undo = new Y.UndoManager(body, { trackedOrigins: new Set(['review']) });
    LiveSuggestions.reject(doc, 's1', 'review');
    expect(textOf(body)).toEqual(['one ']);
    undo.undo();
    expect(textOf(body)).toEqual(['one ', 'two']);
  });
});

describe('LiveSuggestions.ownRejected', () => {
  it('reads the writing as before the person’s own insertions, deletions and formats', () => {
    const plain = written(['The fox']);
    const suggested = written([
      'The ',
      ['quick ', { [INSERTION_MARK]: mark('s1') }],
      ['f', { [DELETION_MARK]: mark('s2') }],
      [
        'o',
        { [FORMAT_CHANGE_MARK]: { ...mark('s3'), before: { bold: null } }, bold: { value: true } },
      ],
      'x',
    ]);
    expect(LiveSuggestions.ownRejected(suggested.body, ADA.key)).toBe(
      LiveSuggestions.ownRejected(plain.body, ADA.key),
    );
  });

  it('keeps everyone else’s suggestions in what it reads', () => {
    const plain = written(['The fox']);
    const others = written(['The ', ['quick ', { [INSERTION_MARK]: mark('s1', BEN) }], 'fox']);
    expect(LiveSuggestions.ownRejected(others.body, ADA.key)).not.toBe(
      LiveSuggestions.ownRejected(plain.body, ADA.key),
    );
  });

  it('reads the person’s own paragraph break joined, and a split’s moved text as the text it is', () => {
    const plain = written(['one two']);
    const split = written(['one '], {
      runs: ['two'],
      attributes: { [INSERTION_MARK]: mark('s1') },
    });
    expect(LiveSuggestions.ownRejected(split.body, ADA.key)).toBe(
      LiveSuggestions.ownRejected(plain.body, ADA.key),
    );
  });

  it('reads the person’s own join, paragraph format and objects as before them', () => {
    const plain = written(['one'], { runs: ['two'], attributes: { style: 'Normal' } });
    const suggested = written(['one'], {
      runs: ['two'],
      atom: { media: 'm1', [INSERTION_MARK]: mark('s1') },
      attributes: {
        style: 'Title',
        [DELETION_MARK]: mark('s2'),
        [PARAGRAPH_FORMAT_CHANGE]: {
          ...mark('s3'),
          before: { style: 'Normal', props: null, list: null },
        },
      },
    });
    expect(LiveSuggestions.ownRejected(suggested.body, ADA.key)).toBe(
      LiveSuggestions.ownRejected(plain.body, ADA.key),
    );
  });
});

describe('isWellFormedMark', () => {
  it('asks for an id within its length, a time, and an author with a key, a name and a colour', () => {
    expect(isWellFormedMark(mark('s1'))).toBe(true);
    expect(isWellFormedMark(mark('s'.repeat(SUGGESTION_ID_MAX + 1)))).toBe(false);
    expect(isWellFormedMark({ ...mark('s1'), at: Number.NaN })).toBe(false);
    expect(isWellFormedMark({ ...mark('s1'), author: { name: 'Ada', colour: '#000' } })).toBe(
      false,
    );
    expect(isWellFormedMark({ ...mark('s1'), author: { ...ADA, name: 'a'.repeat(101) } })).toBe(
      false,
    );
    expect(isWellFormedMark({ ...mark('s1'), before: 'bold' })).toBe(false);
  });
});
