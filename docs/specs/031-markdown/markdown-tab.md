# Markdown tab

**Status: specified.** Nothing is built.

A **markdown tab** is a tab of the `markdown` [tab kind](../006-document/document.md#domain-language): it holds one
markdown text, edited together live, that leaves LiveDoc as the very bytes it holds. A markdown file is a document
with a single markdown tab ([Purpose](../001-project-vision/purpose.md#what-it-is)); its tab strip is hidden, and the
tab still holds the data, so a second tab can join it later without changing what the document is.

A markdown tab and a [text document](../034-text-documents/text-document.md) stay two kinds (plan 0019, fork D3,
`(default)`): a page is its Markdown bytes, a text document is an office document in ODF or OOXML. A `.md` file opens
as a page; a text document may be downloaded as Markdown, and a page is never turned into one silently.

## Why a tab kind

A new kind is added only when no mode can serve the use
([Domain language](../003-system-architecture/domain-language.md#kind)). None can here:

- An [article](../007-editor/article-pages.md) holds blocks and runs and is laid out on pages. Reading markdown into
  it and writing markdown out of it reformats the text: emphasis markers, list bullets, blank lines and line wraps
  come back the way the serialiser likes them, not the way the author wrote them.
- A markdown file is read by `rg`, `cat`, GitHub, static site generators and agents. Each of them sees the bytes, so
  the bytes are the content. A tab that holds anything other than the text cannot promise that a page leaves as it
  arrived.

So the markdown tab holds **the text itself**, and every view of it, the editor included, is drawn from that text.

## Domain language

| Term                   | Means                                                                                | Never called                      |
| ---------------------- | ------------------------------------------------------------------------------------ | --------------------------------- |
| **markdown tab**       | A tab of kind `markdown`: one markdown text                                          | note, page tab, text tab          |
| **page**               | A document whose single tab is a markdown tab, as people speak of it                 | note, article (that is Pages')    |
| **text**               | The markdown tab's characters, exactly as written                                    | content, body, source (as a noun) |
| **front matter**       | A YAML (`---`) or TOML (`+++`) block opening the text                                | metadata, header                  |
| **rendered page**      | The text drawn as formatted prose: headings, lists, tables, images                   | preview (that is the sync's)      |
| **editing surface**    | How one person sees the page while editing it: **Rich**, **Split** or **Source**     | mode, view, preview               |
| **margin note**        | A comment thread on a stretch of the text, as on an article                          | annotation                        |
| **predominant ending** | The line ending most of the text's lines use: `\n` or `\r\n`; `\n` when none or tied | newline style, EOL mode           |

- "Page" is the word for people; code and specs say markdown tab when the tab is meant, document when the container
  is. A page is never called a note: Note is an item type of Plan
  ([Domain language](../003-system-architecture/domain-language.md#items)).
- "Pages" with a capital P stays the editor mode ([Pages mode](../007-editor/pages-mode.md)); a markdown tab has no
  mode.

## What it holds

| Field         | Holds                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------ |
| `kind`        | `'markdown'`                                                                               |
| `name`        | The tab's name, as every tab has; in a single-tab document it is never shown               |
| `text`        | The text, every character as written, line endings and trailing whitespace included        |
| `bom`         | `true` when the file opened with a UTF-8 byte order mark; the mark itself is not in `text` |
| `extension`   | `md` or `markdown`: the file's, as it was read; `md` for a page made in LiveDoc            |
| `marginNotes` | Comment threads, each anchored to a stretch of the text ([Collaboration](#collaboration))  |
| merge state   | What the live merge needs to keep concurrent edits apart ([Storage](#storage))             |

A markdown tab has **no elements, layers, theme, background or editor mode**. Tab settings that only make sense on a
canvas are absent, not empty, so nothing that reads a tab mistakes a markdown tab for an empty diagram.

## The round trip

A markdown tab and a `.md` file are the same thing in two places. **Reading a file into a tab and writing the tab
back, with no edit in between, gives the same bytes.** Every rule below exists to keep that promise.

### Reading a file

1. A file whose bytes are not valid UTF-8 (UTF-16, Latin-1, a truncated sequence, a binary file named `.md`) is not
   read as text. It becomes a [file tab](../006-document/file-tab.md) holding those bytes, marked **Not UTF-8**. It
   renders read-only; [Converting](#converting-a-file-tab) is the way to edit it.
2. A file larger than `MARKDOWN_TEXT_MAX_BYTES` becomes a file tab likewise, marked **Too large to edit together**,
   with its size and the limit.
3. A leading UTF-8 byte order mark (`EF BB BF`) sets `bom` and is left out of `text`.
4. Every other byte decodes into `text` as it stands: no Unicode normalisation (NFC and NFD stay as written), no line
   ending conversion, no tab expansion, no trimming. Control characters, `NUL` included, are characters like any
   other.

### Writing a file

The bytes are the UTF-8 encoding of `text`, preceded by the byte order mark when `bom` is set. Nothing is added:

- **Line endings** are the text's own. `\n`, `\r\n` and a lone `\r` are kept per line, so a file with mixed endings
  keeps them mixed. A line break typed in LiveDoc inserts the [predominant ending](#domain-language).
- **The trailing newline** is there when the text ends with one and absent when it does not. LiveDoc never adds or
  removes one.
- **Front matter** is text. It is written exactly as it stands, whether or not it parses.
- **Unknown syntax** (wiki links `[[page]]`, admonitions `:::note`, math `$$`, Liquid tags, a dialect LiveDoc does
  not know) is text, kept verbatim. The rendered page shows what it cannot interpret as literal text, never drops it.
- **Embedded HTML** is text, kept verbatim, scripts and styles included. Only the [rendered page](#the-rendered-page)
  is sanitised; the text never is.
- **Images and links** are text: `![Diagram](img/flow.png)` stays exactly that. What a link points at is resolved
  when the page renders ([Links](../032-wikis/links.md)), never by rewriting the text, except when the target is
  renamed ([Links](../032-wikis/links.md#renames)).

The same text always writes the same bytes, so a page synced twice at one revision writes one file
([Native files](../027-repositories/native-files.md)).

### Converting a file tab

A file tab holding a `.md` or `.markdown` file that could not be read as text offers **Edit as markdown**, for people
with edit access:

- **Not UTF-8**: the bytes are decoded as UTF-16 when they open with a UTF-16 byte order mark and as Windows-1252
  otherwise; a preview shows the decoded text before anything changes. Confirmed, the tab becomes a markdown tab
  holding that text. It is an edit: the next sync writes UTF-8, and the file's history in git shows the change of
  encoding as one commit.
- **Too large**: offered only once the file is under the limit (a file synced in smaller). The tab becomes a markdown
  tab holding the text as it stands.

A conversion is one undo step and is recorded on the document's [timeline](../013-workspace/timeline.md).

## Editing

### Editing surfaces

A page is edited on one of three **editing surfaces**, chosen with one control at the right edge of the tab strip,
left to right:

| Surface    | Shows                                                                      |
| ---------- | -------------------------------------------------------------------------- |
| **Rich**   | the rendered page, edited in place (the default)                           |
| **Split**  | the source and the rendered page side by side, both editable, kept in step |
| **Source** | the text itself, with syntax colouring                                     |

- **Rich is the default.** A page opens on Rich unless the person chose otherwise (below).
- **A surface is personal.** It is how one person sees the page, never a property of the page: switching it changes
  no content, is no undo step, and nobody else on the page follows. That is why it is not a mode, which is the tab's
  and shared by everyone on it ([Domain language](../003-system-architecture/domain-language.md#mode)).
- **A surface belongs to a page in a window**, as in Spinner's editor: every open page keeps the surface it is
  read in, and switching one never changes another. The last surface chosen is the window's default for a page shown
  for the first time, so a page opened from a link in a Rich page opens on Rich.
- **A switch keeps the reading position**: the new surface opens where the old one was being read, never at the top.
- **Rich edits the text, never a copy of it.** Every edit made on Rich is turned into the smallest text edit that
  produces it, and only that edit is applied (the rules below hold on every surface). The rendered page is redrawn
  from the text, so Rich can never hold a page that differs from what syncs out.
- **What Rich cannot edit in place, it edits as source.** HTML, unknown syntax, a malformed table or front matter
  that does not parse is drawn as a block of its own text, editable as text where it stands; the rest of the page
  stays Rich.

Whatever the surface, these hold:

- **Every edit is a text edit** at the caret or selection. The editor never rewrites text it was not asked to: no
  reformatting on save, no trailing whitespace trimmed (two trailing spaces are a markdown line break), no list
  renumbering, no table realignment.
- **Formatting commands insert markdown.** Bold wraps the selection in `**`, a heading command adds or changes the
  `#` run at the start of the line, a list command adds the marker the surrounding list already uses (`-`, `*` or
  `1.`). The commands are the editor's: the toolbar, the slash menu and the keyboard shortcuts of
  [Article pages](../007-editor/article-pages.md) where they exist, with the same names.
- **Paste.** Plain text is inserted as it is. Rich text (HTML on the clipboard) is converted to markdown for the
  pasted part only, in the text's predominant ending; the text around it is not touched.
- **Images.** Pasting or dropping an image uploads it as a [file document](../006-document/file-tab.md) in the page's
  folder, named after the file (or `image-<n>.<ext>` for a clipboard image), and inserts `![<name>](<file name>)` at
  the caret. The image is stored as uploaded, never re-encoded, so it syncs out byte for byte.
- **Task lists.** Ticking a task's box in the rendered page changes its `[ ]` to `[x]` (or back): one edit of one
  character.
- **The size limit.** An edit that would take the text past `MARKDOWN_TEXT_MAX_BYTES` is refused as a whole, with
  "This page is at its 1 MB limit. Split it into pages to keep writing."

## The rendered page

- **CommonMark with GitHub's extensions**: tables, task lists, strikethrough, autolinks and footnotes, so a page reads
  as it does on GitHub.
- **Front matter** shows as a properties block above the page: each key and its value, editable as text. Front
  matter that does not parse shows as its raw text with **Front matter not readable** and the parser's line, and is
  never rewritten. `title` and `description` are read for the page's title and summary
  ([Wikis](../032-wikis/wiki.md#the-entry-page)); every other key is kept and shown, never interpreted.
- **The page's title** is the front matter's `title`, else its first level 1 heading, else the document's name.
- **HTML** renders from a safe subset (`details`, `summary`, `kbd`, `sub`, `sup`, `br`, `img`, `a`, `picture`,
  `source`, tables and inline formatting). Scripts, styles, frames, forms, event handlers and `javascript:` URLs are
  removed from what is drawn; the text keeps them.
- **Code fences** are highlighted by their language. A `mermaid` fence draws its diagram, read-only, with the
  fence's text one click away; a fence that does not parse draws as code with the parser's message.
- **Images** with a relative path show the file document at that path ([Links](../032-wikis/links.md)). Remote images
  load from their own host, as on GitHub and in every markdown reader.

## Collaboration

Everyone on the page edits the same text at once, as on every tab kind
([Purpose](../001-project-vision/purpose.md#core-capabilities)).

- **Concurrent edits merge by character.** Two people typing in the same paragraph, even the same line, both keep
  every character they typed; neither edit is replaced by the other. An edit is anchored to the characters around it,
  not to an offset, so an insertion made while someone else deletes above it lands where its author put it.
- **Typing inside a deletion survives.** Text one person deletes while another types inside it is deleted; the
  characters typed into it stay, at the place the deletion left.
- **Carets and selections** travel as presence, as on an [article](../007-editor/article-pages.md#collaboration):
  each person's caret in their colour, with their name for a moment after it moves, never stored or replayed.
- **Offline and reconnecting.** Edits made while disconnected, or in an [offline document](../006-document/offline-mode.md),
  merge by the same rule when the connection returns. No edit is lost to a reconnect.
- **Undo is personal.** Undo takes back the person's own edits, newest first, and never someone else's that came
  after.
- **Margin notes** stay on their stretch of text as it moves. A note whose whole stretch is deleted stays on the page,
  marked **On removed text**, where its thread can still be read and resolved.

### How the merge works

The text is a **sequence CRDT**: every character carries a stable identity, and an edit names the characters it sits
between. Edits commute, so every copy that has seen the same edits holds the same text, whatever order they arrived
in.

Two designs were weighed:

| Design                   | For                                                                                        | Against                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| **Sequence CRDT**        | Merges offline edits of any age; the room stays a relay; one rule for browsers and the api | Carries per-character identity, compacted in storage                                                       |
| Server-ordered transform | Small state; the room's sequence numbers already order ops                                 | The room has to transform every op against all it missed; an offline edit needs the history since its base |

The CRDT is chosen because LiveDoc already promises offline documents and reconnect catch-up, and both arrive as
edits made against an old state. Writes that come from outside the room (a changeset, a [sync](#from-files-and-agents))
are applied by the api as edits of the current state, so they merge with live typing like anyone's keystrokes.

## Storage

- The tab's row holds `text`, `bom`, the margin notes and the **compacted merge state**: the CRDT's encoded state with
  deleted characters collected once every connected editor has seen their deletion.
- While anyone has the tab open, the document's room holds its live state and is the **one writer** of the row: it
  persists after each burst of edits settles, never more often than every `MARKDOWN_PERSIST_MS`. The whole-tab save
  the canvas editor uses ([Per-tab storage](../006-document/per-tab-storage.md)) is never used for a markdown tab.
- Each persisted state has a **revision**, as every tab has, and a hash of the bytes it writes, so a
  [snapshot](../027-repositories/repository-link.md#sync-states) can say how old it is.
- The room keeps the states of the last `MARKDOWN_REVISIONS_KEPT` revisions, so a `patch` written against a recent
  revision lands on the characters it was written against ([Agents](#writing)).
- `text` is always readable on its own: search, views and exports read it without the merge state.
- **A page's [branches](../006-document/document-branches.md)** each hold their own text and merge state, started
  from main's at the branch point, which main keeps while the branch is open, so a branch merges back by character
  however old it is.

## From files and agents

Agents and people change a page in three ways, and all three meet in one text:

1. **In the browser**, as above.
2. **Through the command line or the MCP server**, with a [changeset](../024-agents/agent-changesets.md) of text
   operations ([Agents](#agents)).
3. **In a file**, a page synced to a repository and edited there with any tool. The sync folds the file's change back
   as a changeset ([Native files](../027-repositories/native-files.md#folding-a-file-back)).

A changeset is applied by the api as text edits on the revision it names; edits made since by people typing merge
with it by character, and everyone with the page open sees it arrive.

## Agents

### Reading

- The **outline** view of a markdown tab is its heading tree, each heading with its line number and the number of
  lines below it, so an agent finds the part it needs before reading it
  ([Document views](../024-agents/document-views.md)).
- The **text** view is the text, with line numbers when asked (`--lines`), whole or as a range of lines.

### Writing

A markdown changeset's body is one of:

| Operation                    | Does                                                                                                                       |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `edit <old> <new>`           | Replaces the one occurrence of `old` with `new`; several `edit`s apply in order                                            |
| `insert after\|before <old>` | Inserts text after or before the one occurrence of `old`                                                                   |
| `append` / `prepend`         | Adds text at the end or start (after the front matter for `prepend`)                                                       |
| `patch`                      | Edits of the revision `base` names, as character ranges of that revision's text; merged by character with everything since |
| `replace`                    | The whole text; strict: refused unless `base` names the current revision                                                   |

Named rejections, each writing nothing:

| Rejection            | When                                                                                                     |
| -------------------- | -------------------------------------------------------------------------------------------------------- |
| `text_not_found`     | `old` does not occur in the text                                                                         |
| `text_ambiguous`     | `old` occurs more than once; the answer lists each occurrence's line                                     |
| `text_too_large`     | The result would pass `MARKDOWN_TEXT_MAX_BYTES`                                                          |
| `stale_tab`          | A `replace` whose `base` is not the current revision, or a `patch` whose `base` the room no longer keeps |
| `not_a_markdown_tab` | A text operation sent to another kind of tab, or an element operation to this one                        |

`edit` and `insert` match against the text as it is when the api applies them, so an agent that read a page minutes
ago still lands its edit where the words are now, or is told why not.

## Share roles

| Role            | May                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------ |
| **Editor**      | Edit the text, tick tasks, convert a file tab, rename, put margin notes on                                   |
| **Participant** | Read as a Viewer does; open, write and reply to margin notes. Ticking a task is an edit, so it is not theirs |
| **Viewer**      | Read the rendered page and its margin notes; copy text; change nothing                                       |

Each is gated on the session's `can`, never on read-only alone
([Gate a feature by share role](../../instructions/gate-a-feature-by-share-role.md)).

## Limits

| Constant                  | Value             | Why                                                                                                                                             |
| ------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `MARKDOWN_TEXT_MAX_BYTES` | 1,048,576 (1 MiB) | Half a tab's row (`MAX_TAB_BYTES`, 1.99 MB) leaves room for the merge state and margin notes; the largest page of a real 364-page wiki is 78 KB |
| `MARKDOWN_PERSIST_MS`     | 2000              | A burst of typing settles into one write; a closed tab loses nothing the room holds                                                             |
| `MARKDOWN_REVISIONS_KEPT` | 10                | About twenty seconds of steady typing at one revision per `MARKDOWN_PERSIST_MS`: longer than a sync's read, merge and send                      |

## Observability and telemetry

- Fingerprints, each with the document and tab ids and never text: `[markdown] read-not-utf8`,
  `[markdown] read-too-large`, `[markdown] converted`, `[markdown] edit-refused-size`, `[markdown] persisted`,
  `[markdown] changeset-applied`, `[markdown] changeset-rejected` (with its rejection).
- Telemetry, never text: `Tab · Added · Markdown` (a markdown tab added or a page created), `Document · Imported ·
Markdown` (a `.md` file opened as a page), `Tab · Changed · MarkdownConverted` (Edit as markdown).

## Non-goals

- **Other text formats edited live.** A `.txt`, `.json` or `.sh` file is a [file tab](../006-document/file-tab.md);
  a live text kind for them is a later decision.
- **MDX.** An `.mdx` file is a file tab: its JSX cannot be rendered safely or faithfully.
- **A rich editor that owns the text.** No view may hold the page in a structure of its own and write markdown back
  from it; that is exactly what an article does, and why this kind exists.
- **Turning a page into a diagram.** [Markdown import](../020-import-export/markdown-import.md) still turns a markdown
  outline into a diagram on a canvas tab; it reads the text and leaves the page as it is.
