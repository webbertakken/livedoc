# Text document corpus

Files other suites made, read by `src/corpus.test.ts` and `src/edits.test.ts`
([Office packages](../../../docs/specs/020-import-export/office-packages.md#validation)).
Each must read as its snapshot in `src/__snapshots__/corpus.test.ts.snap` says, and write back the same document.

| Folder         | Made by                                                                                                                                          | Licence                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| `libreoffice/` | LibreOffice 24.2 Writer, from `features-source.fodt` and `rich-source.html` (both written for this corpus)                                       | MIT, as this repository                      |
| `word/`        | Microsoft Word, from Apache POI's test data (`test-data/document/`); `encrypted-password-is-pass.docx` is POI's `bug53475-password-is-pass.docx` | Apache-2.0, © The Apache Software Foundation |

- Remaking `libreoffice/`: `soffice --headless --convert-to odt features-source.fodt`, then `--convert-to fodt` and
  `--convert-to docx` from the `.odt`; the same for `rich-source.html`.
- Google Docs' files join when exported from a document written for this corpus.
