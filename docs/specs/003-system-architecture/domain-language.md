# Domain language

## Mode, kind and template

Three words describe how a document and its tabs differ. They answer different questions and are never
interchangeable. These are design decisions, taken before any feature that uses them.

| Term         | Answers                        | Values                                                                   | Where it lives                                |
| ------------ | ------------------------------ | ------------------------------------------------------------------------ | --------------------------------------------- |
| **mode**     | How is a tab worked on?        | Sketch, Structured, Pages (`EditorMode` `draw`, `diagram`, `pages`)      | Per tab, the same for everyone; `Tab.opensIn` |
| **kind**     | What is a tab?                 | the general diagram tab, Event Storming, Markdown, File, ... (`TabKind`) | `Tab.kind`                                    |
| **template** | What was a document made from? | a template (`TemplateKind`), grouped into template families              | Captured once, at creation                    |

### Mode

- An **editor mode** is how a general tab is worked on right now, by everyone on it: Sketch, Structured or Pages
  (the Editor modes spec in 007-editor). The stored values keep their names: `draw` is Sketch, `diagram` Structured.
- A mode is never a type of document or tab. Switching mode changes no content: it sets the tab's mode (one undo step) and everyone on the tab follows.
- A tab stores the mode it **opens in**. "Opens in" is a choice among modes, not a binary, so a new mode needs no
  new concept.
- Whiteboarding is Sketch mode. There is no whiteboard tab kind and no whiteboard document type.
- Running a session (a retro, a town hall) is the **Workshop control**, never a mode: a toggle on the tab that
  brings the session kit into its mode (`Tab.workshop`). A session is an activity, never a tab kind or a stored
  thing; "Session" and "Collaborate" never name the control, and neither does its old name, "Facilitate".
- Planning is **Plan tabs** (Board, Sheet, Dashboard, Form kinds), never a mode.
- What a template or a blank opens as is its **opening** (`TabOpening`): Sketch, Structured, Pages, Workshop or
  Plan. It is a choice of what to make, never a mode.
- "Workshop" names the control and its start; a start's template group is never called Workshops (Start a
  Workshop's is **Ideation**, Start Sketching's **Exercises**). The template catalogue's **Workshops** category
  stays: it says what a template is for, as **Planning** does beside the Plan tabs, and most of its templates open
  with the Workshop control on.

### Kind

- A **tab kind** is what a tab is. It is reserved for boards that do not follow the homogeneous environment of the
  general diagram tab, with their own notation, rules and data.
- The general diagram tab is the default kind. **Event Storming** is the only other kind among the canvas modes;
  Plan's tabs are kinds of their own ([Plan tabs](../026-plan/plan-tabs.md): Board, Sheet and Dashboard, and the Form
  tab of [Forms](../030-forms/forms.md)), each always in Plan.
- **Markdown** and **File** are kinds outside the canvas, worked on in no mode: a markdown tab holds one text
  ([Markdown tab](../031-markdown/markdown-tab.md)), a file tab one file's bytes ([File tab](../006-document/file-tab.md)).
  Every file is a document; a markdown file is a document with one markdown tab, people call it a **page**.
  A page is edited on an **editing surface** (Rich, Split or Source), which is one person's choice, never a mode.
- A new kind is added only when no mode can serve the use.
- "Board type" means a kind. It never names a template or a mode.

### Template

- A **template** is what a document was made from. It shapes the starting content of a general diagram tab and
  then has no further hold on it.
- Templates group into **template families** where a family is meaningful to people, for example Retrospectives
  (several retrospective formats) and Kanban boards.
- A template or a template family is never a kind or a type: a retrospective is a general diagram tab made from a
  retrospective template.

### Using the three together

- **Default folders** are keyed in the order kind, template family, then mode ([Default folders](../013-workspace/default-folders.md)).
- **Explorer filters** offer them as separate chips: Opens in (mode), Kind and Template ([Explorer filters](../013-workspace/explorer-filters.md)).
- Code, copy and specs use these words only in these meanings.

## Items

The words for the work a Plan board frames ([Items](../026-plan/items.md), [Plan board](../026-plan/plan-board.md)).

