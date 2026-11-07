# Repository link

**Status: first slice built.** The link file, the `none`, `index` and `files` mirror levels, every sync state,
`link init|status|ls`, `sync` (`--relocate`, `--dry-run`, `--all`) and `sync --watch` (CLI 0.2). Ahead: the merge of
`ahead` and `diverged` documents, `local-new` creation, `sync --resolve`, the git hooks and the merge driver,
[Branch binding](branch-binding.md), [Committed files](committed-files.md), unlinking, and
[Diagram sources](diagram-sources.md).

A **repository link** binds a directory in a repository to documents in LiveDoc, so the people and agents working in
that repository find, read and change its documents without leaving it. LiveDoc is the **single source of truth**:
what a repository holds of a document is a **snapshot** of it at a known revision, never its home, as the
[Google Drive mirror](../022-drive-mirror/drive-mirror.md) is a copy and never a location. A page or a file document
is written as its own plain file, a [native file](native-files.md), which is a snapshot all the same.

## Why

- Agents look for context with `rg` and `ls`. A diagram that only lives behind a URL is invisible to them.
- People draw faster than they commit. A repository that tried to be the diagram's home would always be behind, and
  two homes always disagree.
- Not every project wants files. A product spread over several repositories, or a team keeping one diagrams
  repository, wants the link and the agent access without copies in every tree.

## Principles

1. **LiveDoc owns every document.** A snapshot in a repository is derived; a change made to it is a proposal that
   reaches LiveDoc as a [changeset](../024-agents/agent-changesets.md), or does not count.
2. **Files are optional.** A link works with no files at all; the CLI reaches the covered documents remotely.
3. **A snapshot says how old it is.** Every mirrored tab records its revision, so any reader knows what it holds.
4. **Nothing is lost, nothing is silent.** A sync never overwrites a local change it has not sent, and every
   automatic resolution is printed and recorded where people will see it.
5. **Deterministic files.** The same document at the same revisions writes the same bytes, so git shows only real
   change.

## The link file

`livedoc.toml`, committed at the root of the directory it links (the repository root, or a package in a
monorepo). It holds identifiers and settings, never a credential.

```toml
# This repository's diagrams live in LiveDoc; see https://docs.nu/help/developers/repositories/
host = "https://docs.nu"   # optional; a self-host names its own

[covers]
folder = "fld_8k2m4q"              # a personal or team folder, its subfolders included
documents = ["doc_3h9x2a"]         # and any single documents, from anywhere the person can open

[mirror]
level = "files"                    # none | index | files; default index
dir = "docs/diagrams"              # relative to this file; default diagrams
ignore = ["drafts/**"]             # paths never adopted or written (Native files)

[repository]
web = "https://github.com/acme/app/blob/main"  # optional; where links out of a wiki open (Links)

[hooks]
block = false                      # true: a commit fails when its sync cannot run

[git]                              # native files (Native files)
binding = "branches"               # branches | none; none makes a local copy (Local copy); default branches
branch = "main"                    # the main git branch (Branch binding); default: the remote's default branch
commit = "none"                    # none | commit | push; default none

[files]                            # which written files are committed (Committed files)
commit_max_bytes = 1048576         # default 1 MB
commit_warn_bytes = 209715200      # default 200 MB

[[sources]]                        # sources without a comment syntax (Diagram sources)
path = "docs/arch.excalidraw"
tab = "doc_3h9x2a/0b34"
```

