// @vitest-environment jsdom
// docs/specs/034-text-documents/lists.md: the list buttons, Format > Bullets & numbering and ⌘⌥Enter.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { ListDefinition, ListPresets, type ListPlace } from '@livedoc/text-documents';
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

const openRestart = vi.fn();
const bind = (canEdit = true) =>
  textDocumentListActions(
    view,
    { read: () => lists, set: (id, list) => (lists[id] = list), startStep },
    { canEdit, openRestart },
  );
const place = () => (view.state.doc.firstChild!.attrs as { list: ListPlace | null }).list;

describe('textDocumentListActions', () => {
  it('binds nothing for a session that does not write', () => {
    expect(bind(false)).toEqual({ actions: {}, choices: {}, stepLevel: null, restart: null });
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

  // lists.md "List styles".
  it('gives each list button a grid of its presets, the one in force checked, each taken as one step', () => {
    const { choices } = bind();
    const numbered = choices['numbered-list']!;
    expect(numbered.grid!.columns).toBe(3);
    expect(numbered.grid!.cells.map((c) => c.label)).toEqual(
      ListPresets.of('number').map((p) => p.name),
    );
    expect(numbered.grid!.cells[2]!.lines.map((l) => [l.level, l.marker])).toEqual([
      [0, '1.'],
      [1, '1.1.'],
      [2, '1.1.1.'],
    ]);
    expect(numbered.read()).toBeNull();
    numbered.actions['list-style-numbered-outline']!.run();
    expect(startStep).toHaveBeenCalled();
    expect(place()).toEqual({ id: 'L1', level: 0 });
    expect(lists.L1).toEqual(ListPresets.byId('numbered-outline')!.list);
    expect(numbered.read()).toBe('list-style-numbered-outline');
    expect(numbered.actions['list-style-numbered-outline']!.checked).toBe(true);
    expect(view.hasFocus()).toBe(true);
    expect(track).toHaveBeenCalledWith('Element', 'Changed', 'TextDocumentListStyleNumbered');
    expect(choices['bulleted-list']!.grid!.cells).toHaveLength(6);
    const checks = choices.checklist!.grid!;
    expect(checks.columns).toBe(2);
    expect(checks.cells.map((c) => c.lines[0])).toEqual([
      { level: 0, marker: '', box: 'ticked', word: { text: 'Done', struck: true } },
      { level: 0, marker: '', box: 'ticked', word: { text: 'Done', struck: false } },
    ]);
  });

  // lists.md "Numbering".
  it('opens Restart numbering at the item, continues numbering, each dimmed where it does not apply', () => {
    const { actions, restart } = bind();
    expect(actions['restart-numbering']!.disabled).toBe(true);
    expect(actions['continue-numbering']!.disabled).toBe(true);
    actions['restart-numbering']!.run();
    expect(openRestart).not.toHaveBeenCalled();
    actions['numbered-list']!.run();
    expect(actions['restart-numbering']!.disabled).toBe(false);
    actions['restart-numbering']!.run();
    expect(openRestart).toHaveBeenCalledWith(1);
    expect(restart!(5)).toBe(true);
    expect(place()).toEqual({ id: 'L1', level: 0, restart: 5 });
    expect(track).toHaveBeenCalledWith('Element', 'Changed', 'TextDocumentListRestart');
    expect(restart!(-2)).toBe(false);
    expect(actions['continue-numbering']!.disabled).toBe(false);
    actions['continue-numbering']!.run();
    expect(place()).toEqual({ id: 'L1', level: 0 });
    expect(track).toHaveBeenCalledWith('Element', 'Changed', 'TextDocumentListContinue');
    expect(actions['continue-numbering']!.disabled).toBe(true);
  });

  it('does nothing once the editor is gone', () => {
    const { actions, stepLevel } = bind();
    view.destroy();
    actions['bulleted-list']!.run();
    expect(stepLevel!(1)).toBe(false);
    expect(actions['bulleted-list']!.checked).toBe(false);
    expect(actions['restart-numbering']!.disabled).toBe(true);
    expect(actions['continue-numbering']!.disabled).toBe(true);
    expect(bind().choices.checklist!.read()).toBeNull();
    expect(track).not.toHaveBeenCalled();
    view = new EditorView(document.createElement('div'), { state: view.state });
  });
});