| Term           | Means                                                                   | Never called                |
| -------------- | ----------------------------------------------------------------------- | --------------------------- |
| **item**       | One record in a document's item store: a type and an open bag of fields | ticket, task, issue, card   |
| **item type**  | What an item is: Task, Story, Bug, Epic, Note, Idea, Action, Risk       | kind (that is a tab's)      |
| **item store** | Every item of one document, stored apart from its tabs                  | backlog, database           |
| **Plan board** | The element that draws items as columns of cards from a stored set-up   | Kanban element, board tab   |
| **card**       | How an item is drawn, on a Plan board or alone as a Plan card           | item (the data is the item) |

- **Plan** names the Plan tabs, never a mode: a Plan board fills a Board tab (an older one may sit on a general tab
  stored in Plan).
- A **column** belongs to a Plan board and stands for a status; a **lane** is the Lane element.

## Diagram elements

The words for the diagram-building elements ([The card](../009-elements/card.md), [The badge](../009-elements/badge.md),
[The step number](../009-elements/step-number.md), [The boundary](../009-elements/boundary.md),
[Concept graphics](../009-elements/concept-graphics.md)).

| Term                | Means                                                                                   | Never called                              |
| ------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------- |
| **Card**            | The diagram element (`card`) with a header band, media, title, meta line, body and tags | node card, info card, Plan card           |
| **slot**            | One part of a Card a person switches on or off                                          | section, field (in copy)                  |
| **Badge**           | The small pill element (`badge`)                                                        | tag (a tag is a chip inside a Card), pill |
| **Step number**     | The numbered disc element (`step`)                                                      | marker (that is a shape's status mark)    |
| **attachment**      | A badge or step number held on one of eight points of a host element                    | group, pin, dock                          |
| **host**            | The element an attached badge or step number sits on                                    | parent (that is a mind node's)            |
| **Boundary**        | The titled, tinted container element (`boundary`)                                       | zone, group, frame (that is the Frame)    |
| **concept graphic** | A Layer stack, Pyramid or Cycle: one element laying out its own rows                    | SmartArt, diagram                         |
| **row**             | One layer, tier or step of a concept graphic (`conceptRows`)                            | item (that is a Plan record)              |

- A Plan **card** draws an item and is always called a Plan card where the two could meet; the diagram **Card** is
  never offered on a Plan tab.

## Agents

The words for a program working on documents for a person ([Agents](../024-agents/README.md)).

| Term               | Means                                                                                                   | Never called                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| **agent**          | A program acting as a person through their API token: an MCP client, a CLI caller, a script             | bot, AI user, assistant                                      |
| **changeset**      | One agent write to one tab: atomic, sequenced by the room, attributed, revertable                       | batch, commit, patch                                         |
| **edit operation** | One step in a changeset (`set`, `add`, `connect`, ...), compiled into element ops                       | op (that is a room op), action, command                      |
| **view**           | A read-only text projection of a tab (outline, graph, layout, ...)                                      | mode, format                                                 |
| **ref**            | The short name a view prints for an element: its id, or its shortest unique id prefix                   | handle (that is a mention), alias                            |
| **selector**       | An expression matching one or more elements (a ref, `type:sticky`, `in:f1`)                             | query, filter (that is the Explorer's)                       |
| **lint finding**   | One problem the diagram lint reports (`box-overlap`), with the refs involved                            | warning, issue                                               |
| **access level**   | What a share link, embed or token admits: Viewer, Participant or Editor (`view`, `participate`, `edit`) | permission, scope (the field is `role`)                      |
| **ownership**      | The owner's powers over a document (sharing, delete, move), apart from any level                        | admin, edit level                                            |
| **board reading**  | What an Event Storming board says, read from where its notes sit: the timeline, chains and gaps         | analysis, parse, interpretation                              |
| **gap**            | One finding of the board reading (`event_without_cause`), with its remedy                               | lint finding (that is a drawing's), hole                     |
| **suggestion**     | A note an agent proposes for a board, shown as a hint or a placeholder until a person applies it        | recommendation, proposal, draft (that is the photo import's) |
| **domain export**  | A board turned into a spec and domain types: the bundle, then a model's writing                         | code generation, scaffold                                    |

- **Participant** is the access level; a person's name, colour and picture (the `participants` table) are their
  **display identity**.
- An **element op** (`ElementOp`) stays the room's unit; an edit operation is the agent's, and compiles into them.
- A CLI **command** and an MCP **tool** are the two front doors to one **verb** (`tab.view`, `element.set`).

## Identity

The words for who is calling ([Auth + guest access](../014-identity/auth-and-guest-access.md#who-is-who)).

| Term               | Means                                                                                 | Never called                     |
| ------------------ | ------------------------------------------------------------------------------------- | -------------------------------- |
| **guest**          | A visitor without an account, keyed to one browser                                    | anonymous user, visitor account  |
| **guest id**       | A guest's owner id: a server-minted UUID, proven by its **guest signature**           | anonymous id, device id          |
| **account**        | A person who signed in, whatever their sign-in methods                                | user (outside better-auth's API) |
| **account id**     | An account's owner id, `acct_…`                                                       | user id, Clerk id, sub           |
| **sign-in method** | A way to prove who you are: Google, an email code                                     | provider, connection, login type |
| **session**        | A signed-in browser; it proves itself to the api with a short-lived **session token** | Clerk session, login             |
| **owner id**       | A guest id or an account id, whichever owns a row                                     | user id                          |

## Colours

The words for choosing a colour ([Colour picker](../004-interface-design/colour-picker.md)).

| Term                     | Means                                                                                             | Never called                            |
| ------------------------ | ------------------------------------------------------------------------------------------------- | --------------------------------------- |
| **colour picker**        | The one control that chooses a colour, in any skin                                                | swatch picker, palette, colour well     |
| **standard colours**     | The ten named colours every picker offers (Ink or White, Grey, Red ... Pink)                      | stock colours (outside Sketch), presets |
| **tone**                 | Which version of the standard colours a picker offers: `strong` (lines, text) or `soft` (fills)   | shade, variant, a drawing finish        |
| **theme colours**        | The active theme's own colours, offered on the canvas only                                        | presets                                 |
| **Custom colours**       | The colours picked with + in the document, kept with its tabs                                     | custom swatches, recent colours         |
| **custom colour editor** | The square, hue, hex and eyedropper panel that **Add a custom colour** (four coloured dots) opens | colour wheel, native picker             |
| **skin**                 | Where and how a picker opens: inline, field, swatch button                                        | variant, mode                           |

## Drawing

The words for how elements are drawn, apart from their colours ([Finish](../008-canvas/finish.md)).

| Term           | Means                                                                                           | Never called                   |
| -------------- | ----------------------------------------------------------------------------------------------- | ------------------------------ |
| **finish**     | The drawing style of a tab and its elements: Flexible (default), Professional, Sketch or Marker | tone, look, style, render mode |
| **Follow Tab** | An element with no finish of its own, drawn in its tab's                                        | inherit, default               |

## Flowcharts

The words for a grown flowchart ([The flowchart](../009-elements/flowchart.md)).

| Term          | Means                                                                     | Never called        |
| ------------- | ------------------------------------------------------------------------- | ------------------- |
| **flowchart** | Steps sharing a `flowchartId`, joined by connectors and laid out together | flow, diagram       |
| **step**      | One shape of a flowchart                                                  | node, box           |
| **step type** | What a step is (Process, Decision, ...), which is its shape kind          | node type, symbol   |
| **lane**      | A swimlane of a flowchart: a Lane element carrying the chart's id         | swimlane (in code)  |
| **direction** | Which way a flowchart flows: Down or Right                                | orientation, layout |

## Repositories and workbenches

The words for diagrams living beside code ([Repositories](../027-repositories/README.md),
[Workbench embeds](../013-workspace/workbench-embeds.md)).

| Term                    | Means                                                                                 | Never called                           |
| ----------------------- | ------------------------------------------------------------------------------------- | -------------------------------------- |
| **repository link**     | `livedoc.toml`: binds a directory to the documents it **covers**                      | project, workspace, scope              |
| **mirror level**        | How much of the covered documents a link writes: `none`, `index`, `files`             | sync mode                              |
| **snapshot**            | A tab as a repository holds it, at a recorded revision                                | copy (that is Drive's), backup, cache  |
| **sync**                | One pass of a link: read, merge, send, write                                          | refresh, update                        |
| **base**                | The snapshot a local change was made from; the merge's common ancestor                | original, previous                     |
| **lost local value**    | A field both sides changed, kept in the report and as a comment, never applied        | conflict (that is a changeset's 409)   |
| **source**              | A diagram as text in a repository (a Mermaid file or fence), bound to a tab           | diagram file, code diagram             |
| **bridge**              | One format's parser and serialiser, with the capabilities it expresses                | adapter, converter                     |
| **compatibility**       | Whether a bound tab may hold residue: `relaxed` (default) or `strict`                 | mode (that is the editor's)            |
| **residue**             | What a bound tab holds that its source's format cannot express                        | extras, unsupported                    |
| **workbench**           | A developer tool that frames the editor beside an agent (an agent workbench, VS Code) | host (that is a profile's server), IDE |
| **selection reference** | The text naming what was selected, attached to a person's message to their agent      | context, selection payload             |
| **native file**         | A document in its own file form: a page as its `.md`, a file document as its bytes    | export, plain copy                     |
| **sync record**         | `.livedoc/`: per document and branch, a native file's document, tab, revision, hash   | lock file, manifest                    |
| **nearest base**        | The kept snapshot a changed file is fewest characters away from; its merge's base     | last sync, latest                      |
| **branch binding**      | Each git branch syncing with the document branches of its name                        | branch mapping, branch sync mode       |
| **main git branch**     | The git branch bound to the documents themselves: `[git] branch`                      | live branch, trunk                     |
| **sync commit**         | A commit a sync or a hook makes, holding only the link's files                        | bot commit, docs commit                |
| **local copy**          | A link outside git: a folder of plain files kept in step with main, live, both ways   | export, backup, mirror (that is Drive) |
| **kept out of git**     | Written into the work tree by the sync, never committed                               | ignored, excluded, untracked           |
| **managed section**     | The `.gitignore` lines between `# livedoc:begin` and `# livedoc:end`                  | LiveDoc block, generated ignore        |

## Document branches

The words for named live copies of a document ([Document branches](../006-document/document-branches.md)).

| Term                | Means                                                                                    | Never called                            |
| ------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------- |
| **document branch** | A named, live copy of a document, edited without touching main                           | fork, draft, copy, variant, version     |
| **main**            | The document itself, as its branches see it                                              | trunk, master, original, default branch |
| **branch point**    | What a branch started from: main or another branch, at a revision of each tab            | fork point, base (that is the sync's)   |
| **merge**           | Bringing a branch's changes into main (or another branch) from their latest shared state | publish, apply, accept                  |
| **unmerged change** | A stretch or field both sides changed differently, kept beside the result as a note      | conflict (that is a changeset's 409)    |
| **discard**         | Closing a branch without merging it; restorable for 30 days                              | delete, abandon, reject                 |

- A git branch is always called a git branch; "branch" alone, in documents, means a document branch.

## Wikis

The words for folders of pages read together ([Wikis](../032-wikis/README.md)).

| Term                 | Means                                                                     | Never called                            |
| -------------------- | ------------------------------------------------------------------------- | --------------------------------------- |
| **wiki**             | A folder marked as a wiki, with everything below it                       | space, notebook, vault, knowledge base  |
| **global wiki**      | A wiki for knowledge across projects, synced to a repository of its own   | personal wiki, main wiki                |
| **project wiki**     | A wiki for one project, synced to a path inside that project's repository | docs folder, repo wiki                  |
| **section**          | A folder inside a wiki                                                    | sub-wiki, chapter                       |
| **entry page**       | The page a wiki opens on                                                  | home page, index (that is `INDEX.md`'s) |
| **sync target**      | Where a wiki's link writes it: a whole repository, or a path inside one   | remote, destination                     |
| **document address** | `https://<host>/document/<id>`: a document's permanent address            | permalink, share link                   |
| **backlink**         | A link to a page, seen from the page it points at                         | reference, mention                      |
| **orphan page**      | A page no other page of its wiki links to                                 | lost page, unlinked page                |
| **broken link**      | A link whose target LiveDoc cannot find                                   | dead link, 404                          |
| **wiki health**      | A wiki's orphan pages, broken links and pages missing from its entry page | lint, audit, report                     |

## Animation

- An **animation set** is the catalogue of animations one family of elements takes: Shape, Sticky, Drawing,
  Media, Table, and Text for words ([Element animations](../028-animation/element-animations.md)). Icons, charts
  and arrows keep sets of their own.
- An element's **body set** animates the element; the **Text set** animates its words. A set is never a kind or a
  mode.
- A **reveal** brings an element or its words in; a **loop** repeats around the rest frame.

## This Browser

**This Browser** is the one name for a document saved only in this browser ([Offline Mode](../006-document/offline-mode.md)):
the place it lives (the Explorer's This Browser section, beside My Documents and the teams), the pill and badge that
mark it, and where a new guest's documents start. A document is **in This Browser**; it is never "Local Only",
"Local Browser" or "offline" in copy. "Offline Mode" stays the name of the feature, and code may say `offline`.

## Names in a sentence

Copy that builds a phrase around a name (a page kind, a field, a note, a template, a chart type, an element type in
an agent's error) takes its article from the name: `withArticle` / `indefiniteArticle` in `@livedoc/items`
(re-exported by `@livedoc/document` and `@livedoc/ui`). A vowel sound takes "an" ("Add an infographic
page", "Create an Org Chart", "is not an Estimate option"), and a vowel said "you" keeps "a" ("a User Persona", "a
UML Class"). A fixed "a" before an interpolated name is how "Create a Org Chart" reached the marketing site.
