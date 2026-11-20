// @vitest-environment jsdom
// docs/specs/034-text-documents/text-and-paragraphs.md "Typing aids": the aids on by default as Google has them (but
// Markdown), kept as what differs from Google's, read back checked; and the aids acting as a person types, each an
// undo step of its own, never on a paste.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { ListDefinition, Styles } from '@livedoc/text-documents';
import { textDocumentSchema as schema } from './text-document-schema';
import {
  DEFAULT_SUBSTITUTIONS,
  readTypingAids,
  saveTypingAids,
  SUBSTITUTIONS_OWN_MAX,
  TypingAids,
  isKeepable,
} from './text-document-typing-aids';
import { typingAidsPlugin } from './text-document-typing-aids-plugin';
import { readUserPreferences } from '@/lib/user-preferences';

// jsdom lays nothing out: the selection scrolled into view has no rectangles.
Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect = () => new DOMRect();

const undoSteps = vi.hoisted(() => ({ count: 0 }));
vi.mock('./text-document-undo', () => ({
  startUndoStep: () => {
    undoSteps.count += 1;
  },
}));

describe('TypingAids', () => {
  it("is Google's by default: every aid on but Markdown, every substitution on", () => {
    const aids = TypingAids.defaults();
    expect(aids).toMatchObject({
      capitalise: true,
      smartQuotes: true,
      links: true,
      lists: true,
      markdown: false,
      substitution: true,
    });
    expect(aids.pairs).toHaveLength(DEFAULT_SUBSTITUTIONS.length);
    expect(TypingAids.stored(aids)).toEqual({});
    expect(TypingAids.ownCount(aids)).toBe(0);
  });

  it('keeps only what differs, and reads it back', () => {
    const base = TypingAids.defaults();
    const aids: TypingAids = {
      ...base,
      capitalise: false,
      markdown: true,
      substitution: false,
      pairs: [
        { replace: 'brb', with: 'be right back', on: true },
        { replace: '(c)', with: '(C)', on: true },
        ...base.pairs
          .filter((p) => p.replace !== '(c)' && p.replace !== '1/2')
          .map((p) => (p.replace === '--' ? { ...p, on: false } : p)),
      ],
    };
    const stored = TypingAids.stored(aids);
    expect(stored).toEqual({
      off: ['capitalise'],
      on: ['markdown'],
      substitution: false,
      defaultsOff: ['--'],
      defaultsRemoved: ['(c)', '1/2'],
      own: [
        ['brb', 'be right back', true],
        ['(c)', '(C)', true],
      ],
    });
    expect(TypingAids.parse(JSON.parse(JSON.stringify(stored)))).toEqual(aids);
    expect(TypingAids.ownCount(aids)).toBe(2);
    expect(TypingAids.active(aids)).toEqual([]);
  });

  it("reads anything unreadable as Google's, and drops pairs it may not keep", () => {
    expect(TypingAids.parse(null)).toEqual(TypingAids.defaults());
    expect(TypingAids.parse([1])).toEqual(TypingAids.defaults());
    const parsed = TypingAids.parse({
      off: ['nope', 'links'],
      own: [
        ['a b', 'x', true],
        ['', 'x', true],
        ['ok', 'fine', true],
        'bad',
        ['x'.repeat(21), 'y', true],
      ],
    });
    expect(parsed.links).toBe(false);
    expect(parsed.pairs[0]).toEqual({ replace: 'ok', with: 'fine', on: true });
    expect(parsed.pairs).toHaveLength(DEFAULT_SUBSTITUTIONS.length + 1);
    const many = TypingAids.parse({
      own: Array.from({ length: SUBSTITUTIONS_OWN_MAX + 5 }, (_, i) => [`k${i}`, 'v', true]),
    });
    expect(TypingAids.ownCount(many)).toBe(SUBSTITUTIONS_OWN_MAX);
  });

  it('keeps a pair only with both sides, no space in its Replace, within their lengths', () => {
    expect(isKeepable('brb', 'be right back')).toBe(true);
    expect([isKeepable(' ', 'x'), isKeepable('a', ''), isKeepable('a b', 'x')]).toEqual([
      false,
      false,
      false,
    ]);
    expect(isKeepable('a', 'x'.repeat(101))).toBe(false);
  });

  it('is kept in the person’s preferences', () => {
    saveTypingAids({ ...TypingAids.defaults(), links: false }, null);
    expect(readUserPreferences().textDocumentTypingAids).toEqual({ off: ['links'] });
    expect(readTypingAids().links).toBe(false);
    saveTypingAids(TypingAids.defaults(), null);
    expect(readUserPreferences().textDocumentTypingAids).toBeUndefined();
  });
});

const views: EditorView[] = [];
afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
  undoSteps.count = 0;
});

