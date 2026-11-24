# Kinds outside the canvas

**Status: built**, but for the gaps named under "Not yet".

How the editor, the tab strip, split view and the Explorer host a tab kind that is not a canvas: the
[text document](../034-text-documents/text-document.md), the [spreadsheet](../029-sheets/spreadsheet.md), the
[PDF document](../035-pdf-documents/pdf-document.md), the [markdown tab](../031-markdown/markdown-tab.md) and the
[file tab](file-tab.md). Built once, for every such kind.

## The surface

- Each kind outside the canvas has a **surface**: one component that fills the editor's area below the editor's lines
  and owns everything drawn there.
- Which surface a tab has is one question, `surfaceOf(tab, inSpreadsheet)` in `@livedoc/document`: `text-document`
  for a text document tab, `spreadsheet` for a sheet tab of a spreadsheet, `pdf` for a PDF tab,
  and none for a canvas tab. A sheet tab in
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
  own title row shows, leaving Add tab. A text document's
  [drawing tabs](../034-text-documents/objects.md#a-drawing-tab) are never listed, so they never count as a second tab.
  A document of one canvas tab keeps both, as it always has.
- With **two or more tabs**, the segment shows as for any document, over the surface.
- **Add tab** stays for whoever may add tabs, and its add menu offers **Text document** after the Plan rows (the tab
  list's footer: **New Text Document**): it adds a text document tab after the others, born ODF
  ([Text document](../034-text-documents/text-document.md)), named **Text document**, selected at once.
  It is offered only in a document stored on LiveDoc: This Browser does not hold a text document yet
  ([Live editing and storage](../034-text-documents/live-editing-and-storage.md) "Offline").
- The add menu offers **PDF from a file** after Text document (the tab list's footer: **New PDF From a File**): it
  opens the file chooser, which takes one `.pdf`, and adds the chosen PDF as a PDF tab after the others, named as the
  file is without its extension, selected once its file and its row are stored
  ([PDF document](../035-pdf-documents/pdf-document.md#a-pdf-tab-from-a-file)).
  It is offered only in a document stored on LiveDoc, on a host that stores files `(default)`
  ([Blob store](blob-store.md#without-object-storage)).
- A spreadsheet is never a tab of another document: a spreadsheet's tabs are its sheet bar
  ([Spreadsheet](../029-sheets/spreadsheet.md)).

## Side by side

- [Side by side tabs](../007-editor/split-view.md) hold a surface tab in either pane.
- In the editor's pane it is its surface, as anywhere.
- In the other pane, a text document tab shows its surface **live and read-only**; a press or a rest of the pointer
  there moves the editor across, as for a canvas tab. A surface with no read-only view yet (the spreadsheet) shows its
  tab's name and "Click to edit." in that pane.
- A PDF tab in the other pane shows its pages live and read-only, in Viewing, with no toolbar.
- Two surfaces of one tab side by side share one live model.

## The room

- A surface joins the document's room as the canvas does, with the same ticket, presence and catch-up.
- A kind outside the canvas carries its edits on its own op kinds, declared in `MUTATION_OP_KINDS` (and presence in
  `PRESENCE_OP_KINDS`), and its content is stored by the room, never by the editor's whole-tab save
  ([Per-tab storage](per-tab-storage.md)). The whole-tab save writes only the tab row (its name, kind and format).

### Live state

A kind whose content is a live state of merged updates (a text document's Yjs document; a PDF's) is a **live tab
kind**. The room stores each one the same way, the kind declaring only what is its own
([Live editing and storage](../034-text-documents/live-editing-and-storage.md#storage) is the text document's).

- **The kind declares**: its tab kind, its frame's op kind (its refusal is `<op kind>-refused`), its log tag, its
  tables (updates, chunks, digest), how its updates merge and decode and how many characters one inserts, its sizes
  (a chunk's bytes, the log's bytes and updates before compaction, a frame's characters) and limits (characters,
  stored bytes), its digest (characters, words, pages, has content, search text, the gallery images it places) read from its state, and, where a
  Participant may change some of it, the level an update asks.
- **Its schema step**: its three tables and their outbox triggers, made by one shared step builder and appended to the
  room's schema as any step is; a shipped step is never edited, so the text document's own steps stay as written.
- **Storing**: a frame from an Editor is checked (the tab is of the kind, in this document; the update decodes; no
  limit passed), appended to the updates log on the room's write queue and only then relayed; the door's posted update
  the same, folded straight into chunks when no log row could hold it. Past the log's bytes or updates, compaction
  folds the log into chunks under the row cap, in one batch. Each is logged with the kind's tag and a fingerprint:
  `persisted`, `compacted`, `update-refused reason=`, `edit-refused limit=`.
- **The level an update asks**: an Editor's update is stored as it is. Anyone else's is judged by what it changes,
  never by what its sender claims: the kind reads the stored state and the update and answers the least level the
  update needs (`participate` or `edit`), or that it cannot be read yet, because it stands on changes the room
  lacks. A kind that declares no such reading (a text document) asks `edit` for every update. A Viewer's update is
  never read.
- **A refusal reaches its sender alone**, as `<op kind>-refused` naming the tab and why: `limit` (the limit
  passed) or `name` (`level_too_low`). Nothing of a refused update is stored or relayed. An update that cannot be
  read yet is refused untold: it follows one the room refused, whose sender has been told already. The door answers
  a level too low `403 level_too_low`. Logged `level-refused level=<level> asks=<level>`.
- **What a state stands on**: a kind whose state is changes to something its tab's row names (a PDF's stored file)
  says what that is. Every frame then names what it was made on (`on`), and so does a posted update; one made on
  anything else is refused whole, told to its sender as `stored_file_changed` (the door: `409`), since its items
  follow others the state no longer holds.
- **Replacing a state with its row**: such a kind may declare an op that replaces both in one step. The room, on its
  write queue, has the kind judge the op against the stored tab, the stored state and the sender's level; then, in
  one transaction, writes the tab's row at the revision it read, removes the state's log and chunks, writes the
  state that stands on the new row and whatever rows the kind keeps of the old one. Only then is everyone told, the
  sender too, in order: the row's change as a `tab-meta`, then the kind's own op. A refusal reaches the sender
  alone, as `<op kind>-refused` with its `name` and `replacement: true`, and nothing is written. Logged
  `state-replaced` and `replacement-refused name=`.
- **The digest and summary**: every stored update queues the tab in the outbox; its drain rebuilds the kind's digest
  from the state, saving the document, and gives the search text to D1; in the same batch it replaces the tab's rows
  in the [reference index](../009-elements/images.md#reference-index) with the images the digest names, so the
  index trails a live tab by one drain. A tab holds content when its digest says so,
  and its characters and stored bytes join the content summary. Logged `digest` with every count the kind's digest
  holds (a text document's characters, words and pages; a PDF's pages and marks too), how many images it names,
  its bytes and how long it took.
- **Copies**: a copied document's live tabs carry their state, stored as chunks under the new tab ids.
- Kinds: the text document (`text-document`, tables `text_document_*`) and the PDF document (`pdf`, tables `pdf_*`).

**In the editor**, a live tab kind's surface is bound to the room the same way too (`apps/live/lib/live-tab/`), the
kind again declaring only what is its own
([Sending, reconnecting and the local copy](../034-text-documents/live-editing-and-storage.md#storage) are specified
with the text document):

- **The kind declares**: its frame's op kind, its log tag, a frame's characters, how long an unconfirmed change waits
  before this browser keeps it, how its state loads and reads a state vector, its bus, and the database its local
  copies are kept in.
- **A bus per kind** takes that kind's ops from the room connection (an update, a stale tab, a refusal) to the open
  surface of the tab they name; a surface opened later reads the stored state, which holds them all.
- **One connection state** for every kind: the room opening and closing is told once, and a re-hydrate asks every
  kind's open surfaces to catch up.
- **The binding**: the room's updates are heard from before the state is read; each local change goes out as one frame
  while the room is open, or by the door when too large for one; a catch-up reads what the room holds beyond this
  browser and sends what the room lacks; a change the room has not confirmed is kept in this browser's local copy and
  dropped once the room holds it; the save status reads the binding's facts (a change pending, saving failed).
- A surface that read its state before it could bind (a PDF document opens its stored file in between) says so, and
  the binding catches up at once, so nothing relayed in between is lost.
- **A binding can be discarded**: it stops for good, keeps nothing in this browser's local copy and removes the copy
  it kept. A surface whose change the room refused discards its binding and binds the state again, read from the
  room, so nothing of the refused change is sent a second time. A binding that was closed or discarded never sends.
- **What lies beyond the room**: a kind whose state stands on something its tab's row names may declare how it reads,
  in its own terms, what this browser holds beyond what the room is known to hold. The binding then keeps what the
  room is known to hold (the state read, every update the room relayed, every update of this browser's the room
  confirmed), answers that reading when asked, and keeps it in the local copy, beside what the copy was made on.
- **A local copy made on something else** than the state now stands on is never merged: its updates follow others
  the state no longer holds. The binding hands the kind the copy's reading, and removes the copy.

## The Explorer

- A document's **kind** is its first tab's kind ([Explorer filters](../013-workspace/explorer-filters.md)); each kind
  outside the canvas has a glyph, a name for the Kind chip, a default folder key and a thumbnail drawn from its content,
  specified with its kind ([Starting and finding](../034-text-documents/starting-and-finding.md)).
- Opening a document whose first tab is outside the canvas opens straight onto its surface, with no canvas code.

## Share roles

- Hosting changes no role: each surface gates its own edits on the session's `can`.
- **Add tab**'s Text document and PDF from a file rows are an Editor's, as every Add tab row; a Participant and a
  Viewer never see Add tab.
- The other pane's read-only view is everyone's who may read the tab.

## Telemetry

- `Tab · Created · TextDocument` when the add menu adds a text document tab.
- `Tab · Created · Pdf` and `Pdf · Imported · Tab` when the add menu adds a PDF tab.

## Not yet

- The editor's shared state (`useEditorState`) still holds the canvas's state and loads with every document: about
  1.3 MB of the document route's first load before compression is shared code a surface does not use.
- The spreadsheet's read-only view for the other pane.
- **PDF from a file** in a This Browser document, which holds a PDF document but takes no PDF tab from the add menu.

## Tests

- `surfaceOf` names each kind's surface, and none for a canvas tab or a Plan Sheet.
- The canvas's code is reachable from the document route only through its loader (a static import check), and the
  loader asks for it never for a document whose tabs all have a surface.
- Switching between a canvas tab and a surface tab restores each one's view.
- A one-tab surface document hides the active tab segment; a two-tab one and a one-tab canvas document show it.
- The add menu's Text document row adds a text document tab and selects it.
- The add menu's PDF from a file row is offered only where the document is stored on LiveDoc and the host stores
  files; a chosen PDF is sent for the document's owner, its tab stored, added after the others and selected; a
  refusal adds nothing and is said; a chooser left adds nothing.
- A Participant's update to a live tab is stored when its kind says it asks no more than `participate`, refused and
  told to its sender alone when it asks `edit`, and refused untold when it cannot be read yet; a Viewer's and
  every non-Editor's update to a kind that reads no level are refused and told the same way.
- A frame made on anything but what the tab's row names is refused and told; a replacement writes the row, the
  state and the kind's rows together or not at all, tells everyone in order, and a refused one writes nothing.
- A discarded binding leaves no local copy, and neither it nor a closed one sends when a late answer arrives.
- A live tab kind's bus delivers only its own tab's updates and refusals, every bus hears the one connection and the
  re-hydrate, and a binding given a state read earlier catches up at once.
