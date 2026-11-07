# Explorer filters

Status: shipped. The grammar, matching, suggestion engine and view models live in `@livedoc/explorer-lens`
(`packages/explorer-lens`); the Explorer page renders the chips, the field, the states and the routes over it.

## What

Every Explorer list can be narrowed by one **lens**: a single filter state written as one string of words and
**tokens**. People pick **chips**; experts type tokens like `opens-in:draw template:retrospective made-by:ai edited:7d`
into the top-bar search. Both edit the same string:

- Choosing a chip value **writes its token** into the string.
- Typing a token **lights its chip**.

One string means the lens fits a URL as it is, and a saved view later is that string with a name.

## Scope and lens

Two different things narrow a list, and they never mix:

- The **scope** is where you are: a folder, a team, My Documents. It is the **breadcrumb**, never a chip and never a
  token. A scoped view lists what lives in its scope.
- The **lens** narrows whatever the current view lists.

An **aggregate view** lists documents from every place at once: **Recent**, **Favourites**, **Search results** and
**Shared With Me**. Only aggregate views have no scope to narrow by, so only they show the **Space** chip and apply the
`space:` token. Every other document view is a **scoped view**.

## Views

| View                                                     | Route                                                                              | Lens                              |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------- |
| My Documents, and each of its folders                    | `/explorer/all`, `/explorer/folder?id=<id>`                                        | Scoped                            |
| A team, at its root or in one of its folders             | `/explorer/team?id=<id>`                                                           | Scoped                            |
| This Browser                                             | `/explorer/offline`                                                                | Scoped                            |
| Recent, Favourites, Search results, Shared With Me       | `/explorer/recent`, `/explorer/favourites`, `/explorer/search`, `/explorer/shared` | Aggregate                         |
| Home, Inbox, Timeline, the Library pages, Trash, Invites | Their own                                                                          | None: typing opens Search results |

- **Search results** (`/explorer/search`) lists every document the reader can open: their own (My Documents and this
  browser), every team's they have joined, and Shared With Me, newest first, with no cap. It has no sidebar row; its
  page title is **Search results**.
- A view that lists no documents has no lens of its own. Typing into the field there takes the reader to Search
  results with what they typed, the field keeping focus; the view they left keeps no `q`.
- **A scoped lens reaches the whole scope.** While a lens is set on a scoped view, the list holds every matching
  document in the scope, its subfolders at any depth included, as one flat list, newest first. Folder rows step
  aside while the lens is set and return when it is cleared. A row from a subfolder names its folder (the
  [Recent folder chip](recent-folder-chip.md)).
