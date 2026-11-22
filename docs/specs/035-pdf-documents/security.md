# Security

**Status: specified; a first slice is built.** Built: the boundary (a PDF's bytes are parsed only in WebAssembly, in a
worker thread with no script runtime, and only typed, bounded values leave it). Links, actions, embedded files and the
abuse cases' tests are not built.

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
  logged.

## Scripts

- **No script from a file ever runs.** The engine is driven without a script runtime, and LiveDoc evaluates no
  string a file carries, sandboxed or not.
- A field's standard format, validate and calculate actions are **recognised as text** and answered by LiveDoc's own
  functions of the same names; anything else is never evaluated ([Fields](fields.md#formats-and-calculations), fork
  F11).
- Scripts are kept in the file as text and written back untouched ([Saving](saving.md#what-is-kept-untouched)).
- File > Properties > Security says how many scripts the file carries and that none ran.

## Links and actions

| In the file                                                                                                       | In LiveDoc                                                                                                                   |
| ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| A link to a place in the document                                                                                 | Followed                                                                                                                     |
| A link to `http`, `https` or `mailto`                                                                             | The address is shown first ("Open example.com/path?"), then opened in a new tab with no opener and no referrer               |
| A link to any other scheme (`javascript:`, `file:`, `data:`, an app's)                                            | Never opened: "This link can't be opened here." with the address as text to copy                                             |
| A link to another file by path (remote go-to)                                                                     | Never followed; the path is shown as text                                                                                    |
| Launch (start a program), submit or import form data, play media, run a script, set a PDF layer's state by action | Never performed; listed in File > Properties > Security as "This file wanted to …"                                           |
| A button that resets fields                                                                                       | Performed when a person presses it, as one undoable change to the field values ([Fields](fields.md#what-a-files-fields-are)) |
| Any other action: a reader's menu command (print, close, quit), showing or hiding a field, a 3D or media view     | Never performed; listed the same way                                                                                         |
| An action on opening the document or a page                                                                       | Never performed, but a go-to that only sets the first view (page, zoom), which is honoured                                   |

- A link's shown address is the address opened: an address whose text and target differ is shown by its target.
- Addresses are compared after normalising; internationalised names are shown in their punycode form when they mix
  scripts.

## Embedded files

- Listed with name, size and type; the name is shown as text, with control characters and path separators removed.
- **Saved only by a person's action** (**Save** on the row); never opened, previewed or run by LiveDoc. A type that
  runs on a computer (an executable, a script, a shortcut) carries a warning line before it is saved.
- An embedded PDF may be **opened as a new PDF document**, through this same boundary; nothing else is opened.
- The embedded files panel is the only way in: no link or action in a file opens one.

## Abuse cases

| Case                                                                      | Rule                                                                                                                      | Rejection or outcome                                    |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| JavaScript anywhere in the file                                           | Never run                                                                                                                 | Listed; `[pdf] script-ignored count=<n>`                |
| Launch, submit, import, media                                             | Never performed                                                                                                           | Listed; `[pdf] action-ignored kind=<kind>`              |
| A hostile link scheme                                                     | Only `http`, `https`, `mailto` and places in the document                                                                 | `link_scheme_refused`                                   |
| Remote references (pictures, fonts, forms by URL)                         | The engine has no network                                                                                                 | Drawn as absent; `[pdf] remote-ignored`                 |
| A decompression bomb                                                      | `PDF_MAX_PAGE_PIXELS` a draw, `PDF_STREAM_MAX_BYTES` a decoded stream, the worker's memory ceiling                        | The page's own notice, or `pdf_stopped`                 |
| A parser crash or hang                                                    | A trap or `PDF_OPEN_TIMEOUT_MS` ends the worker; a fresh one serves the next file                                         | `pdf_stopped`                                           |
| Circular structure (an outline, a page tree, a field tree)                | Every walk keeps a visited set and a depth limit (`PDF_MAX_TREE_DEPTH`)                                                   | The walk stops; what was read shows                     |
| Font and image decoders                                                   | Run inside the same WebAssembly; a decoded picture is only pixels                                                         | A picture that fails draws as absent                    |
| A dangerous embedded file                                                 | Saved only by a person; never opened                                                                                      | The warning line                                        |
| A password kept, logged or sent                                           | Held in the worker's memory for the session only                                                                          | No route or log carries it, by test                     |
| A certificate file kept or sent                                           | Read in the browser, its key dropped when the dialog closes                                                               | No route or log carries it, by test                     |
| Metadata that identifies people                                           | Shown in File > Properties; **Remove hidden information** lists and strips it                                             | [Redaction and protection](redaction-and-protection.md) |
| Text left under a drawn box                                               | Redaction removes content and rewrites; text extracted from a redacted area is empty; earlier files are purged            | The redaction test                                      |
| Content hidden from one reader (PDF layers, white on white, off the page) | The signatures panel lists changes after a signature; **Remove hidden information** finds the rest                        | Listed                                                  |
| A comment claiming a LiveDoc person wrote it                              | A comment read from a file is never credited to an account ([Comments](comments.md#authors))                              | Shown as "From the file"                                |
| A mark or field with hostile geometry or text                             | Bounded on the way out of the worker; text is text                                                                        | Clamped; `[pdf] value-clamped`                          |
| An oversized file                                                         | `FILE_TAB_MAX_BYTES`; the Worker's engine only for a file that fits                                                       | `file_too_large`, `pdf_too_large_for_server`            |
| An upload claiming another file's key                                     | The key is checked against the bytes as they are stored                                                                   | `key_mismatch`                                          |
| A browser's upload of a thumbnail or search text                          | Display only; never read back as the file ([Live editing and storage](live-editing-and-storage.md#what-the-servers-make)) | Marked as a browser's                                   |
| A crafted live change (a Participant's update touching pages)             | The room checks the roots an update changes                                                                               | `level_too_low`                                         |
| A live change naming a blob the document does not hold                    | The room refuses it                                                                                                       | `blob_missing`                                          |
| A signature that looks valid after hidden changes                         | The panel says what each signature covers and lists every change made after it                                            | [Signing](signing.md#the-signatures-panel)              |

## What is not defended

- A file that is itself a lie beyond what is listed after a signature: no reader detects every such file.
- A person's own device: a password and a certificate file are as safe as the browser they are typed into.
- Protection as a lock: a PDF's permissions are a request any reader can ignore, and LiveDoc says so
  ([Opening](opening.md#passwords)).

## Limits

| Constant               | Value       | Why                                                                                               |
| ---------------------- | ----------- | ------------------------------------------------------------------------------------------------- |
| `PDF_STREAM_MAX_BYTES` | 268,435,456 | `(default)` One decoded stream; the corpus's largest honest stream is under a tenth of it         |
| `PDF_MAX_TREE_DEPTH`   | 256         | `(default)` Deeper than any honest outline, page tree or field tree                               |
| `PDF_LINK_MAX_CHARS`   | 2,048       | `(default)` A longer address is shown cut and never opened                                        |
| `PDF_NAME_MAX_CHARS`   | 255         | `(default)` A file's strings shown as names (embedded files, PDF layers, bookmarks) are cut to it |

## Share roles

The boundary is the same for every role. What the file wanted (File > Properties > Security) is readable by anyone
who reads the document; saving an embedded file follows the document's download setting.

## Logging and telemetry

- Fingerprints carry the document and tab ids, sizes, counts and the rejection's name: never a password, a file's
  name, a field value, a signer's name, an address or any text of the file.
- `Pdf · Opened · Link.<Followed|Refused>` when a person presses a link out of the document;
  `Pdf · Exported · EmbeddedFile` when one is saved. Never the address or the name.
