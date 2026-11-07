# Repositories

Follow the references below only as needed; never upfront.

A repository linked to LiveDoc: its documents found with `rg`, read and changed by agents through the CLI,
snapshotted into git when wanted, its pages and files written as the plain files they are and folded back, and its
existing diagram-as-code brought in. LiveDoc stays the single source of truth throughout.

- ./repository-link.md - when working on `livedoc.toml`, mirror levels, mirror and outline files, sync states, the merge, git hooks or the merge driver, unlinking and re-linking
- ./native-files.md - when syncing pages and file documents as their own files: paths that follow names, the sync record, adopting files, folding a page back from its nearest base, renames, deletes, agents editing files and documents at once
- ./local-copy.md - when a link has no git: a folder of plain files synced live both ways, `[git] binding = "none"`, where records and local state live, `sync --watch`, offline edits, renames, deletes, adopting a folder, a second machine
- ./branch-binding.md - when git branches meet documents: each git branch bound to the document branches of its name, files committed on every branch, the pre-commit and pre-push hooks and the CI check, merges found in git, renamed and deleted git branches, a protected main
- ./committed-files.md - when deciding which written files git carries: `[files] commit_max_bytes`, Commit to git or Keep out of git, the managed `.gitignore` section, Git LFS
- ./diagram-sources.md - when binding Mermaid, PlantUML, DOT, draw.io or Excalidraw files to tabs: bridges, directions, markers, strict and relaxed compatibility, residue
