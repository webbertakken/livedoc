# Saving

LiveDoc has no Save button. This is what "saved" means for a PDF, what a file handed out holds, and when its bytes
are rewritten. Researched November 2026; the numbers are from the engine spikes ([The engine](engine.md)).

## What is stored, and what is handed out

- **Stored**: the base (the arriving bytes, by SHA-256, in the blob store) and the layer (the changes, in the room).
  Both are safe as each change lands ([The live model](live-model.md)). Nothing else is "the file".
- **Handed out** (Download, repository sync, the Drive mirror, email, an agent's download): a **bake**, the base with
  the layer applied.

## An unchanged file

A PDF opened and left alone must leave byte for byte. No engine is trusted with that:

- PDFium never returns the arriving bytes: an incremental save of an untouched file adds about 340 bytes, a full save
  reorders everything (verified).
- LibPDF returns the arriving bytes when nothing changed (verified), which is a property of one library's version.

So the rule is structural: **an empty layer is never baked**. Download streams the stored base. The test is a
SHA-256 over the download, equal to the base's key.

## Incremental update or rewrite, per kind of change

| Change                                             | Written as                                           | Why                                                                                                                                                                                         |
| -------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Marks, comments, field values, drawn signatures    | Incremental update                                   | They sit on top of the page; the base stays a prefix; earlier signatures stay valid                                                                                                         |
| A certificate signature                            | Incremental update, then the result becomes the base | It signs the bytes it is appended to                                                                                                                                                        |
| Page order, rotation, deletion, insertion          | Rewrite                                              | The page tree changes; an incremental update could express it, but the engine that edits pages writes whole files (PDFium's incremental save appends about the whole file anyway, verified) |
| A page's own text, pictures and shapes             | Rewrite                                              | The content stream is regenerated                                                                                                                                                           |
| Redaction, removing hidden information, protection | Rewrite, and the base replaced with its history      | What was removed must not survive in an earlier section of the file, nor in a previous version                                                                                              |
| Reduce file size                                   | Rewrite                                              | Its purpose                                                                                                                                                                                 |

- A bake is at most **two stages**: where the layer holds a rewriting change, the page engine writes the base with
  those changes applied; then what Reviewing added is appended to the result as one incremental update. One writer
  appends marks in both cases, so a mark is written the same way whichever path it took.
- The appended update is **exact**: 543 bytes for a highlight on a 1 MB paper, 842 for a filled text field, about
  25 KB for a certificate signature (verified: LibPDF 0.5.3).
- **A bake starts from the base every time**, so a file does not grow by one section per download: it is the base
  plus one update, however often it is handed out (inferred from the model).
- A file that cannot be appended to (one opened only by rebuilding a broken cross-reference) is **rewritten**, and
  says so: the writer is asked first, never trusted to fall back silently (verified: LibPDF rewrites silently when
  asked for an incremental save it cannot do; `canSaveIncrementally()` names the reason).
- **Signatures and rewrites** (fork F8): the first rewriting change on a base that carries signatures is where the
  person is told, before it is made, how many signatures it will invalidate.

## When the base is re-baked

A re-bake replaces the base with a baked file and empties the layer, for everyone at once.

| Trigger                                       | Why it cannot wait                                                                                                                                    |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| A certificate signature is placed             | The signature covers bytes, which must exist                                                                                                          |
| Redaction or protection is applied            | The removed content must leave the stored file, not only the handed-out one                                                                           |
| Bytes arrive from outside (a sync, a replace) | The file changed elsewhere: the new bytes are the base; the layer's changes are carried across where their anchors still hold, and reported where not |
| The layer passes its budget                   | Opening replays the layer; a long one makes every open slower (budget set in Phase 4)                                                                 |

Between re-bakes nothing is rewritten, so undo, version history and concurrent work all stay in the layer.

## Previous versions and version history

- **Every base ever stored is a previous version**, kept by its SHA-256 as the file tab keeps replaced bytes
  ([File tab](../../specs/006-document/file-tab.md#changing-it)): 30 days after it stopped being the base, or as
  long as a named version points at it.
- **Version history within one base** is the layer's own history, read as a text document's versions are: a version
  is the base's key and a point in the layer, rendered by baking or by applying the layer up to that point.
- **Redaction is the exception**: applying it removes the earlier bases and the layer's history that held the
  removed content, and says so before it is applied.

## The validators' claim

A baked file is handed out only when the engine reopens it; in tests every baked file also passes `qpdf --check`,
keeps its base as a prefix where the bake was incremental, and keeps every earlier signature valid
([The corpus and the validators](corpus-and-validators.md)).
