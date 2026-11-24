// docs/specs/034-text-documents/links-and-navigation.md "Links": the addresses kept and refused, the link's whole
// stretch at the caret, what the link editor opens with, applying (in a link, over a selection, at a bare caret, an
// empty Link removing it) as one change, Remove link, LiveDoc document addresses, the card's title, opening, and the
// documents the Link field offers.
import { describe, expect, it, vi } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import type { Node as PmNode } from 'prosemirror-model';
import { textDocumentSchema as schema } from './text-document-schema';
import {
  LINK_ADDRESS_MAX,
  LINK_COLOUR,
  LINK_REFUSED,
  LINK_TOO_LONG,
  applyLink,
  documentAddress,
  documentIdOf,
  linkAddress,
  linkAt,
  linkEditing,
  linkTitle,
  matchingDocuments,
  openLink,
  removeLink,
} from './text-document-links';

const ORIGIN = 'https://docs.nu';
const link = (href: string) => schema.marks.link!.create({ href });
const bold = schema.marks.bold!.create();
const p = (...parts: (string | PmNode)[]) =>
  schema.nodes.paragraph!.create(
    {},
    parts.map((part) => (typeof part === 'string' ? schema.text(part) : part)),
  );
const linked = (text: string, href: string, ...marks: ReturnType<typeof link>[]) =>
  schema.text(text, [...marks, link(href)]);

function stateAt(doc: PmNode, from: number, to = from) {
  return EditorState.create({ doc, selection: TextSelection.create(doc, from, to) });
}

function run(state: EditorState, command: ReturnType<typeof applyLink>) {
  let next = state;
  let steps = 0;
  const done = command(state, (tr) => {
    steps += 1;
    next = state.apply(tr);
  });
  return { done, next, steps };
}

// Each text node of the first paragraph as [text, href | null].
const runs = (state: EditorState, index = 0) => {
  const out: [string, string | null][] = [];
  state.doc.child(index).forEach((node) => {
    const mark = node.marks.find((m) => m.type.name === 'link');
    out.push([node.text ?? '', mark ? (mark.attrs as { href: string }).href : null]);
  });
  return out;
};

describe('linkAddress', () => {
  it('keeps web, email and in-document addresses, a bare domain as https and a bare email as mailto', () => {
    expect(linkAddress('https://example.com/a')).toEqual({ href: 'https://example.com/a' });
    expect(linkAddress('  http://example.com ')).toEqual({ href: 'http://example.com' });
    expect(linkAddress('example.com')).toEqual({ href: 'https://example.com' });
    expect(linkAddress('mailto:ann@example.com')).toEqual({ href: 'mailto:ann@example.com' });
    expect(linkAddress('ann@example.com')).toEqual({ href: 'mailto:ann@example.com' });
    expect(linkAddress('#heading=h.1')).toEqual({ href: '#heading=h.1' });
  });

  it('reads an empty Link as no link', () => {
    expect(linkAddress('   ')).toEqual({ href: '' });
  });

  it('refuses any other scheme and what is no address', () => {
    expect(linkAddress('javascript:alert(1)')).toEqual({ problem: LINK_REFUSED });
    expect(linkAddress('data:text/html,x')).toEqual({ problem: LINK_REFUSED });
    expect(linkAddress('file:///etc/passwd')).toEqual({ problem: LINK_REFUSED });
    expect(linkAddress('two words')).toEqual({ problem: LINK_REFUSED });
    expect(LINK_REFUSED).toBe('Use a web, email or LiveDoc address');
  });

  it('refuses an address past 2,048 characters', () => {
    expect(LINK_ADDRESS_MAX).toBe(2048);
    const long = `https://example.com/${'a'.repeat(LINK_ADDRESS_MAX)}`;
    expect(linkAddress(long)).toEqual({ problem: LINK_TOO_LONG });
    expect(LINK_TOO_LONG).toBe('Use a shorter address');
  });
});

