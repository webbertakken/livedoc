# Workshop control

**Workshop** is a control, not an editor mode: a toggle in the top line's actions group that brings the
**session kit** (the Session strip's Timer, Vote and Poll; the Collaborate categories and Stickers in the palette)
into whichever [editor mode](../007-editor/editor-modes.md) the tab is in, Sketch, Structured or Pages. A team runs
a retrospective, a town hall, a lean coffee or a workshop with it on; off, the modes are about what they make.

## Why

Diagram (now Structured) was the first mode, so it collected everything: shapes and arrows, and beside them a whole
workshop kit (34 Collaborate tiles, a sticker catalogue, a Session strip of Timer, Vote and Poll). Workshop then
became a fifth mode, which gave a session its own surface but tied it to one way of drawing: a team could not run a
vote on a sketch, or a poll over a page of slides, without leaving the mode the work was in. Running a session is
something a team does **on top of** any kind of work, so it is a control that adds the kit, not a mode that
replaces the tools.

## Domain language

| Term                 | Means                                                                                                | Not                                       |
| -------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| **Workshop control** | The toggle that brings the session kit into the tab's mode (`Tab.workshop`)                          | Workshop mode, Session mode, a tab kind   |
| **Workshop on**      | The tab's state while the control is on, the same for everyone on the tab                            | a person's preference                     |
| **session kit**      | What the control brings: the Session strip's three tools and the Collaborate and Stickers categories | the Collaborate elements already on a tab |
| **session**          | The activity a team runs on a tab (a retro, a town hall); never a stored thing                       | a tab kind, a document type               |
| **facilitator**      | The person holding the baton ([Facilitator](facilitator.md)); unrelated to who turned Workshop on    | anyone with Workshop on                   |
| **session tools**    | Timer, Vote and Poll ([Session tools](session-tools.md))                                             | the Collaborate elements as a whole       |
| **Collaborate**      | The session elements as a whole (`toolGroup: 'behaviour'`), offered as six categories                | comments and presence in general          |

- The interface says **Workshop**; specs and code say **Workshop control** or `Tab.workshop`.
- It was **Workshop mode** (`EditorMode` `'workshop'`), and **Facilitate** before that. Every stored trace of the
  mode reads as the control (below, "Existing workshop tabs").
- "Session" and "Collaborate" are not the control's name: both already name other things (the Session strip,
  Session buttons and the share session; the Collaborate elements and menu rows).

## The control

