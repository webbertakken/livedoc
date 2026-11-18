# The live model

How a text document is held while people and agents edit it at once. Researched November 2026. Claims are tagged
**verified** (how), **inferred** (from what) or **assumed**.

## What the model must carry

- **Offline edits** of any age, made in a document in This Browser or while disconnected, merging when the
  connection returns with nothing lost ([Offline Mode](../../specs/006-document/offline-mode.md)).
- **Document branches**: a branch merges into main by character, three ways, however old it is
  ([Document branches](../../specs/006-document/document-branches.md#merging)).
- **Agent changesets**: atomic, sequenced by the room, attributed, revertable
  ([Agent changesets](../../specs/024-agents/agent-changesets.md)), applied by the api as edits of the current state.
- **Undo** that takes back only the person's own edits ([Markdown tab](../../specs/031-markdown/markdown-tab.md#collaboration)).
- **The row cap**: a room's SQLite row holds at most 2,000,000 bytes (verified: `packages/api-schema/src/tab-size.ts`);
  Google's limit is 1.02 million characters (verified: [Drive help](https://support.google.com/drive/answer/37603)),
  so a full-size document's state passes one row and must be chunked.
- **Version history**: named versions, any version seen and restored, who changed what.

## Three designs

### A. A ProseMirror document over a sequence CRDT

The document is a CRDT (a tree of elements holding text with formatting attributes); ProseMirror is a view bound to
it. Every character has a stable identity, so edits commute.

- **Libraries**: Yjs 13.6 with `y-prosemirror` 1.3 and `y-protocols` 1.0, all MIT (verified: `npm view`); Loro 1.18
  with `loro-prosemirror` 0.4, MIT (verified: `npm view`); Automerge 3.5, MIT (verified: `npm view`).
- **Offline**: a state vector says what a copy has seen; the missing updates merge whatever their age (inferred:
  Yjs's documented update model).
- **Branches**: a branch is a copy of the CRDT; merging applies its updates to main. Concurrent text merges by
  character; concurrent attribute changes on one stretch resolve last-writer-wins, which is where the branch spec's
  "unmerged change" note is written (inferred: Yjs formatting attributes are map entries).
- **Agents**: the api applies a changeset as one CRDT transaction on the room's copy, tagged with the token, so it
  merges with live typing; revert applies its inverse as a new transaction (inferred).
- **Undo**: Yjs's `UndoManager` tracks the local origin only (inferred: its documented `trackedOrigins`).
- **Versions**: snapshots (state vectors plus delete sets) render any past version without storing copies
  (inferred: `Y.snapshot`, which needs garbage collection off for the history it must keep).
- **Row cap**: the encoded state is a byte array, split across rows of at most 1.9 MB, with an update log compacted
  into it (inferred). Overhead per character after compaction is small but real; it is measured in Phase 4.
- **Bundle**: Yjs unpacks to 2.3 MB of sources, a fraction shipped (verified: `npm view dist.unpackedSize`); Loro to
  22.6 MB with WebAssembly; Automerge to 47.5 MB with WebAssembly (verified). Loro and Automerge weigh on the editor's
  first load and the Worker's bundle (inferred).
- **Server**: the room holds the document's CRDT and is its one writer to storage, as the markdown spec already says
  for its own text (verified: `markdown-tab.md` "Storage"). Yjs runs in Durable Objects (inferred: `y-durableobjects`
  1.0.5, MIT, exists on npm).

### B. A block tree over room ops

Today's article: blocks with ids, a diff into `put` and `remove` ops, last commit wins per block (verified:
`packages/document/src/article-flow-ops.ts`).

- Two people in one paragraph lose one person's words (verified: `article-pages.md` "Collaboration" says so).
- Offline edits replay as whole-block puts over newer text (inferred).
- Branch merges by block, not by character: the branch spec's rule cannot hold (inferred).
- Simple, already built, no new dependency.

### C. Server-ordered steps

ProseMirror's own collaboration (`prosemirror-collab` 1.3, MIT): clients send steps against a version; the room
orders them and clients rebase (verified: `npm view`; design assumed from the library's documentation).

- Small state and exact ProseMirror semantics, including structure (tables, lists) without a CRDT's tree caveats.
- The room must keep every step since the oldest version anyone may still send; an offline edit of a week needs a
  week of steps, and a branch merge needs both histories rebased (inferred).
- The room must run ProseMirror's schema and transforms to validate and persist (inferred).

## Judgement

| Need             | A. CRDT                        | B. Block ops            | C. Server-ordered steps        |
| ---------------- | ------------------------------ | ----------------------- | ------------------------------ |
| Offline          | Any age, by character          | Lossy                   | Needs the history since base   |
| Branch merges    | By character, attributes LWW   | By block                | Rebase two histories           |
| Agent changesets | One transaction, merges        | Block puts              | Steps, rebased                 |
| Personal undo    | `UndoManager`, local origin    | Today's history, shared | `prosemirror-history` + rebase |
| Row cap          | Chunked state + update log     | Chunked JSON            | Chunked document + step log    |
| Fit with specs   | The markdown spec's own choice | Fails both specs' rules | Contradicts the markdown spec  |

**Finding** (inferred from the above): design A, with **Yjs** as the CRDT. It is the only design that meets the offline
and branch rules the specs already hold, it is the choice `markdown-tab.md` already made for text, and among the CRDTs
it is the lightest to ship and the most used with ProseMirror. Loro's richer mark merging is worth revisiting if Yjs's
attribute merging proves weak in Phase 4's measurements.