describe('linkAt', () => {
  const doc = schema.node('doc', null, [
    p('see ', linked('the ', 'https://a.test', bold), linked('site', 'https://a.test'), ' now'),
  ]);

  it('is the link’s whole stretch around a caret inside it, across its formatting', () => {
    expect(linkAt(stateAt(doc, 7))).toEqual({ from: 5, to: 13, href: 'https://a.test' });
  });

  it('counts a caret at either edge of the link', () => {
    expect(linkAt(stateAt(doc, 5))?.from).toBe(5);
    expect(linkAt(stateAt(doc, 13))?.to).toBe(13);
  });

  it('is the stretch for a selection inside one link, none for one reaching past it', () => {
    expect(linkAt(stateAt(doc, 6, 10))).toEqual({ from: 5, to: 13, href: 'https://a.test' });
    expect(linkAt(stateAt(doc, 3, 10))).toBeNull();
  });

  it('is none off a link', () => {
    expect(linkAt(stateAt(doc, 2))).toBeNull();
    expect(linkAt(stateAt(doc, 15))).toBeNull();
  });

  it('keeps two neighbouring links of different addresses apart', () => {
    const two = schema.node('doc', null, [
      p(linked('ab', 'https://a.test'), linked('cd', 'https://c.test')),
    ]);
    expect(linkAt(stateAt(two, 4))).toEqual({ from: 3, to: 5, href: 'https://c.test' });
  });
});

describe('linkEditing', () => {
  it('opens with the link’s whole text and address when the caret is in one', () => {
    const doc = schema.node('doc', null, [p('see ', linked('site', 'https://a.test'))]);
    expect(linkEditing(stateAt(doc, 7))).toEqual({
      from: 5,
      to: 9,
      text: 'site',
      href: 'https://a.test',
    });
  });

  it('opens with the selection’s text, or nothing at a bare caret', () => {
    const doc = schema.node('doc', null, [p('see site')]);
    expect(linkEditing(stateAt(doc, 5, 9))).toEqual({ from: 5, to: 9, text: 'site', href: '' });
    expect(linkEditing(stateAt(doc, 3))).toEqual({ from: 3, to: 3, text: '', href: '' });
  });

  it('opens with no Text for a selection across paragraphs', () => {
    const doc = schema.node('doc', null, [p('one'), p('two')]);
    expect(linkEditing(stateAt(doc, 2, 7))).toEqual({ from: 2, to: 7, text: null, href: '' });
  });
});