- **Where:** in the top line's actions group, first in its document actions, before Make a Copy, Present and Share
  ([Toolbar layout](../007-editor/toolbar-layout.md#the-top-line)). It is the group's flat button: the Workshop mark
  (a flipchart on an easel, `FlipchartIcon`), named **Workshop**. Like Search and Settings it shows its mark
  alone, its name in its hover card and read out, unless **Button Labels** is on
  ([User preferences](../007-editor/user-preferences.md)), when the name shows beside it (never on a phone). So the
  top line keeps its room and the Palette strip stays centred, and opening a document costs no extra layout pass.
- **A toggle button** (`aria-pressed`): pressed while Workshop is on, drawn with the brand fill Share uses for a
  shared document, so the state reads at a glance. The label never changes, so turning it on or off moves nothing
  (no layout shift); the fill, `aria-pressed` and the strip appearing carry the state.
- **Hover card:** title **Workshop**, line "Bring the session kit to this tab: timers, votes, polls and the
  Collaborate tiles." while off, "Put the session kit away. Anything on the canvas stays." while on.
- **Pressing it** turns the control on or off for the tab: **one tab edit** (one undo step, synced to everyone), as
  a mode switch is. Undo turns it back. Everyone on the tab follows at once; no toast, as the strip appearing or
  going says it.
- **Offered** on a general, unlocked tab to an Editor (below). Not on a Plan tab (Board, Sheet, Dashboard, Form or
  the Plan start), whose strip and tools are its own, nor on an event-storming board, which always has the kit.
- **Keyboard:** reachable by Tab in the actions group like its neighbours; Enter or Space toggles; the focus ring
  is the group's, at least 3:1 (WCAG 2.2 AA).

## Per tab, the same for everyone

- **The control is the tab's**, stored on the tab (`Tab.workshop: true` while on, absent while off), like its mode:
  everyone on the tab sees the same kit, so a timer or a vote one person can see, everyone can.
- **Independent of the mode.** Switching mode keeps the control as it is; turning the control changes no mode, no
  tool and no element.
- **A new tab** from the add menu's **Tab** takes the control from the tab it was made from, as it takes the mode
  ([Editor modes](../007-editor/editor-modes.md#where-the-mode-lives)). **Duplicate** keeps it.
- **A template** made for running a session (below) makes its tab with the control on.

## What it brings, per mode

| Mode       | Session strip     | Palette                                                                                           |
| ---------- | ----------------- | ------------------------------------------------------------------------------------------------- |
| Structured | Timer, Vote, Poll | Its own layout, plus the Collaborate band and Stickers; the strip is the category bar             |
| Pages      | Timer, Vote, Poll | Its own layout (it has Stickers), plus the Collaborate band; on the category bar, Ask and Session |
| Sketch     | Timer, Vote, Poll | None: Sketch shows its dock, so the strip is the kit                                              |

- **The mode's own tools are untouched.** Structured keeps its Popular, Concepts, Technology and Diagrams; Pages
  keeps its page kinds' palettes; Sketch keeps its dock.
- **Empty tab:** with the control on, an empty Structured tab's start is **Start a Workshop** (the session
  templates) in place of Start Diagramming; Sketch and Pages keep their own starts
  ([Template starts](../007-editor/start-diagramming.md)).
- **The Workshop tour** ([Workshop tour](workshop-tour.md)) is offered while the control is on.

## The palette

With the control on, the layout the tab's mode shows gains the session kit (`withWorkshopKit(layout)`):

- **The Collaborate band**: the six categories, in the room-first order, inserted before the layout's **Icons**
  (or last, where a layout has no Icons):
  - **Ask**: Dot vote, Poll, Quiz, the estimate scales, Temperature check, Idea box, Q&A board.
  - **Tools**: Timer, Stopwatch, Reveal zone, Done check, Picker.
  - **Record**: Comment panel, Action card, Agenda, Decision record, Roll call.
  - **React**: the five reaction pads.
  - **Selection Mode**: one button per selection mode.
  - **Navigate**: Portal, Bring focus, Chair, Desk, Sofa, Fence, Link card.
- **Stickers**, right after **Icons**, where the layout has none (Structured).
- **Popular is unchanged:** it stays the mode's twelve.
- **The strip is the category bar** ([Toolbar layout](../007-editor/toolbar-layout.md#the-category-bar)) with the
  control on, in Structured as in Pages, as the Workshop control's was: **Ask** has its own button and Tools, Record,
  React, Selection Mode and Navigate gather into **Session**, browsed in two panes. Off, Structured goes back to its
  category picker.
- **Turning it off** takes the kit's categories away; a palette showing one of them re-lands on the mode's Popular.
- A **Participant** gets the participant palette, as in every mode ([Share roles](#share-roles)).

## Off: what stays in every mode

- **Content stays.** A session element already on a tab (a session button, a reveal zone, an agenda, a sticker)
  renders and works whatever the control: pressing a session button still starts its tool, a reveal zone still
  reveals, a quiz still takes answers. Only what the palette **offers to add** and the strip change.
- **Search still finds them.** The Toolbar strip's Search keeps offering every tile
  ([Toolbar layout](../007-editor/toolbar-layout.md#search-every-element-type)): a timer or a sticker picked there
  with the control off is placed, and the control stays as it is.
- **Structured keeps two Collaborate tiles in Write:** the **Comment panel** and the **Action card**
  (`collab:comment-pin`, `collab:action-card`), because comments and assigned actions belong to every mode. With the
  control on they also sit in Record.
- **The element menus are unchanged.** A session element's own menu sections (Session, Reveal, Picker, Scale,
  Segments, Decision, Chair) and every element's Collaborate section follow the element, not the control.
- Collaborating on a tab is not running a session, so these are untouched and offered whatever the control:
  comments, the Comment panel tile, comment threads and mentions; presence, cursors, follow-me and Bring Focus;
  Presentation mode and the Slide Deck; assigned actions and the Collaborate Panel; the facilitator baton in the
  Collaborators dialog.

## The Session strip

`sessionStripTools(mode, { workshop, esBoard })`:

| Tab                                     | Strip tools              |
| --------------------------------------- | ------------------------ |
| Workshop on (Sketch, Structured, Pages) | Timer, Vote, Poll        |
| Event-storming board                    | Timer, Vote, Poll        |
| Plan tab                                | Timer, Vote              |
| Structured, Workshop off                | none                     |
| Sketch, Workshop off                    | none                     |
| Pages, Workshop off                     | Vote, Poll while running |

- **Off, Structured and Sketch have no strip, running or not.** A timer, vote or poll started there (by a session
  button, or before the control was turned off) runs as before and shows on its own canvas element, but its strip
  button and popover do not: watching turnout, ending a poll or keeping its results is done with the control on.
- **Pages with the control off shows a running Vote or Poll only**, so it can be watched and ended, and never a
  Timer.
- A popover whose button leaves (the control turned off, the tool ending) closes, as today.

## Templates

Session templates make their tab in **Structured with the Workshop control on**
([Templates by mode](../007-editor/templates-by-mode.md)), listed together as **Workshop** in the template picker's
filter, the New Document wizard and Start a Workshop:

- the Retrospectives family's `retrospective`, `start-stop-continue`, `mad-sad-glad`, `four-ls`
  and `sailboat` (`team-retro` is a Plan board of cards);
- `town-hall`, `lean-coffee`, `crazy-eights`, `meeting-agenda`, `workshop-board` and `brainstorm`;
- the boards that ship a dot vote, `affinity-map`, `prioritization-matrix` and `risk-matrix`, since only a tab with
  the Session strip can watch, end and keep that vote;
- the boards a team fills in together: `incident-postmortem`, `user-persona`, `empathy-map`, `journey`,
  `objectives-planner`, `roadmap`, `raci-matrix`, `user-story-map`, `swot`, `business-model-canvas`,
  `stakeholder-map`, `value-proposition-canvas` and `opportunity-solution-tree` (grouped in Start a Workshop under
  Retrospectives, Workshops, Planning and Strategy);
- the quizzes and games, `pub-quiz`, `icebreaker-questions`, `two-truths-and-a-lie`, `would-you-rather` and
  `people-bingo` ([Quiz and game templates](quiz-and-game-templates.md));
- the spaces to walk round in Avatar mode, `virtual-office`, `coworking-space`, `team-pod` and `all-hands-hall`
  ([Virtual Office template](virtual-office-template.md)).

Brainstorm mind maps stay in Structured with the control off, and the drawn warm-ups (`doodle-warmup`,
`pre-mortem`, `idea-garden`) open in Sketch.

**Blank Session** (kind `blank-session`) is Workshop's blank: a general tab in Structured with the control on and
nothing on it, the document named "Untitled Session".

## Share roles

Following [Gate a feature by share role](../../instructions/gate-a-feature-by-share-role.md):

| Role            | The Workshop control                                                                                                                    |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Editor**      | Sees the control and turns it on or off for the tab; the full palette with the kit and the Session strip's set-up                       |
| **Participant** | Sees no control and follows the tab's state; the participant palette and tools; takes part in every running tool as its own spec allows |
| **Viewer**      | Sees no control and follows the tab's state; no palette; sees running tools' buttons read-only, as today                                |

Every gate reads the session's `can` (`can.level === 'edit'`), never `isReadOnly` alone. A locked tab shows no
control to anyone, an Editor included, as a locked tab offers no mode switch. A tab-scoped link changes nothing
here: the control is a tab edit, offered to an Editor on the tab the link opens.

## Existing workshop tabs

- A general tab stored with `opensIn: 'workshop'` (or `'facilitate'`) opens in **Structured with the control on**,
  for everyone (`workshopOf(tab)`, `opensInOf(tab)`). The body is not rewritten on read.
- The first write that touches the mode or the control (an editor's switch or toggle) writes both as they now are:
  `opensIn` the mode (absent for Structured) and `workshop: true` while on.
- Agents and the api accept `'workshop'` wherever a stored or requested mode is read (a creation intent, a create's
  intent, a `/new?mode=` link, default folders, tab stats, the OpenAPI `EditorMode` enum): it is a choice of what
  to make (Structured with the control on), never a mode the editor runs in.

## Workspace

- **Default folders:** the `mode:workshop` key, labelled **Sessions** (noun "sessions"), stays: it is the choice
  of what to make ([Default folders](../013-workspace/default-folders.md)).
- **Explorer filters:** Opens in offers **Workshop** for documents made as sessions
  ([Explorer filters](../013-workspace/explorer-filters.md)).
- **The template picker's filter** offers Workshop, with its count.

## Telemetry

- `Editor` · `Toggled` · `WorkshopOn` / `WorkshopOff`, fired by the control before the change applies (never by a
  collaborator's toggle arriving, an undo or a redo).
- `UI` · `Toggled` · `TemplateModeWorkshop`, from the template picker's filter, as before.
- `Editor` · `Changed` · `ModeWorkshop` is no longer fired; its history stays on the dashboard.
- Both extend existing categories and actions; no new category or action.

## Help

- **The Workshop control** has its own help article (`/help/canvas/workshop/`, the `/help/canvas/workshop-mode/`
  and `/help/canvas/facilitate-mode/` addresses redirecting), registered per
  [Register a help article](../../instructions/register-a-help-article.md), and **Editor Modes** links to it.
- The Session tools article says the set-up lives where the control is on (and on Plan tabs).
- An optional [Workshop tour](workshop-tour.md) shows the kit, from the actions group's **Start Workshop Tour**
  button, while the control is on.

## References

[Editor modes](../007-editor/editor-modes.md), [Session tools](session-tools.md), [Toolbar
layout](../007-editor/toolbar-layout.md), [Workshop tour](workshop-tour.md).

## Defaults

Each default below was applied where this spec is silent or qualitative, and holds until a human confirms it.
The code cites each by its id.

- **WC1** Per tab or per person: Per tab, synced, one undo step: the mode is the tab's for the same reason, and a
  running vote or timer is the room's, so its kit must be everyone's (default).
- **WC2** Structured's strip with the control on: The category bar, as Workshop mode's was, so a Workshop tab looks as
  it did and the Workshop tour's first step has its anchors (default).
- **WC3** What Sketch gets, having no palette: The Session strip only; the Collaborate tiles stay reachable from
  Structured or Pages (default).
- **WC4** Who sees the control: An Editor on a general unlocked tab (the mode switch's gate); a Participant and a Viewer
  follow the tab's state without a control (default).
- **WC5** Whether a new tab takes the control: Yes, from the tab it was made from, as it takes the mode (default).
- **WC6** The control's name and place: "Workshop" with the flipchart mark, first among the document actions; its mark
  alone unless Button Labels is on; pressed shows the brand fill Share uses (default).
