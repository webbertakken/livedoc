// What Format > Bullets & numbering, the toolbar's list buttons and their shortcuts run (docs/specs/034-text-documents/
// lists.md): each acts on the editor there is now, is pressed when the paragraphs are in a list of its kind, gives the
// writing focus back and is counted. Enter, Backspace and Tab in an item are the editor's own keys. Only a session
// that writes gets them.
import { keymap } from 'prosemirror-keymap';
import type { Command, Plugin } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { OfficeAction, OfficeActions } from '@/lib/office/office-catalogue';
import { track } from '@/lib/telemetry';
import { readDomSelection } from './text-document-dom-selection';
import {
  backspaceInList,
  enterInList,
  isListOn,
  stepListLevel,
  tabInList,
  toggleChecked,
  toggleList,
  type ListKind,
  type ListsAccess,
} from './text-document-lists';

export const LIST_ITEMS: readonly { item: string; kind: ListKind; telemetry: string }[] = [
  { item: 'bulleted-list', kind: 'bullet', telemetry: 'Bulleted' },
  { item: 'numbered-list', kind: 'number', telemetry: 'Numbered' },
  { item: 'checklist', kind: 'check', telemetry: 'Checklist' },
];
/** The shortcut row ⌘⌥Enter, which no item names (office-shell.md "Shortcut layer"). */
export const TOGGLE_CHECKBOX = 'toggle-a-checkbox';

export function textDocumentListActions(
  view: EditorView | null,
  access: ListsAccess & { startStep: () => void },
  { canEdit }: { canEdit: boolean },
): { actions: OfficeActions; stepLevel: ((delta: number) => boolean) | null } {
  if (!view || !canEdit) return { actions: {}, stepLevel: null };
  const fromWriting = (change: () => void) => () => {
    if (view.isDestroyed) return;
    readDomSelection(view);
    change();
    view.focus();
  };
  const actions: Record<string, OfficeAction> = {};
  for (const { item, kind, telemetry } of LIST_ITEMS)
    actions[item] = {
      run: fromWriting(() => {
        // A new list's definition and the paragraphs joining it are one undo step.
        access.startStep();
        if (toggleList(access, kind)(view.state, view.dispatch))
          track('Element', 'Changed', `TextDocumentList${telemetry}`);
      }),
      get checked() {
        return !view.isDestroyed && isListOn(view.state, access.read(), kind);
      },
    };
  actions[TOGGLE_CHECKBOX] = {
    run: fromWriting(() => {
      if (toggleChecked(access.read)(view.state, view.dispatch))
        track('Element', 'Changed', 'TextDocumentChecklistTicked');
    }),
  };
  // Increase and Decrease indent move list items a level (lists.md "Levels").
  const stepLevel = (delta: number) =>
    !view.isDestroyed && stepListLevel(delta)(view.state, view.dispatch);
  return { actions, stepLevel };
}

/** Enter, Backspace, Tab and Shift+Tab in an item, ahead of the editor's own. */
export function listKeysPlugin(): Plugin {
  // Only where the writing takes edits: read only, the keys are the browser's.
  const editing =
    (command: Command): Command =>
    (state, dispatch, view) =>
      view?.editable === true && command(state, dispatch, view);
  return keymap({
    Enter: editing(enterInList),
    Backspace: editing(backspaceInList),
    Tab: editing(tabInList(1)),
    'Shift-Tab': editing(tabInList(-1)),
  });
}
