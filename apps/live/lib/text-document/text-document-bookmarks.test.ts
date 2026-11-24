// @vitest-environment jsdom
// docs/specs/034-text-documents/links-and-navigation.md "Bookmarks": a bookmark takes no room and draws its ribbon (no
// text copied); Insert > Bookmark at the caret or a selection's start, the caret after it; the bookmark beside a
// caret; where one is; Remove; the link editor's bookmarks named by the text after them; a pasted copy of a bookmark
// whose name is taken left out; the copied address's `#bookmark=<name>`.
import { describe, expect, it } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { Fragment, Slice, type Node as PmNode } from 'prosemirror-model';
import { DOMSerializer } from 'prosemirror-model';
import { textDocumentSchema as schema } from './text-document-schema';
import {
  BOOKMARK_CLASS,
  BOOKMARK_GLYPH_CLASS,
  BOOKMARK_TARGETS_MAX,
  bookmarkAt,
  bookmarkHash,
  bookmarkLabel,
  bookmarkNames,
  bookmarkOfHash,
  bookmarkPosition,
  bookmarkTargets,
  insertBookmark,
  newBookmarkName,
  removeBookmark,
  withoutTakenBookmarks,
} from './text-document-bookmarks';

const mark = (name: string) => schema.nodes.bookmark!.create({ name });
const p = (...parts: (string | PmNode)[]) =>
  schema.nodes.paragraph!.create(
    {},
    parts.map((part) => (typeof part === 'string' ? schema.text(part) : part)),
  );
const stateAt = (doc: PmNode, from: number, to = from) =>
  EditorState.create({ doc, selection: TextSelection.create(doc, from, to) });

function run(state: EditorState, command: ReturnType<typeof insertBookmark>) {
  let next = state;
  const done = command(state, (tr) => (next = state.apply(tr)));
  return { done, next };
}

describe('the bookmark node', () => {
  it('takes no room, copies as no text, and draws its ribbon for screen readers as Bookmark', () => {
    const dom = DOMSerializer.fromSchema(schema).serializeNode(mark('abc'), {
      document,
    }) as HTMLElement;
    expect(dom.className).toBe(BOOKMARK_CLASS);
    expect(dom.getAttribute('contenteditable')).toBe('false');
    expect(dom.dataset.bookmark).toBe('abc');
    const glyph = dom.querySelector(`.${BOOKMARK_GLYPH_CLASS}`)!;
    expect(glyph.getAttribute('role')).toBe('img');
    expect(glyph.getAttribute('aria-label')).toBe('Bookmark');
    expect(schema.node('doc', null, [p('a', mark('x'), 'b')]).textContent).toBe('ab');
  });
});

describe('Insert > Bookmark', () => {
  it('puts a bookmark at the caret, the caret after it', () => {
    const { done, next } = run(
      stateAt(schema.node('doc', null, [p('abcd')]), 3),
      insertBookmark('n1'),
    );
    expect(done).toBe(true);
    expect(bookmarkPosition(next.doc, 'n1')).toBe(3);
    expect(next.selection.from).toBe(4);
  });

  it('puts it at a selection’s start, the text staying', () => {
    const { next } = run(
      stateAt(schema.node('doc', null, [p('abcd')]), 2, 4),
      insertBookmark('n1'),
    );
    expect(bookmarkPosition(next.doc, 'n1')).toBe(2);
    expect(next.doc.textContent).toBe('abcd');
  });

  it('makes a name none of the writing’s holds', () => {
    const doc = schema.node('doc', null, [p(mark('aaaaaaaaaaaa'))]);
    let n = 0;
    const random = () => (n++ < 12 ? 0 : 0.5);
    expect(newBookmarkName(doc, random)).not.toBe('aaaaaaaaaaaa');
    expect(newBookmarkName(doc)).toMatch(/^[a-z][a-z0-9]{11}$/);
  });
});

describe('a bookmark in the writing', () => {
  const doc = schema.node('doc', null, [p('ab', mark('one'), 'Chapter one'), p(mark('two'))]);

  it('is found beside a caret with nothing selected, on either side', () => {
    expect(bookmarkAt(stateAt(doc, 3))).toEqual({ pos: 3, name: 'one' });
    expect(bookmarkAt(stateAt(doc, 4))).toEqual({ pos: 3, name: 'one' });
    expect(bookmarkAt(stateAt(doc, 2))).toBeNull();
    expect(bookmarkAt(stateAt(doc, 3, 5))).toBeNull();
  });

  it('is found by its name, and all names are known', () => {
    expect(bookmarkPosition(doc, 'two')).toBe(17);
    expect(bookmarkPosition(doc, 'gone')).toBeNull();
    expect([...bookmarkNames(doc)]).toEqual(['one', 'two']);
  });

  it('is removed by Remove, the text staying', () => {
    const { next } = run(stateAt(doc, 3), removeBookmark(3));
    expect(bookmarkPosition(next.doc, 'one')).toBeNull();
    expect(next.doc.textContent).toBe('abChapter one');
    expect(removeBookmark(1)(stateAt(doc, 1))).toBe(false);
  });

  it('is offered by the text after it, Bookmark when none, filtered by the typed words', () => {
    expect(bookmarkTargets(doc, '')).toEqual([
      { name: 'one', label: 'Chapter one' },
      { name: 'two', label: 'Bookmark' },
    ]);
    expect(bookmarkTargets(doc, 'CHAPTER')).toEqual([{ name: 'one', label: 'Chapter one' }]);
    expect(bookmarkLabel(doc, 'two')).toBe('Bookmark');
    expect(bookmarkLabel(doc, 'gone')).toBeNull();
  });

  it('offers at most 8, labelled by at most 40 characters', () => {
    const many = schema.node(
      'doc',
      null,
      Array.from({ length: 10 }, (_, i) => p(mark(`m${i}`), `${'x'.repeat(50)}${i}`)),
    );
    const offered = bookmarkTargets(many, '');
    expect(offered).toHaveLength(BOOKMARK_TARGETS_MAX);
    expect(offered[0]!.label).toHaveLength(40);
  });
});

describe('a pasted bookmark', () => {
  it('is left out where its name is taken, kept where it is new', () => {
    const doc = schema.node('doc', null, [p('a', mark('one'))]);
    const slice = new Slice(Fragment.from(p('x', mark('one'), mark('new'))), 1, 1);
    const kept = withoutTakenBookmarks(slice, doc);
    const names: string[] = [];
    kept.content.descendants((node) => {
      if (node.type.name === 'bookmark') names.push(node.attrs.name as string);
    });
    expect(names).toEqual(['new']);
    expect(kept.openStart).toBe(1);
  });
});

describe('a bookmark’s address', () => {
  it('reads back the name its hash carries', () => {
    expect(bookmarkHash('ab c')).toBe('#bookmark=ab%20c');
    expect(bookmarkOfHash(bookmarkHash('ab c'))).toBe('ab c');
    expect(bookmarkOfHash('#heading=h.1')).toBeNull();
    expect(bookmarkOfHash('#bookmark=%E0%A4%A')).toBeNull();
  });
});