- **Recent** lists the 12 newest documents that match.
- **This Browser**'s documents are the reader's own: they read as Space `mine` and People `me`, and keep their
  **This Browser** pill ([Explorer structure](explorer-structure.md#documents-in-this-browser)).

## The chip row

Every document view shows one row of chips under its page header and breadcrumb:

- One chip per dimension, in dimension order (Opens in, Kind, Template, Wiki, Made by AI, Edited, People), then **Space**
  on aggregate views only. The folder or team the reader is in is the breadcrumb, never a chip.
- **Clear** ends the row while the lens is set and empties `q`. It keeps its place when hidden, so nothing moves.
- A chip opens a listbox of its values under it. Choosing a value toggles it and leaves the listbox open; Escape,
  Tab, a click outside or the chip again closes it, focus returning to the chip.
- Under the row, every reported issue reads as one line, its word named (the messages of the
  [Token grammar](#token-grammar)).
- On a phone the row scrolls sideways in one line.

## Dimensions

Each dimension is a closed list of values. The interface says what a value means; it never calls an editor mode, a tab
kind or a template family a "type", and it keeps "board type" for what it means elsewhere: a board that leaves the
general diagram tab's environment.

| Dimension | Key        | Chip label  | Values and their labels                                                                                                                  |
| --------- | ---------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Text      | (none)     | (the field) | Free words, matched against names and contents ([Content search](content-search.md))                                                     |
| Opens in  | `opens-in` | Opens in    | `draw` Sketch, `diagram` Structured, `pages` Pages, `workshop` Workshop, `plan` Plan: how the document was created to open (its opening) |
| Kind      | `kind`     | Kind        | `event-storming` Event Storming, `markdown` Markdown, `file` File: the first tab's kind when the document was created                    |
| Template  | `template` | Template    | `retrospective` Retrospective, `kanban` Kanban: the template family the document was made from                                           |
| Wiki      | `wiki`     | Wiki        | `<name>` one wiki the reader can open, `any` every wiki ([Wiki](../032-wikis/wiki.md#search))                                            |
| Made by   | `made-by`  | Made by AI  | `ai` Made by AI: the document's `source` is the AI assistant or an AI tool through the MCP server (not the CLI)                          |
| Edited    | `edited`   | Edited      | `today` Today, `7d` Last 7 days, `30d` Last 30 days, `12m` Last 12 months, `this-year` This year                                         |
| People    | `people`   | People      | `me` Me, `others` Others: the owner of a document; the actor of a Timeline event                                                         |
| Space     | `space`    | Space       | `mine` My Documents, `shared` Shared With Me, `team:<id>` the team's name. Aggregate views only                                          |

- **Opens in**, **Kind** and **Template** read the creation intent recorded on the document
  (Default folders: `opensIn`, `tabKind`, `templateFamily` on the document
  summary). Opens in offers one value per editor mode (`EDITOR_MODES`); Kind offers the specific tab kinds, every
  creatable kind but the general diagram tab (Event Storming, Markdown and File among them); Template offers the template families
  (`TEMPLATE_FAMILIES`). A document whose recorded value is unknown (made before the intent was recorded) matches no
  value of that dimension; it shows whenever that dimension is not set. A general diagram tab matches no Kind value, and
  a document made from no family matches no Template value.
- **Made by AI is a filter, not a place.** AI-made documents are no bucket of their own: they live at the root of
  their space or in a folder like any other document, and `made-by:ai` finds them anywhere. Every row and card of an
  AI-made document carries a **Made by AI** badge (a sparkle and the words), so what the filter reads is visible. The
  old Generated view's address, `/explorer/generated`, opens Search results filtered by `made-by:ai`.
- **Edited** reads the document's last save, in local time. Today starts at midnight; Last 7 days and Last 30 days count
  back that many days from now; Last 12 months counts back 12 calendar months from now; This year starts at midnight on
  1 January. A save in the future (a skewed clock) counts as edited.
- **People** on a document is its owner: `me` when the reader owns it, `others` otherwise. Every row of Shared With Me
  is `others`.
- **Space** on a document is `mine` for one in My Documents or in this browser ([Offline Mode](../006-document/offline-mode.md),
  the documents the sidebar marks "This Browser"), `team:<id>` for one in a team, `shared` for a row of Shared With Me. A
  token names a team by id; every label shows the team's **name**, never the id.
- A row that cannot answer a dimension (a Shared With Me row carries no provenance, mode, kind or family) matches no
  value of it.
- **More filters** (favourited, sharing, Drive status) join later behind a "More filters" disclosure.

## Matching

- A dimension may hold **several values**: they combine with **or** (`template:retrospective,kanban` lists both
  families). Dimensions combine with **and**.
- Text matches the document's **name**, ignoring case and accents: every word must match it. A word matches by
  the best of these, best first:
  1. **As typed**: the word appears in the name ("notes" finds "Meeting notes"), at the start of one of the name's
     words before inside one.
  2. **Word starts**: the word is spelled by the starts of the name's words, in order, at least two letters from
     each ("meetnot" finds "Meeting notes").
  3. **Letters in order**: the initials of the name's words ("mn"), else the word's letters in order inside one of
     the name's words, from its first letter ("mtg nts" finds "Meeting notes").
  4. **A typo**: the word starts one of the name's words with one typo when it has 4 to 7 letters, or two when it
     has 8 or more ("meetnig" finds "Meeting notes"). A typo is a letter added, dropped or changed, or two
     neighbouring letters swapped. A word under 4 letters is never forgiven a typo.
- A word, in the text or in a name, is a run of letters and digits; anything else separates words, so "q3-plan"
  is the two words "q3" and "plan".
- Text also matches what a document holds, in the api, folding text the same way
  ([Content search](content-search.md)); how those matches show is the search's presentation.
- The empty lens matches everything.

### Order

- With text in the lens, the matching documents list **best match first**: the closer each word matched, the
  higher the document. Documents that match equally well keep the view's own order, newest first.
- Without text, the order is the view's own, whatever chips are set.
- **Recent** takes its 12 newest matches and orders those best first.
- The **Details** view keeps the column the reader sorted by: the lens narrows it and never reorders it.

### Highlight

- In every document view, the characters each word matched are **marked** in the name: tinted, bold and
  underlined, never shown by colour alone.
- A screen reader reads the plain name, once.

### Titles elsewhere

The same matching finds a document by its name everywhere a name is searched, so a name found in one place is found
in all of them:

- The search panel's **Documents**, **Shared with You** and the team documents under **Teams**, best first before
  each group's cap of 8. A team document found only by its team's name follows those found by their own.
- **Add to Document**'s filter, best first.

Folders, teams, tabs, elements, commands, settings and help keep their own matching: they are not document names.
The Move dialogs pick a folder and filter nothing. The search panel and Add to Document order by match but do not
mark the name.

## Token grammar

The string is words separated by whitespace.

- A word of the form `<key>:<values>` whose key is a dimension key is a **token**. `<values>` is one value or a
  **comma list** of them (`edited:today,7d`). Keys and values are read without regard to case and written lower case;
  a team id keeps its case.
- A dimension may also be **repeated** (`template:retrospective template:kanban`): its tokens' values join, exactly as
  one comma list does. A value listed twice counts once.
- Every other word is **text**.
- A word shaped like a token that is not one stays **text**, whole, and is **reported by a named reason**, never
  dropped. A comma list is reported by its first bad value:

| Reason              | When                                                                    | Message                                                      |
| ------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------ |
| `unknown_dimension` | The key is no dimension (`colour:red`)                                  | “colour:red” isn’t a filter, so it’s searched as text.       |
| `missing_value`     | Nothing after the colon, or an empty list entry (`kind:`, `edited:7d,`) | “kind:” needs a value, so it’s searched as text.             |
| `unknown_value`     | A value is not in the list (`template:mindmap`)                         | “mindmap” isn’t a Template option, so it’s searched as text. |
| `unknown_team`      | `space:team:<id>` names no team of the reader                           | That team isn’t one of yours, so it’s searched as text.      |

- A valid token that cannot apply is kept in the string, not applied, and reported:

| Reason           | When                                              | Message                                                           |
| ---------------- | ------------------------------------------------- | ----------------------------------------------------------------- |
| `space_not_here` | A `space:` token on a scoped view                 | The breadcrumb sets the space here, so Space filters don’t apply. |
| `too_long`       | The string passes 512 characters; the rest is cut | The search is cut to 512 characters.                              |

- A word **being typed** (the caret is in it or at its end, in the field) that starts with a dimension key and a colon
  is **pending**: neither applied nor text, and not reported until the caret leaves it.

The **canonical** string writes **one token per dimension, its values as a comma list**: the tokens in dimension order
(Opens in, Kind, Template, Made by, Edited, People, Space), each list in its dimension's value order (teams after My
documents and Shared With Me, by id), then the text words, single spaces between. Parsing accepts both spellings;
writing produces only this one. Writing a chip edits the string in place: the dimension's tokens merge into one,
written where the first stood, or added after the last token; clearing a chip removes every token of its dimension.

## The field

The top-bar search is the lens field on every Explorer view. It sits in the Explorer header, left of the account
control; on a desktop (`lg` and up) the header is three columns and the field is **centred** between the brand and
the account, on every page (each side column grows to its content first, so a narrow desktop never overlaps them);
below the `sm` breakpoint it takes its own full-width row under the header. Its placeholder reads "Search or
filter documents". The app-wide search panel (documents, folders, help, settings) stays on the bottom bar's Search.

On Home the header draws the same field as on every other page. Typing in it there opens Search results, and the
field keeps the focus with the caret after the typed words.

- Each token renders as a **pill** inside the field: "Template: Retrospective, Kanban", "Space: Acme". The free text
  follows the pills. A pill that does not apply (a Space pill on a scoped view) is muted and says why.
- A typed token becomes a pill once it is complete: accepted from the suggestions, or followed by a space.

### Suggestions

Typing in the field offers **suggestions** in a list under it:

- A word that is the start of a dimension key (`op`, `made`, `edited`) offers those **dimensions**, each with its chip
  label. Accepting one writes `<key>:` and offers its values.
- A word `<key>:<start>` offers that dimension's **values** whose value or label starts with `<start>`, each with its
  label: `edited:7d` reads "Last 7 days · Edited"; a team reads by its name. In a comma list only the entry after the
  last comma is matched, and values already in the list are not offered again.
- A value that would match nothing on its own, with every other dimension and word of the field kept, is still offered
  and **marked** "No matches"; it is never hidden.
- Space and its values are offered on aggregate views only. An empty word offers nothing.
- Accepting a value writes it into the word (after the list's earlier entries), then a space; the rest of the field is
  left as it is.

Keyboard:

| Key       | Does                                                                                            |
| --------- | ----------------------------------------------------------------------------------------------- |
| Down / Up | Moves through the suggestions; no suggestion is active until one is pressed                     |
| Enter     | Accepts the active suggestion; with none active, nothing beyond what typing already applied     |
| Tab       | Accepts the active suggestion; with none active, moves focus on as usual                        |
| Escape    | Closes the suggestions; the field keeps its text                                                |
| Backspace | At the start of the text, right after a pill: first selects the pill, a second press removes it |

### Accessibility

- The field follows the WAI-ARIA **combobox** pattern: the input has `role="combobox"`, `aria-autocomplete="list"`,
  `aria-expanded`, `aria-controls` naming the suggestion `listbox`, and `aria-activedescendant` naming the active
  option. Its label is "Filter documents".
- Each option's name is its label and dimension, plus "no matches" when marked: "Last 7 days, Edited, no matches".
- Each pill has an accessible name ("Filter Template: Retrospective, Kanban", plus "not applied: <reason>" when muted)
  and a **remove** button named "Remove filter Template: Retrospective, Kanban", in the tab order.
- After the lens changes, a polite **live region** announces the count once typing settles: "12 of 40 documents",
  "40 documents", or "No documents match".
- Chips sit in a `group` named "Filters". A chip is **multi-select**: a button with `aria-haspopup="listbox"` and
  `aria-expanded`, named "Template: Retrospective, Kanban" when set and "Template, any" when not, opening a listbox with
  `aria-multiselectable="true"`. Its options are `option`s with `aria-selected`; choosing one toggles it, and the
  first option, "Any", clears every value. **Made by AI**, a dimension of one value, is a toggle button with
  `aria-pressed`.
- A set chip shows its values as text and each chosen option a check, never by colour alone. Text and focus rings meet WCAG 2.2 AA
  contrast; every pill, remove button and chip is at least 24 by 24 CSS pixels. Nothing animates under reduced motion.

## URL and carry-over

- The lens lives in the view's URL as `?q=<string>`, whitespace collapsed, removed when empty. Every change replaces
  the current history entry (no entry per keystroke). While typing, the address bar follows the field at most every
  250 ms (`LENS_URL_WRITE_MS`, a trailing write) and at once when the field loses focus: a write per keystroke ran a
  held key past Safari's limit of 100 history writes in 10 seconds, which throws. A write still waiting belongs to the
  page it was typed on: typing then going Back (a mouse button, a swipe) drops it, so the filter never lands on the
  page gone back to. The rows narrow a beat behind the
  field (a deferred value), so typing never waits on a long list.
- Moving between aggregate views **carries** the lens. Entering a scoped view, or a view with no lens, starts with an
  empty lens; each view's URL keeps its own. Back and Forward restore the lens of the entry they land on.
- The lens is **not** stored: a new session starts unfiltered. Saved views come later.

## States

| State          | Shows                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------ |
| Empty          | The view's own empty copy, unchanged: there is nothing here at all                                     |
| Filtered empty | "No documents match these filters", the reported reasons under it, and **Clear Filters** (empties `q`) |
| Failed         | "Couldn’t load documents" and **Try again**; the lens stays as it was                                  |

- **Failed** replaces the list when the view's last read failed: the reader's own documents for their own views,
  Recent, Favourites and Search results; the shared list for Shared With Me. A failed read never reads as Empty.
  When only the shared list failed, the other views still list what loaded, and a notice says the documents shared
  with the reader could not load.
- The live region speaks only on document views, and only after the lens changes.

## Telemetry

Each time a dimension gains a value it did not hold, from a chip, an accepted suggestion or a typed token, the Explorer emits
`Explorer / Selected / <Dimension>` once, with `<Dimension>` from the closed set `Text`, `OpensIn`, `Kind`, `Template`,
`MadeBy`, `Edited`, `People`, `Space` ([Telemetry](../017-telemetry/telemetry.md)). Text counts when it goes from empty to
non-empty. Never a value, a word or an id. A lens arriving with a link, or restored by Back, counts for nothing: only
the reader's own change does.

## Help

The help centre's [Search and filter documents](../../../apps/help/app/explorer/filters/page.mdx) article describes the
field, the chips and the typed filters; Search results opens it from its Help button.

## Defaults

Each default below was applied where this spec is silent or qualitative, and holds until a human confirms it.
The code cites each by its id.

- **D41** Which words can be reported as a bad token: Only token-shaped words, `^[A-Za-z][A-Za-z-]*:`; `10:30` is plain
  text, unreported (default).
- **D42** How text compares with a name: Both folded: NFD, combining marks stripped, lower case; then matched by the
  tiers of D172, D176 and D177 (default).
- **D43** Where an over-long lens is cut: At the last whitespace within 512 characters; one over-long word is cut at 512
  (default).
- **D44** What "Last 12 months" counts back to: The same local date and time one calendar year before now; 29 February
  rolls on to 1 March (default).
- **D46** The order of space suggestions: My Documents, Shared With Me, then teams by name A to Z (default).
- **D47** Which values a typed value start offers: Those whose value or label starts with it, case-insensitive
  (default).
- **D48** Spacing and caret after an accepted value: One space after the token, caret after it; the rest of the field is
  left as it is (default).
- **D49** When the result count is announced: 400 ms after the last change (`LENS_SETTLE_MS`) (default).
- **D50** Whether the field grows when pills overflow: No: one line high, pills and text scroll sideways, so nothing
  below shifts (default).
- **D51** A caret outside the input: Clamped to `[0, input.length]` (default).
- **D52** How many suggestions show at once: 8 (`LENS_MAX_SUGGESTIONS`) (default).
- **D53** Whether a team id keeps its case: Yes, and compares exactly: keys and fixed values are lower-cased, minted ids
  are not (default).
- **D54** Where a chip writes a token when the string has none: First, before the text words: the canonical place for
  tokens (default).
- **D56** Empty entries around the one a suggestion completes: Dropped: the accepted token is well-formed (default).
- **D57** How the Event Storming value is cased: "Event Storming", as the product names it everywhere else (default).
- **D58** The order of the Edited values: Today, Last 7 days, Last 30 days, Last 12 months, This year: the rolling spans
  widening, then the calendar one (default).
- **D81** Where the search results live and what they list: `/explorer/search`, titled Search results: every document
  the reader can open, newest first, no cap (default).
- **D82** What typing does on a view that lists no documents: Opens Search results with the typed text (one history
  entry), the field keeping focus (default).
- **D83** Whether a scoped lens reaches subfolders: Yes, as in a file manager's search: every match in the scope, one
  flat list; folder rows step aside (default).
- **D84** Whether Favourites is an aggregate view: Yes: it lists documents from every place (default).
- **D85** How Clear keeps the chip row still: Always laid out; `invisible` while the lens is empty (default).
- **D86** Whether a chip's listbox closes on a choice: No: it is multi-select; Escape, Tab, a click outside or the chip
  closes it (default).
- **D87** Where the field sits on a phone: Its own full-width row under the header (default).
- **D88** The field's placeholder: "Search or filter documents" (default).
- **D89** The Made by AI badge's look: A sparkle and the words, violet, built like the This Browser pill (default).
- **D90** Where the retired Dynamic view goes: The My Documents root, as Unsorted does (default).
- **D91** What the personal root tile of the placement browser says under its name: "Top level", in place of "Unsorted"
  (default).
- **D92** How a failed list read shows: Failed on the views that read it; a toast when the shared read alone failed, as
  other views still list rows (default).
- **D93** Whether typed tokens of one dimension stay apart: No: they merge into one pill, as the canonical string writes
  them (default).
- **D171** How a highlight finds its place when folding changes a name's length: Each character folded on its own,
  recording where every folded character came from; a name that folds to its own length maps one to one (default).
- **D172** What "initials or in-order subsequence" admits: The initials of successive title words first; else the
  letters in order inside one title word, starting at its first letter, so a long name never matches scattered letters
  (default).
- **D173** How several words' match qualities combine into one order: The sum of the words' scores (tier index, plus 0.5
  for the weaker match within a tier); lower first (default).
- **D174** Whether the Details view orders by match: No (decided by Webber): it keeps the column the reader sorted by;
  the lens only narrows it (default).
- **D175** How a matched character looks: A light brand tint, semibold and a 2 px brand underline, the text keeping its
  own colour (default).
- **D176** What a typo is measured against: The starts of each title word, up to the word's length plus its typos, so a
  word still being typed is forgiven too (default).
- **D177** What "word prefix" means beside "exact substring": The word spelled by the starts of successive title words,
  each at least 2 letters ("meetnot"); a single word's start is already a substring (default).
- **D178** Which 12 documents Recent ranks under a lens: Its 12 newest matches, ordered best first; never the 12 best of
  all time (default).
