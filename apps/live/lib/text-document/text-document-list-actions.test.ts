// @vitest-environment jsdom
// docs/specs/034-text-documents/lists.md: the list buttons, Format > Bullets & numbering and ⌘⌥Enter.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { ListDefinition, type ListPlace } from '@livedoc/text-documents';
import { track } from '@/lib/telemetry';
import { textDocumentSchema as schema } from './text-document-schema';
import {
  listKeysPlugin,
  textDocumentListActions,
  TOGGLE_CHECKBOX,
} from './text-document-list-actions';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect = () => new DOMRect();

let view: EditorView;
let lists: Record<string, ListDefinition>;
const startStep = vi.fn();
beforeEach(() => {
  lists = {};
  const doc = schema.node('doc', null, [schema.nodes.paragraph!.create(null, schema.text('Milk'))]);
  view = new EditorView(document.body.appendChild(document.createElement('div')), {
    state: EditorState.create({
      doc,
      selection: TextSelection.create(doc, 2),
      plugins: [listKeysPlugin()],
    }),
  });
  vi.mocked(track).mockClear();
});
afterEach(() => view.destroy());

const bind = (canEdit = true) =>
  textDocumentListActions(
    view,
    { read: () => lists, add: (id, list) => (lists[id] = list), startStep },
    { canEdit },
  );
const place = () => (view.state.doc.firstChild!.attrs as { list: ListPlace | null }).list;

describe('textDocumentListActions', () => {
  it('binds nothing for a session that does not write', () => {
    expect(bind(false)).toEqual({ actions: {}, stepLevel: null });
  });

  it('makes a checklist on one undo step, reads it pressed, ticks it with ⌘⌥Enter, counts both', () => {
    const { actions } = bind();
    actions.checklist!.run();
    expect(startStep).toHaveBeenCalled();
    expect(place()).toEqual({ id: 'L1', level: 0 });
    expect(lists.L1).toEqual(ListDefinition.of('check'));
    expect(actions.checklist!.checked).toBe(true);
    expect(actions['bulleted-list']!.checked).toBe(false);
    expect(view.hasFocus()).toBe(true);
    actions[TOGGLE_CHECKBOX]!.run();
    expect(place()!.checked).toBe(true);
    expect(track).toHaveBeenCalledWith('Element', 'Changed', 'TextDocumentListChecklist');
    expect(track).toHaveBeenCalledWith('Element', 'Changed', 'TextDocumentChecklistTicked');
  });

  it('moves an item a level for Increase indent, and declines outside a list', () => {
    const { actions, stepLevel } = bind();
    expect(stepLevel!(1)).toBe(false);
    actions['numbered-list']!.run();
    expect(stepLevel!(1)).toBe(true);
    expect(place()!.level).toBe(1);
  });

  it('gives Enter its meaning in an item only while the writing takes edits', () => {
    bind().actions['bulleted-list']!.run();
    const enter = () =>
      view.dom.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
      );
    enter();
    expect(view.state.doc.childCount).toBe(2);
    view.setProps({ editable: () => false });
    enter();
    expect(view.state.doc.childCount).toBe(2);
  });

  it('does nothing once the editor is gone', () => {
    const { actions, stepLevel } = bind();
    view.destroy();
    actions['bulleted-list']!.run();
    expect(stepLevel!(1)).toBe(false);
    expect(actions['bulleted-list']!.checked).toBe(false);
    expect(track).not.toHaveBeenCalled();
    view = new EditorView(document.createElement('div'), { state: view.state });
  });
});
