# Native files

**Status: specified.** Nothing is built.

A **native file** is a document in its own file form: a page as its `.md` file, a file document as its bytes, a PDF
document as its `.pdf`. A
[repository link](repository-link.md) at the `files` level writes every covered page and file document as a native
file, so whoever reads the repository with `rg`, `cat` or GitHub reads exactly what people edit in LiveDoc, and it
folds the changes made to those files back in.

Everything in [Repository link](repository-link.md) holds here; this spec adds what a file that _is_ the document
asks for. LiveDoc stays the source of truth: a native file is a snapshot of a document branch (or of main) at a
recorded revision, and a change made to it is a proposal that reaches that branch as a
[changeset](../024-agents/agent-changesets.md), or does not count ([Branches](#branches)).

This spec names things as LiveDoc's command line does: the command `livedoc`, the link file `livedoc.toml`, the
mirror file `<slug>.livedoc.json`. [Repository link](repository-link.md) keeps LiveDoc's spelling of the same
names until the rename reaches it.

## What a link writes

At the `files` level, per covered document:

| Document                                                     | Files                                                                                             |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| A page: one [markdown tab](../031-markdown/markdown-tab.md)  | `<name>.md` (or `.markdown`, as it was adopted): the text's bytes                                 |
| A file document: one [file tab](../006-document/file-tab.md) | `<name>.<extension>`: its bytes, with the executable bit when it carries one                      |
| A [PDF document](../035-pdf-documents/pdf-document.md)       | `<name>.pdf`: its bake, the stored file with every live change written in                         |
| Any other document                                           | The mirror file and the outline file ([Repository link](repository-link.md#mirror-levels))        |
| A page or file document that has gained tabs                 | Its native file for its **native tab**, plus a mirror file and an outline file for the other tabs |
| A document a page embeds as an image                         | Also `<slug>.livedoc.svg`: its first tab drawn, so the page shows it on GitHub too                |

- **The native tab** is the tab a native file holds: the one it was made from, or the first when the document was
  created in LiveDoc.
  Its id is kept in the [sync record](#the-sync-record), so reordering tabs never moves the file.
- **The outline file** is named after its mirror file, `<slug>.livedoc.md`, so it never takes a page's name.
- **A render** (`.livedoc.svg`) is written while any covered page embeds the document
  (`![Architecture](architecture.livedoc.svg)`) and removed when none does. Its bytes are deterministic, like every
  file a link writes.
- **Generated files are never documents.** Mirror files, outline files, renders, `INDEX.md`, the link file and the
  sync records are never adopted, wherever the link's `dir` puts them; an edit made to an outline or a render is reported as not sent and overwritten at their next
  write.
- `INDEX.md` is not written where a page's file would take its path, compared case-insensitively: a wiki's
  [entry page](../032-wikis/wiki.md#the-entry-page) holds that place.

## Names and paths

At the `files` level the directories under the link's `dir` are the folders of its covered folder: a folder is a
directory of the same name, and a native file's path is its folders' names, then the document's name and its
extension.

- **The path follows the name.** Renaming or moving a page or file document in LiveDoc moves its file at the next
  sync (`git mv` inside a git work tree). A mirror file keeps its slug when its document is renamed; a native file
  cannot, because the file is the page, and the [links](../032-wikis/links.md) between pages are paths.
- **A name is a file name.** In a folder a link covers at `files`, a page's, file document's or folder's name must
  be a portable file name: none of `/ \ : * ? " < > |`, no control character, not ending in a space or a dot, not a name Windows
  reserves (`CON`, `NUL`, `COM1`, ...). A rename that breaks this is refused with "“<name>” can’t be a file name in
  <folder>, which syncs to a repository: remove <character>."
- **Names that predate the link.** A page, file document or folder already named otherwise when the link arrives is
  held back from the sync and reported with the character to remove; nothing is renamed for it.
- **Siblings differ.** Within such a folder no two documents with the same extension, and no two folders, share a
  name compared case-insensitively and after Unicode NFC, so a clone on macOS or Windows never folds two files into
  one. A rename or a new document that would collide is refused, naming the other.
- **Names from files keep their length.** A document named after a file keeps the file's name whole, up to 255 bytes
  ([Name length](../006-document/name-length.md#names-from-files)).
- **Empty folders write nothing**: git keeps no empty directories. An empty directory in the work tree creates no
  folder.
- A move never lands on a file LiveDoc did not write ([Repository link](repository-link.md#the-mirror-file)).

## The sync record

A native file cannot carry its own sync data without changing its bytes, so a link at `files` keeps its **sync
records** in `.livedoc/` beside its link file, committed: **one small file per document and per branch**, so two git
branches that change different documents never touch the same file.

```text
.livedoc/main/doc_3h9x2a.json                 main's snapshot
.livedoc/branches/feature-x/doc_3h9x2a.json   the document branch feature-x's snapshot

{"path":"tools/pm2.md","document":"doc_3h9x2a","tab":"0b34","branch":"feature-x","rev":41,"hash":"sha256:9f2c..."}
```

- A record names the document, its native tab, the [document branch](../006-document/document-branches.md) (absent
  for main) and the revision the file holds, and `"git":"out"` when the file is
  [kept out of git](committed-files.md). A branch name's `/` is a directory, as git's refs are.
- It holds no time, so a sync at unchanged revisions writes the same bytes, as a mirror file does.
- `hash` is over the file's bytes. **A file is a snapshot of whichever record its bytes match**; a file matching none
  of its document's records is a local edit ([Branch binding](branch-binding.md#files-on-every-branch)).
- A sync writes only the records of the branch it syncs with. On the main git branch it also removes the records of
  branches that have merged; on any other git branch it never touches another branch's records, so a merge in git
  never meets a record changed on both sides by different branches.
- **A missing or partial record is rebuilt**, never trusted blindly: a file at the path of a covered document is that
  document, and its base is found as for any file ([Folding a file back](#a-page)).
- **In git** two clones that synced the same branch of a document to different revisions change the same record; the
  merge driver takes the higher revision, which on one branch holds the lower, and the merge of the file itself
  decides the rest ([Git](#git)). Every other record merges in git's own merge, GitHub's included.

## Sync states

A native file is in one of the [sync states](repository-link.md#sync-states), read from its record line, its bytes
and the document now. Beyond them:

| State       | Means                                                                              | A sync                                             |
| ----------- | ---------------------------------------------------------------------------------- | -------------------------------------------------- |
| `local-new` | A file under `dir` with no record line, at no covered document's path, not ignored | Creates the document ([Adopting](#adopting-files)) |
| `deleted`   | A recorded file is missing from the work tree, and no rename explains it           | See [Deletes](#deletes)                            |
| `moved`     | A recorded file is missing and an unrecorded file is its rename                    | See [Renames and moves](#renames-and-moves)        |

### Adopting files

- A `local-new` file becomes a document in the folder its directory names; missing folders are created.
- `.md` and `.markdown` files become pages when they read as text
  ([Markdown tab](../031-markdown/markdown-tab.md#reading-a-file)); a file whose bytes are a PDF becomes a PDF
  document ([Repository sync](../035-pdf-documents/files-print-and-sync.md#repository-sync)); everything else becomes
  a file document.
- **Ignored**, and reported once per sync where it matters: dotfiles and dot directories (`.git`, `.github`), files
  git ignores, symbolic links (never followed), files over `FILE_TAB_MAX_BYTES`, Git LFS pointer files, and paths
  matching the link file's `[mirror] ignore` globs.

```toml
[mirror]
level = "files"
dir = "docs"
ignore = ["drafts/**", "*.tmp"]   # never adopted, never written
```

## Folding a file back

### A page

1. **The base is the snapshot the file is nearest to.** Among the snapshots the sync can reach (its kept bases, the
   CLI's read copies of the page, LiveDoc's text while it is still at the record's revision, and inside git the
   file's own history) the base is the one fewest characters away from the
   file; a tie takes the newest. An agent that read a page, waited, and wrote the whole file back started from an
   older snapshot; merging it from the newest would quietly undo everything that arrived in between. With no snapshot
   to reach (a fresh clone of a squashed history, a lost record), the merge is
   [baseless](repository-link.md#merging): LiveDoc's text stands, and every stretch where the file differs is a lost
   local value (below).
2. **A three-way merge** of the base, the file and the page as LiveDoc holds it now: by lines, then by words inside
   a line both sides changed. A change only one side made is taken; the same change made on both sides is taken once.
3. **A stretch both sides changed differently** keeps LiveDoc's text. The file's version of that stretch is a
   [lost local value](repository-link.md#merging): in the sync report, and as a margin note on the stretch, "Not
   applied from <path>: <the file's text>", by the person syncing, so whoever reads the page sees it and settles it.
4. **The send** is one `patch` changeset: the edits that turn the revision the merge read into the merged text, based
   on that revision ([Markdown tab](../031-markdown/markdown-tab.md#writing)). The document's room maps them onto the
   characters as they stood at that revision, so they merge with anything typed since by character, as a
   reconnecting editor's edits do ([Markdown tab](../031-markdown/markdown-tab.md#how-the-merge-works)). A revision the room no longer keeps answers
   `412 stale_tab`; the sync re-reads and re-merges, up to `SYNC_MERGE_ATTEMPTS` times.
5. The changeset is credited to the person or token syncing, with the summary "From <path>", so people with the page
   open see the file's edit arrive under a name.
6. The sync then writes the page's new bytes to the file, and its record line.

### A file document

A file document is changed whole ([File tab](../006-document/file-tab.md#changing-it)).

| Local file | LiveDoc since the base | A sync                                                                                  |
| ---------- | ---------------------- | --------------------------------------------------------------------------------------- |
| Changed    | Unchanged              | Replaces the bytes                                                                      |
| Unchanged  | Changed                | Writes the new bytes                                                                    |
| Changed    | Changed                | A **conflict**: nothing is written or sent; reported, naming the file and both ways out |

A conflicted file document is settled with `livedoc sync --take file <path>` (the file's bytes
replace LiveDoc's) or `--take livedoc <path>` (LiveDoc's bytes replace the file). The bytes that lose stay
restorable ([File tab](../006-document/file-tab.md#changing-it)), or in git's history.

## Renames and moves

- **In LiveDoc.** The next sync moves the file and its record line. [Links](../032-wikis/links.md#renames) to it are
  rewritten in the pages that hold them, as edits that sync like any other.
- **In the repository.** A recorded file missing from the work tree and an unrecorded file found in the same sync are
  one **move** when their bytes are equal, or, for pages, when they are at least `SYNC_RENAME_SIMILARITY` alike (as
  git judges a rename). The document is renamed and moved to the folder of the new path, and any change of content is
  folded back as above. Of several candidates the most alike is taken; a tie is no move.
- **Both sides.** A document renamed differently on each side keeps LiveDoc's name; the file is moved to it, and the
  repository's name is reported as not applied.
- **Case only.** A rename that changes only letter case moves through a temporary name, so case-insensitive file
  systems see it.

## Deletes

- **Deleted in LiveDoc** (moved to the Trash, or purged): the file is `gone` and removed; git history keeps it. A
  file holding a change nobody has sent stays, and is refused, never removed
  ([Repository link](repository-link.md#sync-states)). Restored from the Trash, the document is written again.
- **Deleted in the repository** (an agent's `git rm`, a file removed by hand): on the main git branch the document
  moves to the [Trash](../013-workspace/trash.md), recoverable for 30 days, and its record is removed; on any other
  git branch it is deleted on that branch only ([Branches](#branches)). A [kept-out](committed-files.md) file
  removed from the work tree is written again, never a delete. An edit outranks a
  delete: a file deleted while LiveDoc changed its document since the file's base is written again, and the sync
  says so.
- **A folder** whose documents have all gone, either way, goes with them.
- **A directory gone whole is never a delete.** When the link's `dir` is missing, or every recorded file is missing
  at once, nothing is deleted or written; the sync says so at every run until the files are back
  ([Local copy](local-copy.md#deleted)).

## While people and agents edit

A page has two front doors, the document and its file, and both stay one page:

- **With `livedoc sync --watch` running**, a change in either place reaches the other once it settles: a burst of
  typing in LiveDoc, or `SYNC_LOCAL_SETTLE_MS` of quiet on the file. A sync never writes over a file edited while it
  runs ([Repository link](repository-link.md#commands)).
- **Without it**, files catch up at the next sync: one run by hand, the pre-commit hook, or CI asking `link status`.
- **Edits from a fresh read are always safe.** An agent's exact-text edit fails cleanly when the words it looked for
  have moved, and it reads again.
- **A whole-file write from a stale read loses nothing**: it merges from the snapshot it was nearest to
  ([Folding a file back](#a-page)).
- **A changeset to a covered page refreshes its file at once.** When the command line writes a page through a
  changeset, the file is rewritten right away if it is unchanged since its record, so `rg` finds the agent's own
  words without waiting; a file changed meanwhile waits for the next sync's merge.
- **Live typing and a file edit at once** merge; neither replaces the other.

## Git

The [hooks and the merge driver](repository-link.md#git) apply to native files on every git branch, each syncing
with its own document branches ([Branch binding](branch-binding.md)).

- **A page git left conflicted** (markers in the text) is refused, naming `livedoc sync --resolve <file>`. Resolve
  reads git's three versions and merges the two document branches they name, by character, so both branches' words
  arrive, then writes the merged page and stages it ([Conflicts git leaves](branch-binding.md#conflicts-git-leaves)).
- **The records** merge as [The sync record](#the-sync-record) says.
- **Commits and pushes are the link's choice**, `[git] commit` in the link file: `none` writes files only and leaves
  commits to people and the hook; `commit` commits each settled sync; `push` commits and pushes it. `link init`
  suggests `push` for a whole-repository wiki, which nobody else commits to, and `none` otherwise. Whatever the
  setting, a sync never force-pushes, never rewrites history, commits only files under the link's `dir`, its
  records and its managed `.gitignore` section, refuses partial staging as the hook does, and authors a commit as the work tree's own git identity. A commit message names the
  pages by path with their revisions, never the names or emails of the people who edited them in LiveDoc: a public
  repository would publish them.
- **A rejected push** (the remote moved): fetch, rebase the sync's commit onto it, sync once more, push. Still
  rejected, it is reported and retried at the next sync; the commit stays local, nothing is lost. A push refused by
  the remote's rules (a protected branch) is never forced or retried around
  ([Main after a merge](branch-binding.md#main-after-a-merge)).
- **Which files are committed** at all is the repository's choice: [Committed files](committed-files.md).

## Branches

Every git branch syncs with the [document branches](../006-document/document-branches.md) of its name, and the main
git branch with the documents themselves: one rule for pages, file documents and diagrams alike, written in
[Branch binding](branch-binding.md). For a native file that means:

- **A page or file document changed on a git branch** changes its document branch, never main, and its file on that
  git branch holds the branch's snapshot. Main changes when the branch merges.
- **Adopting, renaming, moving and deleting** on a git branch happen on the document branch: a new file is a document
  that exists only on the branch, a deleted file deletes its document on the branch, and both reach main with the
  merge ([Merging](../006-document/document-branches.md#merging)).
- **A page changed on both a branch and main** merges by character, as a reconnecting editor's edits do, whether the
  merge happens in LiveDoc or is found in git.

## Offline

- **The command line offline**: local edits wait in the files; snapshots stay as they are; the hook lets the commit
  through ([Repository link](repository-link.md#the-hooks)). The next sync folds them back from their nearest base.
- **A page edited offline in the browser** merges when the browser reconnects
  ([Markdown tab](../031-markdown/markdown-tab.md#collaboration)); the next sync writes the result.

## Limits

| Constant                 | Value | Why                                                                                      |
| ------------------------ | ----- | ---------------------------------------------------------------------------------------- |
| `SYNC_RENAME_SIMILARITY` | 0.5   | Git's own rename threshold, so the sync and `git log --follow` agree on what a rename is |

How many revisions a room keeps for a `patch` is the markdown tab's `MARKDOWN_REVISIONS_KEPT`
([Markdown tab](../031-markdown/markdown-tab.md#limits)).

## Observability and telemetry

- Fingerprints, each with the document id and path hash, never content: `[sync] adopted`, `[sync] ignored`,
  `[sync] moved`, `[sync] deleted`, `[sync] nearest-base`, `[sync] patched`, `[sync] lost-local-value`,
  `[sync] file-conflict`, `[sync] taken`, `[sync] committed`, `[sync] pushed`, `[sync] push-rejected`.
- Telemetry: category `Cli`, action `Used`, type `SyncTake` for `--take`; the rest counts as `Sync`.
