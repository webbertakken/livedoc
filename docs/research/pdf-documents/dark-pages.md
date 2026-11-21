# Dark pages

How a PDF's pages are shown dark to one person (ruling C3) without the file, a print or anyone else's view changing.
Researched November 2026 on six corpus pages: a paper's first page, a page of charts, a page of highlights, a tax
form, a page with a photograph and a screenshot, and a grey scan.

The precedent is the text document's dark paper
([Editing surface](../../specs/034-text-documents/editing-surface.md#the-page-in-the-dark-scheme)): paper `#1e1f20`,
ink `#e3e3e3`, "dark text is drawn light and a pale fill dark, each keeps its hue and chroma", pictures as they are.
A PDF differs in one way that matters: its page arrives as drawing operators, so LiveDoc does not know which pixel
is ink.

## The designs

| Design                                  | How                                                                                      | Paper and ink             | Coloured text and highlights                                           | Pictures                                                                | Cost a page (612 by 792)           |
| --------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------- |
| **1. A CSS filter**                     | `invert(1) hue-rotate(180deg)` on the page's canvas                                      | Pure black and pure white | Hue kept                                                               | Inverted too: a photograph reads as a negative with shifted colours     | None on the CPU (the compositor's) |
| **2. The engine's forced colours**      | PDFium's `FPDF_RenderPageBitmapWithColorScheme_Start`: one colour for all text and paths | Paper and ink exact       | Lost: every colour becomes the ink; a pale fill becomes a block of ink | Untouched                                                               | 5 to 23 ms, a second rendering     |
| **3. Lightness mirrored on the raster** | Each pixel to OKLab, its lightness flipped onto paper and ink, hue and chroma kept       | Paper and ink exact       | Hue kept                                                               | Mirrored too: a logo reads dim, a photograph as a negative in lightness | 5 to 12 ms in plain JavaScript     |
| **4. Mirrored, photographs put back**   | Design 3, then every photograph's box copied back from the page as drawn                 | Paper and ink exact       | Hue kept                                                               | Photographs untouched; chart bars drawn as pictures still mirrored      | Design 3 plus under 1 ms           |
| CSS blending                            | `mix-blend-mode: difference` over white                                                  | As a plain inversion      | Hue inverted                                                           | Inverted                                                                | None                               |

All verified by the spike's output and its contact sheets (kept beside the plan: `plans/assets/0022/dark-pages/`).

What the pages showed:

- **Design 2 loses what a reader marked.** Highlights, the form's shaded cells and a chart's bars all become the one
  ink colour; the chart's white plot area becomes a pale block. It is a high-contrast mode, not Dark pages.
- **Design 1 is free and wrong on pictures**, and its paper is pure black beside LiveDoc's `#1e1f20`. It cannot
  spare a picture, since the filter covers the canvas.
- **"A picture" needs a rule.** The engine reports each picture's box (`FPDFPageObj_GetBounds`, walking into form
  objects), but a picture is not always a photograph:
  - the charts page holds 57 small pictures that are the bars of its charts: put back as they are, they glare;
  - the scan is one picture that is the whole page: left untouched, Dark pages does nothing for scans.
- The rule the spike settled on: a picture is **put back** when it covers under 85% of the page and shows at least 48
  distinct colours (5 bits a channel, sampled); otherwise it is ink and paper like the rest. On the six pages that
  keeps the photograph, the logo and the screenshot, and mirrors the chart bars and the scan (verified: the sheet).
- **A straight mirror costs contrast.** A grey that meets 4.5:1 on white (`#767676`) lands at 3.2:1 on dark paper,
  because the mirrored range (`#1e1f20` to `#e3e3e3`) is narrower than white to black. Bending the mirror with an
  exponent of 0.65 on the flipped lightness keeps every grey that met 4.5:1 at or above it (`#767676` at 4.8:1,
  `#6b6b6b` at 5.2:1), with black still at 12.8:1 (verified: computed for seven greys).

## Recommendation

**Design 4**, with the bent mirror:

- The engine draws the page as the file says, always. Dark pages is a step after it, in the engine's worker, on the
  tile about to be shown: lightness `L` becomes `paper + (1 - L)^0.65 × (ink - paper)` in OKLab, hue and chroma kept,
  then photographs are copied back by the rule above.
- So nothing of it can reach the file, a download, a print, a thumbnail or another person: those never pass through
  the step. The file's own bytes and the engine's own rendering are untouched by construction.
- Marks made in LiveDoc are drawn by the same step, so a yellow highlight is the same deep yellow whether it came
  with the file or was made a second ago.
- Tiles are cached per look (paper or dark), so switching the setting redraws from the cache or re-runs only the
  step, never the engine.
- Constants, each a default with a safe range: `DARK_PAGES_CURVE` 0.65 (0.5 to 0.7), `DARK_PAGES_PICTURE_COLOURS` 48
  (32 to 128), `DARK_PAGES_PAGE_PICTURE_SHARE` 0.85 (0.7 to 0.95).
- Open, for Phase 7's four drawn options (F13 is asked with them): whether a photograph on dark paper is dimmed a
  little, as some readers do, or left exactly as it is, which is what C3's "pictures untouched" says.

## Cost

- The step is 5 to 12 ms for a 612 by 792 pixel page in plain JavaScript with a per-colour cache (verified). A tile at
  twice the density is four times the pixels: 20 to 50 ms (inferred). A WebGL or WebGPU pass would take it to under
  a frame (assumed, not built); Phase 4 measures it on the tracer bullet before choosing.
