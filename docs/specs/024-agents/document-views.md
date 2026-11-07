# Document views

**Status: built**, the `lint` view answered by the [diagram lint](diagram-lint.md); the CLI reads a pulled file's views
offline and computes `diff` from its read copies.

A **view** is a read-only text projection of a tab, each answering one kind of question at the lowest token cost.
Views are what an agent reads by default; JSON is what it asks for. The measurements behind every choice here are in
`docs/research/agent-cli/compact-representations.md` (a 30-element tab: 4,213 tokens as JSON, 386 as an outline).

## Refs

- An element's **ref** is its id when the id is a slug (`^[a-z][a-z0-9_-]{0,23}$`, as graph input writes them),
  otherwise the shortest prefix of its id unique within the tab, at least 4 characters. An id whose prefix would
  hold anything but letters, digits, `_` and `-` prints as `id:` and the full id as a JSON string (`id:"Node A"`),
  which selectors take too.
- Every command and endpoint that takes an element accepts a ref, any unique prefix, or the full id. An ambiguous
  prefix is refused with the candidates; it is never guessed.
- A prefix printed earlier can become ambiguous when someone adds an element; the refusal says so and the agent
  re-reads.
- A label is never a ref. Labels are matched by [selectors](edit-operations.md#selectors).
- Elements an agent adds take a slug of their label as their id unless it gives one (`Redis cache` becomes
  `redis-cache`, `-2` on a clash), so agent-built tabs read cheaply.
- Refs, slug ids, kind words, containment and the content origin live in `@livedoc/document`, so views, edit
  operations and the lint name elements alike.

## The outline (default)

One line per element: its kind, ref, label, attributes, then its outgoing arrows. Indentation is containment.

```text
tab 0b34 "Checkout platform" · 30 elements: 16 boxes, 3 frames, 11 arrows · threads 1 open/2 · rev 41
frame 048c "Edge"
  actor b811 "Customer" → a3cf
  hexagon 649c "API gateway" note="Kong. Terminates TLS, rate-limits per API key,"… → 202b "JWT", 146b
frame c991 "Services"
  square 146b "Orders service" icon=server → e4a8 "charge", d41e, 6406 "OrderPlaced"
  square e4a8 "Payments service" comments=1 resolved → e6d7 "HTTPS" ~dashed
cylinder d41e "Orders DB"
entity cb02 "Order" {id uuid PK; customer_id uuid FK; status text; total_cents int}
table 480a 4x3 Service | p99 latency | Availability
sticky 0c84 "Payment retries are not idempotent yet!" comments=2 open
```

The example is abridged; a real outline prints every element.

- **Header** names the tab, its counts (boxes, frames, lanes, arrows), the tab kind when it is not a diagram
  (`kind=event-storming`), its mode when not Diagram and its finish when set (`mode=draw · finish=sketch`), a Pages tab's pages (`mode=pages · 4 pages: 3 slide, 1 article (view pages)`), elements on hidden layers and elements of unknown kinds, open threads and the revision.
- **Kind** is the shape for shapes (`square`, `cylinder`, `frame`, `lane`, `entity`), an event-storming note's
  notation (`domain-event`, `command`; `es:actor` so it never reads as the actor shape), else the element type
  (`text`, `sticky`, `table`, `arrow`, `image`, `freehand`).
- **Labels and notes** are JSON strings. Labels are cut at 60 characters, notes at 48, both on a word boundary
  with `…`.
- **Containment** is derived: an element nests under the smallest frame or lane holding its centre, as
  `mermaidFromTab` decides it. A mind map's parent link wins over geometry. Edit operations report frame and lane
  membership by the same rule; the editor's frame drag keeps its own.
- **Arrows** print on their source line as `→ target "label" ~style`; an arrow with a free end prints on its own
  line. The arrow's own id is in the `graph` view.
- **Order** within a level is reading order: rows top to bottom, then left to right.
- **Content kinds** say what they hold briefly: an entity its first 8 fields, a table its size and header row, a
  code block its language and line count, a chart its slice or series count, a checklist `done=2/5`.
- **Live and structured kinds** carry one state attribute: an estimate card `votes=4 revealed`, a decision
  `status=accepted`, a progress bar `progress=40`, and likewise for the rest of the collaboration family, stat rows,
  process steps, agendas, quizzes, legends, ratings, timelines and pages.
- **Bare strokes** (freehand with no label, note, comment, link or arrow) that sit next to each other fold into one
  line, `freehand ×12 (3 closed)`; `layout` lists each one with its ref.
- **Left out**: coordinates, sizes, colours, fonts, anchors and routing (the `layout` view and `--style` have them),
  comment bodies (the `comments` view), elements on hidden layers (counted in the header).

## The views

| View           | Answers                         | Holds                                                                                                                                                          |
| -------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `overview`     | What is in this document?       | Its tabs, their sizes, open threads, last edit; no elements                                                                                                    |
| `outline`      | What does this tab mean?        | As above                                                                                                                                                       |
| `graph`        | What connects to what?          | Nodes (ref, kind, label) and arrows (ref, from, to, label), nothing else                                                                                       |
| `layout`       | Where do things sit?            | Rounded geometry per element from the content origin (the header names the origin when it is not 0,0: stored = shown + origin), or `--coarse` rows and columns |
| `comments`     | What are people saying?         | Open threads with their element's ref and label, every comment in full                                                                                         |
| `show <ref>`   | Everything about one element    | Every field, plus its arrows in and out and its container; or `selected`                                                                                       |
| `find <text>`  | Where is this?                  | Matching elements with their containers                                                                                                                        |
| `lint`         | Is the drawing sound?           | The [lint](diagram-lint.md) findings, refs first                                                                                                               |
| `diff --since` | What changed since I last read? | Added, removed, changed and moved elements since a revision                                                                                                    |
| `pages`        | What pages does this tab have?  | Its pages, each article as Markdown, the layouts on offer ([Pages for agents](pages-for-agents.md#reading-the-pages-view))                                     |

Every view opens with a header line naming the tab, its counts and its `rev`, so a later write can carry it as a
base. Every view takes `--json` for the same data as JSON; the stored tab itself is `--raw`.

`show selected` reads what the agent's owner has selected in an open editor now, the selection the `selected`
selector of [edit operations](edit-operations.md#selectors) reads: every selected element in full, in the tab's order,
fitted by `--budget`. Nothing selected, or a selection that could not be read, is refused as edit operations refuse
it. The api serves it; a pulled file has no live selection.

`diff` is computed by the CLI: it keeps the last tab it read of each document and tab, with its revision, and
compares that copy with the current tab. The api serves no diff.

## Budgets

- `--budget <tokens>` fits a view to a budget by dropping detail in a fixed order: notes, then attributes, then the
  children of the largest containers. Tokens are estimated at characters ÷ 3.
- The api and the CLI apply no budget unless asked; the MCP's `read_document` applies 8,000 tokens unless its caller
  passes another.
- A view never truncates silently: it ends with one line naming what it left out and the command that shows it,
  in the syntax of the door it was read through (`… 12 elements in frame c991 hidden: view --only c991` in the CLI,
  `read_document {"only":"c991"}` in the MCP).

## Where views are made

- One package, `@livedoc/document-views`, holds every view as a pure function of a tab.
- The api serves every view but `diff`: `GET /api/documents/:id/tabs/:tabId?view=<name>` answers `text/plain`, and
  `GET /api/documents/:id?view=overview` the overview.
- The MCP's `read_document` returns a view, the outline by default, instead of element JSON: its text first, then one
  line of JSON naming the document, the tab, its revision and its link. It takes the view's arguments (`view`,
  `budget`, `only`, ...), returns the elements with `format: "json"`, and attaches a PNG only with `image: true`.
- The CLI uses the api's views online and the package for local files (`pull`). An element kind the renderer does
  not know prints as `? <type> <ref> "label"` and is counted in the header, never dropped.
- Each view the api answers counts one anonymous `Agent·Viewed` event typed by the view's name
  ([Telemetry](../017-telemetry/telemetry.md)).

## Defaults

Each default below was applied where this spec is silent or qualitative, and holds until a human confirms it.
The code cites each by its id.

- **VW1** How a ref input resolves: order, case, minimum input length: Exact full id first, then prefix; case-sensitive;
  any prefix length from 1 (default).
- **VW2** Which elements a ref must be unique among: Every element of the tab, arrows and hidden-layer elements
  included, so refs never change with visibility (default).
- **VW3** How a ref prints when the id holds spaces, quotes or other unsafe characters: The prefix when it is
  `[A-Za-z0-9_-]` only, else `id:` plus the full id as a JSON string, the token edit-operation selectors also take
  (default).
- **VW4** What the tab ref in a header is unique among: The document's tab ids by the element ref rule; without document
  context, 4 characters or the slug (default).
- **VW5** How `overview` names the document: Its full id: one document cannot know which prefix is unique in a library
  (default).
- **VW6** How a label becomes a slug: NFKD, marks removed, lower case, non `[a-z0-9]` runs to `-`, trimmed; digit start
  or empty uses the kind token; cut to 24; `-2`, `-3` on a clash (default).
- **VW7** Which agent-added elements take a slug id: Every element an edit operation creates without `id=`, arrows
  included (`arrow` when unlabelled) (default).
- **VW8** Header segment order and wording: `N elements: boxes, frames, lanes, arrows` (non-zero, singular at 1), then
  `kind=`, `hidden`, `unknown`, `threads o open/t`, `rev`; absent segments omitted (default).
- **VW9** What the header's "boxes" bucket holds: Every printed element that is not a frame, lane or arrow, unknown
  kinds included (default).
- **VW10** Which elements count as hidden: Elements `visibleLayerElements` drops, and arrows pinned to one; counted
  apart from the total (default).
- **VW11** What counts as a thread in the header: A printed element with at least one comment; open when not resolved
  (default).
- **VW12** How an unknown shape kind on a known type prints: `? <shape>`, as an unknown type prints `? <type>`
  (default).
- **VW13** Where an event-storming note in photo draft says so: The flag `draft`, first among its attributes (default).
- **VW14** Which attributes the outline prints, in what order: Summary, state attribute, `draft`, `icon=`, `link=`,
  `alt=`, `locked`, `action=` / `actions=`, `note=`, `comments=` (default).
- **VW15** When an attribute value is quoted: Bare when URL-safe without spaces or quotes, else a JSON string (default).
- **VW16** How a word-boundary cut counts and ends: Code points before escaping; last whitespace in the slice, hard cut
  without one; `…` after the closing quote (default).
- **VW17** What an unlabelled element prints for its label: Nothing: token and ref only (default).
- **VW18** How a table's size and header row print: Label if any, `<rows>x<cols>`, the first row's cells joined `\|`
  with `\|` escaped; `0x0` when empty (default).
- **VW19** How entity fields print and escape: `{name type; …; +N}`; `;` and `}` escaped inside a field (default).
- **VW20** A code block with no language: `lang=plain`; `lines=0` when the code is empty (default).
- **VW21** What the count attribute of each chart is called: `slices=N` for pie and bar, `series=N x=M` for a line chart
  (default).
- **VW22** Which attribute each live or structured kind prints as its one state attribute: One per kind:
  `votes=`, `done=`, `ideas=`, `questions=`, `item=`, `status=`, `present=`, `state=`, `picked=`, `revealed`, `stats=`,
  `steps=`, `links=`, `items=`, `rating=`, `progress=`, `points=`, `title=` (default).
- **VW23** Which containers may hold an element: Frames and lanes whose box holds its centre, inclusive, with strictly
  larger area; smallest wins, earlier on a tie (default).
- **VW24** Mind map parent links that loop or dangle: A dangling parent reads as a root; a loop is broken at the node
  with the lowest array index (default).
- **VW25** How rows form in reading order: Sort by y, x, index; join the row while the top is above the row's first
  element's bottom; rows sort by x (default).
- **VW26** Edge order and style marks on a source line: Arrow array order; `~<strokeStyle>` when not solid, then
  `~none`, `~both` or `~from` (default).
- **VW27** Where arrows without a printed source go: Own line `arrow <ref> <from> → <to>`, at the end of the root, in
  array order (default).
- **VW28** How links print: `link=<url>`, `link=tab:<tabRef>`, `link=tab:<tabRef>#<element id>`, `link=doc:<document id>`
  (default).
- **VW29** How assigned actions print: `action="<name>" @<assignee name>` plus `done`; a list as `actions=<open> open/<total>`
  (default).
- **VW30** Graph view line forms and which nodes it lists: Connected nodes only, `kind-word ref label`; arrows `from -> to label [ref]`
  in stored direction; unconnected counted in the elision line (default).
- **VW31** Exact layout coordinates and arrow lines: Integers relative to the content origin (rounded min x, y of
  printed boxes); `r=` when rotated; `ref from.anchor → to.anchor style` (default).
- **VW32** Coarse layout lines: `canvas:` rows, then one line per container with children, depth-first; no arrows
  (default).
- **VW33** Comments view lines and resolved threads: `author YYYY-MM-DD: "text"` (UTC, JSON string); resolved threads
  counted, shown with `all` (default).
- **VW34** What `show` prints for "every field": Sorted `key: JSON` lines; mirrors, packed points and person ids left
  out and named on `omitted:`; tables, entities and code rendered (default).
- **VW35** What `find` matches and how: NFKC lower-case substring over labels, notes, arrow labels, cells, entity
  fields, checklist items, code, comments (default).
- **VW36** Diff line forms and order: `-` first in before order, then `+` and `~` in after order; one `~` line per
  element with `·` changes (default).
- **VW37** Overview lines and the edit age: `doc` line with `edited` age buckets (`just now`, m, h, d under 30 days,
  else a UTC date); tab lines reuse header segments (default).
- **VW38** The budget ladder's detail: Tokens = ceil(UTF-16 length / 3); "attributes" keeps `comments=N open`; "largest"
  is most descendants; the root collapses last (default).
- **VW39** The elision line's grammar and command: `… part; part: view --flag value`, naming only what differs from the
  request (default).
- **VW40** How budgets apply to views other than the outline: Whole lines in order, then the elision line (default).
- **VW41** Which views take a subtree and what an arrow does there: Outline and layout; an arrow is refused as
  `invalid_value`; the header counts the whole tab (default).
- **VW42** The api's query parameter names: `view`, `json=1`, `budget`, `only`, `coarse=1`, `style=1`, `ref`, `q`,
  `all=1`, `door` (default).
- **VW43** Status codes and body of a refused view request: JSON `{ error, message }`; 400 `unknown_view` (`diff` named
  as the CLI's), `invalid_value`, `target_ambiguous`; 404 `target_not_found` (default).
- **VW44** View response headers: `text/plain; charset=utf-8`, `no-cache`, CORS, the tab read's `ETag`; never 304
  (default).
- **VW45** Which of `read_document`'s views the MCP's default budget covers: Every view it reads, unless the caller
  passes a budget (default).
- **VW46** Whether JSON forms carry cut strings: No: full strings; the budget and elision still apply (default).
- **VW47** How `overview` reads many tab bodies: In-scope tabs in order, 8 bodies a query, each batch dropped before the
  next (default).
- **VW48** How `read_document` gets its PNG when `image: true`: The plain tab GET, in parallel with the view, for
  `imageResult` (default).
- **VW49** Where the views' JSON wire types live: `packages/api-schema/src/document-views.ts`, so OpenAPI generates them
  (default).
- **VW50** Which fields `style` prints and against what: fill, stroke, text-color, border, line, text, font, keyed as
  edit operations key them; only when they differ from the kind's factory output (default).
- **VW51** How the per-view event is named and sent: `Agent·Viewed·<View in title case>` for every answered view, any
  caller, through `reportServerEvent` off the response path (default).
- **VW52** How golden files are kept: Vitest `toMatchFileSnapshot` under `src/__fixtures__/golden/`; regenerated only
  with `-u` (default).
- **VW53** Limits the spec leaves open: `ALT_CUT_CHARS` and `ACTION_CUT_CHARS` 48, `REF_NEAREST_MAX` 5,
  `REF_INPUT_MAX_LENGTH` 256, `FIND_QUERY_MAX_LENGTH` 200, `VIEW_BUDGET_MAX` 1,000,000, `VIEW_SLOW_MS` 100 (default).
- **VW54** How the elision command is written for each door: CLI: `view --flag value`; MCP: `read_document` followed by
  the arguments as one JSON object (default).
- **VW55** How `read_document`'s structured result names the view text: `tab { id, name, rev, view, text }`; the text
  block holds the text, a newline, then the one-line JSON (default).
- **VW56** What a bare stroke is and when strokes fold: A freehand with no label, note, thread, link, action or printed
  arrow end; two or more adjacent in reading order fold; ` (c closed)` only when c > 0 (default).
- **VW57** How the api learns which door reads a view: Query `door=cli` (default) or `door=mcp`; the MCP always sends
  `mcp` (default).
- **VW58** Who renders the `lint` view: `@livedoc/diagram-lint`'s renderer under this package's header line (default).
- **VW59** Which arguments `read_document` takes for views: `view`, `budget`, `only`, `ref`, `q`, `coarse`, `all`,
  `style`, `format` (`view` or `json`), `image` (default).
- **VW60** How an elision line names many collapsed containers: The three largest by name in reading order, the rest as
  one `<n> elements in <m> other containers` part (default).
- **VW61** What exact `layout` prints for an element without geometry: `<ref> no geometry`; in `coarse` such elements
  form a last row (default).
- **VW62** What `show` or `only` naming an element on a hidden layer answers: `target_not_found` "on a hidden layer":
  refs stay stable, hidden elements never print (I7) (default).
- **VW63** How `diff` prints an absent or flag value: `none` for an absent label, summary or attribute; `on` for a flag;
  a summary change prints the summaries alone (default).
- **VW64** What `find` with an empty `q` answers offline: `invalid_value`, as the api refuses it (default).
- **VW65** Whether `ref=selected` can name an element whose id is `selected`: No: the word is always the selector, as
  edit operations' reserved words are; `find` reaches such an element (default).
- **VW66** Which selected ids `show selected` prints, and in what order: The printed elements of the tab, each once, in
  `tab.elements` order; other ids are dropped (default).
- **VW67** How several elements print and fit, as text and JSON: One header, each element's `show` lines with a blank
  line between; whole lines kept in order (VW40); JSON `{ header, selected }` (default).
- **VW68** What `show selected` answers without a room: "the selection could not be read", offline (a pulled file) as
  online when the room is unreachable (default).