describe('applyLink', () => {
  it('links a selection to the address in one change, the caret after it', () => {
    const state = stateAt(schema.node('doc', null, [p('see site now')]), 5, 9);
    const { done, next, steps } = run(
      state,
      applyLink({ from: 5, to: 9, text: 'site', href: 'https://a.test' }),
    );
    expect(done).toBe(true);
    expect(steps).toBe(1);
    expect(runs(next)).toEqual([
      ['see ', null],
      ['site', 'https://a.test'],
      [' now', null],
    ]);
    expect(next.selection.from).toBe(9);
    expect(next.selection.empty).toBe(true);
  });

  it('changes the link’s text and address, keeping the first character’s formatting', () => {
    const doc = schema.node('doc', null, [p('see ', linked('site', 'https://a.test', bold))]);
    const { next } = run(
      stateAt(doc, 7),
      applyLink({ from: 5, to: 9, text: 'our page', href: 'https://b.test' }),
    );
    expect(runs(next)).toEqual([
      ['see ', null],
      ['our page', 'https://b.test'],
    ]);
    expect(
      next.doc
        .child(0)
        .child(1)
        .marks.some((m) => m.type.name === 'bold'),
    ).toBe(true);
  });

  it('puts Text in at a bare caret, linked, or the address when Text is empty', () => {
    const doc = schema.node('doc', null, [p('ab')]);
    expect(
      runs(
        run(stateAt(doc, 2), applyLink({ from: 2, to: 2, text: 'X', href: 'https://x.test' })).next,
      ),
    ).toEqual([
      ['a', null],
      ['X', 'https://x.test'],
      ['b', null],
    ]);
    expect(
      runs(
        run(stateAt(doc, 3), applyLink({ from: 3, to: 3, text: '', href: 'https://x.test' })).next,
      ),
    ).toEqual([
      ['ab', null],
      ['https://x.test', 'https://x.test'],
    ]);
  });

  it('keeps a selection’s text when Text is left empty, and links across paragraphs', () => {
    const doc = schema.node('doc', null, [p('one'), p('two')]);
    const { next } = run(
      stateAt(doc, 2, 7),
      applyLink({ from: 2, to: 7, text: null, href: 'https://a.test' }),
    );
    expect(runs(next, 0)).toEqual([
      ['o', null],
      ['ne', 'https://a.test'],
    ]);
    expect(runs(next, 1)).toEqual([
      ['t', 'https://a.test'],
      ['wo', null],
    ]);
  });

  it('removes the link when Link is empty', () => {
    const doc = schema.node('doc', null, [p(linked('site', 'https://a.test'))]);
    expect(
      runs(run(stateAt(doc, 2), applyLink({ from: 1, to: 5, text: 'site', href: '' })).next),
    ).toEqual([['site', null]]);
  });

  it('does nothing at a bare caret with neither Text nor Link', () => {
    const doc = schema.node('doc', null, [p('ab')]);
    expect(run(stateAt(doc, 2), applyLink({ from: 2, to: 2, text: '', href: '' })).done).toBe(
      false,
    );
  });
});

describe('removeLink', () => {
  it('takes the address off the stretch, the text staying', () => {
    const doc = schema.node('doc', null, [p('see ', linked('site', 'https://a.test', bold))]);
    const { next } = run(stateAt(doc, 7), removeLink(5, 9));
    expect(runs(next)).toEqual([
      ['see ', null],
      ['site', null],
    ]);
    expect(next.doc.textContent).toBe('see site');
  });
});

describe('LiveDoc document addresses', () => {
  it('reads the document of an address of this origin, none of another or of shared', () => {
    expect(documentIdOf('https://docs.nu/document/abc', ORIGIN)).toBe('abc');
    expect(documentIdOf('https://docs.nu/document/a%20b/', ORIGIN)).toBe('a b');
    expect(documentIdOf('https://other.test/document/abc', ORIGIN)).toBeNull();
    expect(documentIdOf('https://docs.nu/document/shared?s=x', ORIGIN)).toBeNull();
    expect(documentIdOf('https://docs.nu/explorer', ORIGIN)).toBeNull();
    expect(documentIdOf('mailto:a@b.test', ORIGIN)).toBeNull();
  });

  it('writes a document’s address in full', () => {
    expect(documentAddress('a b', ORIGIN)).toBe('https://docs.nu/document/a%20b');
  });
});

describe('linkTitle', () => {
  const documents = [{ id: 'abc', name: 'Plan', savedAt: 1 }];

  it('names a LiveDoc document of the person’s, else says the address', () => {
    expect(linkTitle('https://docs.nu/document/abc', documents, ORIGIN)).toBe('Plan');
    expect(linkTitle('https://docs.nu/document/zzz', documents, ORIGIN)).toBe(
      'https://docs.nu/document/zzz',
    );
    expect(linkTitle('https://a.test', documents, ORIGIN)).toBe('https://a.test');
    expect(linkTitle('mailto:ann@a.test', documents, ORIGIN)).toBe('ann@a.test');
  });
});

describe('openLink', () => {
  it('opens a web, email or LiveDoc address in a new tab with no opener and no referrer', () => {
    const open = vi.fn();
    expect(openLink('https://a.test', open)).toBe(true);
    expect(open).toHaveBeenCalledWith('https://a.test', '_blank', 'noopener,noreferrer');
  });

  it('never opens another scheme', () => {
    const open = vi.fn();
    expect(openLink('javascript:alert(1)', open)).toBe(false);
    expect(openLink('file:///x', open)).toBe(false);
    expect(open).not.toHaveBeenCalled();
  });
});

