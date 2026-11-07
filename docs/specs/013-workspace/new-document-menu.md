# New Document menu

The Explorer's **New Document** is a split button and a menu. Its face makes a blank document at once; its menu
offers every blank LiveDoc makes, each beside every one of its templates. A blank opens in the
editor straight away, without a page load and without waiting on the server, and opens empty, its template start
closed: whoever asked for a blank gets a blank.

## Why

- Starting a document took three steps: New Document loaded `/new`, the wizard asked for a mode, and the document
  opened on that mode's template start, which still had to be closed before work could begin. Someone who knew what
  they wanted paid for every step.
- A document that is still empty needs nothing from the server to open. Waiting for one made a new document the
  slowest thing to open in LiveDoc.

## Domain language

| Term                  | Means                                                                             | Never called                      |
| --------------------- | --------------------------------------------------------------------------------- | --------------------------------- |
| **New Document menu** | The split button and its menu in the Explorer's pane header                       | create menu, new menu, launcher   |
| **blank**             | One entry of the menu: what a new document starts as (Diagram, Sheet, ...), empty | kind, type, document type, mode   |
| **last blank**        | The blank this browser made last; the face makes it                               | default blank, favourite          |
| **template group**    | One heading of a blank's templates in the pane, a group of its template start     | category (the catalogue's), shelf |

