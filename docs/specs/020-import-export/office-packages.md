# Office packages

**Status: built** for both formats' containers, metadata, units, colours, pictures' headers and validation; embedded
fonts wait for the document fonts.

The **office packages** are the shared layer every office file LiveDoc reads or writes stands on, for both native
formats (fork C1, ruled: ODF and OOXML both native): the **ODF package** and the **OOXML container**, their manifests and
relationships, metadata, common styles, units and colours, embedded files, and ODF's flat single-XML form. The
[text document](../034-text-documents/text-document.md) and the spreadsheet of plan 0020 each map their own content
onto it ([Standard mapping](../034-text-documents/standard-mapping.md)); neither forks a second one. The code is one
DOM-free package, `@livedoc/office-packages`, so the editor, the api, the MCP server and the CLI read and write the same
bytes.

## Domain language

| Term                | Means                                                                                                                                                               | Never called           |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| **package**         | An office file as a zip: an ODF package or an OOXML container                                                                                                       | archive, bundle        |
| **ODF package**     | `mimetype`, `META-INF/manifest.xml`, `content.xml`, `styles.xml`, `meta.xml`, `settings.xml`, pictures                                                              | OpenOffice file        |
| **OOXML container** | An Open Packaging Conventions zip: `[Content_Types].xml`, `_rels/.rels`, parts and their `.rels`                                                                    | Word file (in specs)   |
| **flat file**       | An ODF document as one XML file (`office:document`), pictures inline as base64                                                                                      | XML export             |
| **entry**           | One file inside a package (OOXML calls it a part)                                                                                                                   | blob                   |
| **relationship**    | An OOXML link from one part to another or to an outside address, by id                                                                                              | reference, link        |
| **media type**      | A document's kind as the package declares it (`application/vnd.oasis.opendocument.text`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`) | MIME (in copy), format |
| **kept content**    | Foreign elements, attributes and entries a reader does not map, kept to be written back                                                                             | unknown, unsupported   |

## Reading a package

1. The bytes start with a zip local header, or with `<?xml` for an ODF flat file; anything else is `package_damaged`.
2. **Budgets** apply before anything inflates: `PACKAGE_MAX_BYTES` on the file, `PACKAGE_MAX_ENTRIES` entries, one
   `PACKAGE_MAX_INFLATED_BYTES` budget shared across every entry (`package_too_large`). The shared zip reader counts
   as it inflates, never trusting a header's sizes.
3. Encrypted packages are refused: ODF's `manifest:encryption-data`; an OOXML file that is an OLE compound document
   (`EncryptionInfo`, a password-protected `.docx`) (`package_encrypted`).
4. **Which format**: an ODF package by its `mimetype` entry, else its manifest; an OOXML container by
   `[Content_Types].xml` and the main part `_rels/.rels` points at. A media type the caller does not read is
   `package_wrong_type` (a spreadsheet opened as a text document is offered as one, never misread).
5. Entry names are keys, never paths: a name with `..`, a leading `/` (other than OOXML's part names, resolved against
   the package root), a backslash or a drive letter is `package_damaged`.
6. XML is parsed by one non-validating streaming parser that never resolves entities; any `DOCTYPE` is
   `xml_doctype_refused`. Namespaces are resolved by URI, never by prefix; OOXML's `mc:AlternateContent` takes the
   first `mc:Choice` the reader understands, else `mc:Fallback`, and keeps the rest.
7. **Relationships** are read from each part's `_rels/<part>.rels` and resolved against the part's folder; a target
   that resolves outside the package is `package_damaged`. A part the content types do not name is kept with
   `application/octet-stream`.
   Relationships with `TargetMode="External"` are never followed on read (remote pictures, linked templates); they are
   kept and reported.
8. Dropped and reported, never kept: ODF `office:scripts`, `Basic/`, `Scripts/`; OOXML `vbaProject.bin`,
   `vbaData.xml` and their relationships (`.docm`, `.dotm`); ActiveX controls; OLE objects' binaries (their
   replacement picture stays); signatures (`META-INF/documentsignatures.xml`, `_xmlsignatures/`); thumbnails.
9. A picture whose header gives more than `PICTURE_MAX_PIXELS` is `picture_too_large`, read before any decoding.

## Writing a package

- **ODF**: `mimetype` first and stored, then `META-INF/manifest.xml` listing every entry with its media type,
  `content.xml`, `styles.xml`, `meta.xml`, `settings.xml`, pictures under `Pictures/` named by the SHA-256 of their
  bytes, `Thumbnails/thumbnail.png`; every XML entry declaring `office:version="1.4"`.
