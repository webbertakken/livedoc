# Purpose

LiveDoc, at [docs.nu](https://docs.nu), is where anyone keeps **documents of every kind, together, in real time**,
and where each document can live on as a plain file in a repository.

This is the root of the spec tree: every other spec is a decision taken inside
the boundaries set here. That only works if it stays true, so it carries a
[record of the boundaries that have moved](#boundaries-that-have-moved) rather
than quietly describing a product that no longer exists.

## What it is

A multiplayer workspace of documents in the browser. **Every file is a
document**: a page of prose, a diagram, a board, a sheet, a form, a deck. People
and agents open the same document at once, see each other's cursors and edits
live, and contribute simultaneously.

- **A document holds tabs, and every tab has a kind.** A document with one tab
  hides its tab strip: it reads as a single page, while the tab still holds its
  data, so a second tab can arrive later without changing what the document is.
- **Markdown is native.** A markdown file is a document with a single tab of the
  **markdown** kind, edited together live, and it stays a markdown file: wherever it syncs to, it arrives
  as plain markdown that any tool can read.
- **Documents sync to where they are used.** LiveDoc is the source of truth;
  the command line syncs documents out to repositories and other systems as
  plain files, and folds changes made there back in. Agents that read files with
  `rg` read the same words people edit in the browser.
- **Wikis are folders.** A global wiki is a folder that syncs to a repository of
  its own; a project wiki is a folder that syncs to a path inside the project's
  repository. Both are edited, linked and searched the same way.

It grew out of livediagram, and keeps everything that made livediagram's canvas
good: the diagram, board, sheet and form tabs are LiveDoc tab kinds, worked on as
they are there ([livediagram upstream](../002-project-scope/livediagram-upstream.md)).

## The product comes first

Opening docs.nu lands in the **Explorer**, at `/`, not on a marketing page. The first
thing anyone sees is their own workspace, ready to use; there is nothing to read
before there is something to do. The marketing pages exist, under `/about`, and are secondary to an extremely well tailored experience of the
product itself.

Pricing follows the same rule. Hosting is free and generous for everyone, so
nobody thinks about a plan when they start. Plans live in the menus, under
**Usage**, for the people whose usage grows past what free hosting covers
([Open source + distribution](../002-project-scope/open-source-and-business-model.md)).

## Target users

Anyone who writes things down to think, alone or together, and wants what they
write to stay theirs:

- People keeping a personal or shared wiki of what they know.
- Engineering teams whose documentation, diagrams and decisions belong next to
  their code, and stay readable there.
- Teams that plan, run sessions and record outcomes in the same place they
  write.
- **Agents.** A command line, an API and an MCP server read and write documents,
  so an agent works in the same documents as the people it works for.

The entry point is one person: the workspace works fully without signing in.
Collaboration earns the second person; sync earns the repository.

## Core capabilities

- **Real-time collaboration** on every tab kind, markdown included: live
  cursors, concurrent edits that merge rather than clobber, reconnect catch-up.
- **Documents of every kind**: markdown pages, diagrams, boards, sheets, forms,
  decks and any other file, organised in folders.
- **Sync**: the command line mirrors documents to repositories and other systems
  as plain files, and back, on every git branch: each git branch edits its own
  live [document branches](../006-document/document-branches.md), merged when
  its pull request merges.
- **Wikis**, global and per project, with links between pages and search across
  them.
- **Machine access**: a public API, a command line and an MCP server.
- **Self-hosting**: the whole product runs on anyone's own infrastructure.

## What it is _not_

- **Not a marketing site with an app behind it.** The product is the front door.
- **Not a lock-in.** Every document can leave as a plain file; a markdown file
  never becomes a format only LiveDoc reads.
- **Not the home of source code.** Code lives in repositories and their editors;
  LiveDoc holds what is written about it, beside it.
- **Not a paywall.** No feature is reserved for a plan: plans buy more usage,
  never more product.
- **Not a public gallery.** Documents reach people through share links, teams
  and published forms; LiveDoc keeps no public showcase of what people write.

## Boundaries that have moved

When a boundary moves, it is recorded here in the same change, with the spec
that moved it. LiveDoc started from livediagram's purpose, and these moved at
the start:

- **"The canvas is the product"**: widened by this spec. Documents are the
  product; the canvas is one of their tab kinds.
- **"Not a documentation platform"**: reversed by this spec. Documentation and
  wikis are what LiveDoc is for.
- **"Pages are a mode of the canvas"**: reversed by [Text document](../034-text-documents/text-document.md).
  Writing is a document kind of its own, on ODF and OOXML, worked on as Google Docs is; Pages mode is removed.
- **"Not a paid product, ever"**: narrowed by
  [Open source + distribution](../002-project-scope/open-source-and-business-model.md).
  Hosting stays free; usage beyond it can be bought, to pay for hosting. No
  feature is ever gated.
- **The landing page leads**: reversed by this spec. The Explorer is the front
  door; marketing is secondary.

Since then:

- **The Community gallery**: removed by this spec. The inherited public gallery
  of shared documents, with its likes, reports and copies, is not part of
  LiveDoc; its addresses (`/community`, `/api/community`) answer 404, and its
  tables are dropped. Upstream changes to it are never picked
  ([upstream](../002-project-scope/livediagram-upstream.md#what-is-shared-and-what-is-not)).

## Why it matters

Knowledge gets split between tools that are good at prose, tools that are good
at drawing, and repositories where agents and tools can actually read it. Each
copy drifts from the others. LiveDoc exists to be **one place where every kind
of document is written together, live, and still lands as a plain file wherever
it is needed**.

## How it ships

LiveDoc is **open source** (MIT), self-hostable in full, and runs as a
**hosted product** at [docs.nu](https://docs.nu), free for everyone, with
usage-based plans for power users. See
[Open source + distribution](../002-project-scope/open-source-and-business-model.md).