- A blank is never called a kind: a kind is what a tab is, and Structured and Sketch (the Diagram and Whiteboard blanks) are modes of one kind
  ([Domain language](../003-system-architecture/domain-language.md#mode-kind-and-template)). The blanks name what
  people make, whatever mode or kind makes it.

## The blanks

In this order, each with its glyph and number key:

| #   | Blank      | Makes (its blank template)              | Its templates, in the pane                                      |
| --- | ---------- | --------------------------------------- | --------------------------------------------------------------- |
| 1   | Diagram    | Blank Diagram (`blank`)                 | Start Diagramming's, in its groups, Recommended first           |
| 2   | Whiteboard | Blank Whiteboard (`whiteboard`)         | Start Sketching's, in its groups, Recommended first             |
| 3   | Page       | Blank Article (`blank-article`)         | Start Making Pages' Articles                                    |
| 4   | Sheet      | Blank Spreadsheet (`blank-spreadsheet`) | The spreadsheet templates (Budget, Timesheet, Invoice, ...)     |
| 5   | Board      | Blank Board (`blank-board`)             | The Plan templates that set up boards (Kanban, Bug Triage, ...) |
| 6   | Slides     | Blank Slide Deck (`blank-slide-deck`)   | Start Making Pages' Slides                                      |
| 7   | Form       | Blank Form (`blank-form`)               | The form templates                                              |
| 8   | Workshop   | Blank Session (`blank-session`)         | Start a Workshop's, in its groups, Recommended first            |

- **Page** is prose. It makes an Article ([Article pages](../007-editor/article-pages.md)) until the
  [markdown tab](../031-markdown/markdown-tab.md) ships; then it makes a page, a document of one markdown tab.
- **Blank Board** is a new blank: one Board tab holding a Blank board, which starts on Setup Board
  ([Plan board](../026-plan/plan-board.md)). Every other blank is an existing template.
- **Dashboard is not a blank.** A dashboard shows a document's own boards and sheets, and a new document has none;
  it is made from Start Planning once there is work to show.
- **Event Storming** is not offered: it is made from its templates and imports, never from nothing.

## The button

- The pane header's create action, wherever a section offers New Document
  ([Folders](folders.md), `paneHeaderActions`). It replaces the Create dropdown and the lone New Document button.
- **A split button**, brand-filled, as tall as Help:
  - **The face** reads **New <last blank>** ("New Diagram") with the plus glyph, and makes that blank at once.
    The last blank is kept per browser; before any, it is Diagram. On a phone the face shows the plus and the
    blank's glyph only, its name in `aria-label`.
  - **The caret**, its own button behind a hairline, opens the menu. So does the Down arrow on the face.

## The menu

A popover under the button, its right edge on the button's. Two panes side by side:

- **The list**, on the right, straight under the button where the pointer already is: the eight blanks, each its
  glyph in its own tint, its name and its number key in a key cap. The selected row is filled. Where the section
  offers New Folder ([Folders](folders.md)), a hairline and **New Folder** (or **New Subfolder**) end the list.
- **The pane**, to the left of the list: **every template of the selected blank**, three to a row, each its preview
  and name, under the headings of its template groups (Recommended, Brainstorm, Design, ...). A template appears
  once, under the first group holding it. The pane scrolls within the menu; each group's heading stays at the top
  while its templates pass under it, and a soft fade at the foot says there is more. A blank with one group (Page,
  Slides, Sheet, Board, Form) has one heading.
- **There is no blank card.** A row of the list is the blank: clicking it, or Enter on it, makes the blank. The pane
  holds templates only.
- **There is no way out to a bigger picker.** The pane holds every template of the blank; the editor's template
  start remains on any empty tab (**Show Templates**).
- **The menu opens on the last blank.** Hovering a row selects it; the arrow keys do too.
- **Hovering never steals the selection on the way to the pane.** While the pointer moves towards the pane, the rows
  it crosses do not select (menu aim): a row selects once the pointer rests on it, or moves away from the pane.
- **Both panes keep their size** whatever is selected: the pane is a fixed height, about four rows of templates,
  so nothing jumps; another blank's templates start at their top.

### What each choice does

| Choice                                             | Makes                         | Opens on                          |
| -------------------------------------------------- | ----------------------------- | --------------------------------- |
| The face, a list row, Enter on a row, a number key | The blank                     | The canvas, its start closed      |
| A template card                                    | A document from that template | The template                      |
| New Folder                                         | A folder, as before           | The folder, its name being edited |

- Every document choice remembers its blank as the last blank and closes the menu.
- **A blank opens with its start closed** (`closeStartForBlank`): no template picker over it. The palette tray's
  **Show Templates** still brings the start back while the tab is empty
  ([Template starts](../007-editor/start-diagramming.md#bringing-it-back)).

## Where it goes

As every new document does ([New document route](../007-editor/new-document-route.md#one-step-wizard)):

- **Stored** where the default for who is creating says: This Browser for a guest, LiveDoc for everyone else
  ([Save locations](../006-document/save-locations.md#the-default-depends-on-who-is-creating)).
- **Filed** in the folder or team the Explorer shows, an explicit placement; anywhere else (Home, Recent, a view) it
  carries none, and the server files it in the person's [default folder](default-folders.md) for its intent.
- **Named** after its template ("Untitled Diagram").

## Opening at once

A blank is on screen, editable, **within 200 ms of the click**, and a template within 500 ms.

- **No page load.** The Explorer opens the editor in its own place, as `/new` hands off
  ([In-place handoff](../007-editor/new-document-route.md#in-place-handoff-to-the-editor)), the address bar moving
  to `/document/<id>` with a new history entry, so Back returns to the Explorer where it was.
- **No server wait.** The document is made in the browser and the editor opens it from memory. The server's create
  runs behind it; the room connects, and what was done meanwhile is saved, once the create has landed. A document in
  This Browser opens the same way, its write to this browser running behind it, and its saves held until that write
  has landed ([Offline mode](../006-document/offline-mode.md#instant-open)).
- **Nothing to fetch first.** The editor's code, and the icon catalogues it draws with, are fetched while the
  Explorer is idle, and again when the pointer reaches the button.
- **Nothing to build first.** While the Explorer is idle, the blank the face makes is made ready in the background,
  unseen and unsaved, so the face's click only shows it; nothing is created until the click.
- **A create that fails loses nothing.** The editor stays open with what was done, says the document is not saved
  yet, and offers **Try again**, which re-runs the same create under the same id
  ([New document route](../007-editor/new-document-route.md#a-failed-load-is-not-a-missing-document)). A refused
  placement says why and offers **Save to My Documents**.

## Keyboard and screen readers

- The face and the caret are buttons; the caret has `aria-haspopup="menu"` and `aria-expanded`.
- The list is a `menu` of `menuitem`s named "<name>, blank" with `aria-keyshortcuts` 1 to 8. The pane is a labelled
  `group` ("Diagram templates") of `menuitem`s, under headings (`h3`) naming its template groups.
- **Up and Down** move along the list, wrapping; **Home** and **End** reach its ends. **Enter** makes the selected
  blank. **1 to 8** make that blank from anywhere in the menu. **Left** moves into the pane, on its first template;
  there the arrow keys move as a grid, three to a row, the rows of every group one after another, and the card
  reached scrolls into view. **Right** from the pane's right column goes back to the list. **Escape**
  closes the menu and puts focus back on the caret; **Tab** moves through the menu and leaves it closed.
- Focus is visible on every row and card (the brand ring). Reduced motion: the menu appears without its fade.

## On a phone

Below `sm` the menu is a sheet from the bottom edge, the list only: each row makes its blank, and a **Templates**
button at its end swaps the sheet to that blank's pane, with **Back**. New Folder ends the list.

## The `/new` wizard

The New Document menu never goes through `/new`. The wizard stays for the links that ask for it (the public sites, `/new?mode=`,
a blank's or template's link), unchanged ([New document route](../007-editor/new-document-route.md)).

## Telemetry

- `UI · Opened · NewDocumentMenu` when the menu opens.
- `UI · Used · NewDocumentBlank` or `NewDocumentTemplate` for each choice; the usual
  `Document · Created` and `Template · Used` follow.
- `Timing` of the open, from click to the editor painted ([Timing telemetry](../017-telemetry/timing-telemetry.md)),
  as `NewDocumentOpen`.

## Logs

`[new-document] choice=<blank|template> blank=<id> template=<kind>`, then
`[new-document] opened ms=<n>`, `[new-document] create-landed ms=<n>` or
`[new-document] create-failed action=<retry|choose>`.

## Defaults

Each default below was applied where this spec is silent or qualitative, and holds until a human confirms it.
The code cites each by its id.

- **D191** How the pane orders a whole mode's templates: Its start's groups in rail order, Recommended first, each
  template once under its first group (default).
- **D192** Which templates Sheet, Board and Form list: The spreadsheet Plan templates, the other Plan templates, and the
  form templates, in catalogue order (default).
- **D193** How menu aim decides the pointer heads for the pane: The triangle of the previous point and the pane's two
  near corners; held at most 300 ms after the last move (default).
- **D195** When the menu's code is fetched: On idle, and on pointer enter or focus of the button (default).
- **D196** Where the open's clock starts and stops: From the call to `startNewDocument` (the click) to the first paint
  after the editor's load reaches `done` with the canvas on screen (default).
- **D197** How saves are held until the create lands: The autosave and the unload flush do not run while held, and run
  once on landing against the created content; every other request naming the document waits in `apiFetch` (default).
- **D198** Back before the create lands: The editor stays mounted, hidden, until the create has landed and nothing is
  unsaved, checked every 250 ms; Forward shows it again (default).
- **D199** Who the reader is before the profile settles: The creator's id the Explorer already holds, with the
  placeholder name and colour until the profile loads (default).
- **D200** The not-saved notice's place and words: First in the editor's top-centre stack: "Not saved yet." with the
  failure's message and its one action (default).
- **D201** A start with nobody bound as the creator: The `/new` path with the same template and place (default).
- **D202** Where the signed-in budget test lives: `e2e/account/`, the only suite with a signed-in stack; the guest half
  stays in `e2e/` (default).
- **D203** Whether This Browser waits for its write before opening: No: it opens from memory as a LiveDoc document does,
  saves held until the write lands; one path, one Try again (default).
- **D204** What may run before the new editor's first frame: Its render and its effects' mount: the reveal follows as a
  transition, a create that lands at once after the paint (default).
- **D205** Whether the editor may be built before the click: Yes, for the face's blank only: a hidden standby built when
  the Explorer is idle (at most 2 s), nothing created until the click (default).
- **D206** Which choices the standby serves: The face's blank, unplaced or in the default store; every other choice is
  prepared at the click (default).
- **D207** When the create starts: After the editor's first frame of the document, or 1 s at most: a create that lands
  at once would re-render it inside that frame (default).
