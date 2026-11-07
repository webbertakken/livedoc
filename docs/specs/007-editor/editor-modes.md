# Editor modes

A general tab is drawn on in one of three **editor modes**: **Sketch**, **Structured** and **Pages**. A mode decides
which tools and rules are in focus; it never decides what the tab is. Like a drawing tool that switches between a
pixel mode and a vector mode over the same picture, switching mode keeps every element exactly where it is and
changes only how the next mark is made.

Two things that were modes are not any more. **Plan** is tabs of their own: a Board, Sheet or Dashboard tab is added
from **+** beside an ordinary tab ([Plan tabs](../026-plan/plan-tabs.md)). **Workshop** is a control, not a mode:
the [Workshop control](../012-collaboration/workshop-mode.md) in the actions group brings the session kit into
whichever mode the tab is in.

## Domain language

| Term                 | Means                                                                                                                                                                                                       |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **tab kind**         | What a tab **is** ([Document](../006-document/document.md)). Reserved for specific uses: an event-storming board, and the Plan tabs (Board, Sheet, Dashboard, Form).                                        |
| **editor mode**      | How a general tab is **worked on** right now: `draw`, `diagram` or `pages` (`EditorMode`, the **switchable** modes `SWITCHABLE_EDITOR_MODES`). A Plan tab is worked on in `plan`, which nobody switches to. |
| **Sketch mode**      | Freehand whiteboarding: the dock, preset pens, eraser, shape recognition ([Sketch mode](../023-draw-mode/draw-mode.md)). Stored and coded as `draw`.                                                        |
| **Structured mode**  | Structured drawing: the palette, shapes, arrows, icons, templates, snapping and guides. Stored and coded as `diagram`.                                                                                      |
| **Pages mode**       | Pages on the canvas, of four kinds: infographic pages to lay out, article pages to write, slide pages to present and logo pages to design a logo on ([Pages](pages-mode.md), [Logo pages](logo-pages.md)).  |
| **Plan**             | The Plan tabs and how they are worked (`plan`): boards, sheets, dashboards and forms ([Plan tabs](../026-plan/plan-tabs.md)). Never a mode in the interface.                                                |
| **Workshop control** | The toggle in the actions group that brings the session kit into the tab's mode (`Tab.workshop`, [Workshop control](../012-collaboration/workshop-mode.md)). Never a mode.                                  |
| **mode switch**      | The control beside the menu button (and leading an empty tab's start) that changes the mode.                                                                                                                |

- "Whiteboard" names the activity and Sketch mode's look, never a tab kind and
  never a type of document.
- "Mode" on its own is ambiguous here (Zen mode, Presentation mode, Power user
  mode); in specs and code say **editor mode**. The interface says **Sketch**,
  **Structured** and **Pages**. The stored values and code keep their names (`draw`, `diagram`, `Tab.opensIn`,
  telemetry tokens such as `ModeDraw`): only the words people read changed.

## Kinds versus modes

- **A tab kind is for a very specific use** whose notation, rules and data are
  its own: the [event-storming board](../021-event-storming/event-storming.md)
  is one, and so are the Plan tabs (a Board, Sheet, Dashboard or Form tab). A new kind is added only when a use
  cannot be served by a mode.
- **Everything else is the general tab** (`kind: 'diagram'`, the default). It
  carries every element type; every mode works on it.
- **Whiteboarding is a mode, not a kind.** There is no `'whiteboard'` kind.
- **Planning is kinds, not a mode.** A Board, Sheet or Dashboard is a tab of its own, added from **+**; nothing
  switches a general tab into Plan.
- **Running a session is a control, not a mode.** The Workshop control is on or off for the tab, in whichever mode
  it is.
- **Content is shared between modes.** A stroke drawn in Sketch mode is a
  `freehand` element in Structured mode too, and a shape placed in Structured mode
  is there in Sketch mode. Nothing is hidden, converted or locked by a switch.

## The mode switch

- **Beside the menu (hamburger) button, on every general tab.** The top chrome's switch (`EditorModeSwitch`) sits
  directly to the right of the menu button, last in the brand group at the top left
  ([Toolbar layout](toolbar-layout.md#the-top-line)). A tab with content changes mode here: the palette and the
  active tab's glyph follow at once, and every element stays exactly where it is.
  - **Under 1280px wide** (a laptop, a tablet, a phone) it shows the icon and the chevron only, no name, to save
    room on the top line for the Palette strip; its accessible name still says the mode. It sits in the brand group, top left, whether or not the line holds a strip.
  - It stays up in every mode, so it never moves when the mode changes.
- **And on an empty tab's start.** The switch also leads every start panel's rail ([Template
  starts](start-diagramming.md) "Changing mode"), named and full width (`StartModeSwitch`), so a tab begun in the
  wrong mode changes before anything is made.
- **The two always agree.** On an empty tab both show at once. Both read and write the one source of truth, the
  tab's mode (`Tab.opensIn`, through the editor's one `EditorModeState`), so a switch in either place updates the
  other, the palette and the active tab's glyph in the same render.
- **Nowhere else.** The tab menu holds no Mode section, and the tab list and the Explorer offer none.
- **A dropdown chip** (`ModeMenuChip`): on the start's rail a full-width row; beside the menu button a compact
  chip (`compact`). Both show the current mode's icon, its name (not on a phone beside the menu button) and a
  chevron, on the faint tint the editor's menu-like controls use. A press opens the **mode menu** below it, hanging
  from its left edge. Choosing a row switches and closes the menu; Escape or a press outside closes it.
  - **No hover card:** it would cover the menu the chip opens.
  - Semantics: a menu button (`aria-haspopup="menu"`, `aria-expanded`, `aria-keyshortcuts="Shift+D"`) over a
    `menu` of `menuitemradio` rows; arrow keys open it and move within it, wrapping, Home and End jump, Enter or
    Space chooses the focused row. The start's chip is named for the tab it sets ("Tab mode: Structured"), the top
    chrome's for the editor ("Editor mode: Structured"), so the two never share a name while both show.
  - The top chrome's menu floats over the canvas (a portal), kept 8px inside the viewport, so it never sits under
    the canvas's own overlays nor runs off a phone's right edge.
  - The same for everyone, power user mode or not, on a phone as on a computer.
- **The mode menu is a plain dropdown**, styled as the toolbar group's menus: one list, a row per mode in the order
  **Sketch, Structured, Pages**. A row is the mode's mark, its name and, on the current mode, a check at the row's
  end. Nothing else: no descriptions, no preview, no tool chips, no tints.
  - The panel is 220px wide (the full width of the start's rail there), with 4px padding and a 12px radius on the
    menu surface; each row is 36px tall with a 6px radius, 10px across, its mark 16px.
  - The current row sits on the hover tint, its name and mark in the strong text colour, its check in the brand
    colour; the row under the pointer or the keyboard takes the lighter hover tint. The focus ring is the brand
    colour's, at least 3:1 against the menu (WCAG 2.2 AA).
- **One switch, two places:** the chip beside the menu button and every start panel's rail open the same menu, by
  the same rules. The New Document wizard's cards are a choice of what to make, not a switch.
- **One mode chosen:** Sketch, Structured or Pages. Exactly one is active.
- **Switching is instant and lossless:** no dialog, no reload, and no element changes (the tab's
  mode is the one field it writes, with what the mode brings: "Where the mode lives"); the
  selection is kept, an in-progress gesture or text edit is finished first, and the canvas
  viewport does not move. The Workshop control keeps its state across a switch.
- **Where it is offered:** on a general, unlocked tab, empty or not, to an Editor ([Share
  roles](../013-workspace/share-roles.md): changing a tab's mode is reshaping it). A Participant, a Viewer, and
  everyone on a locked tab, sees no switch and sees the tab in its mode; Shift+D does nothing for them.
- **Not on event-storming boards or Plan tabs:** each kind keeps its own tools and shows no switch. A Plan tab is a
  Board, Sheet, Dashboard or Form tab, or a general tab stored in Plan (an empty one is the Plan start, Start
  Planning; one with content predates Plan tabs and keeps working as it is).
- **Width:** the start's switch fills its row; the top chrome's chip takes only the width its content needs, so a
  short name (Pages) leaves no empty space. The tab name beside it moves a little on a switch, which is the person's
  own choice.
- **Shift+D** moves the tab to the next mode, Sketch, Structured, Pages and round again, shown in the chip's
  `aria-keyshortcuts` and Settings › Keyboard; a switch by key is announced politely ("Sketch mode"). It works
  wherever the switch is offered, and obeys the character-key shortcuts setting.
- **Accessible:** reachable by keyboard, its state exposed to assistive
  technology, its text and focus ring at least WCAG 2.2 AA.

## Where the mode lives

- **The mode is the tab's, the same for everyone.** A general tab stores its editor mode
  (`Tab.opensIn`, `diagram` when absent; the field keeps its stored name). Everyone on the tab
  works in that mode at once: a view that differed from person to person would be inconsistent.
- **Switching is a tab edit.** The switch beside the menu button, the start's switch, Shift+D and a start's
  template from another mode, used by an editor on a general, unlocked tab, set the tab's mode: **one tab edit** (one undo step,
  synced to everyone). Everything the switch brings with it lands in the same edit: entering
  Pages puts a board that does not fit its first page onto a page made around it
  ([Pages](pages-mode.md) "Into pages"), and leaving Pages with **Turn Into
  Pages** turns the articles into Page elements ([Article pages](article-pages.md#leaving-pages)).
- **Undo switches back.** Undo after a switch puts the tab back exactly as it was, in the mode it
  was in, for everyone; Redo switches again. Undoing further back past a switch returns the tab to
  that earlier mode too.
- **Everyone follows a switch.** When the tab's mode changes under someone (a collaborator's
  switch, their undo or redo), their view switches at once:
  - a text edit in progress is kept, so nothing typed is lost; a gesture in progress (a drag, a
    stroke) is finished first, as a switch of one's own finishes it;
  - a toast says who switched: "<Name> switched this tab to <Mode>." ("Someone" when the room
    gives no name); no toast for one's own switch, undo or redo.
- **Who can switch:** an editor on a general tab. A view-role visitor and everyone on a locked tab
  follow the tab's mode and see no switch. An event-storming board is always Structured and a Plan tab always
  Plan; neither shows a switch.
- **The tab says what it opens in** because its mode is stored: a tab opens in its mode for
  everyone, including a person opening it for the first time. The Whiteboard template, Quick
  Start entry and whiteboard imports set it to `draw`.
- **Stored modes that are no longer modes.** A general tab stored with `opensIn: 'workshop'` (or its older
  `'facilitate'`) opens in Structured with the Workshop control on, for everyone; nothing is rewritten until an
  editor next switches its mode or turns the control, which writes the mode and the control as they now are
  ([Workshop control](../012-collaboration/workshop-mode.md#existing-workshop-tabs)). A general tab stored with
  `opensIn: 'plan'` stays a Plan tab: empty, it shows Start Planning; with content, it keeps working as before
  (an old tab of boards and sheets alone converts to Plan tabs, [Plan tabs](../026-plan/plan-tabs.md#converting-old-plan-tabs)).
- **Nothing is remembered per person.** A mode chosen before this change and kept in a browser
  (`livedoc:v2:editor-mode:<tab>`) is no longer read: the tab's own mode wins. The keys are
  left in place and ignored.
- **+ adds a tab or a Plan tab.** The document group's **+** opens the **add menu**: **Tab**, then **Board**,
  **Sheet** and **Dashboard** (each row its mark and name, styled as the mode menu). The tab list's footer offers
  the same four as **New Tab**, **New Board**, **New Sheet** and **New Dashboard**, and the command palette's
  **Create New Tab** is the first.
  - **Tab** makes a general tab straight away, after the others, in the mode of the tab its maker was on (the
    active tab's mode, for everyone on the new tab): made from a Pages tab it is a Pages tab, from a Sketch tab a
    Sketch tab, and from an event-storming board or a Plan tab a Structured tab. It carries the source's look
    ([Canvas and palette](../008-canvas/canvas-and-palette.md) "Selecting & adding") and the source's Workshop
    control (on when the source's is), never the source's kind.
  - **Board**, **Sheet** and **Dashboard** make a Plan tab after the others, opening on Start Planning at that
    choice (Boards, Spreadsheets or Dashboards on its rail) so the next pick makes the tab that kind
    ([Plan tabs](../026-plan/plan-tabs.md#the-kinds)).
  - A new tab opens empty on its own start (Start Diagramming, Start Sketching, Start a Workshop, Start Making
    Pages, Start Planning: [Template starts](start-diagramming.md), [Working in Plan](../026-plan/plan-mode.md#starting-a-board);
    `newTabOpening` in `apps/live/lib/new-tab-seed.ts`), whose search also finds every other start's templates.
    Only the template chosen for it changes that: every template opens as it was made to
    ([Templates by mode](templates-by-mode.md)), the **Whiteboard** in Sketch, Blank in Structured, a session
    template in Structured with the Workshop control on, and an **Event Storming** board is always Structured.
  - **Duplicate** is not a new tab: the copy keeps the original's mode, kind and Workshop control.
  - Adding a tab is an Editor's alone: a Participant, a Viewer and any tab-scoped link see no **+** and add
    no tab ([Share roles](../013-workspace/share-roles.md), [Tab-scoped share
    links](../013-workspace/tab-scoped-share-links.md)), whichever row it would be.
- **A new document opens in Structured** unless its maker chose otherwise: a new document's Mode step on `/new`
  picks its choice's blank, so the document opens as that choice ([New document route](new-document-route.md)). An
  import that sets its own mode wins.
- **No Mode in the tab menu.** The tab menu offers no mode choice: the switch beside the menu button is the one
  place a tab with content changes mode (above). The tab pill's icon follows a switch at once, as the palette does.
- **The tab pill shows the tab's mode.** Each tab pill leads with the icon of its mode (the same
  glyph the mode switch uses), tinted with the tab's theme accent. An
  event-storming board is always Structured, so it shows the Structured icon. A Board, Sheet or Dashboard tab
  shows its kind's glyph instead, and the Plan start the board mark ([Plan tabs](../026-plan/plan-tabs.md#the-kinds)).

## One look

There is one look, the diagram look, with the whiteboard's best parts merged
into it. **A mode chooses the defaults written into new content and the
backdrop behind it; it never re-colours what is already there.** Every colour
is stored on the element, so collaborators in different modes see the same
element in the same colour.

- **Each mode's default canvas.** The canvas colour is the tab's in every mode; the pattern behind it suits the
  mode. Structured shows the tab's pattern (the theme's dot grid until someone picks another). Sketch shows the person's
  own board pattern (graph paper until chosen, [Sketch mode](../023-draw-mode/draw-mode.md#board-background)).
  Pages shows a **plain** surround, because its pages are the paper and a pattern behind them competes with
  the layout; a Plan tab shows a **blank canvas** too, so boards, sheets and dashboards carry the page. Pages mode's
  and Plan's apply only while the tab keeps its theme's pattern: a pattern someone picked shows in every mode but
  Sketch. None is stored, so exports, thumbnails and other people's modes keep the tab's own (`MODE_PATTERNS`,
  `resolveViewBackdrop`).
- **Off-white light canvas.** The Default theme's light canvas is the board's
  off-white (`#fbfaf7`); its dark canvas stays `#0d121a`.
- **Ink is one colour everywhere.** **Ink**, the drawing colour (`#1c1917`
  on a light canvas, `#e2e8f0` on a dark one), is the same on every theme and
  stored by name. Any element can take it: in Sketch mode from the pen and
  quick style rows, in Structured mode as the **eighth swatch, after the theme's
  colours**, in the quick style panel's colour rows and the element menu's
  colour rows.
  - Pen strokes and text with no colour of their own are drawn in Ink, in
    both modes.
  - Shapes keep their theme defaults: a shape added in Structured mode is filled
    and outlined as today.
- **Sketch mode writes Ink, unfilled.** A shape, line or arrow made in Sketch mode
  is written with an Ink outline and no fill, so it looks the same in Structured
  mode and to every collaborator.
- **Marker colours are first-class.** The stock colours (Ink, Grey, Blue, Red,
  Orange, Yellow, Green, Teal, Violet, Pink) are stored by name on any element and
  drawn in the version tuned for **the canvas behind them**, light or dark,
  on every tab, in every export, thumbnail and image the api or MCP renders.
  On the Default theme that canvas follows the viewer's appearance; a theme
  with a fixed canvas keeps its ink readable whichever appearance is on.
- **One backdrop colour in both modes.** The canvas colour is the tab's
  own: its theme's canvas, or the custom background colour when one is set;
  on the Default theme, the off-white or dark canvas.
- **The pattern:** in Structured mode, the tab's stored pattern, shared by
  everyone. In Sketch mode, the person's own: Plain, Dots or Grid as they last
  chose it in Sketch mode (synced preferences, Grid until chosen), not stored
  on the tab, so choosing it changes nothing for anyone else.
- **Exports, thumbnails and api or MCP images** use the tab's Structured
  backdrop: its colour and stored pattern, whoever exports and in whichever
  mode.

## What a mode brings into focus

- **Structured mode** is the editor as described by
  [Canvas and palette](../008-canvas/canvas-and-palette.md),
  [Toolbar layout](toolbar-layout.md) and the canvas specs.
- **Sketch mode** is what the whiteboard was: the dock with its pens, shapes,
  history and settings; the whiteboard's keyboard shortcuts; pen versus touch;
  picking by the drawn line; strokes that stay open; nothing animating in; no guides for pens; shape recognition and the two
  erasers ([Sketch mode](../023-draw-mode/draw-mode.md)).
- **What a mode writes, stays.** A rule that shapes content is stored on the
  element when it is made, never read from the mode: a text box made in Sketch
  mode **hugs its text** in both modes and for everyone; one made in Structured
  mode does not. A rule about input (what a click picks, which keys do what)
  follows the person's current mode.
- **A text box's sizing** is one field, `TextElement.sizing`:
  - `'fit'`: the width follows the words up to the wrap width, and the height
    hugs the lines (a text box clicked into place in Sketch mode);
  - `'wrap'`: the width is set, and the height hugs the lines (dragged out or
    resized in Sketch mode);
  - absent: a fixed box, its text wrapping inside it (Structured mode).
  - It replaces `autoWidth`: `autoWidth: true` becomes `'fit'`; text on a
    migrated whiteboard without it becomes `'wrap'`, as it hugged there.
- **Entering Sketch mode**, by opening a tab or by switching, puts the active
  pen in hand on an empty tab and Select on a tab with content.
- **Pages mode** is Structured mode drawn as pages, with the palette
  narrowed (both below); every other rule, tool and shortcut is Structured mode's.
- **A Plan tab** is worked as Structured mode is, with Plan boards taking input as a planning tool and no palette
  ([Working in Plan](../026-plan/plan-mode.md)).
- **The Workshop control** adds the session kit to any of the three modes: the Session strip's three tools, and in
  Structured and Pages the Collaborate categories and Stickers in the palette
  ([Workshop control](../012-collaboration/workshop-mode.md)).
- **Each mode's mark**: Sketch a marker, Structured a flowchart (two steps joined),
  Pages a page with a little chart above two lines of writing (its first two
  page kinds, infographic and article); the same glyph on the switch and the tab pill. The Plan start's is a board of
  three columns with a raised card, and the Workshop control's a flipchart on an easel.
- **No further cue:** the dock (in place of the palette) and the switch's
  own label say which mode is on; no tint, accent or notice is added.
- **Leaving a mode puts its tool down**, as leaving a whiteboard did: a pen,
  the eraser or an armed shape never carries over into the other mode. A mode's tool can still
  be **picked up** in another on purpose: the Toolbar strip's Search offers Sketch mode's markers
  in Structured, Pages and on Plan tabs ([Toolbar layout](toolbar-layout.md#search-every-element-type)),
  and one picked there is put down by a switch like any other.

## The tool a mode starts with

- Every mode starts on **Select**; a Plan tab starts on **Hand** (a board's cards take the pointer
  themselves). On a phone every mode starts on **Hand**, so a drag moves the canvas.
- The tool is picked whenever the mode changes, the first mode a tab opens in included; any tool can be picked
  after. An embedded viewer always starts on Hand.
- A Plan tab leaves **Eraser** and **Format** out ([Working in Plan](../026-plan/plan-mode.md#tools)).
- Turning the Workshop control on or off changes no tool.

## The palette per mode

Each mode has its own **palette layout**
(`apps/live/components/palette/palette-layouts.ts`): the categories its
palette offers, in order, what each is called there, and which tiles each
holds.

- **Identity is shared, arrangement is per mode.** A category's glyph and its
  default label, blurb and band live in the category catalogue
  (`PALETTE_CATEGORIES`); a tile's identity in the tile catalogue
  (`PALETTE_TILES`). A layout only arranges them, so one tile can sit in
  different categories in different modes, and a category can be renamed,
  re-banded or re-filled for one mode without touching another.
- **A layout entry** names a category and may override its `label`,
  `description` and `band`, and list its `tiles` by id, in order. With no list
  it holds the category's own tiles (`tilesForCategory`), so a layout spells
  out only where a mode differs. `boardOnly` keeps a category to
  event-storming boards.
- **Catalogue categories** (My shapes, Icons, Stickers, Tech) are
  bodies with their own content and take no tile list.
- **A body decides presentation only** (a grid, rows with a blurb, Media's
  and Components' collapsed groups); it
  renders whatever tiles the layout hands it. A category with no body of its
  own, such as Popular, is a tile grid.
- **Every surface reads the layout:** the Toolbar strip, its category bar and flyouts (Pages, and Structured with
  the Workshop control on:
  [The category bar](toolbar-layout.md#the-category-bar), which shows the layout without Popular, with one-word
  names, Write and Draw apart, and, with the Workshop control on, the session tools as Ask and Session), and its
  category picker, tiles and More popover (Structured with the control off, a Plan tab).
- Sketch mode shows its own tools in place of the palette, so it borrows
  Structured's layout.
- **The Workshop control adds the session kit** to whichever layout the tab shows (`withWorkshopKit`): the six
  Collaborate categories as a **Collaborate** band, and **Stickers** where the layout has none
  ([Workshop control](../012-collaboration/workshop-mode.md#the-palette)). Off, Structured offers no **Stickers**
  and no **Collaborate**, though Search still finds and places them.

Today the layouts differ as below. Within the shared categories,
**Sankey** sits in **Concepts**, after the concept graphics, in Structured and Pages: a flow drawn as wide as
what it carries explains an idea the way a funnel or a cycle does.
Pages's **Write** leaves out **Page** (the page is the canvas there) and
**Annotation**, it offers **no Build** (mind maps, flowcharts, lanes and frames organise a diagram, not a visual
page: its **Components** ends with the **Stack**, and its **Data** with the **Timeline** and the **Table**), and its
**Components** leaves out **Entity**; Structured's
**Media** leaves out the **Embed** group (YouTube, Vimeo, Loom, Figma, Google
Docs, Website), keeping Image and Avatar; it offers Build's tiles as two categories, **Diagrams** (Mind node, Org
chart, Flowchart, Sequence, Table and the **Entity**, also on Structured's Popular) and
**Layout** (Lane, Frame, Stack, **Boundary**, Timeline, then Diagram key and the **Card**, **Badge** and **Step
Number** from Components: [The card](../009-elements/card.md), [The badge](../009-elements/badge.md),
[The step number](../009-elements/step-number.md), [The boundary](../009-elements/boundary.md)), so what is built
sits apart from what it is laid out in ([Toolbar layout](toolbar-layout.md#the-category-bar)); and its **Write**
adds the **Callout** from Components (a headed note belongs to a diagram as much as a page) ahead of the Comment
panel and Action card, which close it as their own Comments group.

| Category          | Structured | Pages     | Plan tab | Workshop control on |
| ----------------- | ---------- | --------- | -------- | ------------------- |
| Popular           | yes        | yes       | no       | unchanged           |
| Plan's seven      | no         | no        | yes      | unchanged           |
| Logo              | no         | logo page | no       | unchanged           |
| Shapes            | yes        | yes       | no       | unchanged           |
| My shapes         | yes        | yes       | no       | unchanged           |
| Write             | yes        | yes       | no       | unchanged           |
| Draw              | yes        | no        | no       | unchanged           |
| Build             | no         | no        | no       | unchanged           |
| Diagrams          | yes        | no        | no       | unchanged           |
| Layout            | yes        | no        | no       | unchanged           |
| Components        | no         | yes       | no       | unchanged           |
| Concepts          | yes        | yes       | no       | unchanged           |
| Devices           | no         | yes       | no       | unchanged           |
| Event Storming    | board      | no        | no       | unchanged           |
| Icons             | yes        | yes       | no       | unchanged           |
| Stickers          | no         | yes       | no       | added               |
| Tech              | yes        | no        | no       | unchanged           |
| Media             | yes        | yes       | no       | unchanged           |
| Data              | no         | yes       | no       | unchanged           |
| Collaborate's six | no         | no        | no       | added               |

Pages offers **Logo** only while the tab has a logo page, and turns to it when one is added
or pressed into ([Logo pages](logo-pages.md#the-logo-palette)).

A Plan tab shows no palette: its boards, sheets and dashboards carry their own tools
([Working in Plan](../026-plan/plan-mode.md#no-palette)). The Workshop control is not offered there.

- **The landing category** is the mode's **Popular** (a Plan tab's is **Cards**), and the notation on an
  event-storming board
  (the layout's `landing`). Switching mode re-lands the palette there, so it
  never shows a category the new mode leaves out; turning the Workshop control off re-lands it there too when the
  category on show was the kit's.
- **Popular** is the landing category of every mode: the tiles that mode is most
  often built from (twelve at most), listed in its layout entry, fixed (not edited or
  reordered). A layout may put a divider of its own between two entries (`DIVIDE`), shown on the strip as a
  tile's own fixed divider is. An entry may be an **opener** instead of a tile (`palette-openers`): it stands for a whole category, or
  one group of a catalogue, and on the strip opens it in a popover under itself, drawn with a chevron as the
  catalogue groups are ([Toolbar layout](toolbar-layout.md) "More"); in the Palette panel it moves the palette to
  that category. An opener places nothing and is not a search result. It replaced the per-browser **Favourites**
  ([Palette Favourites](../010-palette/palette-favourites.md), removed).
  - **Structured**: Square, Circle, Diamond, Text, Arrow, Frame, Mind node, Flowchart node, Sankey, Table, the
    **AWS** opener (Technology's AWS marks), Entity.
  - **Pages**: Text, Square, Circle, Image, Speech bubble, Pie, Bar,
    Donut, Stat row, Process, Timeline, Callout, each also reachable from
    another category the mode offers.
- Elements already on the canvas are untouched: narrowing the palette only
  changes what is offered to add.

## The pages

Pages mode draws **pages** on the canvas, in a row, like artboards in
a design tool. What a page is and offers (sizes, backgrounds, layouts, page
actions, snapping, export, putting content onto a page, page slides) is
[Pages](pages-mode.md); this section is the basics.

- **The pages** are sheets of paper (white in light chrome, slate-900 in dark)
  with a soft shadow, under every element. The first is centred on the row
  anchor (`Page.rowAt`, the canvas origin when absent; [Pages
  pages](pages-mode.md) "A page"), so a board put onto a page keeps its
  place; each further page sits **96** px (`PAGE_GAP`) to the right
  of the one before, every page centred on the row's horizontal axis.
  - A page is **A4** unless it has a size of its own: at 96 px per inch,
    **794 x 1123** in portrait, **1123 x 794** in landscape (`A4_SHORT_SIDE`,
    `A4_LONG_SIDE`, `packages/document/src/page.ts`); the other
    sizes are in [Pages](pages-mode.md) "Sizes".
  - The pages are the tab's (`Tab.pages`: `Page[]`, in row
    order), so everyone lays out on the same ones. A tab with no `pages` has one
    page, in its legacy `pageOrientation` (portrait when absent); the legacy
    field is dropped the first time the pages change. At most **100** pages
    (`MAX_PAGES`).
- **The surround** is the tab's own canvas: its colour, and every canvas setting, apply behind the pages exactly
  as in Structured mode. Its pattern is **plain** while the tab keeps its theme's pattern (see One look, "Each mode's
  default canvas"); a pattern someone picked shows as it does in Structured mode.
- **Each page's label** sits above its top-left corner (**A4 · Portrait** on an infographic page, or
  **A4 · Landscape · Article**, its name first when it has one, never "Page n": the page
  navigator shows its place), and
  **its settings cog** above its top-right, both held at one screen size at any
  zoom. The cog (tooltip **Page settings**, or **Page 2 settings**) opens the
  **page panel** ([Pages](pages-mode.md) "The page panel").
  A viewer who cannot edit (a view role, a locked tab) gets no cog and no add
  button.
- **Adding a page:** a round **+** sits in the gap's width to the right of the
  last page, level with its middle, adding another page like the last; under it
  a smaller button opens **Add a Page** to choose a page of any kind
  ([Pages](pages-mode.md) "Adding a page"). The page goes after the last; both
  are gone at the limit, and the view then frames the new page.
- **Content moves with its page.** Turning, resizing, moving or deleting a page
  moves the pages after it; every element whose centre lies on a page that
  moves (and an arrow's free ends) moves with it, re-centred on the page's
  centre (`withPages`); on an article page it keeps its place from
  the page's top-left corner, where the writing starts. A deleted page takes its content with it; a
  turned or resized page re-fits its own content
  ([Pages](pages-mode.md) "Sizes"). Elements on no page stay
  where they are. Each change is one tab edit (one undo step, synced to
  everyone).
- **Turning, adding and deleting animate:** the sheets ease to their new places
  and shapes over 200 ms (none under reduced motion).
- **Centred in the viewport:** entering Pages mode or opening a tab in it
  fits the first page itself (`pageFitBox(page)`), never the whole row of
  pages: the tab's own fit on landing, and the fit after a template or an import
  lands on it, frame the first page too (only Fit to Screen fits everything), and going to a page
  (its label, the page navigator, a new page) fits that page, so whatever its shape
  (a landscape slide on a wide screen too) it fills the view; turning or resizing a
  page re-fits it. Where the Toolbar strip lies over
  the canvas's top edge, the page centres in the band below it
  (`computeFitBelow`).
- **Only the pages are drawn on.** A draw, tap-to-place or double-click-to-add
  that starts off every page is ignored (`pressIsOffPage`); elements already on
  the canvas still move freely, on or off the pages.
- **Elements are cut off at the page edges.** Whatever part of an element hangs
  off a page is hidden and cannot be pressed, as if the pages were the only
  paper (`PageClip`, a layer clipped to the pages that holds the
  element views). The selection handles are drawn above it, so an element
  hanging off a page still shows all of them. Not in the isometric view, whose
  3D stack a clip would flatten.
- **The sheets are a view, never elements.** They take no pointer events (a
  press on one is a press on the empty canvas). Thumbnails see the tab's own
  backdrop and the elements whole; the Export dialog in Pages mode exports
  the pages ([Pages](pages-mode.md) "Export").
- The sheets are `apps/live/components/canvas/CanvasPages.tsx`; the pages'
  edits and the centring are `apps/live/hooks/editor/usePagesMode.ts`.

## Leaving Pages

Structured and Sketch show no pages, so an editor's switch away from Pages on a tab that has
something on it asks first:

- **A tab with articles** asks Turn Articles Into Pages? (Convert, Keep as Articles, Cancel;
  [Article pages](article-pages.md#leaving-pages)).
- **A tab with content but no articles** asks a lighter question: a small card hanging from the
  mode switch that asked (the one beside the menu button, `data-mode-switch`), pointing at it, below
  it or above when there is no room below. A warning glyph in an amber disc, the title "Switch to
  <Mode>?" and one sentence: "<Mode> mode doesn't show pages. Changes you make there may not fit
  back onto your pages when you return to Pages." Its buttons are **Cancel** and **Switch** (the
  target mode's glyph on it, focused). Escape or a press outside stays.
  With no switch on screen (a Shift+D press, a start's template from another mode), the card sits centred near
  the top of the screen.
- An empty tab, a visitor or a locked tab switches straight away.
- Confirming sends `Editor` · `Changed` · `LeavePagesConfirmed`, beside the switch's own
  `ModeDiagram` / `ModeDraw`.

## Every mode, always offered

Every mode of the catalogue is offered to everyone who may switch: the mode switch always lists all three, and a
tab always opens in its stored mode. Shift+D steps through all three. The template picker's filter offers what a
template makes: the three modes, then **Workshop** (Structured with the Workshop control on) and **Plan** (Plan
tabs) ([Templates by mode](templates-by-mode.md)).

Pages and Plan each had a switch in **Settings › Experimental** while they
were new. Both graduated on 2026-10-06, and the **Experimental** category went
with them. Their `pagesModeEnabled` and `planModeEnabled` preferences are
retired keys ([User preferences](user-preferences.md) "Retired keys"), so a
person who had switched either off sees it again. Their `UI` · `Toggled` ·
`PagesMode{On,Off}` / `PlanMode{On,Off}` events are retired from the
dashboard ([Telemetry](../017-telemetry/telemetry.md) "Retired features").

## Existing whiteboards

- A stored tab with `kind: 'whiteboard'` reads as a general tab that opens in
  Sketch mode. Its elements, background and layers are unchanged.
- Imports that landed on a whiteboard (Excalidraw, Microsoft Whiteboard) land
  on a general tab in Sketch mode.
- The **Blank Whiteboard** template (kind id `whiteboard`) creates a
  general tab that opens in Sketch mode, as the other Sketch templates do
  ([Templates by mode](templates-by-mode.md)).

## Telemetry ([Telemetry](../017-telemetry/telemetry.md))

- `Editor` · `Changed` · `ModeDraw` (Sketch) / `ModeDiagram` (Structured) / `ModePages`, fired by
  the switch and Shift+D before the mode applies (never by a collaborator's
  switch arriving, an undo or a redo). `ModePlan` and `ModeWorkshop` are no longer fired: Plan is tabs and Workshop
  a control (`Editor` · `Toggled` · `WorkshopOn` / `WorkshopOff`, [Workshop
  control](../012-collaboration/workshop-mode.md#telemetry)). Their stored history stays on the dashboard.
- `Tab` · `Created` · `Board` / `Sheet` / `Dashboard`, fired by the add menu's Plan rows (a plain **Tab** stays
  `Tab` · `Created` with no type), and `UI` · `Opened` · `AddTabMenu` when **+** opens the add menu.
- `Tab` · `Changed` · `OpensInDiagram` / `OpensInDraw` / `OpensInPages` / `OpensInPlan` were
  fired by the retired Opens in submenu, whose successor (the tab menu's Mode) is retired too.
- `Tab` · `Changed` · `PagePortrait` / `PageLandscape`, fired by a page's
  orientation in Pages mode, `PageAdded` (an infographic page; `SlidePageAdded`,
  `ArticleAdded` and `LogoPageAdded` for the other kinds) by its add button, and `PageRemoved` by
  Delete Page.
- Sketch mode's own events are the **`Draw`** category (pens, shapes, eraser,
  recognition, background, snap colours,
  [Sketch mode](../023-draw-mode/draw-mode.md#telemetry-telemetry--public-transparency-dashboard)).
  It was named `Whiteboard`; the stored history is rewritten to `Draw` so the
  dashboard's lines continue.
- Pages mode's events were named for Infographic mode (`ModeInfographic`,
  `OpensInInfographic`, `InfographicModeOn` / `Off`); migration
  `0066_pages_telemetry.sql` rewrites the stored history to the Pages
  names so the dashboard's lines continue.

## Naming in the interface

- The help article **Editor Modes** (`/help/canvas/editor-modes/`) explains the three modes, the
  start's switch, the add menu and the Workshop control, and links to each mode's own article.
- **Sketch** (stored `draw`) and **Structured** (stored `diagram`) are the modes' names everywhere a person reads
  them: the switch, the tab pill's name, Settings (the **Editor › Sketch** sub-category, Dock Position), the
  starts, the New Document wizard, the template picker, the Explorer's Opens in, help, tours, the command palette
  and the marketing site. They were called **Draw** and **Diagram**. The **Draw** palette category and the drawing
  tools keep their names: they are tools, not the mode. Sketch mode's help article is **Sketch mode** at
  `/help/canvas/sketch-mode/`, the `/help/canvas/draw-mode/` address redirecting. Sketch's start is **Start
  Sketching** (it was Start Drawing); Structured's stays **Start Diagramming**, as a diagram is what it starts.
- The template card is **Blank Whiteboard**, one of five blanks (Blank Whiteboard,
  Blank Diagram, Blank Illustration, Blank Session, Blank Plan), one per choice of the template picker's filter,
  that lead Popular
  ([Templates by mode](templates-by-mode.md)); the document it makes is named "Untitled
  Whiteboard", for the activity a person comes for.
- **Pages** is the mode's name everywhere: the switch, Settings, the tab menu, the New Document
  wizard, help, the marketing site and the agents' tools. Its template start is **Start Making
  Pages**. It was called **Illustrate**, and before that **Infographic** while its pages were all
  infographics. Every stored trace of either old name reads as Pages: `opensIn: 'illustrate'` or
  `'infographic'`, a recorded creation intent, a create's intent and a `/new?mode=` link
  (`parseEditorMode`), a default-folder key `mode:illustrate` or `mode:infographic`
  (`parsePlacementDefaultKey`; clearing the default clears every name). Tab bodies are not
  rewritten. The tour's preferences `illustrateTourSeen` and `illustrateTourKinds` are renamed
  `pagesTourSeen` and `pagesTourKinds` (migration 0097 in D1, `upgradeLegacyPreferences` for any
  older copy). The `infographicModeEnabled` and `illustrateModeEnabled` preferences went with the
  mode's Settings switch (retired keys). "Infographic" now names a kind of page
  ([Pages](pages-mode.md) "Page kinds"), and "illustration" stays a plain word (the **Blank
  Illustration** template, help figures).
  The help articles moved to `/help/canvas/pages-mode/`, the `/help/canvas/illustrate/` and
  `/help/canvas/infographics/` addresses redirecting.
- **Workshop** names the control for running a session ([Workshop control](../012-collaboration/workshop-mode.md)),
  everywhere: the actions group, the New Document wizard, the template picker, help, the marketing site and the
  agents' tools. It was a mode until the Workshop control replaced it, and **Facilitate** before that. Its
  template start is **Start a Workshop** and its tour **The Workshop Tour**. Every
  stored trace of the old name reads as Workshop: `opensIn: 'facilitate'`, a recorded creation intent, a create's
  intent, a `/new?mode=` link and a recently opened document's mode (`parseEditorMode`), an `opens-in:facilitate`
  Explorer filter, and a default-folder key `mode:facilitate` (`parsePlacementDefaultKey`; clearing the default
  clears both names). Tab bodies are not rewritten. The tour's preference `facilitateTourSeen` is renamed
  `workshopTourSeen` (migration 0098 in D1, `upgradeLegacyPreferences` for any older copy), and telemetry history
  moves to the new event names and help slugs. The help article is **The Workshop control** at
  `/help/canvas/workshop/`, the `/help/canvas/workshop-mode/` and `/help/canvas/facilitate-mode/` addresses
  redirecting. The **facilitator** keeps its name.
- **Plan** names the Plan tabs (Board, Sheet, Dashboard, Form) and their start, **Start Planning**, never a mode:
  "Plan mode" is gone from the interface. Its help article is **Plan tabs** at `/help/canvas/plan-tabs/`, the
  `/help/canvas/plan-mode/` address redirecting.

## Non-goals

- Further editor modes beyond these three until use asks for one.
- A mode for planning or for running a session: both are served without one (Plan tabs, the Workshop control).
- A mode per element or per layer.
- Converting content between modes (a stroke into a shape on switching).

## References

[Document](../006-document/document.md), [Sketch mode](../023-draw-mode/draw-mode.md),
[Event storming](../021-event-storming/event-storming.md),
[Toolbar layout](toolbar-layout.md), [Zen mode](zen-mode.md).

## Defaults

Each default below was applied where this spec is silent or qualitative, and holds until a human confirms it.
The code cites each by its id.

- **D15** Where the remembered mode is kept: One `localStorage` key per tab, `livedoc:v2:editor-mode:<tabId>`, retired:
  the mode is the tab's (`Tab.opensIn`), and keys an earlier editor wrote are left in place, never read (default).
- **D16** Whether an opening-mode change moves people already on the tab: Yes: the mode is the tab's, and everyone on it
  follows a change; nothing is pinned per page (default).
- **D17** Who may choose Opens in on a locked tab: Nobody: on a locked tab the Mode choices are not offered at all
  (retired 2026-10-18 with the tab menu's Mode) (default).
- **D18** How Opens in stores Diagram: Written explicitly (`opensIn: 'diagram'`), not deleted (default).
- **D19** Where Opens in sits in the tab menu: Rows straight in the menu, after Import, Export and Clear: icon and name,
  no description (retired 2026-10-18: the tab menu holds no Mode) (default).
- **D20** Which tools a switch puts down besides the other mode's: The eraser in both directions; a palette-armed shape
  on entering Draw (default).
- **D21** How Ink is stored by name: `penColour` / `penTextColour: 'ink'`, a `PenColourName` beside the eight hued ones
  (default).
- **D22** A migrated board's unpainted shape label: `penTextColour: 'ink'`, as the board drew it (default).
- **D59** Whether a switch held by the Leave Pages question moves Opens in: Only once it goes ahead (Turn Into Pages or
  Keep as Articles); Cancel writes nothing (default).
- **D103** The mode menu's measures beyond "36px rows, 6px radius": Mock-up B's: a 220 px panel (the chip's width when
  wider), 4 px padding, 12 px radius, 16 px marks, a 14 px brand check (default).
- **D104** Whether the mode menu still shows Shift+D: Only as the chip's `aria-keyshortcuts` and in Settings › Keyboard;
  mock-up B shows no key cap (default).
- **D105** What a Plan tab's top line shows where the switch was: Nothing: no switch, as an event-storming board; the
  brand group simply ends at the menu button (default).
- **D106** Where an empty general tab stored `plan` sits: It stays the Plan start (Start Planning), with no mode switch
  on its rail; its search still reaches every other start (default).
- **D107** The add menu's rows and marks: Tab (the mark of the mode it will open in), Board (kanban), Sheet (grid),
  Dashboard (tiles); the tab list's footer as four rows (default).
- **D108** Where Board, Sheet and Dashboard land: A Plan start opened on Start Planning's matching rail category
  (Boards, Spreadsheets, Dashboards), kept for the maker only (default).
- **D109** Sketch's start's name: Start Sketching (was Start Drawing); Structured keeps Start Diagramming (default).
- **D110** The heading over other starts' matches, once Workshop and Plan are no modes: "Elsewhere", line "Choosing one
  changes this tab to match.", empty-state line "Found elsewhere." (default).
- **D111** Help addresses after the renames: `/help/canvas/sketch-mode/`, `/help/canvas/workshop/`,
  `/help/canvas/plan-tabs/`, each old address redirecting (default).
- **D112** The order of the five blanks and the wizard's cards: The openings' order: Sketch, Structured, Pages,
  Workshop, Plan (default).
- **D113** The tours named after a mode: Start Sketch Tour and Start Structured Tour (were Draw and Diagram); the
  Workshop and Plan tours keep their names (default).
- **D114** Where the top line finds room for the Workshop control and the longer Structured: Under 1280px the mode chip
  shows its mark alone (name read out); the Workshop control is its mark alone unless Button Labels is on, so a 1024px
  laptop keeps the Palette strip on the top line and a 1440px one keeps it centred (default).