- **OOXML**: `[Content_Types].xml` first (a `Default` per extension of kept media, an `Override` per part),
  `_rels/.rels`, `docProps/core.xml`, `docProps/app.xml`, the main part and its
  `_rels`, `styles.xml`, `numbering.xml`, `settings.xml`, `fontTable.xml`, comment and note parts as used, media under
  `media/` named by the SHA-256 of their bytes; relationship ids assigned in order of first use, after the ids of
  kept relationships, which never change ([Kept content](../034-text-documents/standard-mapping.md#kept-content)).
- Every XML entry is UTF-8 and declares only the namespaces it uses.
- **Deterministic**: the same document gives the same bytes (fixed entry order, zip timestamps of 1980-01-01, fixed
  attribute order, automatic styles and relationship ids assigned in a fixed order).
- The ODF flat file follows the same order inside one `office:document`, with `office:mimetype` set.

## Common pieces

- **Units**: lengths read in `cm`, `mm`, `in`, `pt`, `pc`, `px` (ODF) and twentieths of a point, half-points and EMUs
  (OOXML); the model holds points as numbers rounded to three decimals; ODF lengths are written in points to three
  decimals, OOXML's in its own units, so a length read and written comes back equal.
- **Colours**: `#rrggbb` (ODF) and `rrggbb` or `auto` (OOXML) in and out; OOXML theme colours resolved through the
  theme part and the theme reference kept.
- **Metadata**: one `DocumentMetadata` for both formats (ODF `meta.xml`, OOXML `docProps/core.xml` and `app.xml`),
  whose unmapped children are kept: title (the document's name), creator, creation and modification dates, language, the generator
  `LiveDoc/<version>`, statistics (pages, paragraphs, words, characters).
- **Styles**: font declarations, named styles and defaults, automatic styles (ODF) and direct formatting (OOXML), with
  inheritance resolved by parent (ODF `style:parent-style-name`, OOXML `w:basedOn`).
- **Embedded files**: pictures (PNG, JPEG, GIF, SVG, WebP, EMF and WMF kept as bytes with their fallback picture),
  equations, embedded fonts (ODF `svg:font-face-uri`; OOXML obfuscated `w:embedRegular` fonts, de-obfuscated) handed
  only to the browser's font loader. Pictures' media types, pixel sizes and resolutions are read from their headers
  (PNG, JPEG, GIF, WebP; resolution from PNG `pHYs` and JPEG JFIF).

## Validation

- Every file LiveDoc writes is validated in CI against **its own format's schema**: ODF against the OASIS ODF 1.4 RELAX
  NG schemas (main and manifest) with Jing (`-i`), ID-type checks off, after removing `livedoc:`, `loext:` and kept content as
  extended conformance defines; OOXML against the ISO/IEC 29500 Transitional XML schemas (WordprocessingML, DrawingML,
  OPC content types and relationships, SpreadsheetML) after removing the namespaces `mc:Ignorable` names and kept
  content. A test writes one file per construct of the mapping, in each format, and validates each, for text documents
  and spreadsheets alike.
- SpreadsheetML's text (`t`) leaves out `xml:space`, which Excel and LibreOffice write and Excel reads to keep a
  text's edge spaces; LiveDoc writes it only on such text, and the check removes it, the one attribute it removes that
  the file means.
- The check is one module, `@livedoc/office-packages/validation` (Node only), and the script that fetches the schemas
  is the office packages' `scripts/fetch-office-schemas.sh`; each package's `validate:files` runs its own constructs.
- The OOXML schemas are ECMA-376 Part 4's Transitional RELAX NG (compact syntax) and Part 2's OPC schemas, checked by
  Jing too (`-c`). Schemas and Jing are fetched from their publishers by the validation script, each pinned by its
  SHA-256, into a gitignored cache; nothing of them is committed. CI's **Office files** job runs the validation.
- A fetch that fails is retried (five times, on any HTTP error), then tried at the next mirror where one is listed
  (Jing: Maven Central, then its Google-hosted mirror); every failing address is named.
- CI keeps the fetched schemas in its cache, keyed on the script that pins them, so a run with the cache reaches no
  outside host.
- A **corpus** of files made by LibreOffice, Microsoft Word and Google Docs, in both formats, lives with the tests, each
  with the structure it must read as, and its maker and licence in the corpus's `README.md`.

## Named rejections

| Rejection             | When                                                                                           |
| --------------------- | ---------------------------------------------------------------------------------------------- |
| `package_damaged`     | Not a zip or flat file; a bad entry name or relationship target; a corrupt entry; no main part |
| `package_too_large`   | Past a byte or entry budget                                                                    |
| `package_encrypted`   | An encrypted entry or an encrypted OOXML file                                                  |
| `picture_too_large`   | A picture past `PICTURE_MAX_PIXELS`                                                            |
| `package_wrong_type`  | A media type the caller does not read                                                          |
| `xml_doctype_refused` | A `DOCTYPE` in any XML entry                                                                   |
| `xml_malformed`       | XML that does not parse; the entry and line are in the report                                  |

## Observability

Fingerprints, never content: `[package] read` (format, media type, entries, bytes, milliseconds), `[package] refused`
(rejection, entry), `[package] dropped` (scripts, macros, signatures, external relationships), `[package] written`
(format, bytes, milliseconds).
