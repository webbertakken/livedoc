# Files, print and sync

**Status: specified; a first slice is built.** Built: a PDF dropped on the Explorer (one or several), kept in This
Browser for a guest where sign-in is offered, the add menu's PDF from a file, and File > Download > PDF. A file sent to LiveDoc is sent before the
document opens. A canvas tab's and a Pages tab's
Download as PDF are written by the one writer, with a guard that finds a second. Every other way in and out is not
built.

How a PDF arrives as a [PDF document](pdf-document.md), how it leaves by Download, print and email, how a repository
link and the Drive mirror keep it as a file, and how the other kinds meet it. Every file that leaves is a bake
([Saving](saving.md)); a PDF nobody changed leaves as its stored file, byte for byte.

## Opening

A file whose bytes are a PDF ([What becomes a PDF document](pdf-document.md#what-becomes-a-pdf-document)) arrives by:

| Way                                          | Result                                                                                               |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| A drop or a paste of a file on the Explorer  | A PDF document in the folder dropped on, or the folder in view; several files make several documents |
| The Explorer's New > PDF document, or Import | The file chooser; the same result                                                                    |
| A drop or a paste on an open document        | A PDF tab joins that document, for whoever may add tabs `(default)`; a toast names it with **Open**  |
| A drop on a PDF document's pages             | Asked: **Open as a new document**, or (Editing) **Insert its pages here**                            |
| File > Open in any office kind               | Its chooser takes `.pdf`; the PDF opens as a new PDF document in a new browser tab                   |
| A repository sync                            | A `.pdf` file is adopted as a PDF document ([Repository sync](#repository-sync))                     |
| The Drive mirror                             | A PDF in the mirrored folder is adopted as a PDF document ([The Drive mirror](#the-drive-mirror))    |
| An agent                                     | `pdf.import` with bytes ([Agents](agents.md))                                                        |

- **Where it is kept is where a new document is** `(default)`
  ([Save Locations](../006-document/save-locations.md#the-default-depends-on-who-is-creating)): LiveDoc for a
  signed-in person, for anyone on a guest-only deployment, and for a drop on a folder or a team's place; **This
  Browser** for a guest where sign-in is offered, whose file is kept in this browser and sent nowhere
  ([Live editing and storage](live-editing-and-storage.md#this-browser)).
  - A browser that will not keep the file says so by name and makes nothing
    ([Errors in This Browser](live-editing-and-storage.md#errors-in-this-browser)).
- **The pages show before the upload ends**: the browser hashes the file, opens it from its local bytes, and sends it
  to the [blob store](../006-document/blob-store.md) meanwhile; the save status reads "Uploading 42%". Changes made
  meanwhile are live changes, sent once the stored file is confirmed.
- A file already held for that owner is not sent again.
- A drop where no file storage exists, or of a file too large, is answered by its
  [refusal](opening.md#refusals) at once, before any byte travels, and nothing is made. Whether file storage exists
  is asked of the host before the file is read
  ([Without object storage](../006-document/blob-store.md#without-object-storage)).
- A person who may not add a document where they dropped is told so; the drop is never taken silently by the browser
  (which would replace LiveDoc with the browser's own viewer).
- Several PDFs dropped together open as several documents, with one toast ("4 PDFs added") and the first opened.
- **A drop in the page's first moments waits** `(default)`: until the Explorer knows who is here (a guest's id is
  asked of the server as the page opens), a dropped file is held, up to `PDF_DROP_OWNER_WAIT_MS`, then opened. Past
  it: "LiveDoc isn't ready yet. Drop the PDF again in a moment." A section that takes no document says so at once.
- A file that could not be taken at all is said too: "This PDF couldn't be opened. Try again." `(default)`.

## Downloading

File > Download, the Explorer's row menu and an agent's `pdf.download`:

| As                       | Is                                                                                              |
| ------------------------ | ----------------------------------------------------------------------------------------------- |
| **PDF**                  | The bake: every live change in the file. Unchanged, the stored file itself                      |
| **PDF, flattened**       | The bake with marks and fields written into the page content, a copy; the document is unchanged |
| **PDF without comments** | The bake without comment threads and their replies; marks that carry no words stay              |
| **PDF, pages…**          | A page range ("1-3, 8") of the bake, as a new PDF                                               |
| **Pages as pictures**    | PNG or JPEG, one a page or the pages chosen, at 72 to 600 dpi, zipped when more than one        |
| **Text**                 | The text by page as `.txt`, in reading order                                                    |
| **Field data**           | The field values as FDF or XFDF ([Fields](fields.md#field-data))                                |
| **Comments summary**     | The threads by page as a PDF or `.txt` ([Comments](comments.md#summary))                        |

- The file is named as the document is, with `.pdf`.
- A download is made in the browser that asks for it, from the stored file it already holds; a large one shows
  "Preparing the PDF…" with a progress bar and **Cancel**.
- Dark pages never reaches a download ([Dark pages](dark-pages.md)).
- A protected PDF is downloaded protected as it was; **Remove protection** is an Editor's document tool.
- Downloading, printing and copying are open to every level unless the owner turned them off for Viewers and
  Participants in the share dialog, when the controls are not drawn. That setting is no lock.
- Other formats (Word, Excel, PowerPoint, HTML, RTF) are not written from a PDF document; **Open as a text
  document** is the way to an editable office file ([Other kinds meeting a PDF](#other-kinds-meeting-a-pdf)).

## Printing

- **File > Print** (⌘P) hands the browser the bake itself, so the browser's own print path draws it at the printer's
  resolution, with the browser's dialog for copies, sides, pages a sheet, scale and paper.
- Before it, LiveDoc's own small dialog asks only what the browser cannot know:

| Choice     | Options                                                                             |
| ---------- | ----------------------------------------------------------------------------------- |
| **Pages**  | All; Current page; Pages ("1-3, 8"); Selected thumbnails                            |
| **Marks**  | Document and marks (default); Document only; Document, marks and a comments summary |
| **Fields** | With their values (default); Blank                                                  |

- Where a browser cannot print a PDF it is handed (phones), the chosen pages are drawn at `PDF_PRINT_DPI` into a
  print-only document.
- Print is always light paper as the file says. Dark pages, selections, presence and LiveDoc's chrome never print.
- A PDF whose permissions forbid printing dims Print with the reason until the permissions password is given
  ([Opening](opening.md#passwords)).
- Booklets, posters, tiling, colour separations and print production are left out
  ([Parity matrix](parity-matrix.md#left-out)); what the browser's dialog offers (two sides, several pages a sheet)
  is there.

## Replacing

- **File > Replace file** (an Editor's) takes another PDF's bytes as the stored file: bytes arriving from outside
  ([Saving](saving.md#when-the-stored-file-is-replaced)). Live changes are carried across where their anchors hold,
  and the ones that do not are reported and kept in the previous version.
- A replace with a file that is not a PDF is refused: "Choose a PDF file."

## Email

File > Email > **Email this file**, where the host has email configured: the bake as an attachment (or, past the
host's attachment limit, a link to the document), to addresses, with a message, as a text document's
([Files and print](../034-text-documents/files-and-print.md#email)). Where email is not configured the item is not
drawn.

## Other kinds meeting a PDF

- **Kept as a PDF document**: a text document's, a spreadsheet's and a canvas tab's Download as PDF offers "Keep in
  LiveDoc as a PDF document": the written PDF becomes a PDF document beside its source, linked back to it in
  Properties. It is a copy: later changes to the source do not reach it.
- **One writer.** Every kind's Download as PDF and every bake are written by the repository's one PDF writer; a
  second PDF writer anywhere in the codebase is a defect, and a test finds one by the words no writer can do
  without.
- **A canvas tab's and a Pages tab's PDF** is a page a picture: the pixels packed without loss, never re-encoded,
  each page the size in points its tab or sheet shows at. The writer loads when a PDF is asked for, never with the
  editor, and refuses by name what is no PDF: no page (`no_pages`), a picture that is not its size
  (`picture_size`), a page past the most a PDF page measures (`page_size`). The file is titled as its tab is named,
  says LiveDoc made it and when, and names no author `(default)`.
- **Opened as a text document**: File > Open as a text document runs the text document's own import of a PDF (text
  and pictures, reading order guessed) and makes a **copy** as a text document
  ([Files and print](../034-text-documents/files-and-print.md#opening)); the PDF document is unchanged.
- **Pages from a LiveDoc document**: Editing's Insert pages takes another PDF document's pages, or another kind's
  pages written as PDF first ([Organising pages](organising-pages.md#inserting)).
- **On a canvas**: a link to the PDF document, as to any document. A PDF page as a picture on a canvas is the image
  element's own import.

## Repository sync

A PDF document is a **native file** ([Native files](../027-repositories/native-files.md)): `<name>.pdf`, its bake.

- **Written out**: the bake, deterministic, so a sync at unchanged revisions writes the same bytes; unchanged, the
  stored file itself. The sync record holds the tab's revision and the hash of the bytes written.
- **Adopted**: a `.pdf` file whose bytes are a PDF becomes a PDF document; one that is not becomes a file document.
- **Folded back**: a `.pdf` changed in the repository is bytes arriving from outside. Where LiveDoc's side is
  unchanged since the recorded revision, the file's bytes become the stored file. Where both changed, it is a
  conflict, settled as a file document's is: `livedoc sync --take file <path>` or `--take livedoc <path>`; the bytes
  that lose stay as a previous version, and live changes are carried where their anchors hold.
- **A PDF the server cannot bake** (protected, or past `PDF_SERVER_BAKE_MAX_BYTES`) is written by the CLI on the
  person's machine, which bakes there; a sync with no CLI on a machine (a hook's push) writes the stored file and
  reports "contract.pdf: 12 changes are in LiveDoc and not yet in this file."
- Files over `FILE_TAB_MAX_BYTES` and Git LFS pointer files are left and reported, as for every file.

## The Drive mirror

- A PDF document is mirrored to Google Drive as `<name>.pdf` (`application/pdf`), its bake, renewed when the
  document's live changes or stored file change, at the mirror's own cadence
  ([Drive mirror](../022-drive-mirror/drive-mirror.md)) `(default)`.
- A PDF put into the mirrored folder in Drive is adopted as a PDF document; a mirrored PDF whose bytes change in
  Drive is bytes arriving from outside.
- A PDF the server cannot bake is mirrored as its stored file, with the note in the mirror's status, never silently.

## Limits

| Constant                 | Value  | Why                                                                                          |
| ------------------------ | ------ | -------------------------------------------------------------------------------------------- |
| `PDF_PRINT_DPI`          | 150    | `(default)` Where pages are drawn for print; safe range 100 to 300                           |
| `PDF_PICTURE_MAX_DPI`    | 600    | `(default)` Pages as pictures; a Letter page at 600 dpi is 33 megapixels                     |
| `PDF_DROP_MAX_FILES`     | 50     | `(default)` PDFs taken from one drop; more are refused together, with the count              |
| `PDF_DROP_OWNER_WAIT_MS` | 10,000 | `(default)` How long a drop waits for the Explorer to know who is here; safe range 2 to 30 s |

## Share roles

| Role            | May                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------ |
| **Editor**      | Everything here: add a PDF tab, replace the file, download every form, print, email        |
| **Participant** | Download, print and email, unless the owner turned those off; import and export field data |
| **Viewer**      | Download and print, unless the owner turned those off                                      |

Making a PDF document in a folder asks what making any document there asks.

## Keyboard and accessibility

- A drop has a keyboard equal everywhere: the Explorer's New and Import, File > Open, Pages > Insert.
- The print and download dialogs are the shell's dialogs: labelled, focus trapped while open, Escape closes.
- Progress ("Uploading 42%", "Preparing the PDF…") is a polite live region, updated at most once a second.

## Telemetry and observability

- `Pdf · Imported · <Way>`; `Pdf · Exported · <Pdf|Flattened|WithoutComments|Pages|Pictures|Text|FieldData|
CommentsSummary|Print|Email|KeptFromTextDocument|KeptFromSpreadsheet|KeptFromCanvas>`;
  `Pdf · Changed · StoredFile.Arrived` for a replace.
- `Document · Created · <Offline|Cloud>` beside `Pdf · Imported` for a PDF that arrives as a new document, by where it
  is kept.
- Fingerprints: `[pdf] arrived way=<way> bytes=<n> held=<bool>`, `[pdf] upload ms=<n> parts=<n>`,
  `[pdf] download as=<as> ms=<n>`, `[pdf] download failed`, `[pdf] sync wrote=<bake|stored> lacking=<n>`,
  `[pdf] sync folded anchors-lost=<n>`, `[pdf] drive wrote=<bake|stored>`.

## Errors

| When                                       | A person sees                                                               |
| ------------------------------------------ | --------------------------------------------------------------------------- |
| The upload stops                           | "Upload paused. It continues when you are back online." The pages stay open |
| The upload is refused after the pages show | The refusal's copy, with **Download** of the local bytes; nothing is stored |
| A download or print's bake fails           | "This PDF couldn't be written. Your changes are safe." **Try again**        |
| The browser blocks the download            | "Your browser blocked the download." **Download again**                     |
