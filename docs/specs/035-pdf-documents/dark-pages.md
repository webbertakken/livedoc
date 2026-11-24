# Dark pages

**Status: built.** The step in the engine's worker, photographs put back; the setting in Settings, View and the
toolbar, live; the pages following the scheme until turned off.

The look (photographs kept as drawn) is `(default)`: the director chose it on 2026-11-24; the drawn options are in
the plan's assets.

**Dark pages** is one person's view of a [PDF document](pdf-document.md)'s pages shown dark: lightness inverted, hue
kept, pictures untouched. The file, Download, print and what anyone else sees never change (ruling C3). Webber:
"I want PDFs to also do this, display dark for dark theme, light for light theme": a PDF's pages follow the colour
scheme as a text document's paper does. His earlier ruling ("it should ask the first time you enter a document on
dark mode") is replaced by it: nothing is asked. The research is [Dark pages](../../research/pdf-documents/dark-pages.md).

## What it is, and is not

- The surface's **chrome follows the scheme**, always, as all of LiveDoc does
  ([Colour scheme](../004-interface-design/color-scheme.md)).
- The **pages follow the scheme too**: dark in the dark scheme, paper in the light one, as a text document's page is
  ([The page in the dark scheme](../034-text-documents/editing-surface.md#the-page-in-the-dark-scheme)). A PDF page
  arrives as drawing operators, so showing it dark is a recolouring, which a person may turn off for their own view.
- Dark pages is **offered in the dark scheme only**. In the light scheme it is not listed, and the pages are paper
  there, whatever the setting.
- It is **never in a file**: not in a download, a bake, a print, a thumbnail, a share card, an agent's preview, a
  version's rendering or another person's view. Those never pass through the step that makes it.

## The recolouring

The engine draws each tile as the file says. Dark pages is a step after it, in the engine's worker, on the tile about
to be shown:

- **Lightness is mirrored**, hue and chroma kept: in OKLab, a pixel's lightness `L` becomes
  `paper + (1 - L)^DARK_PAGES_CURVE × (ink - paper)`, where paper is the text document's dark paper (`#1e1f20`) and
  ink its ink (`#e3e3e3`). White paper takes dark paper's lightness, neutral as white is (`#1f1f1f`); black text
  becomes ink; a red heading stays red.
- **The curve keeps contrast**: a straight mirror would turn a grey that meets 4.5:1 on white into one that does not
  on dark paper. With the curve, every grey that met 4.5:1 on white stays at or above it on dark paper.
- **Photographs are put back** `(default)`. A picture is copied back as the file drew it when it covers less than
  `DARK_PAGES_PAGE_PICTURE_SHARE` of the page and shows at least `DARK_PAGES_PICTURE_COLOURS` distinct colours;
  otherwise it is ink and paper like the rest.
- **A picture is judged once a page**, never a tile: its colours are counted on it drawn alone, its longer side
  `DARK_PAGES_PICTURE_SAMPLE_PX`, so every tile and scale of one picture decides alike `(default)`.
- Only a picture of more than one bit a pixel and at least `DARK_PAGES_PICTURE_MIN_SIDE` pixels a side is judged. So a photograph, a logo and a screenshot stay as they are; a chart
  whose bars are tiny pictures, and a scanned page that is one picture, are mirrored.
- **Marks, fields, signatures and selections** made in LiveDoc pass through the same step, so a yellow highlight is
  the same deep yellow whether it came with the file or was made a second ago.
- **Tiles are kept per look** (paper or dark): switching draws the pages in view again, the latest asked first.
- **The left panel's thumbnails** are this person's view too, so they show dark with the pages `(default)`.
- The page's edge and the ground are the shell's tokens, unchanged by the step.

## The setting

- **One setting, a person's**: Dark pages on or off. It follows the account when signed in, and this browser
  otherwise, as the colour scheme's preference does ([Preferences](../007-editor/user-preferences.md)).
- **Three places, one value**: Settings > Appearance > **Dark Pages** ("Show PDF pages dark in the dark colour
  scheme. Only your view changes."), the surface's **View > Dark pages** check, and the toolbar's Dark pages toggle in
  Viewing.
- **Live**: flipping it recolours the open pages without a reload, in every open PDF document of that person's
  browser.
- It is **on until turned off**: a person who never touched it sees dark pages in the dark scheme; turning it off
  is kept, and shows the pages as the file says in both schemes `(default)`.
- The toolbar toggle carries `aria-pressed`, and its name and tooltip are "Dark pages" `(default)`.

## Limits

| Constant                        | Value | Safe range  | Why                                                                                                 |
| ------------------------------- | ----- | ----------- | --------------------------------------------------------------------------------------------------- |
| `DARK_PAGES_CURVE`              | 0.65  | 0.5 to 0.7  | `(default)` `#767676`, 4.5:1 on white, lands at 4.8:1 on dark paper; black at 12.8:1                |
| `DARK_PAGES_PICTURE_COLOURS`    | 48    | 32 to 128   | `(default)` Distinct colours, 5 bits a channel, sampled: a photograph has more, a chart's bar fewer |
| `DARK_PAGES_PAGE_PICTURE_SHARE` | 0.85  | 0.7 to 0.95 | `(default)` A picture covering more of the page is a scanned page, not a photograph                 |
| `DARK_PAGES_STEP_BUDGET_MS`     | 16    | 8 to 50     | `(default)` A tile's step; past it the step moves to the GPU. Set by measurement                    |
| `DARK_PAGES_PICTURE_SAMPLE_PX`  | 96    | 64 to 256   | `(default)` The longer side a picture is drawn at to count its colours                              |
| `DARK_PAGES_PICTURE_MIN_SIDE`   | 64    | 32 to 128   | `(default)` Pixels a side, in the file, of the least picture judged a photograph                    |
| `DARK_PAGES_LOG_EVERY`          | 50    | 1 to 1,000  | `(default)` A step is logged for the first, then one in this many                                   |

## Share roles

Dark pages is a view, so every role has it alike; it changes nothing anyone else can see and is gated on nothing.

## Accessibility

- Text and controls that met 4.5:1 on paper meet it on dark paper; a colour pair the file itself drew below 4.5:1
  is not made worse.
- Dark pages is independent of forced colours: where the system forces colours, the pages stay as the file says and
  Dark pages is not offered, since the system's own palette must win.
- Nothing about Dark pages is conveyed by colour alone: the toggle has a pressed state and a name.

## Telemetry and observability

- `Pdf · Toggled · <DarkPagesOn|DarkPagesOff>` wherever it is flipped, fired before the setting is persisted.
- Fingerprints: `[pdf] dark-pages step ms=<n> pictures=<n>` (the first, then one in `DARK_PAGES_LOG_EVERY`),
  `[pdf] dark-pages on=<yes|no>` (a choice), `[pdf] dark-pages not-saved`.

## Errors

- The step failing on a tile shows the tile as the file says and logs `[pdf] dark-pages step-failed`; it never shows
  a blank or half-recoloured tile.
- The setting failing to persist keeps the choice for this open and says "Your choice couldn't be saved. It applies
  until you close this PDF."
