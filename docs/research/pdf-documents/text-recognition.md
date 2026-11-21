# Text recognition

A scan has no text to select, search, mark or read aloud (fork F10). What recognising it in the browser costs and
gives. Researched November 2026 with a spike.

## Engines that may ship

| Engine                                                 | Licence                             | Runs                                                   | Verdict                                                                          |
| ------------------------------------------------------ | ----------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Tesseract (`tesseract.js` 7.0.0, core 6.1.2)           | Apache-2.0 (verified: npm registry) | WebAssembly, in a worker                               | The candidate: 100+ languages, one data file each                                |
| Scribe.js (`scribe.js-ocr` 0.18.3)                     | AGPL-3.0 (verified: npm registry)   | WebAssembly                                            | Refused by the licence gate                                                      |
| A detection and recognition model pair on ONNX Runtime | Apache-2.0 models (assumed)         | The runtime LiveDoc already ships for the photo import | Strong on photographs of text; two models and a data file per script; not spiked |
| A recognition service                                  | n/a                                 | Someone else's server                                  | Refused: a required outside service, and the file would leave                    |

## Weight

- The engine: 2.86 MB of WebAssembly (LSTM only; 1.06 MB gzipped: verified).
- A language: English is 2.95 MB compressed in the compact integer form (`best_int`), 10.9 MB in the full form
  (verified: the data package). Each further language is a file of its own, fetched only when chosen.
- All of it loads only when someone asks for recognition; a PDF with real text never needs it.
- The data is served from LiveDoc's own origin (the plan's default), so recognition works self-hosted and offline
  once fetched, and no file or word leaves the browser.

## Accuracy and speed

Measured on a page whose words are known: the first page of a two-column paper (750 words, 9 point type), drawn as a
picture at four resolutions, clean and roughed up as a phone scan is (grey, turned 1.2 degrees, blurred, noisy).
"Found" is the share of the page's words read correctly; time is one page on one thread (verified by the spike).

| Resolution | Clean: found | Rough: found | Time a page  |
| ---------- | ------------ | ------------ | ------------ |
| 100 dpi    | 69.6%        | 37.3%        | 2.6 to 2.9 s |
| 150 dpi    | 92.3%        | 87.9%        | 3.2 to 3.7 s |
| 200 dpi    | 92.8%        | 92.1%        | 4.0 to 4.5 s |
| 300 dpi    | 95.6%        | 97.6%        | 4.2 to 4.9 s |

- Recognition is good enough to **find and select** (9 words in 10 at 150 dpi and above) and not good enough to
  **edit** the words as if they were the author's: one word in twenty wrong at best, on dense small type.
- A scan's own resolution decides: the corpus's grey scan is 2,550 by 3,300 pixels on a Letter page, 300 dpi
  (verified: the engine reports the picture's size).
- A 100-page scan is about seven minutes on one thread; workers in parallel divide it by the cores given (inferred).
  So it runs page by page, visible pages first, with progress and cancel, and its result is kept.

## What recognition writes

| Design                                                         | For                                                                                                   | Against                                                                        |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **A. An invisible text layer in the file**                     | Every reader then selects and searches it; it is what Acrobat writes; search and agents get the words | It changes the page's content (a rewrite, so fork F8 applies to a signed scan) |
| **B. Kept beside the file, in LiveDoc only**                   | The file is untouched; nothing to invalidate                                                          | Only LiveDoc finds the words; the download is still a picture                  |
| **C. Both: beside the file at once, into the file when asked** | Search works at once for everyone here; the file changes only by a person's choice                    | Two homes for the same words                                                   |

**Recommended: C.** Recognition's words join the layer as each page is read (so everyone on the document can search
them), and **Recognise text in the file** is an Editing action that writes them as invisible text
(text render mode 3: verified, `FPDFTextObj_SetTextRenderMode` is in the build).

## For F10

- The default holds: recognition in the browser, on demand, language data from LiveDoc's own origin, an invisible
  layer, and editing a scan's words left out.
- The numbers to ask with: 4.0 MB fetched for the engine and English, once; about 4 s a page; 9 words in 10 found
  at 150 dpi, 19 in 20 at 300 dpi; each further language about 3 MB.