These are every table and key a link file holds; [Diagram sources](diagram-sources.md) owns `[[sources]]`,
[Native files](native-files.md#adopting-files) owns `ignore`, [Links](../032-wikis/links.md#links-out-of-the-wiki)
owns `[repository]`, [Branch binding](branch-binding.md) owns `[git] branch`, [Local copy](local-copy.md) owns
`[git] binding`, and
[Committed files](committed-files.md) owns `[files]`.

- **Covers.** A link covers the documents in its `folder` (subfolders included) and its listed `documents`. Either
  may be absent, not both. A document moved out of the folder leaves the link's coverage; a listed document stays
  covered wherever it moves.
- **Host.** Absent means the CLI's active profile's host. A link naming another host than the active profile is
  refused with the profile to use; a self-host link never contacts docs.nu.
- **Several links.** A command acts on the nearest `livedoc.toml` at or above the working directory; `--all`
  acts on every link below it. Two links covering one document each keep their own snapshot.
- **Unknown keys** are refused by name, so a typo never silently does nothing.

## Mirror levels

| Level   | Writes                                                                                                                                                         | For                                                          |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `none`  | Nothing                                                                                                                                                        | Remote-only projects; agents use the CLI against the link    |
| `index` | `<dir>/INDEX.md` only                                                                                                                                          | Agents find diagrams with `rg` and read them through the CLI |
| `files` | `INDEX.md`, plus per document its files: a page or file document as its [native file](native-files.md), any other as a mirror file and an outline file (below) | Documents readable offline, in reviews and in git history    |

`index` is the default: it makes every covered document discoverable at almost no cost in the tree.

### `INDEX.md`

Generated, and opening with a line that says so and where to edit. One section per document, in a stable
order (folder path, then name, then id, so a new document never reorders the rest): its name, its link, its folder path, each tab's name, kind, element count and revision, and (at `files`) the
paths of its files. At `index` each tab also carries its outline's header line, so `rg` finds a document by its
tab names and counts; at `files` the outlines are in the outline files.

### The mirror file

`<folder path>/<slug>.livedoc.json`: the CLI's [pull file](../015-api/cli.md#local-files), so the editor's
"Import a copy" reads it, with these rules for a committed copy:

- **One element per line**, in the tab's stored order, keys sorted. A change to one element is a one-line diff, and
  `rg "Play button"` lands on the element's line.
- `livedocSync` keeps the host, the [document branch](../006-document/document-branches.md) the file is a
  snapshot of (absent for main) and each tab's `rev`, `hash` and `settingsHash`. It holds **no time** (a pull at
  an unchanged revision writes the same bytes); when it was last synced lives in the local sync state.
- The slug comes from the document's name at first mirror and then stays: the path is stable while the document is
  renamed or moved, and a sync names the files whose path would now differ (`sync --relocate` moves them, through
  `git mv` inside a git work tree). A move never lands on a file LiveDoc did not write: a hand-written
  `architecture.md` at the target is kept, the document stays where it is, and the sync refuses it naming that file.
- Formatting is not meaning: a file reformatted by another tool parses alike, hashes alike (the hash is over
  canonical JSON), and is rewritten in the canonical form at its next change.

### The outline file

