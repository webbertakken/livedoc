// @vitest-environment jsdom
// docs/specs/034-text-documents/lists.md "Levels", "Checklists": items drawn at their level with their marker.
import { afterEach, describe, expect, it } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import {
  ListDefinition,
  ListPresets,
  type ListPlace,
  type ParagraphProps,
} from '@livedoc/text-documents';
import { textDocumentSchema as schema } from './text-document-schema';
import { listMarkersPlugin, TICKED_INK } from './text-document-list-markers';

const p = (text: string, list: ListPlace | null, props: ParagraphProps | null = null) =>
  schema.nodes.paragraph!.create({ list, props }, schema.text(text));

// jsdom finds no place under the pointer.
document.elementFromPoint = () => null;

let view: EditorView | null = null;
afterEach(() => view?.destroy());

function mount(
  paragraphs: ReturnType<typeof p>[],
  lists: Record<string, ListDefinition>,
  editable = true,
) {
  const listeners = new Set<() => void>();
  view = new EditorView(document.body.appendChild(document.createElement('div')), {
    state: EditorState.create({
      doc: schema.node('doc', null, paragraphs),
      plugins: [
        listMarkersPlugin(
          () => lists,
          (l) => {
            listeners.add(l);
            return () => listeners.delete(l);
          },
        ),
      ],
    }),
    editable: () => editable,
  });
  return { view, notify: () => listeners.forEach((l) => l()) };
}
const markers = (v: EditorView) =>
  [...v.dom.querySelectorAll('.text-document-list-marker')].map((m) => m.textContent);

describe('listMarkersPlugin', () => {
  it('draws each item at its level with its marker, which is no text of the writing', () => {
    const { view: v } = mount(
      [
        p('one', { id: 'N', level: 0 }),
        p('sub', { id: 'N', level: 1 }),
        p('two', { id: 'N', level: 0 }),
        p('plain', null),
      ],
      { N: ListDefinition.of('number') },
    );
    expect(markers(v)).toEqual(['1.', 'a.', '2.']);
    const [first, second, , plain] = [...v.dom.querySelectorAll('p')];
    expect(first!.style.getPropertyValue('--text-document-indent-start')).toBe('36pt');
    expect(first!.style.textIndent).toBe('-18pt');
    expect(second!.style.getPropertyValue('--text-document-indent-start')).toBe('72pt');
    expect(plain!.getAttribute('data-list-kind')).toBeNull();
    expect(v.state.doc.textContent).toBe('onesubtwoplain');
    expect(v.dom.querySelector('.text-document-list-marker')!.getAttribute('contenteditable')).toBe(
      'false',
    );
  });

  it("lets a paragraph's own indents draw over its level's", () => {
    const { view: v } = mount(
      [p('a', { id: 'B', level: 0 }, { indentStart: 90, indentFirst: 0 })],
      {
        B: ListDefinition.of('bullet'),
      },
    );
    const item = v.dom.querySelector('p')!;
    // Its own, not its level's (36pt).
    expect(item.style.getPropertyValue('--text-document-indent-start')).toBe('90pt');
    expect(item.style.textIndent).toBe('0pt');
    const bullet = v.dom.querySelector('.text-document-list-marker')!;
    expect([bullet.textContent, bullet.getAttribute('aria-label')]).toEqual(['●', 'bullet']);
  });

  it('ticks a checklist item from its box, drawing it struck through and greyed', () => {
    const { view: v } = mount([p('Milk', { id: 'C', level: 0 })], {
      C: ListDefinition.of('check'),
    });
    const box = () => v.dom.querySelector('[role="checkbox"]')!;
    expect([box().getAttribute('aria-checked'), box().getAttribute('aria-label')]).toEqual([
      'false',
      'Milk',
    ]);
    box().dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect((v.state.doc.firstChild!.attrs as { list: ListPlace }).list.checked).toBe(true);
    expect(box().getAttribute('aria-checked')).toBe('true');
    const item = v.dom.querySelector('p')!;
    expect(item.style.textDecorationLine).toBe('line-through');
    expect(item.style.color).toContain('light-dark(rgb(95, 99, 104)');
    expect(TICKED_INK).toBe('#5f6368');
    box().dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect((v.state.doc.firstChild!.attrs as { list: ListPlace }).list.checked).toBeUndefined();
  });

  // lists.md "List styles": a checklist without strikethrough.
  it('draws a ticked item of a checklist without strikethrough as it was', () => {
    const { view: v } = mount([p('Milk', { id: 'C', level: 0, checked: true })], {
      C: ListPresets.byId('checklist-plain')!.list,
    });
    const item = v.dom.querySelector('p')!;
    expect(v.dom.querySelector('[role="checkbox"]')!.getAttribute('aria-checked')).toBe('true');
    expect(item.style.textDecorationLine).toBe('');
    expect(item.style.color).toBe('');
  });

  it('leaves the box inert where the writing is read only', () => {
    const { view: v } = mount(
      [p('Milk', { id: 'C', level: 0 })],
      { C: ListDefinition.of('check') },
      false,
    );
    const box = v.dom.querySelector('[role="checkbox"]')!;
    expect(box.getAttribute('aria-disabled')).toBe('true');
    box.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect((v.state.doc.firstChild!.attrs as { list: ListPlace }).list.checked).toBeUndefined();
  });

  it('draws again when the lists change, with no edit of the writing', () => {
    const lists: Record<string, ListDefinition> = {};
    const { view: v, notify } = mount([p('a', { id: 'L1', level: 0 })], lists);
    expect(markers(v)).toEqual(['●']);
    lists.L1 = ListDefinition.of('number');
    notify();
    expect(markers(v)).toEqual(['1.']);
  });

  // performance.md "A keystroke's frame": an edit of text outside the items keeps them drawn, mapped.
  it('keeps the items through an edit of text outside them, and draws them again for one inside', () => {
    let reads = 0;
    const lists = { L1: ListDefinition.of('number') };
    view = new EditorView(document.body.appendChild(document.createElement('div')), {
      state: EditorState.create({
        doc: schema.node('doc', null, [p('Intro', null), p('a', { id: 'L1', level: 0 })]),
        plugins: [
          listMarkersPlugin(
            () => {
              reads += 1;
              return lists;
            },
            () => () => {},
          ),
        ],
      }),
    });
    const v = view;
    v.dispatch(v.state.tr.insertText('xy', 1));
    expect(reads).toBe(1);
    expect(markers(v)).toEqual(['1.']);
    v.dispatch(v.state.tr.insertText('b', v.state.doc.content.size - 1));
    expect(reads).toBe(2);
  });

  it('ticks the item its box is in after an edit of text before it', () => {
    const { view: v } = mount([p('Intro', null), p('Milk', { id: 'C', level: 0 })], {
      C: ListDefinition.of('check'),
    });
    v.dispatch(v.state.tr.insertText('Some more ', 1));
    v.dom
      .querySelector('[role="checkbox"]')!
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect((v.state.doc.child(1).attrs as { list: ListPlace }).list.checked).toBe(true);
  });
});
