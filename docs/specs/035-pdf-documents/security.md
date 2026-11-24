# Security

**Status: specified; a first slice is built.** Built: the boundary (a PDF's bytes are parsed only in WebAssembly, in a
worker thread with no script runtime, and only typed, bounded values leave it), guarded by a test that no code outside
the engine names the libraries beneath it; and what the engine answers of links, bookmarks and actions: a place in
the document, an address of an opened scheme, or a named refusal, with circular and over-deep outlines stopped; and
embedded files listed by a cleaned name, never opened, with the ones that run on a computer told apart; the engine's
time limit and memory ceiling, held by the page that started it; values clamped on the way out and logged; and every
abuse case the engine and its worker meet, each a test. The surface's handling of links and embedded files, what
File > Properties > Security lists, and the abuse cases of signing, redaction, comments and the servers are not
built: each is a test of the phase that builds it.

A PDF is untrusted input: it can carry code, ask for the network, hide content, lie about its authors and exhaust a
parser. This spec is the trust boundary of a [PDF document](pdf-document.md) and the rule for every abuse case; each
rule is a test with a named rejection. The research is [Security](../../research/pdf-documents/security.md).

## The boundary

- **A PDF's bytes are parsed only inside WebAssembly, in a worker thread.** A parser fault is a trap in a sandbox,
  never memory corruption in the page, and a slow file blocks no frame. The api Worker is the same boundary on the
  server; the room never parses a PDF.
- **Nothing from a file reaches the DOM as markup.** Text is set as text, a picture is pixels the engine decoded, a
  link is a filtered address, a name is shown as a string. No file's string is ever a selector, a URL to fetch, a
  file path or a format string.
- **The worker has no network.** It is given bytes and returns bytes, text and numbers. Nothing is fetched because a
  file asked.
