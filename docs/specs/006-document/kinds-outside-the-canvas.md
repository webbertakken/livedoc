# Kinds outside the canvas

**Status: specified.** Nothing is built.

How the editor, the tab strip, split view and the Explorer host a tab kind that is not a canvas: the
[text document](../034-text-documents/text-document.md), the spreadsheet of plan 0020, the
[markdown tab](../031-markdown/markdown-tab.md) and the [file tab](file-tab.md). Built once, for every such kind.

## The surface

- Each kind outside the canvas has a **surface**: one component that fills the editor's area below the tab strip and
  owns everything drawn there.
- While a tab of such a kind is selected, the canvas and its chrome (palette, toolbar strip, mode switch, minimap, zoom,
  start panels, tours of the canvas) are **not mounted**, and none of their code is loaded for a document whose tabs
  are all outside the canvas.
- A surface is loaded on demand (its own chunk), so a canvas document's first load carries none of it.
- **Switching tabs** between a canvas tab and a surface tab unmounts one and mounts the other; each restores its own
  view (a canvas its viewport, a surface its scroll position and caret), remembered per tab in this browser.

## The tab strip

- A document with **one tab** hides the tab strip, whatever the kind ([Document](document.md)); a surface then reaches
  the top of the editor below its own title row.
- With **two or more tabs**, the strip shows as for any document, above the surface; a surface's own title row then
  shows the tab's name where the document's name would be, and the document's name stays in the strip's header.
- Adding a tab offers every kind, the kinds outside the canvas included.

## Side by side

[Side by side tabs](../007-editor/split-view.md) host a surface in either pane; each pane mounts its own surface or
canvas. Two surfaces of one tab side by side share one live model.

## The room

- A surface joins the document's room as the canvas does, with the same ticket, presence and catch-up.
- A kind outside the canvas carries its edits on its own op kinds, declared in `MUTATION_OP_KINDS` (and presence in
  `PRESENCE_OP_KINDS`), and its content is stored by the room, never by the editor's whole-tab save
  ([Per-tab storage](per-tab-storage.md)), which is never used for these kinds.

## The Explorer

- A document's **kind** is its first tab's kind ([Explorer filters](../013-workspace/explorer-filters.md)); each kind
  outside the canvas has a glyph, a name for the Kind chip, a default folder key and a thumbnail drawn from its content.
- Opening a document whose first tab is outside the canvas opens straight onto its surface.

## Tests

- A document of one surface tab loads no canvas module (a bundle test on the route's chunks).
- Switching between a canvas tab and a surface tab restores each one's view.
- A two-tab document shows the strip; a one-tab document hides it, for each kind.