function writing(text = '', aids: Partial<TypingAids> = {}, attrs: Record<string, unknown> = {}) {
  const lists: Record<string, ListDefinition> = {};
  const view = new EditorView(document.body.appendChild(document.createElement('div')), {
    state: EditorState.create({
      doc: schema.node('doc', null, [
        schema.nodes.paragraph!.create(attrs, text ? schema.text(text) : undefined),
      ]),
      plugins: [
        typingAidsPlugin({
          read: () => ({ ...TypingAids.defaults(), ...aids }),
          lists: { read: () => lists, set: (id, list) => (lists[id] = list) },
          readStyles: () => Styles.builtIn('odf'),
        }),
      ],
    }),
  });
  view.dispatch(view.state.tr.setSelection(TextSelection.atEnd(view.state.doc)));
  views.push(view);
  return { view, lists };
}

/** Types as the browser does: each character offered to the editor's text input handlers, else inserted. */
function type(view: EditorView, text: string) {
  for (const char of text) {
    const { from, to } = view.state.selection;
    const handled = view.someProp('handleTextInput', (f) =>
      f(view, from, to, char, () => view.state.tr),
    );
    if (!handled) view.dispatch(view.state.tr.insertText(char, from, to));
  }
}
const textOf = (view: EditorView) => view.state.doc.textContent;

describe('typingAidsPlugin', () => {
  it('makes quotes curly, as a step after the typing', () => {
    const { view } = writing();
    type(view, `"it's"`);
    expect(textOf(view)).toBe('“it’s”');
    expect(undoSteps.count).toBe(6);
  });

  it('substitutes, links and capitalises as a word ends with a space', () => {
    const { view } = writing();
    type(view, 'see (c) www.example.com and i ');
    expect(textOf(view)).toBe('See © www.example.com and I ');
    const linked = view.state.doc.firstChild!.child(1);
    expect(linked.text).toBe('www.example.com');
    expect(linked.marks[0]!.attrs.href).toBe('https://www.example.com');
  });

  it('runs the word aids before Enter splits the paragraph', () => {
    const { view } = writing('hello');
    const enter = new KeyboardEvent('keydown', { key: 'Enter' });
    expect(view.someProp('handleKeyDown', (f) => f(view, enter))).toBeFalsy();
    expect(textOf(view)).toBe('Hello');
    const shifted = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true });
    view.someProp('handleKeyDown', (f) => f(view, shifted));
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 3)));
    view.someProp('handleKeyDown', (f) => f(view, enter));
    expect(textOf(view)).toBe('Hello');
  });

  it('makes a list of a typed marker at the paragraph start', () => {
    const { view, lists } = writing();
    type(view, 'iv. ');
    expect(textOf(view)).toBe('');
    expect(view.state.doc.firstChild!.attrs.list).toEqual({ id: 'L1', level: 0, restart: 4 });
    expect(lists.L1!.levels[0]).toMatchObject({
      kind: 'number',
      format: 'lower-roman',
    });
    const bullet = writing();
    type(bullet.view, '- x');
    expect(textOf(bullet.view)).toBe('x');
    expect(bullet.lists.L1).toEqual(ListDefinition.of('bullet'));
  });

  it('leaves a marker in a list, or past the start, as typed', () => {
    const inList = writing('', {}, { list: { id: 'L9', level: 0 } });
    type(inList.view, '- ');
    expect(textOf(inList.view)).toBe('- ');
    const later = writing('So');
    type(later.view, ' - ');
    expect(textOf(later.view)).toBe('So - ');
  });

  it('reads Markdown as it is typed, when it is on', () => {
    const { view } = writing('', { markdown: true });
    type(view, '## Plan');
    expect(view.state.doc.firstChild!.attrs.style).toBe('Heading_20_2');
    expect(textOf(view)).toBe('Plan');
    type(view, ' **now** _soon_ ~~never~~ [x](https://a.example)');
    expect(textOf(view)).toBe('Plan now soon never x');
    const marks = (word: string) => {
      let found: string[] = [];
      view.state.doc.descendants((node) => {
        if (node.isText && node.text === word) found = node.marks.map((m) => m.type.name);
      });
      return found;
    };
    expect([marks('now'), marks('soon'), marks('never'), marks('x')]).toEqual([
      ['bold'],
      ['italic'],
      ['strike'],
      ['link'],
    ]);
  });

  it('leaves Markdown as typed while it is off, or a heading the document lacks', () => {
    const off = writing();
    type(off.view, '# **x**');
    expect(textOf(off.view)).toBe('# **x**');
    const view = new EditorView(document.body.appendChild(document.createElement('div')), {
      state: EditorState.create({
        doc: schema.node('doc', null, [schema.nodes.paragraph!.create()]),
        plugins: [
          typingAidsPlugin({
            read: () => ({ ...TypingAids.defaults(), markdown: true }),
            lists: { read: () => ({}), set: () => {} },
          }),
        ],
      }),
    });
    views.push(view);
    type(view, '# a');
    expect(textOf(view)).toBe('# a');
  });

  it('acts on nothing with its aids off, and leaves other characters to the browser', () => {
    const { view } = writing('', {
      capitalise: false,
      smartQuotes: false,
      links: false,
      lists: false,
      substitution: false,
    });
    type(view, `"hello" (c) www.a.com 1. `);
    expect(textOf(view)).toBe(`"hello" (c) www.a.com 1. `);
    expect(
      view.someProp('handleTextInput', (f) => f(view, 1, 1, 'ab', () => view.state.tr)),
    ).toBeFalsy();
  });
});
