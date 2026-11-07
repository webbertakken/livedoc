# Local copy

**Status: specified.** Nothing is built.

A **local copy** is a [repository link](repository-link.md) that git takes no part in: a live, two-way sync between
LiveDoc and a folder of plain files. People edit its pages live in the browser; people and agents edit the same pages
as files, with `rg`, an editor or any file tool; each side reaches the other once it settles. It is the first of the
three outcomes of [Documents in repositories](../005-project-roadmap/prototype-scope.md#next), and the core the other
two build on: [committed main](committed-files.md) and [branch binding](branch-binding.md) add git to exactly this
sync, and change nothing in it.

Everything in [Repository link](repository-link.md) and [Native files](native-files.md) holds for a local copy. This
spec says what a link is when git is not involved, and settles each path the git-bound specs leave to git.

## Domain language

| Term            | Means                                                                                      | Never called                |
| --------------- | ------------------------------------------------------------------------------------------ | --------------------------- |
| **local copy**  | A link git takes no part in: outside a git work tree, or `[git] binding = "none"`          | offline copy, export, clone |
| **copy folder** | The folder holding the local copy's link file: its root                                    | vault, workspace, checkout  |
| **settled**     | A file with `SYNC_LOCAL_SETTLE_MS` of quiet, or a burst of edits in LiveDoc that has ended | debounced, saved            |

## What makes a link a local copy

A link is a local copy when **either**:

- its link file is outside any git work tree, or
- its link file says so, wherever it is: `[git] binding = "none"`.

```toml
host = "https://docs.nu"

[covers]
folder = "fld_8k2m4q"      # the wiki

[mirror]
level = "files"
dir = "docs"

[git]
binding = "none"           # branches | none; default branches. none: a local copy, even inside a git work tree
```

- **`binding = "none"`** keeps a folder that happens to be a git work tree (a wiki that was kept in git before it
  moved into LiveDoc) a local copy: the sync never reads the git branch, never commits, and installs no hook. Git
  keeps working on the folder as its owner chooses, and sees the sync's writes as anyone's.
- **`binding = "branches"`** (the default) inside a git work tree binds git branches
  ([Branch binding](branch-binding.md)); outside one it changes nothing, as there is no git branch to bind.
- A local copy **always syncs with main**: it has no document branches, hooks, merge driver, commits or `.gitignore`
  section. Document commands run inside it act on main; `--branch` names a branch explicitly, as anywhere.
- A local copy is at the `files` level: its pages and file documents are its files. `index` and `none` are accepted
  and do what they do for any link; a [wiki](../032-wikis/wiki.md#sync-target) is refused any level but `files`.

## Where things live

| What                                                                                  | Where                                                                                                        |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| The link file, `livedoc.toml`                                                         | The copy folder's root                                                                                       |
| The pages, file documents, mirror and outline files                                   | Under the link's `dir`, as [Native files](native-files.md#what-a-link-writes) says                           |
| The [sync records](native-files.md#the-sync-record)                                   | `.livedoc/main/<document id>.json` beside the link file, inside the copy folder                              |
| The [local sync state](repository-link.md#local-sync-state): bases, reports, the lock | Outside the copy folder: `~/.cache/livedoc/links/<link id>/`, or the git directory's when inside a work tree |

- **The records travel with the folder.** Copied, moved, backed up or carried to another machine by any tool, a copy
  folder keeps saying which revision each file holds, so a file that matches its record is never read as an edit.
- **The local sync state stays on the machine**: it is what this machine kept to merge with, never needed to read the
  folder right. Losing it loses only bases; a later edit then folds back from what remains
  ([Folding a file back](native-files.md#a-page)).
- **Never documents**: the link file and `.livedoc/` are never adopted, wherever `dir` puts them; nor is any dotfile.

## Making a local copy

### Of a folder in LiveDoc, into an empty folder

`livedoc link init --folder <folder> --level files` in an empty folder, then `livedoc sync`: every covered document
is written, with its record.

### Of an existing folder of files

A folder that already holds the files (the global wiki at `~/Repositories/wiki`, its pages under `docs/`) comes in
as [Bringing an existing wiki in](../032-wikis/wiki.md#bringing-an-existing-wiki-in) says, with `[git] binding =
"none"` when it is a git work tree: `link init --folder <empty wiki> --dir docs --binding none`, `sync --dry-run`,
`sync`. Inside a work tree without `--binding`, `link init` writes no `[git]` table and says how to keep the folder a
local copy, so neither binding is ever chosen by accident.

- **Adoption changes no file.** Every byte, line ending, byte order mark, executable bit and name stays as it was; the
  only new things in the folder are the link file and `.livedoc/`.
- **An interrupted adoption resumes.** Each document's record is written as soon as it is created, and a document
  being created is known before it is, so the next sync finishes the rest and never creates one twice.
- **What is held back is said, before anything is written**: by `sync --dry-run`, then by the sync, per file with its
  reason (a name that is no file name, two names one case-insensitive file system would fold into one, too large, a
  symbolic link, ignored).

### On a second machine

A second machine has a local copy of its own: its own folder, its own local sync state.

- **A copy of the copy folder** (carried by git, an archive, a disk) brings the link file and the records: the first
  sync writes whatever LiveDoc has newer, and folds back whatever was edited since the records were written.
- **An empty folder** gets the link file by `link init` with the same folder, then everything by `sync`.
- **A folder of older files with no records** is linked as any existing folder: a file at a covered document's path
  is that document ([The sync record](native-files.md#the-sync-record)), and folds back from its nearest base.
- **Two machines editing at once** both reach LiveDoc, where their edits merge by character as two people's do; each
  machine's next sync writes the merged page.
- **A folder kept in step between machines by another tool** (a file syncer, a network share) is one folder with
  several writers: each machine's sync reads the others' writes as snapshots when their records came with them, and as
  edits otherwise, so nothing is lost. One `sync --watch` per such folder keeps it quiet.

## Keeping in step

### `sync --watch`

`livedoc sync --watch` keeps the copy folder and LiveDoc in step until it is stopped, as for any link
([Commands](repository-link.md#commands)):

- **LiveDoc to the folder.** It listens to every covered document's room; a burst of edits that settles writes the
  page's new bytes, when the file is unchanged since its record. A file changed meanwhile is merged first.
- **The folder to LiveDoc.** It watches every file under `dir`. A file that settles is folded back; a new file is
  adopted; a missing one is a delete or the half of a move, judged against every other file in the folder, never
  on its own.
- **Its own writes are not edits.** A file holding exactly what the sync wrote there is never sent back.
- **It survives the network.** Offline, edits wait in the files and in LiveDoc; when the connection returns, every
  document either side changed is synced, from its base, without a restart.
- **It survives itself.** Stopped, crashed or never started, the next `sync` (or the next watch's first pass) finds
  every change made meanwhile, either side, from the records and the bases.
- **One watch per copy folder.** A second `sync --watch` on the same copy folder on the same machine is refused,
  naming the first's process id; one-off `sync` and `link status` still run beside it.
- It is a long-running process: run it under the person's process manager, which restarts it.

### Without a watch

Files catch up at the next `livedoc sync`, run by hand, by a script or by an agent; nothing in the folder is stale
for longer than people choose.

## Every path

### Edited in one place

| Edited                     | The next sync                                                                          |
| -------------------------- | -------------------------------------------------------------------------------------- |
| A page in LiveDoc          | Writes the file                                                                        |
| A page's file              | Folds it back from its nearest base, as one `patch` ([A page](native-files.md#a-page)) |
| A file document in LiveDoc | Writes the file                                                                        |
| A file document's file     | Replaces the bytes ([A file document](native-files.md#a-file-document))                |

### Edited in both, or offline

- **A page edited in both places**, at once or while either was offline, merges by line, then by word: both sides'
  changes arrive, a change both made arrives once, and a stretch both changed differently keeps LiveDoc's text with
  the file's version as a [lost local value](repository-link.md#merging), in the sync's report and as a margin note
  on the page.
- **The base is the snapshot the file is nearest to** among those this machine reaches: the bases the sync kept, the
  CLI's own read copies of the page, and LiveDoc's text while it is still at the record's revision. An agent that
  read the page through the CLI and wrote the whole file back merges from what it read. LiveDoc's newer text is
  never a base: a stale file merged from it would quietly undo everything that arrived since.
- **A file that matches its record is kept as a base**, so a copy folder carried to a machine that never synced it
  has bases from its first sync on.
- **A file document changed in both places** is a conflict: nothing is written or sent, and the sync names both ways
  out, `livedoc sync --take file <path>` and `--take livedoc <path>`. LiveDoc's bytes that lose stay restorable as
  the tab's previous version; with no git history to keep them, the file's bytes that lose are set aside in the local
  sync state, and the line that took them names where.

### Renamed or moved

As [Renames and moves](native-files.md#renames-and-moves) says, without git: a rename in LiveDoc moves the file with
a plain rename; a file renamed or moved in the folder renames or moves its document, judged by equal bytes or
`SYNC_RENAME_SIMILARITY`, across the whole folder. Both sides renaming keeps LiveDoc's name.

### Deleted

- **In LiveDoc** (to the Trash, or purged): the file is removed. Outside git there is no history to keep it, so the
  Trash is where it comes back from: restoring the document writes the file again. A file holding a change nobody has
  sent stays, and is refused, never removed.
- **In the folder**: the document moves to the Trash, recoverable for 30 days. An edit outranks a delete: a file
  deleted while its page changed in LiveDoc since the file's base is written again, and the sync says so.
- **A folder gone whole is never a delete.** When `dir` is missing, or every file the records name is missing at
  once (an unmounted disk, a folder moved away, an emptied tree), the sync deletes nothing, writes nothing and says
  "<dir> is missing its files: nothing was deleted. Put them back, or delete the documents in LiveDoc." It is
  reported at every sync until the files are back.

### Held back

A file the sync cannot take is reported once per sync, by path and reason, and changes nothing else:
a name that is no portable file name, siblings one case-insensitive file system would fold into one, a file over
`FILE_TAB_MAX_BYTES`, a symbolic link, an ignored path, and a file whose document this person may not open
(`unreadable`).

## Ending a local copy

Deleting the link file and `.livedoc/` ends it; every file stays as it is, and every document stays in LiveDoc
([Unlinking and re-linking](repository-link.md#unlinking-and-re-linking)). Linking the same folder again later
reattaches each file to its document by path, as re-linking does.

## Who may sync

As for any link ([Who may sync](repository-link.md#who-may-sync)): each person syncs with their own credential, a
view-level token syncs one way, and a document the person cannot open is `unreadable` and left alone.

## Observability and telemetry

- Fingerprints, with the link id and document ids, never paths or text: `[sync] local-copy` (once per pass, with why:
  `no-git` or `binding-none`), `[sync] watch-refused` (a second watch), `[sync] folder-missing` (with the count of
  missing files), and those of [Native files](native-files.md#observability-and-telemetry).
- Telemetry: as any link (`Sync`, `SyncWatch`, `SyncTake`); a local copy is not counted apart.

## Defaults

Each default below was applied where this spec is silent or qualitative, and holds until a human confirms it.
The code cites each by its id.

- **LC1** What a `files` link inside a work tree with `binding = "branches"` does before Branch binding is built: Mirror
  files as the first slice; every page and file document held, reason `binding-unbuilt`, naming `[git] binding = "none"`;
  nothing of a git branch is ever written as main's (default).
- **LC2** How `[git] binding` gets into the link file: `link init --binding none\|branches`; without it inside a work
  tree, one stderr hint and no `[git]` table, so a git-bound link is never made by accident either way (default).
- **LC3** A host whose overview carries no tab `kind` or `hash`: Read as a host without markdown and file tabs: native
  files held, reason `host-too-old`; mirror files as before (default).
- **LC4** The unit of the markdown spec's "character ranges": UTF-16 code units of the base revision's text (JavaScript
  string indices), the same in `editsBetween` and the api's `patch` (default).
- **LC5** Editor leftovers that are not dotfiles: `*~`, `#*#` and `.#*` are ignored as `editor-leftover`, so an Emacs or
  Vim backup never becomes a document (default).
- **LC6** "Files git ignores" when git takes no part: Inside a work tree (a `binding = "none"` wiki): `git check-ignore --stdin`,
  one call per pass.
  Outside one: no `.gitignore` is read; `[mirror] ignore` is the copy's own list (default).
- **LC7** How `[mirror] ignore` globs match: `picomatch` 4.0.7 against the path relative to `dir`, POSIX separators,
  `dot: true`; a glob ending `/**` also matches the directory itself (default).
- **LC8** How a large first sync stays under the api's per-token limits: A `Pacer` of `SYNC_WRITES_PER_MINUTE` (120,
  under `WRITE_RATE_LIMITER` 300/60 s) and `SYNC_READS_PER_MINUTE` (100, under `API_TOKEN_READ_RATE_LIMITER` 120/60 s),
  waiting rather than failing; `[sync] paced` logs each wait (default).
- **LC9** Whether every pass reads every covered document's overview: A native document whose list entry (`savedAt`,
  `name`, `folderId`) equals the recorded one and whose file matches its record is `in-step` with no read; mirror-file
  documents are read as before (their comments do not move `savedAt`) (default).
- **LC10** Which files a narrowed `--watch` pass judges moves over: The whole scan, always: a lone half of a rename
  never deletes a document (default).
- **LC11** How "as git judges a rename" is measured: Bytes of lines common to both texts, counted as a multiset, over
  the larger text's bytes, as git's diffcore counts text by line (default).
- **LC12** A directory renamed in the folder: When every document recorded under one directory moved to one new
  directory and no folder of that name exists, the folder is renamed, keeping its id (and a wiki mark on it) (default).
- **LC13** When "a folder whose documents have all gone goes with them" deletes a LiveDoc folder: Only a folder this
  pass emptied, holding no document and no subfolder; never the covered folder (default).
- **LC14** Temporary files and modes of the files a local copy writes: `.<name>.<pid>.tmp` beside the target (a dotfile,
  so `rg`, watchers and other syncs skip it), then `rename(2)`; a rewrite keeps the target's mode; a new file 0644, or
  0755 when executable, narrowed by the umask (default).
- **LC15** How a watch of hundreds of documents opens its room streams: In index order, `SYNC_STREAM_OPENS` (10) at a
  time (default).
- **LC16** Where a file name splits into name and extension: At the last dot; no dot: extension `''`; `archive.tar.gz`
  is `archive.tar` and `gz` (default).
- **LC17** The adopted document's id, and how adoption stays exactly-once: A random id chosen by the CLI and journalled
  in `adoptions.json` before the create; a resumed pass asks the api for it before creating again (default).
- **LC18** How "one watch per copy folder" is enforced, and its exit: An exclusive `watch` file in the state directory;
  a live holder exits 5 (`watch_running`) naming the pid; a dead holder on this hostname is taken over, as RL34
  (default).
- **LC19** Where set-aside bytes are kept, and for how long: `<state dir>/set-aside/<startedAt>-<file name>`, 0600,
  never pruned: they are the person's bytes (default).
