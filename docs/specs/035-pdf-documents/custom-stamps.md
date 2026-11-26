# Custom stamps

**Status: built: where they are kept, their api, their file form, making one in the browser and placing one.** Manage
stamps (renaming, deleting, categories) and stamp identity are not.

A **custom stamp** is a person's own stamp: a picture, or a page of a PDF, given a name and a category, kept in
LiveDoc for them, and placed on any PDF as a standard or dynamic stamp is ([Marks](marks.md#stamps)). The parity rows
are the matrix's "Stamps" ([Parity matrix](parity-matrix.md#stamps)).

## Domain language

| Term             | Meaning                                                                                  | Not                  |
| ---------------- | ---------------------------------------------------------------------------------------- | -------------------- |
| **custom stamp** | A person's own stamp: its picture, name, category and natural size, in their stamps      | stamp image, sticker |
| **their stamps** | Every custom stamp one owner keeps                                                       | stamp library        |
| **its picture**  | The custom stamp's bytes, one blob, a PNG or a JPEG                                      | image, asset         |
| **natural size** | The size a custom stamp is placed at before it is held to a third of the page, in points |                      |

## Where they are kept

- **In LiveDoc, owner-scoped, as [custom themes](../011-theme/custom-themes.md) are**: keyed by the request's owner,
  the account for a person signed in, else this browser's guest id ([Auth + guest access](../014-identity/auth-and-guest-access.md)).
  A guest's stamps are this browser's; a guest who signs up takes them to the account, by the same move as their
  documents; an account's are there wherever they sign in. Deleting the account deletes them.
- A row each, in D1's `custom_stamps`: its id (`custom-<uuid>`), owner, name, category, its picture's key, the
  picture's type (`png` or `jpeg`), its size in pixels and its natural size in points, and when it was made and
  changed. Newest first.
- **Its picture is a blob the owner holds** ([Blob store](../006-document/blob-store.md#holds-and-retention)): sent
  by an upload that names no document, before the stamp is made, and **held by the custom stamp** for as long as it
  is kept. It counts against the owner's file allowance, as every blob does (F16).
- A self-host without file storage keeps no custom stamps: `GET /api/capabilities` says `filesEnabled` false, and
  Custom stamps is not offered ([Without object storage](../006-document/blob-store.md#without-object-storage)).

## Making one

- **Insert > Stamp > Custom stamps** opens **Create custom stamp**, a dialog; so does the Stamp control's
  **Create custom stamp…** cell, after its custom stamps.
- It asks, in order: **a file** (PNG, JPEG, SVG or PDF; one, by choosing or dropping it); for a PDF, **which page**
  (a number from 1, the first `(default)`); **a name** (the file's name without its ending `(default)`, at most
  `PDF_CUSTOM_STAMP_NAME_MAX_CHARS`, trimmed, never empty); **a category** (one of theirs, or a new one typed, at most
  `PDF_CUSTOM_STAMP_CATEGORY_MAX_CHARS`; `Custom` `(default)`). A preview shows the picture as it will be kept.
  **Create** makes it; **Cancel** and Escape make nothing.
- **The picture as kept** is made in the browser, never on the servers:
  - a PNG or a JPEG is kept as it came where it is at most `PDF_CUSTOM_STAMP_MAX_SIDE_PX` on its longer side and at
    most `PDF_STAMP_MAX_BYTES`; otherwise drawn smaller, as a PNG for a PNG and a JPEG for a JPEG, until it is both;
  - an SVG is drawn as a picture, by the browser, into a PNG at its own size held to `PDF_CUSTOM_STAMP_MAX_SIDE_PX`;
    its scripts and anything it would load are never run, as a picture drawn by the browser never runs them;
  - a page of a PDF is drawn by the engine at `PDF_CUSTOM_STAMP_PAGE_SCALE` pixels a point into a PNG, its paper
    white, held to `PDF_CUSTOM_STAMP_MAX_SIDE_PX` `(default)`.
- **Its natural size**: a page's size in points; the kept picture's pixels at 96 to the inch, three
  quarters of a point each `(default)`.
- Then its picture is sent ([Getting bytes in](../006-document/blob-store.md#getting-bytes-in)), asked first so bytes
  already held go nowhere, and the stamp is made: `POST /api/custom-stamps`. It becomes the stamp the Stamp control
  shows, the Stamp tool in hand `(default)`.

## Placing one

- **The Stamp control's grid** shows a person's custom stamps after Standard and Dynamic, a section a category in
  the order of their newest stamp, each cell its picture and its name; then **Create custom stamp…**. A guest's and
  a person's are their own: nobody sees another's.
- A custom stamp is placed as every stamp is, by a press with the Stamp tool in hand: at its natural size, at most a
  third of the page's width, its shape kept, centred on the press and held to the page.
- **Its picture is sent for the document first** (`?document=<id>`, participate access: a picture a Participant's
  change brings), asked first so bytes the document's owner holds go nowhere; the bytes are then the document
  owner's, held by the document while a mark names them
  ([Storage](live-editing-and-storage.md#storage)). The mark is made once they are held; a press while they are
  sent places nothing more.
- **The mark** is a stamp whose `stamp` is the custom stamp's id, its `lines` its name, its `picture` the key, the
  picture's type and its size in pixels. The mark holds no category: a category is their stamps', never a mark's.
- **The page draws its picture**, fetched from the document by its key
  ([Getting bytes out](../006-document/blob-store.md#getting-bytes-out)), across the stamp's box; a picture still on
  its way, or one that fails, draws the stamp's box outlined in its colour with its name.
- Selected, moved, resized, turned and deleted as every stamp is. Its colour is none: Format's colour and "Make this
  look the default" are not offered for it, and a colour given to marks selected with it leaves it as it is. Its
  mark still carries one, the Blue tone's `(default)`, which only its outlined box shows.
- **Their pictures are read once a page** and drawn for as long as it is open, as they are few and small
  (`PDF_STAMP_MAX_BYTES` each) `(default)`.
- **In the file** a custom stamp is a `Stamp` whose `Name` is `#` and its id, so Acrobat keeps its look when it turns
  it rather than drawing one of its own ([Marks](marks.md#in-the-file)); `Contents` its name; its appearance its
  picture across `BBox`, as an image of the picture's own pixels (a JPEG's bytes as they are, a PNG's as its colours
  and its see-through as a soft mask).
- **A bake is handed each picture its marks name**, by key; one missing, or whose bytes are not the type it says,
  refuses the bake by name (`pictures-unavailable`), never a stamp written without its picture `(default)`.
- **Read back**: LiveDoc's own custom stamp, while the live changes hold it, is read by its id as every mark is. A
  file's `Stamp` whose `Name` begins with `#` is a stamp LiveDoc does not draw: drawn as the file says, never selected
  ([Marks](marks.md#changing-a-mark)).

## Limits

| Constant                              | Value     | Why                                                                                                               |
| ------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------- |
| `PDF_STAMP_MAX_BYTES`                 | 2,097,152 | `(default)` A custom stamp's picture as kept (2 MiB): a stamp is small on its page; larger is drawn smaller first |
| `PDF_CUSTOM_STAMP_MAX_SIDE_PX`        | 1,200     | `(default)` A picture's longer side as kept: a third of an A4 page's width printed at 600 dpi; safe 600 to 2,400  |
| `PDF_CUSTOM_STAMP_PAGE_SCALE`         | 2         | `(default)` Pixels a point a PDF page is drawn at (144 dpi), before it is held to the longer side; safe 1 to 4    |
| `PDF_CUSTOM_STAMPS_MAX`               | 200       | `(default)` Custom stamps one owner keeps: more than any grid is read through; at the most, 400 MiB of pictures   |
| `PDF_CUSTOM_STAMP_NAME_MAX_CHARS`     | 64        | `(default)` A custom stamp's name: a cell's label                                                                 |
| `PDF_CUSTOM_STAMP_CATEGORY_MAX_CHARS` | 32        | `(default)` A category's name: a section's heading                                                                |

## API

`/api/custom-stamps`, owner-scoped (`requireOwner`): guests included.

| Request                              | Body                                                                                        | Answer                         |
| ------------------------------------ | ------------------------------------------------------------------------------------------- | ------------------------------ |
| `GET /api/custom-stamps`             |                                                                                             | `200 { stamps }`, newest first |
| `POST /api/custom-stamps`            | `{ id, name, category, picture: { key, type, width, height }, natural: { width, height } }` | `201 { stamp }`                |
| `PATCH /api/custom-stamps/:id`       | `{ name?, category? }`                                                                      | `200 { stamp }`                |
| `DELETE /api/custom-stamps/:id`      |                                                                                             | `204`                          |
| `GET /api/custom-stamps/:id/picture` |                                                                                             | `200` its picture's bytes      |

| Refusal                          | Status | When                                                                                                                                                                                                                                                         |
| -------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `custom_stamp_invalid`           | 400    | A field missing or of the wrong form: an id not `custom-<uuid>`, a name or category empty or too long, a type not `png` or `jpeg`, a size not a whole count up to `PDF_CUSTOM_STAMP_MAX_SIDE_PX`, a natural size not above 0 and up to `PDF_MAX_PAGE_POINTS` |
| `custom_stamp_exists`            | 409    | The id is taken (a create sent again)                                                                                                                                                                                                                        |
| `too_many_custom_stamps`         | 409    | The owner keeps `PDF_CUSTOM_STAMPS_MAX` already                                                                                                                                                                                                              |
| `custom_stamp_picture_missing`   | 409    | The owner holds no stored blob of the picture's key                                                                                                                                                                                                          |
| `custom_stamp_picture_too_large` | 413    | The blob held is larger than `PDF_STAMP_MAX_BYTES`                                                                                                                                                                                                           |
| `custom_stamp_not_found`         | 404    | No custom stamp of that id is the owner's (another's reads as none)                                                                                                                                                                                          |
| `blob_missing`                   | 404    | Storage no longer has the picture a custom stamp names (`GET .../picture`)                                                                                                                                                                                   |
| `files_unavailable`              | 503    | The deployment has no file storage                                                                                                                                                                                                                           |

- **Its picture is read back by its owner alone**, `GET /api/custom-stamps/:id/picture`: the bytes as kept, typed
  `image/png` or `image/jpeg`, `nosniff`, kept by the browser as a blob's are (`private`, a year, `immutable`, its
  key the `ETag`) `(default)`. The browser that made it keeps its bytes too, so it reads them from here only where it
  did not (another browser, signed in). Another's reads as `custom_stamp_not_found`.

## Share roles

- **Their stamps are a person's own**, outside every document: made, kept and listed for their owner alone.
- **On a shared PDF**, an Editor and a Participant place their own custom stamps, as any stamp; a Participant's
  picture is sent with participate access and becomes the document owner's bytes. A **Viewer** has no Stamp tool and
  places none ([Marks](marks.md#share-roles)).

## Errors

| When                                          | A person sees                                                                                                                   |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| The file cannot be read as a picture or a PDF | "That picture couldn't be read. Choose a PNG, JPEG, SVG or PDF."                                                                |
| The picture is still too large, drawn smaller | "That picture is too large for a stamp. Choose a smaller one."                                                                  |
| They keep the most custom stamps              | "You have the most custom stamps LiveDoc keeps (200). Delete one in Manage stamps first."                                       |
| Their files are full                          | "Your files are full. Free some space, then try again."                                                                         |
| Sending or making it fails otherwise          | "That stamp couldn't be made. Try again."                                                                                       |
| A custom stamp's picture cannot be placed     | "That stamp couldn't be placed. Try again."                                                                                     |
| A bake cannot read a picture its marks name   | "Some of this PDF's stamps need a picture that couldn't be read. Check your connection, then try again. Your changes are safe." |

## Telemetry and observability

- `Pdf · Created · CustomStamp` (one made; from a picture or a page alike), `Pdf · Added · Stamp.Custom` (one placed),
  `UI · Opened · PdfDocumentCustomStampDialog`. Never a stamp's name, category or picture.
- `[custom-stamps] created id=<id> bytes=<n>`, `[custom-stamps] refused reason=<refusal> owner=<id>`,
  `[custom-stamps] deleted id=<id>`, `[custom-stamps] picture-missing id=<id> key=<8>` in the api; `[pdf] pictures-missing count=<n> unfit=<n>` in the engine (a bake
  refused `pictures-unavailable`: a picture its marks name not handed in, or not the type it says); `[pdf] custom-stamp-made from=<picture|svg|pdf> bytes=<n>
scaled=<bool>`, `[pdf] custom-stamp-failed reason=<unreadable|too_large|too_many|files_full|failed|list>`, `[pdf] custom-stamp-placed held=<bool>`
  (false: its picture could not be sent, nothing placed), `[pdf] custom-stamps-read count=<n>`,
  `[pdf] custom-stamp-keep-skipped` (this browser would not keep a made stamp's bytes), `[pdf] stamp-picture-failed
key=<8>` (a picture the page or the grid could not read), `[pdf] picture-read-failed key=<8>` (one a bake could not
  read) in the browser.

## Tests

- The api: each request and each refusal, owner-scoping (another's reads as `custom_stamp_not_found`), the cap, the
  move on sign-up and the delete with the account, and the retention sweep keeping a picture a custom stamp holds.
- The package: a custom stamp mark's bounds, the bake's `Stamp` with `#` `Name`, its picture's image (JPEG as is, PNG
  with its soft mask) round trip, checked by qpdf; a file's `#` stamp read as one LiveDoc does not draw.
- The browser: the picture kept (scaled, SVG drawn, a PDF page drawn), the dialog's fields and errors, the grid's
  sections, placing (sent first, the mark), the page drawing the picture; e2e: a PNG made a stamp, placed, and in the
  downloaded file.