`<slug>.livedoc.md` beside the mirror file, named after it so it never takes the name of a page's own `.md`
file: generated, opening with a line that says so and links the document, then one
section per tab holding its [outline view](../024-agents/document-views.md#the-outline-default) in a `text` fence.
It is what an agent reads first, at a tenth of the JSON's tokens, and what a reviewer reads in a pull request.

## Sync states

A covered document is in one state, from comparing its mirror file, the file's recorded revisions and hashes, and
the document now. A native file reads its revision and hash from the sync record instead, and adds the `deleted` and
`moved` states ([Native files](native-files.md#sync-states)):

| State        | Means                                                                                    | A sync                                       |
| ------------ | ---------------------------------------------------------------------------------------- | -------------------------------------------- |
| `in-step`    | Local hashes match the recorded ones; the revisions are the document's                   | Nothing                                      |
| `behind`     | Local unchanged; LiveDoc has newer revisions                                             | Writes the newer snapshot                    |
| `ahead`      | Local changed; LiveDoc unchanged since the recorded revisions                            | Sends the local change ([Merging](#merging)) |
| `diverged`   | Both changed                                                                             | Merges, then sends ([Merging](#merging))     |
| `new`        | Covered, never mirrored                                                                  | Writes it                                    |
| `local-new`  | A file in `dir` holding a document envelope with no `livedocSync`: written by hand       | Creates the document in the link's folder    |
| `gone`       | The api answers `410 document_trashed`, or the document is readable and outside coverage | Removes its files; git history keeps them    |
| `unreadable` | The api answers `404` for the file's document: purged, or not this person's to open      | Nothing; reported once per sync              |

- **Only an envelope without sync data is new.** A file whose `livedocSync` names a document is never created
  again, whatever the api answers, so a teammate without access, a purged document's file on an old branch or a
  file a merge brings back never makes a duplicate. The api answers a document someone may not open exactly as an
  absent one, so `unreadable` covers both and touches nothing.
- A missing mirror file of a covered document is `new` again: deleting a file never deletes a document. A file of
  an `unreadable` document stays until someone deletes it.
- A document that cannot be read for a transient reason (offline, rate limited, a server failure) keeps its files
  untouched and is reported, never treated as `gone` or `unreadable`.
- A file holding git's conflict markers is refused, naming `livedoc sync --resolve <file>`
  ([Git](#git)); nothing else in the sync waits for it.
- **A broken file holds its document back.** A conflicted or otherwise invalid file at a document's mirror path
  holds that document's write back: the document is reported, naming the file and its fix, and never written again
  at another path.
- **A rename is a change.** A document whose name or other envelope fields differ from its file is `behind` even
  when no tab's revision moved, and its files are rewritten.
- **Without mirror files** (`none`, `index`) a document's state comes from the revisions the local sync state
  recorded at its last sync; a document never synced on this machine is `new`.
- **A gone file with an unsent change stays.** A `gone` or level-lowered file whose hashes differ from its recorded
  ones holds a local change nobody has sent; it is kept and refused, naming the file, never removed.

Until the merge is built, `ahead` and `diverged` are refused per document, naming the file and the command that
sends it (`livedoc push <file>`), and the rest of the sync proceeds. Until then too, `local-new` is reported
and never created, and a conflicted file's refusal names the manual fix (keep one side with
`git checkout --ours <file>` or `--theirs`, then sync) in place of `sync --resolve`.

**Lowering the mirror level** (`files` to `index`, or to `none`) removes the files the new level does not write, as
`gone` removes them; git history keeps them.

## Merging

A merge is a **three-way merge per tab, element by element**, of the **base** (the snapshot the local change was made
from), the **local** file and the **remote** tab now. It lives in one pure package, `@livedoc/tab-merge`, so the
CLI and git's merge driver merge alike, and any other front door can.

**The base** is the tab at the recorded revision. The CLI keeps every snapshot it writes in its local sync state
(below), keyed by document, tab and revision; inside a git work tree it falls back to the file's own history
(`git log` for the version recording that revision). A merge with no base (a cleared cache, a squashed history, a
fresh clone) is a **baseless merge**: every field that differs takes the remote value and records the local one as
a lost local value (below); elements only in the file are added, as an edit outranks a delete, and listed in the
report and the changeset's summary.

| Base → local | Base → remote   | Result                                                                   |
| ------------ | --------------- | ------------------------------------------------------------------------ |
| added        | absent          | Added                                                                    |
| changed      | unchanged       | Local                                                                    |
| unchanged    | changed         | Remote                                                                   |
| changed      | changed         | Field by field: each side's changed fields; a field both changed: remote |
| removed      | unchanged       | Removed                                                                  |
| removed      | changed         | Remote kept: an edit outranks a delete                                   |
| changed      | removed         | Local restored: an edit outranks a delete                                |
| reordered    | order unchanged | Local order for the elements it moved                                    |

- **Fields** are an element's top-level fields; an arrow's ends, points and label are one field each. The
  [live fields](../024-agents/agent-changesets.md#what-a-changeset-is) (comments, answers, votes, ticks) are never
  merged from a file: LiveDoc's always stand.
- **No silent path.** A field both sides changed is a **lost local value**: the merge keeps it in the sync report and
  as a comment on the element in LiveDoc, "Not applied from <path>: label was "Start game"", authored by the
  person syncing, so whoever looks at the diagram sees it and can resolve it. A restored element and a kept remote
  edit are reported likewise.
- **Tab settings** (name, theme, background) follow LiveDoc; a local change to them is reported as not sent.
  A tab added in the file is created; a tab removed from the file is not deleted.
- **The send** is one strict `replace` changeset per merged tab, based on the remote revision the merge read. When
  that revision moved meanwhile (`412 stale_tab`) the sync re-reads and re-merges, up to `SYNC_MERGE_ATTEMPTS`
  times, then reports the tab as still diverged. Held elements answer as for any changeset (`--wait-held`).

## Commands

| Command                                             | Does                                                                                                                                                                                    |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `link init [--folder <f>] [--doc <d>]... [--level]` | Writes `livedoc.toml`; with no folder, a picker of the person's folders                                                                                                                 |
| `link status [--branch <name>]`                     | Every covered document with its state and branch; exits 0 ([In CI](#in-ci) for `--fail-behind`)                                                                                         |
| `link ls`                                           | The covered documents, as `document ls` prints them                                                                                                                                     |
| `sync [--watch] [--relocate] [--dry-run] [--all]`   | One sync of the link; `--watch` keeps syncing until interrupted                                                                                                                         |
| `sync --resolve <file>`                             | A file git left conflicted, resolved ([Conflicts git leaves](branch-binding.md#conflicts-git-leaves))                                                                                   |
| `link clean`                                        | Puts git's version back over unsent-free snapshots, so a pull or checkout proceeds ([Branch binding](branch-binding.md#while-people-and-agents-work))                                   |
| `sync --carry-main [--dry-run]`                     | Writes main's current snapshot of documents git's main is behind onto the current git branch, as one commit for a pull request ([Branch binding](branch-binding.md#main-after-a-merge)) |
| `link hooks install\|uninstall`                     | The git hooks and the merge driver ([Git](#git))                                                                                                                                        |
| `unlink [--dry-run]`                                | Ends the link in one commit, leaving every file as it is ([Unlinking](#unlinking-and-re-linking))                                                                                       |

- `link init` without `--folder` or `--doc` shows a picker of the person's folders on a terminal; where stdin or
  stdout is not a terminal it refuses, listing the folders as runnable `link init --folder <id>` commands.
- Every other command takes a mirror file's path wherever it takes a document, as it takes a pulled file today.
- `sync --watch` listens to each covered document's room through the CLI's [room stream](../015-api/cli.md) and
  writes a tab's snapshot after its burst of changes settles (the `wait --for change` rule), and watches the mirror
  directory for local changes, syncing them after `SYNC_LOCAL_SETTLE_MS` of quiet. It reconnects as the room stream
  does and prints one line per sync.
- A covered document without a live room stream (one trashed and restored, refused a ticket, or dropped) is
  listened to again at the next coverage read, so its changes keep arriving live. A rate-limited ticket (`429`) is
  retried, never treated as a refusal.
- One sync runs at a time per link: a lock in the local sync state makes a second wait for it, or fail after
  `SYNC_LOCK_WAIT_MS` naming the holder's process id. Of two syncs waiting on the same crashed holder, exactly
  one takes the lock over.
- A sync never writes over or removes a mirror file edited while it runs: a file whose bytes changed since the
  sync's scan is refused, as `diverged` (or kept, for a removal), and the edit stays for `push`.

## Git

Git moves slower than documents, so the repository holds **snapshots at commit time**. Every git branch is bound to
the [document branches](../006-document/document-branches.md) of its name, and the main git branch to the documents
themselves: each git branch's snapshots are of its own document branches, and its local changes are proposals to
them. One rule holds for diagrams, pages and file documents alike: [Branch binding](branch-binding.md).

### The hooks

- **Pre-commit** (and **pre-merge-commit**, which `git merge` runs instead) runs `livedoc sync --hook`: one sync,
  then `git add` of exactly the files it wrote. A commit carries the diagrams as they were when it was made, and the
  local changes it carries have reached LiveDoc.
- **Pre-push** runs `livedoc sync --hook=pre-push`: it checks that each pushed git branch's snapshots are still
  current, and when they are not it makes one sync commit and stops the push once
  ([The hooks](branch-binding.md#the-hooks)).
- **Partial staging is refused.** A mirror file whose staged content differs from the work tree, or a commit with
  its own index (`git commit -o`, `GIT_INDEX_FILE`), would commit what the person did not stage; the hook fails
  naming the file and the fix (`git add <file>`), and syncs nothing.
- **Never in the way.** Past `SYNC_HOOK_BUDGET_MS`, offline, or signed out, the commit goes through with one
  stderr line naming the revisions its snapshots hold. `[hooks] block = true` fails the commit instead.
- **The hook line** is guarded, so a teammate without the CLI commits as before:
  `if command -v livedoc >/dev/null 2>&1; then livedoc sync --hook; fi`, and likewise for pre-push.
  `link hooks install` appends each,
  never replacing a hook, to the tracked hook file where a hook manager keeps one (Husky's `.husky/pre-commit`,
  never its generated `.husky/_`; a `pre-commit` command in `lefthook.yml`), committed for everyone, and otherwise
  to `.git/hooks`, for this clone only.

### The merge driver

`.gitattributes` (committed): `*.livedoc.json merge=livedoc`; the driver itself is registered per clone in
`.git/config` by `link hooks install`. It merges two branches' copies of a mirror file **tab by tab**, telling
LiveDoc's history from local changes by each copy's own record: a tab whose hash equals its recorded hash is a
**clean snapshot**, any other tab carries a **local change**.

| Ours           | Theirs                          | Result                                                                                                                                                 |
| -------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| clean snapshot | clean snapshot, the same branch | The higher revision's tab, verbatim                                                                                                                    |
| clean snapshot | clean snapshot, another branch  | Merged element by element from git's base copy, as the branch merge would; marked a snapshot of both, so the next sync makes the same merge in LiveDoc |
| local change   | clean snapshot                  | Ours, with its own recorded revision; the next sync merges it with LiveDoc                                                                             |
| clean snapshot | local change                    | Theirs, likewise                                                                                                                                       |
| local change   | local change                    | Ours; theirs is kept as a **pending proposal** in the local sync state and reported                                                                    |

- The driver never merges two snapshots of one document branch element by element: two revisions of one branch are
  not two edits, and their difference is never sent back. Two branches' snapshots are two edits, and merge as the
  [branch merge](../006-document/document-branches.md#merging) does; the merge it writes is provisional, and the
  next sync replaces it with LiveDoc's ([Merging in git](branch-binding.md#merging-in-git)).
- It works offline and sends nothing. The next sync sends pending proposals first, each merged against LiveDoc
  from its own base, so both branches' changes arrive.
- A tab in only one copy is kept; the document envelope's other fields come from the copy with the higher revision.
- **Without the driver** (a clone that never ran `link hooks install`), git merges the text and may leave conflict
  markers. `livedoc sync --resolve <file>` reads the three versions from git's index (`:1:`, `:2:`, `:3:`),
  applies the driver's table and stages the result.

### In CI

`link status` answers whether the committed snapshots are current; it fails a build only when asked
(`--fail-behind`), and without a token it says so and exits 0. On a pull request it judges the document branches the
pull request carries, and main only on main ([In CI](branch-binding.md#in-ci)).

## Unlinking and re-linking

A repository opts in and out at any moment, and neither touches a document or any file's bytes.

- **Linking adopts what is there.** `link init` on a folder of existing files adopts them unchanged: the first commit
  after it adds only the link file and the sync records
  ([Wiki](../032-wikis/wiki.md#bringing-an-existing-wiki-in)).
- **`livedoc unlink`** ends the link in one commit: it removes the link file, the sync records, the managed
  `.gitignore` section ([Committed files](committed-files.md#the-managed-section)) and the hook lines it installed in
  tracked hook files; this clone's own `.git/hooks` lines and merge driver registration go too. Every other file stays
  exactly as it is. Before it commits, it:
  1. syncs once, so the files hold the current snapshot of the git branch it runs on;
  2. lists the open document branches of this repository **not yet in git** (their latest revision in no local git
     branch's records) and, when asked, **writes each to its git branch first**: one sync commit per git branch, made
     in a temporary worktree so the checkout never switches. A git branch only on the remote is fetched; one deleted
     (its document branches in their grace) or never created (a branch started in LiveDoc) is created from the main
     git branch. Pushing them stays the person's;
  3. lists the files [kept out of git](committed-files.md) and offers to commit them or leave them on disk;
  4. says what never reaches files and stays in LiveDoc: margin notes, comments, presence, share links and roles,
     and the Timeline.
- **The folder in LiveDoc is then made read-only** (asked, for an Editor of the folder), marked "Unlinked from
  <repository> on <git branch>, <when>", so nobody keeps editing documents whose edits no longer reach the
  repository. Nothing in it is lost; **Make editable** lifts it. Unlinked on a git branch other than main, the link
  ends where that commit lands, and the mark names the git branch.
- `unlink --dry-run` lists all of it and changes nothing; declining any step changes nothing.
- **Removing the link by hand** (deleting the link file and `.livedoc/` without the CLI) ends it as well, without
  those steps; the folder in LiveDoc stays editable, and its open branches stay open until discarded.
- **Re-linking later** (`link init --folder <folder>` on the same folder, while it still exists) reattaches each file
  to its old document by path, and by content where the path moved, as a
  [move](native-files.md#renames-and-moves) is found; a file changed meanwhile folds back from its nearest base, and
  the read-only mark lifts. A folder purged since links as new: its files are adopted as new documents.

## Local sync state

Per link, never committed: inside a git work tree at `<git dir>/livedoc/<link id>/` (each worktree its own),
elsewhere at `~/.cache/livedoc/links/<link id>/`. The link id is a hash of the link file's absolute path. It
holds the base snapshots (the latest `SYNC_BASES_KEPT` per tab), the pending proposals, the last
`SYNC_REPORTS_KEPT` sync reports, when each tab was last synced, and the lock.

## Who may sync

- The person syncing reads and writes with their own credential, so each person's sync reaches only what they can
  open; a teammate without access to a document finds it `unreadable`: its snapshot stays untouched and they are
  told so once per sync.
- A view-level token syncs one way: snapshots are written, local changes are reported as not sent.
- The mirror is as public as the repository: `link init` says so in one line when the repository has any git
  remote. Document and folder ids in `livedoc.toml` grant nothing.

## Limits

| Constant               | Value | Why                                                                      |
| ---------------------- | ----- | ------------------------------------------------------------------------ |
| `SYNC_MERGE_ATTEMPTS`  | 3     | A busy tab settles within a few attempts; more means people are mid-edit |
| `SYNC_LOCAL_SETTLE_MS` | 1500  | An editor's save and a formatter's rewrite land as one change            |
| `SYNC_LOCK_WAIT_MS`    | 30000 | Longer than a sync of a large folder; shorter than a person's patience   |
| `SYNC_HOOK_BUDGET_MS`  | 5000  | A commit never waits on a slow network for longer                        |
| `SYNC_REPORTS_KEPT`    | 20    | Enough to find what last week's syncs did; small enough to never matter  |
| `SYNC_BASES_KEPT`      | 5     | Covers several syncs while a local edit is in flight                     |

## Observability and telemetry

- CLI debug fingerprints: `[sync] state`, `[sync] wrote`, `[sync] sent`, `[sync] merged`, `[sync] lost-local-value`,
  `[sync] gone`, `[sync] unreadable`, `[sync] pending`, `[sync] resolved`, `[sync] refused`, `[sync] lock-wait`, `[unlink] started`, `[unlink] branch-written`, `[unlink] committed`,
  `[unlink] declined`, `[relink] reattached`, each with the document and tab ids, never content.
- Telemetry: category `Cli`, action `Used`, type the verb (`LinkInit`, `Sync`, `SyncWatch`, `LinkHooks`, `Unlink`), as every
  command ([CLI](../015-api/cli.md#telemetry)).

## Defaults

Each default below was applied where this spec is silent or qualitative, and holds until a human confirms it.
The code cites each by its id.

- **RL1** How `livedoc.toml` is parsed: `smol-toml` 1.9.0 (the latest), bundled: the link file uses tables, arrays and
  arrays of tables, beyond the hand parser `config-file.ts` reads; its line and column name a syntax error (default).
- **RL2** What this slice does with `[hooks]` and `[[sources]]`: Parse and validate, never refuse a known table:
  `[hooks]` admits only `block`, a boolean, refused by name otherwise; `[[sources]]` must be an array of tables and its
  tables' keys are left to diagram-sources; both are ignored by every command of this slice, with a debug line
  (default).
- **RL3** The grammar of ids and `dir`: Ids are the strings the api stores (the spec's `fld_…`, `doc_…` are
  illustrative): non-empty, no whitespace, at most 128 characters; `dir` normalised to POSIX segments, `.` allowed,
  `..`, absolute paths and a real path outside the link root refused (`invalid_dir`) (default).
- **RL4** Which directories `--all` and the mirror scan walk: Depth first in byte order of names; `.git`, `node_modules`
  and dot-directories skipped; symbolic links never followed; the mirror scan also skips any subdirectory holding its
  own `livedoc.toml` (default).
- **RL5** How the link's host is compared, and which profile the refusal names: As origins with a leading `www.` ignored
  (as `parseDocumentUrl`); the refusal exits 2 and names the first `config.toml` profile with that host, else `--host <link host>`
  (default).
- **RL6** A covered folder the syncing account cannot find: Said once on stderr; that pass judges no mirror file outside
  coverage, so no file is removed for a folder the account cannot see (default).
- **RL7** What "folder path" is, for paths and for `INDEX.md`: Paths: the slugged names (`fileSlug`) of the folders
  below the covered folder down to the document's; empty for a listed document outside it.
  `INDEX.md`: the names from the space (`My Documents`, or the team's name), `/`-joined; `Shared With Me` when the
  folder is not visible (default).
- **RL8** The link id's length, the state dir's discovery and modes: First 16 hex of SHA-256 of the link file's real
  path; `git rev-parse --absolute-git-dir` from the link root (each worktree its own), else `<cacheDir>/links/<link id>/`;
  directories 0700, files 0600 (default).
- **RL9** How `--relocate` moves a file git does not track: `git -C <root> mv` first; an untracked file, a missing `git`
  or a refusal falls back to a rename; empty directories left behind are removed (default).
- **RL10** What the offline overview shows as "edited" for a file with no `pulledAt`: The greatest `updatedAt` among the
  file's tabs, else 0 (default).
- **RL11** Two mirror files naming one document: Both refused (`duplicate`), naming each other; neither is written or
  removed (default).
- **RL12** When an `in-step` document's outline file is rewritten: Only when it is missing, so CLIs of different
  versions never rewrite each other's outlines back and forth (default).
- **RL13** Whether `--dry-run` takes the lock or writes the local sync state: Neither: it reads and prints, ending `dry run: nothing written`
  (default).
- **RL14** Which answers are transient, and whether a pass retries: `429`, `5xx`, a timeout and a network failure are
  transient, kept and reported, not retried within the pass; `401` ends the pass before any write, exit 4 (default).
- **RL15** Whether a sync records read copies: Yes, every tab it reads, as `pull` does (CLI24), so `tab diff --since`
  works from a synced revision (default).
- **RL16** When `INDEX.md` is rewritten, and what a document not read this pass shows: Rewritten only when its bytes
  differ; an `unreadable`, transient or refused document keeps its previous section verbatim (found by its `Link:`
  line), else is left out (default).
- **RL17** A pass's exit when documents fail differently: The highest exit among its actions (as CLI84); `unreadable`,
  `local-new`, `gone` and a lowered removal are 0, a refusal (`gone-changed` and `lowered-changed` included) 1, a
  transient 6 or 7; `--all` takes the highest across links.
  `link status` is not a pass: it exits 0 (spec, RL43) (default).
- **RL18** How a waiting sync polls, and its exit when the wait ends: Every 250 ms; exit 5 (`lock_held`, "conflict or
  held: retry"), naming the pid (default).
- **RL19** Whether `sync --watch` holds the lock between passes: No: per pass only, so `link status` and a one-off
  `sync` still run beside a watch (default).
- **RL20** Which room events count as a document's "changes" for `--watch`: Every event `classifyRoomOp` yields,
  comments included (the mirror holds an element's threads), settled by `WAIT_SETTLE_MS` per document (default).
- **RL21** How `--watch` learns that coverage changed: Coverage re-read every 60 s; entering documents get a stream and
  a pass, leaving ones a pass and no stream (default).
- **RL22** What `--watch` does after a room stream reconnects: A pass of that document, as after an op, instead of the
  `tab diff` notice `watch` prints (default).
- **RL23** How `--watch` tells its own writes from a person's: Each path it wrote or removed is kept with the SHA-256 of
  what it wrote; an event whose file hashes to it is ignored (default).
- **RL24** How `sync --watch` reports as `SyncWatch` when the verb is `sync`: `Verb.telemetryType(input)`, read by
  `main.ts` before `pascalToken(verb.id)`; `CLI_COMMANDS` gains a `SyncWatch` row beside `Sync` (default).
- **RL25** The line `--watch` prints per sync: `<HH:MM:SS>` in UTC, then the pass's action lines joined with `·`, or `in step`;
  a refusal or `unreadable` line again only after it changed (default).
- **RL26** How `link init --folder` names a folder: A full id, an id prefix of at least 4, or a name equal ignoring
  case, over personal and team folders; none or several exit 3 with the nearest or the candidates (default).
- **RL27** `link init --doc` given a share-link URL: Exit 2: a link file holds ids, and a share code is a credential of
  sorts (default).
- **RL28** Whether `link init` writes `host`: Always, so a teammate on another profile is refused rather than syncing
  ids against the wrong host (default).
- **RL29** `sync --watch --dry-run`: Exit 2: a dry run writes nothing, so there is nothing to watch (default).
- **RL30** Whether the mirror file keeps the envelope's `exportedAt`: No: it is a time, and the same revisions must
  write the same bytes; `parseDocumentEnvelope` reads its absence as 0 (default).
- **RL31** Which keys "keys sorted" sorts: Every object's, at every depth, in `canonicalJson`'s order, so the whole file
  is one canonical form (default).
- **RL32** How names and outlines are made safe in Markdown: Names get a backslash before each backslash, backtick,
  asterisk, underscore, bracket, angle bracket, hash, pipe and tilde, and before a leading list marker; code spans and
  fences one backtick longer than the longest run inside (default).
- **RL33** How the `[sync]` and `[link]` fingerprints print beside `[cli]`: `debugLog(io, scope)`; the sync modules log
  with scope `sync`, `link init` and its picker with `link`, under `LIVEDOC_DEBUG=1` only (default).
- **RL34** A lock whose holder died: A holder on this hostname whose pid is not alive is stale: removed and taken over,
  logged; a holder on another hostname is never judged stale (default).
- **RL35** How the folder picker takes input, and what cancelling exits: Line based on stderr: a numbered list, then
  `folder> ` read with the terminal's own line editing; a number chooses, other text narrows by path ignoring case,
  Enter alone, Ctrl-D or Ctrl-C cancels with exit 1; no raw mode, arrows or redraw, as the CLI draws no cursor movement
  (CLI); choices are personal folders then each team's by team name, depth first, siblings by
  name (default).
- **RL36** What a sync does at `none`, where states come from recorded revisions: It reads coverage and revisions and
  records them in the local sync state, so `link status` has states; it writes nothing in the tree but the removal of
  lowered files; `sync --watch` ends after its first pass (default).
- **RL37** Which "envelope fields" make a document `behind`, and how they are read: `document.name`,
  `document.presentation`, the tab order and each tab's `folder` (absent equal to none), compared at `files` against
  `GET /documents/:id`, read beside the overview; a hand edit of them is no local change and is written back (default).
- **RL38** How many folders the picker and its refusal show at once: 20, as `LIST_DEFAULT_LIMIT`; the rest named in one
  line, reached by narrowing or by `--folder <name>` (default).
- **RL39** The refusal's shape when `link init` is not run in a terminal: Exit 2 (`folder_needed`); one line per folder,
  `livedoc link init --folder <id>` with `--level` when given and a shell comment `# <path> (<library>)`, so each line
  runs as pasted; the first as the hint (default).
- **RL40** How `link init` knows the repository has a git remote: `git -C <cwd> remote` exiting 0 with any output; no
  git, a non-zero exit or no output prints nothing; no forge is asked, so the profile's host stays the only one
  contacted (default).
- **RL41** How the stable order compares: Folder path by its slugged segments, segment by segment in UTF-16 code units,
  a prefix first; then the document name in code units; then the id; never `localeCompare`, so every machine orders
  alike (default).
- **RL42** Which generated Markdown a sync may remove: An outline file or `INDEX.md` only when its first line is still
  the generated line; one edited past that is left and named (default).
- **RL43** What `link status` prints for a document it could not read: `?` in the state column, the failure on stderr,
  exit 0 like every other row (default).
- **RL44** The local sync state's record shape: Per document its name and per tab `{ rev, syncedAt }`, refreshed for
  every document whose state a pass decided and dropped when it is `gone` (default).