describe('matchingDocuments', () => {
  const documents = [
    { id: 'a', name: 'Team plan 2026', savedAt: 1 },
    { id: 'b', name: 'Plan for the team', savedAt: 3 },
    { id: 'c', name: 'Budget', savedAt: 2 },
  ];

  it('offers the documents whose names hold every typed word, newest first', () => {
    expect(matchingDocuments(documents, 'team PLAN').map((d) => d.id)).toEqual(['b', 'a']);
    expect(matchingDocuments(documents, '  ')).toEqual([]);
    expect(matchingDocuments(documents, 'nothing')).toEqual([]);
  });

  it('offers at most 8', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      id: `${i}`,
      name: `Note ${i}`,
      savedAt: i,
    }));
    expect(matchingDocuments(many, 'note')).toHaveLength(8);
    expect(matchingDocuments(many, 'note')[0]!.id).toBe('11');
  });
});

describe('the link look', () => {
  const look = (node: PmNode) => ({
    colour: (
      node.marks.find((m) => m.type.name === 'color')?.attrs as { value?: string } | undefined
    )?.value,
    underlined: node.marks.some((m) => m.type.name === 'underline'),
  });

  it('is Google’s blue, underlined, given to a new link as its own formatting', () => {
    expect(LINK_COLOUR).toBe('#1155cc');
    const { next } = run(
      stateAt(schema.node('doc', null, [p('see site now')]), 5, 9),
      applyLink({ from: 5, to: 9, text: 'site', href: 'https://a.test' }),
    );
    expect(look(next.doc.child(0).child(1))).toEqual({ colour: LINK_COLOUR, underlined: true });
    expect(look(next.doc.child(0).child(0))).toEqual({ colour: undefined, underlined: false });
  });

  it('never carries on into what is typed after the link', () => {
    const { next } = run(
      stateAt(schema.node('doc', null, [p('ab')]), 3),
      applyLink({ from: 3, to: 3, text: 'X', href: 'https://x.test' }),
    );
    const typed = next.apply(next.tr.insertText('y'));
    expect(runs(typed)).toEqual([
      ['ab', null],
      ['X', 'https://x.test'],
      ['y', null],
    ]);
    expect(look(typed.doc.child(0).lastChild!)).toEqual({ colour: undefined, underlined: false });
  });

  it('leaves an edited link’s own formatting as it is', () => {
    const red = schema.marks.color!.create({ value: '#ff0000' });
    const doc = schema.node('doc', null, [p(schema.text('site', [red, link('https://a.test')]))]);
    const { next } = run(
      stateAt(doc, 2),
      applyLink({ from: 1, to: 5, text: 'site', href: 'https://b.test' }),
    );
    expect(look(next.doc.child(0).child(0))).toEqual({ colour: '#ff0000', underlined: false });
  });

  it('is taken off with the link, where the link still has it exactly', () => {
    const looked = [
      schema.marks.color!.create({ value: LINK_COLOUR }),
      schema.marks.underline!.create({ value: true }),
      link('https://a.test'),
    ];
    const doc = schema.node('doc', null, [p(schema.text('site', looked))]);
    const { next } = run(stateAt(doc, 2), removeLink(1, 5));
    expect(next.doc.child(0).child(0).marks).toEqual([]);
    const own = schema.node('doc', null, [
      p(
        schema.text('site', [
          schema.marks.underline!.create({ value: true }),
          link('https://a.test'),
        ]),
      ),
    ]);
    const kept = run(stateAt(own, 2), removeLink(1, 5)).next;
    expect(look(kept.doc.child(0).child(0))).toEqual({ colour: undefined, underlined: true });
  });
});
