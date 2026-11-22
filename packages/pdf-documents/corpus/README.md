# PDF corpus

Files other software made, read by `src/engine/corpus.test.ts` and, in CI, by `src/validation/corpus.validate.ts`
([Opening](../../../docs/specs/035-pdf-documents/opening.md), [Saving](../../../docs/specs/035-pdf-documents/saving.md#the-validators-claim)).
Each opens with the pages `manifest.json` says, or is refused by the name it says; none is changed by being read.

| Folder    | From                                                                                               | Licence                                      |
| --------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `pdfium/` | PDFium's `testing/resources`, as they are: the smallest file of each thing a reader meets in a PDF | BSD-3-Clause, its notice in `pdfium/LICENSE` |

- `manifest.json` names each file with what it holds, its SHA-256 and size, its pages or the refusal it is met with,
  its open password where it has one, whether it opens only by being repaired, and whether the writer cannot open
  it (a password outside ASCII under the older security handlers: it is read, and a bake of it is refused by name).
- Only files under a permissive licence, or made by LiveDoc's own scripts, live here
  ([The corpus and the validators](../../../docs/research/pdf-documents/corpus-and-validators.md#licences-and-what-may-live-in-the-repository)).
  Files tests make themselves are in `src/testing/fixtures.ts`, never committed as files.
- The wider corpus (other projects' test files under other terms) is fetched by `scripts/fetch-pdf-corpus.sh`, each
  file pinned by its SHA-256, into a cache outside the repository; CI's Office files job keeps it between runs.
