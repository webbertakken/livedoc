// @vitest-environment jsdom
// docs/specs/034-text-documents/links-and-navigation.md "Heading links": a heading's id is the first hidden bookmark
// at its start, before its text; a heading gains one when a link first needs it; the caret in a heading (nothing
// selected) names it; the link editor's headings by their text (Untitled heading when empty), filtered, at most 8, in
// the order written; the copied address's `#heading=<id>`; a link's title is its heading's text.
import { describe, expect, it } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import type { Node as PmNode } from 'prosemirror-model';
import { TextDocument, type Style } from '@livedoc/text-documents';
import { textDocumentSchema as schema } from './text-document-schema';
import {
  HEADING_LABEL_LENGTH,
  HEADING_TARGETS_MAX,
  claimHeadingId,
  giveHeadingId,
  headingAt,
  headingHash,
  headingIdOf,
  headingLabel,
  headingOfHash,
  headingTargets,
  pendingHeadingId,
} from './text-document-heading-links';

const mark = (name: string) => schema.nodes.bookmark!.create({ name });
const para = (level: number | null, ...parts: (string | PmNode)[]) =>
  schema.nodes.paragraph!.create(
    level === null ? {} : { props: { outlineLevel: level } },
    parts.map((part) => (typeof part === 'string' ? schema.text(part) : part)),
  );
const h = (...parts: (string | PmNode)[]) => para(1, ...parts);
const body = (...parts: (string | PmNode)[]) => para(null, ...parts);
const doc = (...blocks: PmNode[]) => schema.node('doc', null, blocks);
const styles: readonly Style[] = [];
const stateAt = (d: PmNode, from: number, to = from) =>
  EditorState.create({ doc: d, selection: TextSelection.create(d, from, to) });

describe('a heading’s id', () => {
  it('is the first hidden bookmark before its text', () => {
    expect(headingIdOf(h(mark('_a'), mark('_b'), 'Title'))).toBe('_a');
    expect(headingIdOf(h(mark('shown'), mark('_b'), 'Title'))).toBe('_b');
  });

  it('is none when the only hidden bookmark comes after text, or there is none', () => {
    expect(headingIdOf(h('Title', mark('_a')))).toBeNull();
    expect(headingIdOf(h('Title'))).toBeNull();
  });

  it('is given at the heading’s start, the caret staying in its text', () => {
    const before = stateAt(doc(h('Title')), 3);
    let after = before;
    const done = giveHeadingId(0, '_new')(before, (tr) => (after = before.apply(tr)));
    expect(done).toBe(true);
    expect(headingIdOf(after.doc.child(0))).toBe('_new');
    expect(after.doc.textContent).toBe('Title');
    expect(after.selection.from).toBe(4);
  });

  it('is never given where no paragraph starts', () => {
    const state = stateAt(doc(h('Title')), 1);
    expect(giveHeadingId(7, '_x')(state)).toBe(false);
  });
});

describe('the heading at the caret', () => {
  it('names a heading the caret is in, with its id and text', () => {
    const d = doc(body('Intro'), h(mark('_a'), 'Title'));
    expect(headingAt(stateAt(d, 10), styles)).toEqual({ pos: 7, id: '_a', text: 'Title' });
  });

  it('names one without an id', () => {
    expect(headingAt(stateAt(doc(h('Title')), 2), styles)).toEqual({
      pos: 0,
      id: null,
      text: 'Title',
    });
  });

  it('is none in body text, or over a selection', () => {
    expect(headingAt(stateAt(doc(body('Intro')), 2), styles)).toBeNull();
    expect(headingAt(stateAt(doc(h('Title')), 1, 3), styles)).toBeNull();
  });

  it('reads the level through the paragraph’s style', () => {
    const d = doc(
      schema.nodes.paragraph!.create({ style: 'Heading_20_2' }, [schema.text('Styled')]),
    );
    const blank = TextDocument.blank({ format: 'odf' }).styles;
    expect(headingAt(stateAt(d, 2), blank)?.text).toBe('Styled');
  });
});

describe('the link editor’s headings', () => {
  it('are offered by their text, Untitled heading when empty, in the order written', () => {
    const d = doc(h(mark('_a'), 'Alpha'), body('x'), h(), h('Beta gamma'));
    expect(headingTargets(d, styles, '')).toEqual([
      { pos: 0, id: '_a', label: 'Alpha' },
      { pos: 11, id: null, label: 'Untitled heading' },
      { pos: 13, id: null, label: 'Beta gamma' },
    ]);
    expect(headingTargets(d, styles, 'GAMMA be').map((t) => t.label)).toEqual(['Beta gamma']);
  });

  it('are at most 8, labelled by at most 40 characters', () => {
    const d = doc(...Array.from({ length: 10 }, () => h('y'.repeat(60))));
    const targets = headingTargets(d, styles, '');
    expect(targets).toHaveLength(HEADING_TARGETS_MAX);
    expect(targets[0]!.label).toHaveLength(HEADING_LABEL_LENGTH);
  });
});

describe('a heading’s address and title', () => {
  it('reads back the id its hash carries', () => {
    expect(headingHash('_a b')).toBe('#heading=_a%20b');
    expect(headingOfHash(headingHash('_heading=h.x'))).toBe('_heading=h.x');
    expect(headingOfHash('#bookmark=x')).toBeNull();
    expect(headingOfHash('#heading=%E0%A4%A')).toBeNull();
  });

  it('is titled by its heading’s text, Google’s ODF form too', () => {
    const d = doc(h(mark('_heading=h.q'), 'Alpha'), body(mark('_z'), 'Body'));
    expect(headingLabel(d, styles, '_heading=h.q')).toBe('Alpha');
    expect(headingLabel(d, styles, 'heading=h.q')).toBe('Alpha');
    expect(headingLabel(d, styles, '_z')).toBeNull();
    expect(headingLabel(d, styles, '_gone')).toBeNull();
  });
});

describe('a heading’s id not yet given', () => {
  it('is offered as the same new name each time, none the writing holds', () => {
    const d = doc(h('Alpha'), h('Beta'));
    const [a, b] = headingTargets(d, styles, '');
    expect(a!.id).toBeNull();
    const pending = pendingHeadingId(d, a!.pos);
    expect(pending).toMatch(/^_[a-z][a-z0-9]{11}$/);
    expect(pendingHeadingId(d, a!.pos)).toBe(pending);
    expect(pendingHeadingId(d, b!.pos)).not.toBe(pending);
  });

  it('is given to its heading when claimed, in the step that links to it', () => {
    const d = doc(body('x'), h('Alpha'));
    const state = stateAt(d, 1);
    const pending = pendingHeadingId(d, 3);
    let after = state;
    expect(claimHeadingId(pending, styles)(state, (tr) => (after = state.apply(tr)))).toBe(true);
    expect(headingIdOf(after.doc.child(1))).toBe(pending);
  });

  it('claims nothing for a name no heading is offered by', () => {
    const state = stateAt(doc(h(mark('_a'), 'Alpha')), 2);
    expect(claimHeadingId('_a', styles)(state)).toBe(false);
    expect(claimHeadingId('_nobody', styles)(state)).toBe(false);
  });
});