- **The worker holds one secret at most**: a password or a certificate file's key a person gave it, for the session
  ([Opening](opening.md#passwords), [Signing](signing.md#certificate-signatures)).
- What crosses the boundary outward is typed and bounded: page sizes, text runs, marks, field descriptions, bitmaps of
  a stated size. A value out of bounds (a page of 10^9 points, a mark with 10^7 points) is clamped or dropped, and
  logged: once a call, `[pdf] value-clamped what=<coordinate|size|text|list> count=<n>`.
- **The engine is held to a time and to a size by the page that started it.** A worker that has answered nothing for
  `PDF_ENGINE_TIMEOUT_MS` while a call waits is ended, and so is one whose memory passes the ceiling
  ([Opening](opening.md#limits)); a call cannot be stopped inside WebAssembly, so the worker is what ends.
- **What the worker says of a failure is a name**, never a message: an error's own words may quote the file.

## Scripts

- **No script from a file ever runs.** The engine is driven without a script runtime, and LiveDoc evaluates no
  string a file carries, sandboxed or not.
- A field's standard format, validate and calculate actions are **recognised as text** and answered by LiveDoc's own
  functions of the same names; anything else is never evaluated ([Fields](fields.md#formats-and-calculations), fork
  F11).
- Scripts are kept in the file as text and written back untouched ([Saving](saving.md#what-is-kept-untouched)).
- File > Properties > Security says how many scripts the file carries and that none ran. The engine says how many the
  file names for the document as a whole as it opens (`[pdf] script-ignored count=<n>`); a page's and a field's are
  counted where that list is built.
- The engine never asks its reader to perform an action of a file's: not on opening, not on a page, not on a field.

## Links and actions

| In the file                                                                                                       | In LiveDoc                                                                                                                   |
| ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| A link to a place in the document                                                                                 | Followed                                                                                                                     |
| A link to `http`, `https` or `mailto`                                                                             | The address is shown first ("Open example.com/path?"), then opened in a new tab with no opener and no referrer               |
| A link to any other scheme (`javascript:`, `file:`, `data:`, an app's)                                            | Never opened: "This link can't be opened here." with the address as text to copy                                             |
| A link with no scheme (an address relative to where the file once was)                                            | `(default)` Never opened: it leads nowhere from here; the address is shown as text to copy                                   |
| A link to another file by path (remote go-to)                                                                     | Never followed; the path is shown as text                                                                                    |
| Launch (start a program), submit or import form data, play media, run a script, set a PDF layer's state by action | Never performed; listed in File > Properties > Security as "This file wanted to …"                                           |
| A button that resets fields                                                                                       | Performed when a person presses it, as one undoable change to the field values ([Fields](fields.md#what-a-files-fields-are)) |
| Any other action: a reader's menu command (print, close, quit), showing or hiding a field, a 3D or media view     | Never performed; listed the same way                                                                                         |
| An action on opening the document or a page                                                                       | Never performed, but a go-to that only sets the first view (page, zoom), which is honoured                                   |

- A link's shown address is the address opened: an address whose text and target differ is shown by its target.
- Addresses are compared after normalising; internationalised names are shown in their punycode form when they mix
  scripts.

## Embedded files

- Listed with name, size and type; the name is shown as text, with control characters and path separators removed,
  and the characters that turn the direction of text with them `(default)`, so a name cannot show another ending
  than it has.
- **The size is what the file says it is** `(default)`: a file that says none shows no size until it is saved. No
  embedded file is decoded to be counted. The type is the one the file names, where it is written as a type is.
- **Saved only by a person's action** (**Save** on the row); never opened, previewed or run by LiveDoc. A type that
  runs on a computer (an executable, a script, a shortcut) carries a warning line before it is saved.
- **Which files run is told by the name's ending** `(default)`, never by the type the file names, which a file can
  say as it likes: programs (`exe`, `com`, `scr`, `msi`, `msp`, `dll`, `cpl`, `app`, `dmg`, `pkg`, `deb`, `rpm`,
  `apk`, `jar`), scripts (`bat`, `cmd`, `ps1`, `vbs`, `vbe`, `js`, `jse`, `wsf`, `wsh`, `hta`, `sh`, `command`,
  `py`, `pl`, `rb`), shortcuts (`lnk`, `url`, `desktop`, `scf`, `inf`, `reg`) and office files that carry macros
  (`docm`, `xlsm`, `pptm`). The ending is read after dots and spaces at the name's end are dropped, as a computer
  drops them.
- An embedded PDF may be **opened as a new PDF document**, through this same boundary; nothing else is opened.
- The embedded files panel is the only way in: no link or action in a file opens one.

## Abuse cases

| Case                                                                      | Rule                                                                                                                        | Rejection or outcome                                    |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| JavaScript anywhere in the file                                           | Never run                                                                                                                   | Listed; `[pdf] script-ignored count=<n>`                |
| Launch, submit, import, media                                             | Never performed                                                                                                             | Listed; `[pdf] action-ignored kind=<kind>`              |
| A hostile link scheme                                                     | Only `http`, `https`, `mailto` and places in the document                                                                   | `link_scheme_refused`                                   |
| Remote references (pictures, fonts, forms by URL)                         | The engine has no network                                                                                                   | Drawn as absent; `[pdf] remote-ignored`                 |
| A decompression bomb                                                      | `PDF_MAX_PAGE_PIXELS` a draw; a picture is decoded a row at a time, never whole; the engine's time limit and memory ceiling | The page still shows, or `pdf_stopped`                  |
| A parser crash or hang                                                    | A trap, `PDF_ENGINE_TIMEOUT_MS` or the memory ceiling ends the worker; a fresh one serves the next file                     | `pdf_stopped`                                           |
| Circular structure (an outline, a page tree, a field tree, a tag tree)    | Every walk keeps a visited set and a depth limit (`PDF_MAX_TREE_DEPTH`)                                                     | The walk stops; what was read shows                     |
| Font and image decoders                                                   | Run inside the same WebAssembly; a decoded picture is only pixels                                                           | A picture that fails draws as absent                    |
| A dangerous embedded file                                                 | Saved only by a person; never opened                                                                                        | The warning line                                        |
| A password kept, logged or sent                                           | Held in the worker's memory for the session only                                                                            | No route or log carries it, by test                     |
| A certificate file kept or sent                                           | Read in the browser, its key dropped when the dialog closes                                                                 | No route or log carries it, by test                     |
| Metadata that identifies people                                           | Shown in File > Properties; **Remove hidden information** lists and strips it                                               | [Redaction and protection](redaction-and-protection.md) |
| Text left under a drawn box                                               | Redaction removes content and rewrites; text extracted from a redacted area is empty; earlier files are purged              | The redaction test                                      |
| Content hidden from one reader (PDF layers, white on white, off the page) | The signatures panel lists changes after a signature; **Remove hidden information** finds the rest                          | Listed                                                  |
| A comment claiming a LiveDoc person wrote it                              | A comment read from a file is never credited to an account ([Comments](comments.md#authors))                                | Shown as "From the file"                                |
| A mark or field with hostile geometry or text                             | Bounded on the way out of the worker; text is text                                                                          | Clamped; `[pdf] value-clamped`                          |
| An oversized file                                                         | `FILE_TAB_MAX_BYTES`; the Worker's engine only for a file that fits                                                         | `file_too_large`, `pdf_too_large_for_server`            |
| An upload claiming another file's key                                     | The key is checked against the bytes as they are stored                                                                     | `key_mismatch`                                          |
| A browser's upload of a thumbnail or search text                          | Display only; never read back as the file ([Live editing and storage](live-editing-and-storage.md#what-the-servers-make))   | Marked as a browser's                                   |
| A crafted live change (a Participant's update touching pages)             | The room checks the roots an update changes                                                                                 | `level_too_low`                                         |
| A live change naming a blob the document does not hold                    | The room refuses it                                                                                                         | `blob_missing`                                          |
| A signature that looks valid after hidden changes                         | The panel says what each signature covers and lists every change made after it                                              | [Signing](signing.md#the-signatures-panel)              |

## What is not defended

- A file that is itself a lie beyond what is listed after a signature: no reader detects every such file.
- A person's own device: a password and a certificate file are as safe as the browser they are typed into.
- Protection as a lock: a PDF's permissions are a request any reader can ignore, and LiveDoc says so
  ([Opening](opening.md#passwords)).

## Limits

| Constant                 | Value  | Why                                                                                               |
| ------------------------ | ------ | ------------------------------------------------------------------------------------------------- |
| `PDF_MAX_TREE_DEPTH`     | 256    | `(default)` Deeper than any honest outline, page tree, field tree or tag tree                     |
| `PDF_LINK_MAX_CHARS`     | 2,048  | `(default)` A longer address is shown cut and never opened                                        |
| `PDF_NAME_MAX_CHARS`     | 255    | `(default)` A file's strings shown as names (embedded files, PDF layers, bookmarks) are cut to it |
| `PDF_PROPERTY_MAX_CHARS` | 2,048  | `(default)` A property of the file (title, author, subject, keywords, producer) is cut to it      |
| `PDF_OUTLINE_MAX_ITEMS`  | 20,000 | `(default)` Bookmarks read from one file; past it the outline is cut and says so                  |
| `PDF_PAGE_MAX_LINKS`     | 5,000  | `(default)` Links read on one page                                                                |
| `PDF_MAX_COORDINATE`     | 28,800 | `(default)` A coordinate read from a file is held within two pages' reach of the page's origin    |
| `PDF_MAX_LAYERS`         | 1,000  | `(default)` PDF layers read from one file; more are shown as the file sets them and not listed    |

- No limit is set on one decoded stream: the reader decodes a picture a row at a time, so a picture of 1 GiB in a
  file of 1 MB draws in 1.2 s with the engine's memory unchanged (measured). What bounds a bomb is the draw's pixels,
  the engine's time and the worker's memory.

## Share roles

The boundary is the same for every role. What the file wanted (File > Properties > Security) is readable by anyone
who reads the document; saving an embedded file follows the document's download setting.

## Logging and telemetry

- Fingerprints carry the document and tab ids, sizes, counts and the rejection's name: never a password, a file's
  name, a field value, a signer's name, an address or any text of the file.
- The engine's own, sent to the page that started it and written there: `[pdf] value-clamped`,
  `[pdf] script-ignored count=<n>`. The page's, of its worker: `[pdf] worker-restarted reason=<trap|timeout|memory>`
  with the failure's name.
- `Pdf · Opened · Link.<Followed|Refused>` when a person presses a link out of the document;
  `Pdf · Exported · EmbeddedFile` when one is saved. Never the address or the name.
