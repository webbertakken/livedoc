# Kinds outside the canvas

**Status: built**, but for the gaps named under "Not yet".

How the editor, the tab strip, split view and the Explorer host a tab kind that is not a canvas: the
[text document](../034-text-documents/text-document.md), the [spreadsheet](../029-sheets/spreadsheet.md), the
[markdown tab](../031-markdown/markdown-tab.md) and the [file tab](file-tab.md). Built once, for every such kind.

## The surface

- Each kind outside the canvas has a **surface**: one component that fills the editor's area below the editor's lines
  and owns everything drawn there.
- Which surface a tab has is one question, `surfaceOf(tab, inSpreadsheet)` in `@livedoc/document`: `text-document`
  for a text document tab, `spreadsheet` for a sheet tab of a spreadsheet, and none for a canvas tab. A sheet tab in
  a document without a workbook is a Plan Sheet, drawn on the canvas, until stored Plan Sheets are migrated
  ([Sheet migration](../029-sheets/migration.md)).
- A document's outline names each tab's kind (`TabSummary.kind`, absent for a general tab), so the editor knows a
  tab's surface before its body loads: the room keeps it in the tab row's `kind` column, written from the body by
  the row's own triggers on every write, so no writer can leave it behind.
- A surface is loaded on demand (its own chunk), so a canvas document's first load carries none of it.
- While a surface tab is selected, the canvas and its chrome are **not mounted**.

## The canvas's code

- The **canvas's code** is one chunk loaded on demand: the canvas with its palette, toolbars, minimap and zoom, and
  the chrome only a canvas uses (the quick style panel, the modifier hint, the start panels, the photo import, the
  board scene notice, the arrow-connect hint, the element dialogs, the element context menus, the anchored popovers
  and the presentation host).
- It is asked for, never for a document whose tabs all have a surface:
  - **at the open**, when the tab opened first is a canvas tab, alongside its element kind families
    ([Web performance](../016-platform/web-performance.md) "At the open"); the board's first frame waits for it as it
    waits for them, so a board never draws a placeholder where its canvas belongs;
  - **once the document has settled**, on idle, when any of its tabs is a canvas tab, so switching to one is instant;
  - **when a canvas tab is selected** (a tab added, or chosen) and it is not in yet.
- The content a board may draw on open (pages, the Draw dock, tables, sequence diagrams, the Map) and the canvas's
  panels are fetched ahead with it, never for a document without a canvas tab.
- While it loads, the canvas's place holds the tab's paper, so nothing shifts when it arrives.
- A needed load that fails shows, in the canvas's place, **"This tab couldn't load."** with **Try Again**; a newer
  build being live recovers as any other chunk does ([Stale builds](../016-platform/stale-builds.md)).
- Logs: `[canvas-code] load reason=<open|tab|idle|retry>`, `[canvas-code] in ms=<n>`,
  `[canvas-code] failed reason=<reason>`.

## Switching tabs

- Switching between a canvas tab and a surface tab unmounts one and mounts the other.
- Each restores its own view: a canvas its viewport, as before; a surface its **scroll position** and, for a text
  document, its **selection**, clamped to the text there now, with the caret in the writing again for whoever may
  edit it (default).
- A surface's view is remembered per document and tab in this browser (`localStorage`), the
  `SURFACE_VIEW_MAX_ENTRIES` most recent (200, default), the oldest forgotten first; a remembered view that no longer
  parses is forgotten, never applied.
- A surface writes its view as the person scrolls or moves the selection, at most every
  `SURFACE_VIEW_WRITE_MS` (250 ms, default), and once more as it unmounts.

## The tab strip

- In the editor's two lines ([Toolbar layout](../007-editor/toolbar-layout.md) "The bottom line"), the tab strip is the
  document group's **active tab** segment with its tab stack.
- Over a text document's surface the document group floats at the bottom right, as it does over a canvas (default),
  without the people here: the surface's title row shows them
  ([Editing surface](../034-text-documents/editing-surface.md#the-title-row)).
- A document whose **one tab is outside the canvas** hides that segment and the document's name, which the surface's
  own title row shows, leaving Add tab. A document of one canvas tab keeps both, as it always has.
- With **two or more tabs**, the segment shows as for any document, over the surface.
- **Add tab** stays for whoever may add tabs, and its add menu offers **Text document** after the Plan rows (the tab
  list's footer: **New Text Document**): it adds a text document tab after the others, born ODF
  ([Text document](../034-text-documents/text-document.md)), named **Text document**, selected at once.
  It is offered only in a document stored on LiveDoc: This Browser does not hold a text document yet
  ([Live editing and storage](../034-text-documents/live-editing-and-storage.md) "Offline").
- A spreadsheet is never a tab of another document: a spreadsheet's tabs are its sheet bar
  ([Spreadsheet](../029-sheets/spreadsheet.md)).

## Side by side

- [Side by side tabs](../007-editor/split-view.md) hold a surface tab in either pane.
- In the editor's pane it is its surface, as anywhere.
- In the other pane, a text document tab shows its surface **live and read-only**; a press or a rest of the pointer
  there moves the editor across, as for a canvas tab. A surface with no read-only view yet (the spreadsheet) shows its
  tab's name and "Click to edit." in that pane.
- Two surfaces of one tab side by side share one live model.

## The room

- A surface joins the document's room as the canvas does, with the same ticket, presence and catch-up.
- A kind outside the canvas carries its edits on its own op kinds, declared in `MUTATION_OP_KINDS` (and presence in
  `PRESENCE_OP_KINDS`), and its content is stored by the room, never by the editor's whole-tab save
  ([Per-tab storage](per-tab-storage.md)). The whole-tab save writes only the tab row (its name, kind and format).

## The Explorer

- A document's **kind** is its first tab's kind ([Explorer filters](../013-workspace/explorer-filters.md)); each kind
  outside the canvas has a glyph, a name for the Kind chip, a default folder key and a thumbnail drawn from its content,
  specified with its kind ([Starting and finding](../034-text-documents/starting-and-finding.md)).
- Opening a document whose first tab is outside the canvas opens straight onto its surface, with no canvas code.

## Share roles

- Hosting changes no role: each surface gates its own edits on the session's `can`.
- **Add tab**'s Text document row is an Editor's, as every Add tab row; a Participant and a Viewer never see Add tab.
- The other pane's read-only view is everyone's who may read the tab.

## Telemetry

- `Tab · Created · TextDocument` when the add menu adds a text document tab.

## Not yet

- The editor's shared state (`useEditorState`) still holds the canvas's state and loads with every document: about
  1.3 MB of the document route's first load before compression is shared code a surface does not use.
- The spreadsheet's read-only view for the other pane.

## Tests

- `surfaceOf` names each kind's surface, and none for a canvas tab or a Plan Sheet.
- The canvas's code is reachable from the document route only through its loader (a static import check), and the
  loader asks for it never for a document whose tabs all have a surface.
- Switching between a canvas tab and a surface tab restores each one's view.
- A one-tab surface document hides the active tab segment; a two-tab one and a one-tab canvas document show it.
- The add menu's Text document row adds a text document tab and selects it.
