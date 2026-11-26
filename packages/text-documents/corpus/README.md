# Text document corpus

Files other suites made, read by `src/corpus.test.ts` and `src/edits.test.ts`
([Office packages](../../../docs/specs/020-import-export/office-packages.md#validation)).
Each must read as its snapshot in `src/__snapshots__/corpus.test.ts.snap` says, and write back the same document.

| Folder         | Made by                                                                                                                                                                                                                             | Licence                                                                     |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `libreoffice/` | LibreOffice 24.2 Writer, from `features-source.fodt`, `rich-source.html`, `suggestions-source.docx`, `suggested-blocks-source.docx`, `suggested-rows-source.docx` and `story-suggestions-source.docx` (all written for this corpus) | MIT, as this repository                                                     |
| `word/`        | Microsoft Word, from Apache POI's test data (`test-data/document/`); `encrypted-password-is-pass.docx` is POI's `bug53475-password-is-pass.docx`                                                                                    | Apache-2.0, © The Apache Software Foundation                                |
| `google/`      | Google Docs' own export of `libreoffice/features.docx`: `.docx` from a Google Doc, `.odt` (written by its LibreOfficeDev 6.0.5.2 converter)                                                                                         | MIT, as this repository; the `.odt`'s embedded Liberation fonts SIL OFL 1.1 |

- Remaking `libreoffice/`: `soffice --headless --convert-to odt features-source.fodt`, then `--convert-to fodt` and
  `--convert-to docx` from the `.odt`; the same for `rich-source.html`. `suggestions.fodt` is
  `soffice --headless --convert-to fodt suggestions-source.docx` (LiveDoc wrote the `.docx`: every kind of suggestion).
  `suggested-blocks.fodt` is `soffice --headless --convert-to fodt suggested-blocks-source.docx` (the `.docx` written by
  hand as Word writes tracked blocks: a table of contents, a table inserted with another author's text inside, a table
  deleted, a section break inserted and one deleted). `suggested-rows.fodt` likewise from `suggested-rows-source.docx` (by hand: a row
  inserted with another author's text inside, a row deleted, a column inserted (`w:cellIns`), a column deleted).
  `story-suggestions.fodt` likewise from `story-suggestions-source.docx` (LiveDoc wrote it: a header's text a suggested
  insertion); LibreOffice lists a header's tracked changes inside the header.
- Remaking `google/`: open `libreoffice/features.docx` in Google Docs, save it as a Google Doc, then File > Download as
  Microsoft Word (.docx) and OpenDocument Format (.odt).
