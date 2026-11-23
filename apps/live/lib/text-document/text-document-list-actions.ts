// What Format > Bullets & numbering, the toolbar's list buttons, their grids of styles and their shortcuts run
// (docs/specs/034-text-documents/lists.md): each acts on the editor there is now, is pressed or checked as the caret's
// list says, gives the writing focus back and is counted. Enter, Backspace and Tab in an item are the editor's own
// keys. Only a session that writes gets them.
import { keymap } from 'prosemirror-keymap';
import type { Command, Plugin } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { ListMarkers, ListPresets, type ListPreset } from '@livedoc/text-documents';
import type { OfficeAction, OfficeActions } from '@/lib/office/office-catalogue';
import type { OfficeChoices } from '@/components/office/OfficeChoiceMenu';
import type { OfficeGridLine } from '@/components/office/OfficeChoiceGrid';
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
import {
  applyListPreset,
  continueNumbering,
  presetAt,
  restartAt,
  restartNumbering,
  setListBullet,
} from './text-document-list-options';

export const LIST_ITEMS: readonly {
  item: string;
  kind: ListKind;
  telemetry: string;
  // Presets to a row in the button's grid.
  columns: number;
}[] = [
  { item: 'bulleted-list', kind: 'bullet', telemetry: 'Bulleted', columns: 3 },
  { item: 'numbered-list', kind: 'number', telemetry: 'Numbered', columns: 3 },
  { item: 'checklist', kind: 'check', telemetry: 'Checklist', columns: 2 },
];
export const RESTART_NUMBERING = 'restart-numbering';
export const CONTINUE_NUMBERING = 'continue-numbering';
export const MORE_BULLETS = 'more-bullets';
/** A preset's action, and its cell in its grid. */
export const presetActionId = (preset: ListPreset) => `list-style-${preset.id}`;

const PREVIEW_LEVELS = [0, 1, 2];

/** A preset as its grid cell draws it: three items at levels 0 to 2, a checklist's first ticked. */
export function presetPreview(preset: ListPreset): OfficeGridLine[] {
  if (preset.kind === 'check') {
    const struck =
      preset.list.levels[0]?.kind === 'check' && preset.list.levels[0].strikeChecked !== false;
    return [
      { level: 0, marker: '', box: 'ticked', word: { text: 'Done', struck } },
      { level: 0, marker: '', box: 'open' },
      { level: 1, marker: '', box: 'open' },
    ];
  }
  const markers = ListMarkers.of(
    PREVIEW_LEVELS.map((level) => ({ id: 'P', level })),
    { P: preset.list },
  );
  return PREVIEW_LEVELS.map((level, i) => ({ level, marker: markers[i]?.text ?? '' }));
}
/** The shortcut row ⌘⌥Enter, which no item names (office-shell.md "Shortcut layer"). */
export const TOGGLE_CHECKBOX = 'toggle-a-checkbox';

export function textDocumentListActions(
  view: EditorView | null,
  access: ListsAccess & { startStep: () => void },
  {
    canEdit,
    openRestart,
    openMoreBullets,
  }: {
    canEdit: boolean;
    // Restart numbering's dialog, opened at the number it starts with.
    openRestart: (start: number) => void;
    // More bullets' special characters dialog.
    openMoreBullets: () => void;
  },
): {
  actions: OfficeActions;
  choices: OfficeChoices;
  stepLevel: ((delta: number) => boolean) | null;
  // Restart numbering's dialog taken: the item's level restarted at the number, or refused.
  restart: ((start: number) => boolean) | null;
  // A character pressed in More bullets' dialog, made the caret item's bullet on an undo step of its own.
  bullet: ((text: string) => boolean) | null;
} {
  if (!view || !canEdit)
    return { actions: {}, choices: {}, stepLevel: null, restart: null, bullet: null };
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
  // The list buttons' grids (lists.md "List styles").
  const choices: Record<string, OfficeChoices[string]> = {};
  const presetNow = () => (view.isDestroyed ? null : presetAt(view.state, access.read()));
  for (const { item, kind, telemetry, columns } of LIST_ITEMS) {
    const presets = ListPresets.of(kind);
    const own: Record<string, OfficeAction> = {};
    for (const preset of presets)
      own[presetActionId(preset)] = {
        run: fromWriting(() => {
          access.startStep();
          if (applyListPreset(access, preset)(view.state, view.dispatch))
            track('Element', 'Changed', `TextDocumentListStyle${telemetry}`);
        }),
        get checked() {
          return presetNow()?.id === preset.id;
        },
      };
    choices[item] = {
      read: () => {
        const preset = presetNow();
        return preset ? presetActionId(preset) : null;
      },
      entries: [],
      actions: own,
      grid: {
        columns,
        cells: presets.map((preset) => ({
          id: presetActionId(preset),
          label: preset.name,
          lines: presetPreview(preset),
        })),
      },
    };
  }
  // Restart and continue numbering (lists.md "Numbering"): dimmed, or left out of the context menu, off a numbered item.
  const restartFrom = () => (view.isDestroyed ? null : restartAt(view.state, access.read()));
  actions[RESTART_NUMBERING] = {
    run: () => {
      const start = restartFrom();
      if (start !== null) openRestart(start);
    },
    get disabled() {
      return restartFrom() === null;
    },
  };
  actions[CONTINUE_NUMBERING] = {
    run: fromWriting(() => {
      if (continueNumbering(access.read)(view.state, view.dispatch))
        track('Element', 'Changed', 'TextDocumentListContinue');
    }),
    get disabled() {
      return view.isDestroyed || !continueNumbering(access.read)(view.state);
    },
  };
  const restart = (start: number) => {
    if (view.isDestroyed || !restartNumbering(access.read, start)(view.state, view.dispatch))
      return false;
    track('Element', 'Changed', 'TextDocumentListRestart');
    view.focus();
    return true;
  };
  // List options > More bullets (lists.md "List options"): the dialog stays open, so the writing keeps no focus.
  actions[MORE_BULLETS] = { run: openMoreBullets };
  const bullet = (text: string) => {
    if (view.isDestroyed) return false;
    access.startStep();
    if (!setListBullet(access, text)(view.state, view.dispatch)) return false;
    access.startStep();
    track('Element', 'Changed', 'TextDocumentListBullet');
    return true;
  };
  // Increase and Decrease indent move list items a level (lists.md "Levels").
  const stepLevel = (delta: number) =>
    !view.isDestroyed && stepListLevel(delta)(view.state, view.dispatch);
  return { actions, choices, stepLevel, restart, bullet };
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
