# Dark pages

**Status: built.** The step in the engine's worker, photographs put back; the setting in Settings, View and the
toolbar, live; the first-time question.

The look (photographs kept as drawn) and the first-time question (a card, once per person) are `(default)`: the
director chose them on 2026-11-24 while Webber's answer is open; the drawn options are in the plan's assets.

**Dark pages** is one person's view of a [PDF document](pdf-document.md)'s pages shown dark: lightness inverted, hue
kept, pictures untouched. The file, Download, print and what anyone else sees never change (ruling C3). Webber: "Dark
pages, but it can be turned on or off with a setting as well, and it should ask the first time you enter a document
on dark mode." The research is [Dark pages](../../research/pdf-documents/dark-pages.md).

## What it is, and is not

- The surface's **chrome follows the scheme**, always, as all of LiveDoc does
  ([Colour scheme](../004-interface-design/color-scheme.md)).
- The **pages** are the author's: in either scheme they are drawn as the file says, unless the person has Dark pages
  on. A text document's page is dark paper in the dark scheme because LiveDoc knows which of its pixels is ink
  ([The page in the dark scheme](../034-text-documents/editing-surface.md#the-page-in-the-dark-scheme)); a PDF page
  arrives as drawing operators, so showing it dark is a recolouring, and a person's choice.
- Dark pages is **offered in the dark scheme only**. In the light scheme it is not listed, and a person who has it on
  sees paper pages there.
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
- It is **off until answered** ([The first-time question](#the-first-time-question)).
- The toolbar toggle carries `aria-pressed`, and its name and tooltip are "Dark pages" `(default)`.

## The first-time question

Fork F13 `(default)`.

- **Asked once per person, ever**: the first time a person opens a PDF document in the dark scheme (or switches to
  the dark scheme with one open), never once per document. Its answer follows the account, or this browser.
- **It never blocks reading.** It is a card anchored under the toolbar at the right, not a dialog: the pages scroll,
  zoom and select behind it, focus does not move to it, and it is announced politely once ("Question: show PDF pages
  dark?").
- **While it stands the pages show as paper**, so nothing is recoloured unasked.
- The card: the heading "Show PDF pages dark?", the line "Only your view changes. The file, downloads and prints stay
  as they are.", a small before and after of the open page side by side, and two buttons: **Use dark pages** and
  **Keep as they are**.
- Either button sets the setting and closes the card for good. Closing it another way (its ×, Escape while it has
  focus) leaves Dark pages off and counts as asked, with a one-line toast: "You can turn on Dark pages in the View
  menu."
- Leaving the document without answering asks again on the next PDF `(default)`: nothing was chosen.
- It is reachable by keyboard: F6 moves through the surface's regions and reaches the card (region `question`, after
  the notice); its buttons follow in tab order; Escape closes it and returns focus to where it was.
- On a phone the card spans the pages' width, under the toolbar.
- A Viewer, a Participant and an Editor are asked alike; a guest is asked once per browser.

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
- `Pdf · Opened · DarkPagesQuestion` when the card shows; `Pdf · Selected · DarkPagesQuestion.<Use|Keep|Dismissed>`
  when it closes.
- Fingerprints: `[pdf] dark-pages step ms=<n> pictures=<n>` (the first, then one in `DARK_PAGES_LOG_EVERY`),
  `[pdf] dark-pages asked`, `[pdf] dark-pages on=<yes|no>` (a choice), `[pdf] dark-pages not-saved`.

## Errors

- The step failing on a tile shows the tile as the file says and logs `[pdf] dark-pages step-failed`; it never shows
  a blank or half-recoloured tile.
- The setting failing to persist keeps the choice for this open and says "Your choice couldn't be saved. It applies
  until you close this PDF."
