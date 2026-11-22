# PDF corpus

Files other software made, read by `src/engine/corpus.test.ts` and, in CI, by `src/validation/*.validate.ts`
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
  file from its project at a pinned commit and held to its SHA-256, into a cache outside the repository
  (`PDF_CORPUS_DIR`, else `~/.cache/livedoc/pdf-corpus`); CI's Office files job keeps it between runs.
- `fetched.json` says what is expected of each file of the wider corpus: its pages or the refusal it is met with,
  its open password, whether it opens only by being repaired, and where its first page stands apart from the second
  renderer's: the ceiling of its measured share of differing pixels and what differs, or why the second renderer
  draws none. Its `derived/` files are made in the run, with qpdf, from the paper the cache holds.
- The second renderer is PDF.js on a canvas for Node, fetched into the same cache from the npm registry and held to
  its SHA-256. It is a tool of the validation and no dependency of the workspace: a canvas package anywhere in the
  workspace is picked up by jsdom, and every app's tests would then run against a real canvas. Its canvas is the
  build for Linux on x64, CI's machine.
- To add a file: add its `fetch` line to the script with its SHA-256, run
  `pnpm --filter @livedoc/pdf-documents validate:files`, and write its entry in `fetched.json` from what the run
  says. A page past the tolerance is looked at before it is named: what differs is a sentence, never a number alone.
