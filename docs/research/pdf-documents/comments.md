# Comments

How LiveDoc's comment threads and a PDF's own annotations become one thing, so a thread survives Acrobat and an
Acrobat comment becomes a thread. Researched November 2026.

## The two sides

| LiveDoc today                                                                                                                                                                                | A PDF                                                                                                                 |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| A **thread** on an element or a cell: comments (id, text, time, author name and colour, a server-trusted author id, mentions) and `resolved` (verified: `packages/document/src/comments.ts`) | A **markup annotation** with `Contents`, an author (`T`), a modified date, a unique name (`NM`), an optional popup    |
| Review surfaces add a range anchor, reactions and assignment ([Review surfaces](../../specs/012-collaboration/review-surfaces.md), specified)                                                | **Replies** are text annotations whose `IRT` points at the annotation replied to                                      |
| The Inbox reads threads and assigned actions                                                                                                                                                 | **Review state** is a reply with `StateModel` `Review` and a `State` (Accepted, Rejected, Cancelled, Completed, None) |

The right-hand column is ISO 32000-2's markup annotations (assumed from the standard; the engine's build reads and
writes `IRT` and the reply type: verified, `EPDFAnnot_SetLinkedAnnot`, `EPDFAnnot_GetReplyType`).

## The designs

| Design                                                                | A thread is                                  | For                                                                                 | Against                                                                    |
| --------------------------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **A. Threads live in LiveDoc, written out as annotations when baked** | LiveDoc's thread, anchored to a mark         | The Inbox, mentions, reactions and assignment work as everywhere; one comment model | Needs a faithful mapping both ways                                         |
| **B. Annotations are the model**                                      | Whatever the file's annotations say          | Nothing to map                                                                      | No mentions, reactions or assignment; the Inbox would need a second reader |
| **C. Threads beside the file, never in it**                           | LiveDoc's thread, invisible to other readers | Simplest                                                                            | A downloaded PDF has no comments: fails "save"                             |

**Recommended: A.** A PDF's **anchor** is a mark: a stretch of text (a highlight, underline or strike-through with
its quads), an area (a rectangle), or a point (a note). The thread hangs on the mark, as a canvas thread hangs on an
element.

## The mapping

| LiveDoc                   | Written to the file as                                                                                               | Read from a file as                                                        |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| The anchor mark           | The markup annotation itself, `NM` its LiveDoc id                                                                    | Any markup annotation with `Contents` or replies starts a thread           |
| The first comment         | The mark's `Contents`, `T` (the author's name), `M` and `CreationDate`                                               | The same                                                                   |
| A reply                   | A text annotation with `IRT` to the mark and `RT` `R`                                                                | The same; replies are ordered by date                                      |
| Resolved                  | A state reply: `StateModel` `Review`, `State` `Completed`                                                            | `Completed` or `Accepted` reads as resolved                                |
| A mention                 | Its text, as written (`@Name`)                                                                                       | Plain text; never resolved to a person                                     |
| A reaction, an assignment | Kept in LiveDoc; written under a private key of LiveDoc's own in the annotation, which other readers ignore and keep | Read back from that key; absent in a file from elsewhere                   |
| The author                | A name. The file has no place for an account                                                                         | A name and no account: shown as written, never matched to a person by name |

- **Authors are untrusted on the way in.** A file may say any name wrote a comment. A comment read from a file is
  shown with its name and the note that it came with the file; it never borrows a LiveDoc person's avatar or
  colour, and never reaches someone's Inbox as theirs (inferred from the author rewriting in
  `apps/api/src/comments.ts`, which exists to stop exactly that spoofing).
- **Deleting the anchor** keeps the thread, marked as on deleted content, as a text document's does.
- **Without comments**: Download offers the file with or without them; "without" bakes marks that carry no thread
  and leaves replies and states out.

## What is owed to the shared pieces

The thread, composer, comments panel and Inbox feed are the review surfaces, owned by plan 0019's Phase 12 and not
built yet. A PDF adds its anchor kinds and this mapping, nothing else.
