# Saving

**Status: specified.** Nothing is built.

LiveDoc has no Save button. A [PDF document](pdf-document.md) is saved as it is worked on, live, for everyone on it.
"Saved" means the document's file is always whole and current: every way a file leaves LiveDoc hands out a valid PDF
holding every change, and a PDF nobody changed leaves byte for byte as it came. The evidence is
[Saving](../../research/pdf-documents/saving.md) and [The engine](../../research/pdf-documents/engine.md).

## The stored file and its live changes

- **Stored** are two things, both safe as each change lands: the **stored file** (the PDF's bytes, exact, in the blob
  store under their SHA-256) and the **live changes** (what people changed since, in the document's room). Nothing
  else is "the file".
- **Handed out** is a **bake**: the stored file with the live changes written in. Download, print, repository sync,
  the Drive mirror, email and an agent's download each hand out a bake
  ([Files, print and sync](files-print-and-sync.md)).
- **A bake starts from the stored file every time.** A file does not grow by one section per download: it is the
  stored file plus one addition, however often it is handed out.
- **A bake is deterministic**: the same stored file and the same live changes bake to the same bytes, wherever it runs
  (a browser, the api, the CLI), so a sync at unchanged revisions writes nothing. A certificate signature is never
  made by a bake ([Signing](signing.md#certificate-signatures)).
- The save status in the title row says **Saved** when the room has confirmed every live change and the stored file's
  bytes are in the blob store; it never waits for a bake.

## An unchanged file

- **Empty live changes are never baked.** The download of a PDF nobody changed streams the stored file itself; no
  engine touches it.
- The test is a SHA-256 over the download, equal to the tab's `blob`.
- Reading changes nothing: opening, scrolling, finding, selecting, Dark pages, a person's zoom and a PDF layer shown
  or hidden for one person make no live change.

## Addition or rewrite

A change is written one of two ways, by its kind, never by the engine's convenience:

| Change                                                                         | Written as                                               | Why                                                                                |
| ------------------------------------------------------------------------------ | -------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Marks, comments, field values, drawn signatures                                | An **addition**: an incremental update                   | They sit on top of the page; the stored file stays a prefix; signatures stay valid |
| A certificate signature                                                        | An addition, and the result becomes the stored file      | It signs the bytes it is appended to                                               |
| Page content: text, pictures, shapes                                           | A **rewrite**                                            | The page's content stream is regenerated                                           |
| Pages: order, rotation, deletion, insertion, crop                              | A rewrite                                                | The page tree changes                                                              |
| Headers, footers, watermarks, backgrounds, bookmarks, properties, built fields | A rewrite                                                | They change the pages or the document's own structure                              |
| Flattening, recognised text written into the file, reduce file size            | A rewrite                                                | Their purpose                                                                      |
| Redaction, removing hidden information, protection                             | A rewrite, and the stored file replaced with its history | What was removed must survive nowhere                                              |

- **A bake has at most two stages.** Where the live changes hold a rewriting change, the stored file is rewritten with
  those changes applied; then what Reviewing added is appended to the result as one addition. One writer appends in
  both cases, so a mark is written the same way whichever path its file took.
- **An addition is exact**: it holds the changed objects and nothing else. The stored file is a byte-for-byte prefix of
  the baked file, and every earlier signature still covers what it covered
  ([Signing](signing.md#changes-after-a-signature)).
- **A rewrite keeps everything the change did not touch** ([What is kept untouched](#what-is-kept-untouched)) and is
  guarded: each page outside what the change touched draws the same before and after, or the change is undone and
  reported ([Editing text](editing-text.md#guards)).
- **A file that cannot take an addition** (one opened only by rebuilding a broken cross-reference) is rewritten, and
  says so before the first change ([Opening](opening.md#damaged-files)). The writer is asked first whether it can
  append; a silent fall back to a rewrite is a defect.
- **The first rewriting change on a file that carries certificate signatures** is where a person is told, before it is
  made, how many signatures it invalidates ([Signing](signing.md#changes-after-a-signature), fork F8).
- **The file's version** is its own: a bake writes the version the file came in, raising it only when a change needs a
  newer feature, and File > Properties says when it was raised.
- **A linearised file** stays linearised only while unchanged; a baked one is not, and a rewrite is written
  linearised when the stored file was.

## What is kept untouched

"The file is the author's": what a change does not touch is never rewritten, and what LiveDoc does not understand is
kept and written back.

- In an **addition**, every byte of the stored file is kept by construction.
- In a **rewrite**, everything the engine reads is carried across object for object: fonts and their subsets, pictures
  in their own encoding (a JPEG is never re-encoded), colour spaces and output intents, PDF layers, embedded files,
  the structure tree, metadata streams, page labels, article threads, named destinations, the form's scripts as text,
  XFA data, portfolios' collections, rich media and 3D streams, and private data of other software.
- **A conformance claim** (PDF/A, PDF/UA) is kept while it holds. A change that breaks one removes the claim, with the
  notice "This change means the file no longer claims PDF/A." before the change; LiveDoc never claims a conformance
  for a file it changed unless a validator agrees in tests ([Accessibility](accessibility.md#what-a-written-file-keeps)).
- **Scripts a file carries** are kept as text and never run ([Security](security.md#scripts)).

## When the stored file is replaced

Replacing bakes the file, stores the result as the new stored file and empties the live changes, in one step for
everyone on the document; every client reloads the pages it shows, keeping its place.

| Trigger                                                         | Why it cannot wait                                                          |
| --------------------------------------------------------------- | --------------------------------------------------------------------------- |
| A certificate signature is placed                               | The signature covers bytes, which must exist                                |
| Redaction, removing hidden information or protection is applied | The removed content must leave the stored file, not only the handed-out one |
| Bytes arrive from outside: a sync, a Drive change, **Replace**  | The file changed elsewhere; the new bytes are the stored file               |
| The live changes pass `PDF_LIVE_CHANGES_MAX_BYTES`              | Opening replays them; long ones make every open slower                      |

- Between replacements nothing is rewritten, so undo, version history and concurrent work all stay in the live
  changes.
- **Bytes arriving from outside** carry the live changes across where their anchors still hold (the same page by its
  content, the same text under a highlight) and report those that do not: "3 marks couldn't be placed on the new file.
  They are kept in the previous version." ([Files, print and sync](files-print-and-sync.md#repository-sync))
- Replacing for the budget is done by the first client that is able and idle, as an ordinary change: undo history
  before it is no longer steppable, and version history still reaches it.
- Who may trigger each: [Share roles](#share-roles).

## Previous versions and version history

- **Every stored file ever held is a previous version**, kept under its SHA-256 as a file tab keeps replaced bytes
  ([File tab](../006-document/file-tab.md#changing-it)): for 30 days after it stopped being the stored file, or for as
  long as a named version points at it.
- **Version history within one stored file** is the live changes' own history, read as a text document's versions are
  ([Review surfaces](../012-collaboration/review-surfaces.md#version-history)): a version is a stored file's key and a
  point in its live changes, shown by applying the changes up to that point.
- **Restoring a version** makes its file the stored file and its changes the live changes, as a new replacement;
  nothing is lost, and the state restored over becomes a previous version.
- **Redaction and removing hidden information are the exception**: applying one removes every earlier stored file and
  the history that held the removed content, and says so before it is applied
  ([Redaction and protection](redaction-and-protection.md#what-applying-removes)).

## The validators' claim

- A baked file is handed out only after the engine has **reopened it**: its page count, and each changed page's draw,
  are checked against what was meant. A bake that fails the check is not handed out: "This PDF couldn't be written.
  Your changes are safe." with **Try again**, and the stored file and live changes stay as they were.
- In tests, every baked file also passes `qpdf --check`, has its stored file as a prefix where the bake was an
  addition, keeps every earlier signature valid by poppler's `pdfsig`, and draws the same outside what changed
  ([The corpus and the validators](../../research/pdf-documents/corpus-and-validators.md#validators-and-oracles)).
- A bake LiveDoc's servers make is the same code as a browser's; a file past `PDF_SERVER_BAKE_MAX_BYTES`, or a
  protected one, is baked only where a person or the CLI is
  ([Live editing and storage](live-editing-and-storage.md#what-the-servers-make)).

## Limits

| Constant                     | Value               | Why                                                                                           |
| ---------------------------- | ------------------- | --------------------------------------------------------------------------------------------- |
| `PDF_LIVE_CHANGES_MAX_BYTES` | 4,194,304 (4 MiB)   | `(default)` Past it the stored file is replaced; set by measurement on the tracer bullet      |
| `PDF_SERVER_BAKE_MAX_BYTES`  | 33,554,432 (32 MiB) | `(default)` What a Worker's 128 MB holds whole beside the engine                              |
| `PDF_BAKE_TIMEOUT_MS`        | 120,000             | `(default)` A bake past it stops with "This PDF couldn't be written."; safe range 30 to 600 s |
| Previous versions            | 30 days             | The file tab's own, as the Trash keeps a deleted document                                     |

## Share roles

| Role            | May                                                                                                              |
| --------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Editor**      | Everything that replaces the stored file; restore a version or a previous version; **Replace**                   |
| **Participant** | Changes written as additions; a certificate signature, which replaces the stored file by an addition (F7, ruled) |
| **Viewer**      | Nothing that changes what is stored; downloads a bake                                                            |

Every role downloads the same bake: the file holds every live change, whoever made it.

## Telemetry and observability

- `Pdf · Changed · StoredFile.<Signed|Redacted|Protected|Arrived|Budget|Restored>` when the stored file is
  replaced; `Pdf · Exported · <As>` carries no size.
- Fingerprints with the document and tab ids: `[pdf] baked kind=<addition|rewrite|both> bytes=<n> ms=<n>
where=<browser|api|cli>`, `[pdf] bake-refused reason=<reopen|timeout|cannot-append>`,
  `[pdf] stored-file-replaced reason=<reason> from=<key prefix> to=<key prefix>`, `[pdf] unchanged-streamed`,
  `[pdf] anchors-lost count=<n>`.

## Errors

| When                                                         | A person sees                                                                     |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| A bake fails its reopen check or passes its time             | "This PDF couldn't be written. Your changes are safe." **Try again**              |
| A change would turn a signed file into a rewrite             | The warning of [Signing](signing.md#changes-after-a-signature), before the change |
| The blob store refuses the new stored file (full, too large) | "This PDF couldn't be stored: <reason>. Your changes are still live."             |
| A replacement arrives while a person is mid-change           | The change is carried onto the new stored file, or reported as an anchor lost     |
