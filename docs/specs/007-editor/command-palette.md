# Command palette (⌘K)

Make every editor action reachable by typing its name. This is **not a new
surface**: the global Search panel ([Canvas and palette](../008-canvas/canvas-and-palette.md) "Search panel") already has a
grouped, keyboard-navigable results list with an **Actions** group backed by
the command registry (`lib/editor-commands.ts`). This spec promotes that
Actions group into a full command palette by (a) binding the conventional
**Cmd/Ctrl+K** shortcut alongside the existing Cmd/Ctrl+., and (b) widening
the registry from selection/document verbs to the whole app surface.

## Shortcut

- **Cmd/Ctrl+K opens the Search panel**, identically to Cmd/Ctrl+. (both
  stay; `K` is the convention users arrive with, `.` is grandfathered).
  Works in zen mode and read-only views, like the existing binding.
- **The Explorer page binds both too** (`useSearchShortcut`), opening the same panel as its
  Search button. As in the editor, the chords stand down when the Keyboard Shortcuts setting is
  off, while focus is in a text field, a text area, a select or editable text (the Explorer's filter box
  included), while a dialog is open (one the modal guard counts, or any `aria-modal` element, the phone's Sections
  drawer included), and for a key another handler already took.

## One search

Ctrl K (Cmd K on a Mac) opens **one search** everywhere: in the Explorer, and over an open document in the editor.
It is the Search panel, the same panel on both surfaces, and it finds, in one list:

- **Documents**, by their titles, matched fuzzily as the Explorer's lens matches them (`@livedoc/explorer-lens`
  `matchTitle`): yours, those shared with you, and your teams'. Content search joins them as the document content index
  lands ([Content search](../013-workspace/content-search.md)).
- **Templates to start from**, matched as the New Document wizard matches them; picking one makes that document at
  once ([Canvas and palette](../008-canvas/canvas-and-palette.md#search-panel) "Templates").
- **In the editor, its actions**: the command registry below, and the editor's navigation (tabs, elements, Add to
  canvas).
- Folders, teams, settings and help, as the panel already lists them.

The Explorer's top-bar field stays the **lens**: it filters the view in hand, its filter tokens (`kind:`, `space:`,
`template:` and the rest, [Explorer filters](../013-workspace/explorer-filters.md)) keep working there, and typing
plain words in it on Home opens Search results. Ctrl K is the one way to search everything from anywhere.

## Registry expansion

New commands join `buildEditorCommands`, each mapping 1:1 to an existing
editor handler (the non-negotiable rule of that registry — no behaviour
forks, no drifted telemetry):

- **History:** Undo, Redo — offered only when `canUndo` / `canRedo`.
- **View:** Toggle zen mode, Fit to screen.
- **Cleanup:** Auto Layout (one per style), Auto-align: their only home since the tab menu's
  Cleanup category was removed ([Layout cleanup](../008-canvas/layout-cleanup.md)); Renumber Steps, while the tab
  holds a step number ([The step number](../009-elements/step-number.md)).
- **Dialogs:** Export…, Import…, Settings, Keyboard shortcuts (opens
  Settings on its Keyboard category, [User preferences](user-preferences.md)), Browse templates.

## Read-only visitors

The registry previously returned nothing for read-only views. Now it returns
the **view-safe subset** (zen mode, fit to screen, export, Collaborators, Review Board on an Event Storming board
([Board review](../021-event-storming/board-review.md#the-panel)), and
the canvas tool switches that do not write to the document); mutating
commands and the Eraser and Format painter tools stay editor-only. `CommandContext` carries `isReadOnly` so the gating lives
in the pure builder where it's unit-tested.

## Locked tabs and Plan tabs

The palette offers only what would do something. On a **locked tab** (`tabLocked`) the element
verbs, layout cleanup, the photo reader and the Eraser and Format tools are withheld, since the
tab refuses every element edit; the document, tab and view commands stay. On a **Plan tab**
(`planMode`) Eraser and Format are left out, as the tool dropdown leaves them out.

## Unchanged on purpose

- Commands still match only on a **non-empty query**: an empty palette lists
  navigation results, not a catalogue whose first entry Enter would blindly
  run (some commands are destructive).
- Ordering: command results stay after navigation groups, so picking a tab
  or element by name keeps the default Enter.
- Telemetry: opening the panel and running commands keep their existing
  events; the underlying handlers own their own tracking, so no new events.
