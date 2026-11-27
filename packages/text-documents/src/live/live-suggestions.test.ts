// docs/specs/034-text-documents/review.md "How a suggestion is kept": suggestions kept in the writing as marks on text,
// objects, paragraphs and blocks; a suggestion every part with one id; accepted and rejected in one change; the writing
// read with one person's suggestions rejected.
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { Paragraph, type Block } from '../model/blocks';
import type { Table } from '../model/tables';
import { TextDocument } from '../model/text-document';
import { writeLiveDocument } from './live-write';
import { readLiveDocument } from './live-read';
import { liveGalleryImages } from './live-media';
import { MEDIA_MAP } from './live-names';
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

  it('reads a picture showing a drawing as a drawing, in a replacement’s two parts', () => {
    const { doc } = written({
      runs: ['one'],
      atom: { media: 'm1', drawing: 'd-old', [DELETION_MARK]: mark('s1') },
    });
    const paragraph = doc.getXmlFragment('body').get(0) as Y.XmlElement;
    const picture = new Y.XmlElement('picture');
    picture.setAttribute('media', 'm2');
    picture.setAttribute('drawing', 'd-new');
    picture.setAttribute(INSERTION_MARK, mark('s1') as unknown as string);
    paragraph.push([picture]);
    expect(LiveSuggestions.read(doc)[0]!.parts).toEqual([
      { kind: 'deletion', text: 'picture', element: 'drawing' },
      { kind: 'insertion', text: 'picture', element: 'drawing' },
    ]);
  });

  // review.md "Drawings": a rejected drawing's PNG is named by nothing, so its push drops the reference and the daily
  // image sweep (images.md "Retention") reclaims it; one another picture still shows stays referenced, never swept.
  it('drops a rejected drawing’s gallery image from the references, keeping one another picture shows', () => {
    const { doc } = written({
      runs: ['one'],
      atom: { media: 'kept', drawing: 'd-old', [DELETION_MARK]: mark('s1') },
    });
    const paragraph = doc.getXmlFragment('body').get(0) as Y.XmlElement;
    for (const [media, drawing, id] of [
      ['copy', 'd-copy', 's1'],
      ['shared', 'd-other', 's2'],
    ] as const) {
      const picture = new Y.XmlElement('picture');
      picture.setAttribute('media', media);
      picture.setAttribute('drawing', drawing);
      picture.setAttribute(INSERTION_MARK, mark(id) as unknown as string);
      paragraph.push([picture]);
    }
    const plain = new Y.XmlElement('picture');
    plain.setAttribute('media', 'shared-plain');
    paragraph.push([plain]);
    const media = doc.getMap<unknown>(MEDIA_MAP);
    media.set('kept', { mediaType: 'image/png', image: 'img-old' });
    media.set('copy', { mediaType: 'image/png', image: 'img-copy' });
    // The same bytes deduplicated: one gallery image behind two pictures.
    media.set('shared', { mediaType: 'image/png', image: 'img-shared' });
    media.set('shared-plain', { mediaType: 'image/png', image: 'img-shared' });
    expect(liveGalleryImages(doc).sort()).toEqual(['img-copy', 'img-old', 'img-shared']);
    expect(LiveSuggestions.reject(doc, 's1', 'test')).toBe(true);
    expect(LiveSuggestions.reject(doc, 's2', 'test')).toBe(true);
    expect(liveGalleryImages(doc).sort()).toEqual(['img-old', 'img-shared']);
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

  it('names a break’s kind: a page break, a column break, a horizontal line, else none', () => {
    const { doc } = written(
      ['one'],
      {
        runs: ['two'],
        attributes: { [INSERTION_MARK]: mark('s1'), props: { pageBreakBefore: true } },
      },
      {
        runs: ['three'],
        attributes: { [INSERTION_MARK]: mark('s2'), props: { columnBreakBefore: true } },
      },
      {
        runs: [],
        attributes: { [INSERTION_MARK]: mark('s3'), props: { borders: { bottom: { width: 1 } } } },
      },
      {
        runs: ['four'],
        attributes: { [INSERTION_MARK]: mark('s4'), props: { borders: { bottom: { width: 1 } } } },
      },
    );
    expect(LiveSuggestions.read(doc).map((s) => s.parts[0]!.breakKind)).toEqual([
      'page',
      'column',
      'horizontal-line',
      undefined,
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

  it('drops a join’s mark when no paragraph stands before it, even an empty one', () => {
    const empty = written({ runs: [], attributes: { [DELETION_MARK]: mark('s1') } }, ['text']);
    LiveSuggestions.accept(empty.doc, 's1', 'test');
    expect(textOf(empty.body)).toEqual(['', 'text']);
    const { doc, body } = written({ runs: ['only'], attributes: { [DELETION_MARK]: mark('s1') } });
    LiveSuggestions.accept(doc, 's1', 'test');
    expect(textOf(body)).toEqual(['only']);
    expect((body.get(0) as Y.XmlElement).getAttribute(DELETION_MARK)).toBeUndefined();
  });

  it('removes a first paragraph’s rejected break with its paragraph when nothing of it is left', () => {
    const line = { [INSERTION_MARK]: mark('s1'), props: { borders: { bottom: { width: 1 } } } };
    const followed = written({ runs: [], attributes: line }, ['text']);
    LiveSuggestions.reject(followed.doc, 's1', 'test');
    expect(textOf(followed.body)).toEqual(['text']);
    const typed = written({ runs: [['new', { [INSERTION_MARK]: mark('s1') }]], attributes: line }, [
      'text',
    ]);
    LiveSuggestions.reject(typed.doc, 's1', 'test');
    expect(textOf(typed.body)).toEqual(['text']);
  });

  it('keeps a first paragraph whose rejected break leaves text, or that nothing follows', () => {
    const kept = written({ runs: ['old'], attributes: { [INSERTION_MARK]: mark('s1') } }, ['text']);
    LiveSuggestions.reject(kept.doc, 's1', 'test');
    expect(textOf(kept.body)).toEqual(['old', 'text']);
    const alone = written({ runs: [], attributes: { [INSERTION_MARK]: mark('s1') } });
    LiveSuggestions.reject(alone.doc, 's1', 'test');
    expect(textOf(alone.body)).toEqual(['']);
    expect((alone.body.get(0) as Y.XmlElement).getAttribute(INSERTION_MARK)).toBeUndefined();
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

  it('reads the person’s own first paragraph, empty once rejected, as gone, as rejecting it leaves it', () => {
    const plain = written(['text']);
    const line = written(
      {
        runs: [],
        attributes: { [INSERTION_MARK]: mark('s1'), props: { borders: { bottom: { width: 1 } } } },
      },
      ['text'],
    );
    expect(LiveSuggestions.ownRejected(line.body, ADA.key)).toBe(
      LiveSuggestions.ownRejected(plain.body, ADA.key),
    );
    const others = written({ runs: [], attributes: { [INSERTION_MARK]: mark('s1', BEN) } }, [
      'text',
    ]);
    expect(LiveSuggestions.ownRejected(others.body, ADA.key)).not.toBe(
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

// review.md "Reviewing suggestions": Accept all and Reject all settle every suggestion as one change; a Participant's
// Reject all mine only their own; a preview reads a settled copy, the document untouched.
describe('LiveSuggestions.settleAll', () => {
  const mixed = () =>
    written([
      'A ',
      ['new', { [INSERTION_MARK]: mark('s1') }],
      ' ',
      ['old', { [DELETION_MARK]: mark('s2', BEN) }],
      ' ',
      ['his', { [INSERTION_MARK]: mark('s3', BEN) }],
    ]);

  it('accepts every suggestion in one change, and says how many', () => {
    const { doc, body } = mixed();
    let updates = 0;
    doc.on('update', () => (updates += 1));
    expect(LiveSuggestions.settleAll(doc, true, null)).toBe(3);
    expect(updates).toBe(1);
    expect(textOf(body)).toEqual(['A new  his']);
    expect(LiveSuggestions.count(doc)).toBe(0);
  });

  it('rejects every suggestion, or only one person’s', () => {
    const all = mixed();
    expect(LiveSuggestions.settleAll(all.doc, false, null)).toBe(3);
    expect(textOf(all.body)).toEqual(['A  old ']);
    const bens = mixed();
    expect(LiveSuggestions.settleAll(bens.doc, false, null, { only: BEN.key })).toBe(2);
    expect(textOf(bens.body)).toEqual(['A new old ']);
    expect(LiveSuggestions.read(bens.doc).map((s) => s.id)).toEqual(['s1']);
  });

  it('makes no change when there is nothing to settle', () => {
    const { doc } = written(['plain']);
    let updates = 0;
    doc.on('update', () => (updates += 1));
    expect(LiveSuggestions.settleAll(doc, true, null)).toBe(0);
    expect(updates).toBe(0);
  });

  it('reads a settled copy, the document untouched', () => {
    const { doc, body } = mixed();
    const accepted = LiveSuggestions.settledCopy(doc, true);
    const rejected = LiveSuggestions.settledCopy(doc, false);
    expect(textOf(accepted.getXmlFragment('body'))).toEqual(['A new  his']);
    expect(textOf(rejected.getXmlFragment('body'))).toEqual(['A  old ']);
    expect(LiveSuggestions.count(doc)).toBe(3);
    expect(textOf(body)).toEqual(['A new old his']);
  });
});

describe('LiveSuggestions joining past a block', () => {
  // review.md "How a suggestion is kept": a join joins its paragraph to the one before, past any block the same
  // settling takes away.
  const fileMark = { id: 'j', at: 1, author: { name: 'File' } };
  const paragraph = (text: string, suggested?: object): Paragraph => ({
    type: 'paragraph',
    style: 'P',
    props: {},
    inlines: [{ type: 'run', text, props: {} }],
    ...(suggested ? { suggested } : {}),
  });
  const table: Table = {
    type: 'table',
    columns: [100],
    rows: [{ cells: [{ blocks: [paragraph('cell')], props: {} }] }],
    headerRows: 0,
    suggested: { deletion: fileMark },
  };

  it('joins into the paragraph before a table its acceptance deletes', () => {
    const live = new Y.Doc();
    writeLiveDocument(live, {
      ...TextDocument.blank(),
      body: [paragraph('a'), table, paragraph('b', { join: fileMark })],
    });
    LiveSuggestions.accept(live, 'j', null);
    const body = readLiveDocument(live, 'odf').body;
    expect(body.map((b) => (b.type === 'paragraph' ? Paragraph.text(b) : b.type))).toEqual(['ab']);
  });

  it('takes away a paragraph after a table when its rejected break or accepted join leaves nothing', () => {
    const kept = { ...table, suggested: {} };
    const inserted = (text: string): Paragraph => ({
      ...paragraph('', { break: fileMark }),
      inlines: [{ type: 'run', text, props: {}, suggested: { insertion: fileMark } }],
    });
    const deleted = (text: string): Paragraph => ({
      ...paragraph('', { join: fileMark }),
      inlines: [{ type: 'run', text, props: {}, suggested: { deletion: fileMark } }],
    });
    const settledText = (body: Block[], accept: boolean) => {
      const live = new Y.Doc();
      writeLiveDocument(live, { ...TextDocument.blank(), body });
      if (accept) LiveSuggestions.accept(live, 'j', null);
      else LiveSuggestions.reject(live, 'j', null);
      return readLiveDocument(live, 'odf').body.map((b) =>
        b.type === 'paragraph' ? Paragraph.text(b) : b.type,
      );
    };
    expect(settledText([paragraph('a'), kept, inserted('new'), paragraph('z')], false)).toEqual([
      'a',
      'table',
      'z',
    ]);
    expect(settledText([paragraph('a'), kept, deleted('old'), paragraph('z')], true)).toEqual([
      'a',
      'table',
      'z',
    ]);
    expect(settledText([paragraph('a'), kept, deleted('old')], true)).toEqual(['a', 'table', '']);
  });

  it('keeps the paragraph when the table before it stays', () => {
    const live = new Y.Doc();
    writeLiveDocument(live, {
      ...TextDocument.blank(),
      body: [paragraph('a'), { ...table, suggested: {} }, paragraph('b', { join: fileMark })],
    });
    LiveSuggestions.accept(live, 'j', null);
    const body = readLiveDocument(live, 'odf').body;
    expect(body.map((b) => (b.type === 'paragraph' ? Paragraph.text(b) : b.type))).toEqual([
      'a',
      'table',
      'b',
    ]);
  });
});
