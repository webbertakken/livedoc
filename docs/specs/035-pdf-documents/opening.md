# Opening any PDF

**Status: specified; a first slice is built.** Built: a file read whole by the engine in a worker thread, every page's
size read before any is drawn, the refusals shown by name with Download (a protected file among them, until its
password screen is built). The engine reads a file's version, properties, page labels, what its permissions ask, and
whether it has fields or a structure tree, and opens and writes a protected file given its password. The password
screen, reading by range, repair notices, the time and memory limits are not built.

What LiveDoc reads of a PDF, what it says when it cannot, and how damaged, protected and very large files are met.
"Any PDF" is every PDF a common reader opens: PDF 1.0 to 2.0, linearised, encrypted, with damaged cross-references,
scanned, tagged, signed, with fields, PDF layers, embedded files and any script's fonts. Each opens here, or is refused
with a named reason; none is changed by being opened, and none is opened by converting it. The evidence is
[The standard](../../research/pdf-documents/the-standard.md) and [The engine](../../research/pdf-documents/engine.md).

## What is read

| Of the file                          | Read as                                                                                | Where it shows                                          |
| ------------------------------------ | -------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Pages: size, rotation, boxes, labels | Each PDF page, in order, with its label ("iv", "A-3") where the file gives one         | The pages, the thumbnails, the page field               |
| Page content                         | Drawn by the engine as the file says; text with its place, pictures, shapes            | The pages; text boxes and objects in Editing            |
| Text                                 | Characters with positions, in the file's own order; flagged where a font maps none     | Selection, find, copy, the accessible tree, search      |
| Annotations                          | [Marks](marks.md), and [comments](comments.md) where they carry words or replies       | On the page, the comments panel                         |
| Links and actions                    | Links to a place in the document or an address; every other action listed, not run     | On the page ([Security](security.md#links-and-actions)) |
| The interactive form                 | [Fields](fields.md), with values, order and the standard actions                       | On the page, the fields panel                           |
| Signatures                           | Each [certificate signature](signing.md): signer, time, what it covers, intact or not  | The signatures panel, a banner                          |
| The outline                          | [Bookmarks](document-tools.md#bookmarks), nested as the file has them                  | The outline panel                                       |
| Embedded files                       | Name, size and type of each; never opened by LiveDoc                                   | The embedded files panel                                |
| Optional content                     | [PDF layers](reading-surface.md#the-left-panel), shown as the file sets them           | The layers panel                                        |
| The structure tree                   | Headings, paragraphs, lists, tables, figures and their alternative text                | The accessible tree ([Accessibility](accessibility.md)) |
| Metadata                             | Title, author, subject, keywords, producer, dates, the PDF version, conformance claims | File > Properties                                       |
| Protection                           | Whether an open password is asked, and what the permissions ask                        | The password screen, File > Properties                  |
| Everything else                      | Kept untouched and written back ([Saving](saving.md#what-is-kept-untouched))           | Nowhere                                                 |

- The file is read by **one reader**, the engine in a worker thread ([Security](security.md#the-boundary)); nothing of
  it is read on the page's own thread, and no second reader's opinion decides whether it is open.
- **A file under `FILE_WHOLE_READ_MAX_BYTES` (8 MiB) is fetched whole; a larger one is read by range**, the first
  page's blocks first, so page one shows before the rest arrives
  ([Bytes](../../research/pdf-documents/bytes.md#getting-the-bytes-out)).
- **Opening changes nothing.** No live change is made by reading, the stored file is never rewritten, and the
  download of a PDF nobody changed is the stored file itself ([Saving](saving.md#an-unchanged-file)).

## While it opens

- The title row and menus show at once, from the document's outline; the pages' place holds a page-shaped placeholder
  on the surface's ground.
- Every page's size is read before any is drawn, so the scrollbar is true from the first frame; page one then draws,
  as a whole-page picture first and sharp tiles behind it ([Reading surface](reading-surface.md#the-pages)).
- A file read by range shows "Loading page 1 of 240" under the placeholder after `PDF_OPEN_NOTICE_MS` (800 ms), with
  the part fetched as a progress bar; reduced motion shows the numbers only.
- The view a person left (page, zoom, panel) is restored
  ([Kinds outside the canvas](../006-document/kinds-outside-the-canvas.md#switching-tabs)), clamped to the pages
  there now.

## Damaged files

Damage is ordinary: a broken trailer, a spoiled cross-reference, a file cut short.

- **A file the engine can rebuild opens**, with a notice bar: "This PDF was damaged. LiveDoc repaired it to show it;
  the file itself is unchanged." **Details** names what was rebuilt.
- A repaired file's changes are written as a **rewritten file**, never as an addition, and the notice says so before
  the first change: "Changes to this PDF are saved as a repaired copy." ([Saving](saving.md#addition-or-rewrite))
- A file opened with pages missing (cut short after page 12 of 40) shows the pages it has and the notice "Only 12 of
  this PDF's pages could be read."; it is read-only, since a bake would write the loss into the file.
- **A file the engine cannot rebuild** is refused as damaged, below.

## Passwords

Fork F9 `(default)`.

- **An open password** is asked on the pages' place, never as a browser prompt: "This PDF is protected. Enter its
  password to open it.", a password field, **Open**. A wrong one answers "That password didn't open this PDF." and
  keeps focus in the field; nothing limits the tries, since the check is the person's own browser's.
- The password is **one person's, held in the engine's worker for the session**: never stored, never logged, never
  sent to LiveDoc's servers. Each person on the document gives it themselves; a reload asks again.
- **A PDF whose permissions forbid changes** opens for everyone with its password-free reading, in **Viewing**, with
  the notice "This PDF asks not to be changed." and **Enter permissions password**. Given, the person's level decides
  their modes as for any PDF. Permissions that forbid copying or printing are honoured the same way: Copy and Print
  are dimmed with the reason until the permissions password is given.
- **What the permissions ask** is read as seven answers, each yes where the file asks nothing: printing, printing
  at full resolution, changing page content, copying text and pictures, marks (with filling and signing), filling and
  signing alone, and inserting, deleting and rotating pages. Text for screen readers is always allowed. Given the
  permissions password, every answer is yes.
- **The engine holds the file while it waits for a password**: the password is given to the engine that already has
  the bytes, never sent with them again, and a wrong one leaves the engine waiting.
- Permissions are a request, not a lock: any reader can ignore them
  ([The standard](../../research/pdf-documents/the-standard.md#what-the-design-leans-on)). LiveDoc honours them and says
  so in File > Properties.
- **Inside LiveDoc, sharing decides who reads.** The password guards the file wherever it travels; marks and comments
  people make are LiveDoc's own content, guarded by the document's share roles. The surface loads no live change until
  the engine has opened the file.
- A protected PDF is baked only where its password is: in a browser that was given it, or the CLI. LiveDoc's servers
  never bake it, draw it or read its text: it has no thumbnail but a lock, and no search text
  ([Live editing and storage](live-editing-and-storage.md#what-the-servers-make)).
- Adding, changing and removing protection is an Editor's document tool
  ([Redaction and protection](redaction-and-protection.md#protection)).

## Refusals

A refusal fills the pages' place: a glyph, one sentence, a second line saying what can still be done, and
**Download** (the stored file, byte for byte) wherever the bytes are held. The title row, sharing and the Trash work
as for any document.

| Name                        | When                                                                                       | Copy                                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `pdf_damaged`               | The engine cannot read the file, repaired or not                                           | "This PDF is damaged and can't be opened. You can still download the file."                      |
| `pdf_newer`                 | The file opens with no pages, or names a feature or filter the engine does not know        | "This PDF uses a newer kind of PDF than LiveDoc reads yet. You can still download the file."     |
| `pdf_certificate_protected` | The file is encrypted to certificates (F14, ruled: refused by name)                        | "This PDF is locked to specific people's certificates, which LiveDoc doesn't open."              |
| `pdf_rights_protected`      | The file names a rights service or another security handler                                | "This PDF is protected by a rights service, which LiveDoc doesn't open."                         |
| `pdf_stopped`               | Reading passed `PDF_OPEN_TIMEOUT_MS` or the worker's memory ceiling, or the engine trapped | "LiveDoc stopped reading this PDF, because it asked for too much time or memory." **Try again**  |
| `file_too_large`            | The bytes pass `FILE_TAB_MAX_BYTES`; nothing is stored                                     | "This file is larger than 100 MB, the most LiveDoc holds for one file."                          |
| `files_unavailable`         | The server has no file storage; nothing is stored                                          | "This server has no file storage."                                                               |
| `blob_missing`              | The stored file's bytes are gone from the store                                            | "This PDF's file is missing from storage." with **Restore a previous version** where one is kept |

- A refusal is told apart from damage: a PDF made by tomorrow's software is "newer", never "damaged"
  ([The standard](../../research/pdf-documents/the-standard.md#in-the-wild)).
- After `pdf_stopped` the worker is ended and a fresh one started for the next file; **Try again** reads once more, and
  a second stop is final for that open.
- **One page that cannot be drawn** does not refuse the file: the page shows "This page is too large to show." (past
  `PDF_MAX_PAGE_PIXELS`) or "This page couldn't be drawn." in its own frame, and the rest read on.
- An XFA form is not refused: its static pages show, with a notice ([Fields](fields.md#xfa)).
- Portfolios, rich media, 3D and geospatial pages are not refused: their pages draw as any reader's fallback draws
  them, their data is kept untouched, and the notice says what is not shown
  ([Parity matrix](parity-matrix.md#left-out)).

## Limits

| Constant                    | Value                | Why                                                                                                                                          |
| --------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `FILE_TAB_MAX_BYTES`        | 100,000,000 (100 MB) | The file tab's cap (F6, ruled): a phone holds such a file by range without loading it whole ([Bytes](../../research/pdf-documents/bytes.md)) |
| `FILE_WHOLE_READ_MAX_BYTES` | 8,388,608 (8 MiB)    | `(default)` Under it one request is the simplest path; above it page one must not wait for the file                                          |
| `PDF_RANGE_BLOCK_BYTES`     | 65,536               | `(default)` The block the engine's reader is fed; a paper's first page is 4 blocks of 16                                                     |
| `PDF_OPEN_TIMEOUT_MS`       | 30,000               | `(default)` Reading the structure of the slowest corpus file takes under a second; safe range 10 to 120 s                                    |
| `PDF_OPEN_NOTICE_MS`        | 800                  | `(default)` Past it a person wonders; before it a notice would flash                                                                         |
| `PDF_MAX_PAGE_PIXELS`       | 268,435,456          | `(default)` One draw of one page; a decompression bomb draws at most this                                                                    |
| `PDF_PAGE_TEXT_MAX_CHARS`   | 200,000              | `(default)` One page's text read at once, twenty times a dense page; a page past it reads its first part and says so                         |
| `PDF_WORKER_MAX_BYTES`      | 1,073,741,824        | `(default)` The engine's memory ceiling in a browser; a phone's is 268,435,456. Measured: 724 MiB at most                                    |

## Share roles

- Opening, the password screen and every refusal are the same for an Editor, a Participant and a Viewer: reading is
  everyone's who may read the document.
- **Download** on a refusal follows the document's download setting, as every download does
  ([Files, print and sync](files-print-and-sync.md#downloading)).
- **Try again** and **Restore a previous version** are an Editor's where they change what is stored; **Try again**
  alone is everyone's.

## Keyboard and accessibility

- The password field takes focus when it shows; Enter opens; the wrong-password line is tied to the field and
  announced assertively.
- A refusal is a region with the sentence as its heading; its buttons follow in tab order; nothing is conveyed by the
  glyph alone.
- The loading notice is a polite live region, updated no more than once a second.

## Telemetry and observability

- `Pdf · Opened · <Outcome>`, once per open: `Read`, `Repaired`, `Partial`, `PasswordGiven`, or
  `Refused.<Name>` (`Damaged`, `Newer`, `CertificateProtected`, `RightsProtected`, `Stopped`, `TooLarge`,
  `NoFileStorage`, `BlobMissing`). Never the password or a name.
- Fingerprints with the document and tab ids: `[pdf] opened pages=<n> bytes=<n> ranged=<bool> repaired=<bool>`
  (with `ms`, `read` and `engine`: how long the open, the read and the engine took),
  `[pdf] refused name=<name>`, `[pdf] password-asked`, `[pdf] password-wrong`, `[pdf] page-refused reason=<reason>`,
  `[pdf] worker-restarted reason=<trap|timeout|memory>`.
