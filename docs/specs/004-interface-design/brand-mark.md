# Brand mark

The LiveDoc logo is the **Page Stack**: three isometric glass sheets fanned back from the viewer, each a different
kind of document. In front, a page with a folded corner and lines of text; behind it, a plain sheet; at the back, a
sheet with grid cells along its exposed edge. It reads as "documents of every kind, held together". The **wordmark**
beside it reads `LiveDoc`, with `Live` in the accent and `Doc` in ink.

## The mark

- Three sheets of one size, back to front: the **sheet** (grid cells), the **plain sheet** and the **page** (folded
  corner, text lines). Each stands in the same isometric plane and sits one step behind and above the next, so the
  stack climbs to the right.
- Each sheet is a gradient over one **prism palette**, six stops from light to dark: `light`, `vivid`, `primary`,
  `deep`, `dark` and `highlight`. The page wears the brightest gradient, the sheet at the back the deepest, so the
  stack reads front to back.
- The text lines, the grid cells and each back sheet's top and right edges are drawn in `highlight`, so every sheet
  holds its outline against the one in front of it.
- The brand palette is sky into blue into deep indigo.

## Two drawings

| Drawing   | Where                                                     | What it carries                                                                                   |
| --------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `compact` | Below 48px: the header, favicons, list icons, small tiles | The three sheets, the page's folded corner and two bold text lines                                |
| `full`    | From 48px up: app icons, social cards, large marketing    | Four finer text lines, the grid cells on the back sheet, and a glass sheen along the page's edges |

The detail in `full` is under a pixel wide at header size, so `compact` carries fewer, bolder lines instead.

## Light and dark

The mark has a light and a dark palette. Dark is brighter in its mid stops and darker at its deepest stop, so the
stack holds its edges on a dark surface. The mark follows the page's scheme wherever it is drawn live. Favicons follow
the browser's `prefers-color-scheme`. Static rasters (PNG icons, the Apple icon, social cards) use the light palette.
The email mark (`apps/marketing/public/email/livedoc-mark-64.png`) is a transparent light-palette PNG so it sits
cleanly on the tinted page behind each email ([Transactional email](../014-identity/transactional-email.md)); its path
never changes, because every email ever sent points at it.

## Theme accent

In the editor the mark, drawn without the wordmark, takes the active tab's theme accent (its element stroke). One accent
becomes a whole prism palette: the brand palette's shape (how much lighter, darker, more or less vivid and how far round
the hue wheel each stop sits from `vivid`) is carried onto the accent. So a pink theme gives a pink glass stack with
the same depth as the blue one.

- Lightness stays near the brand's, moving at most a little toward the accent, so a near-black or pale theme accent
  still gives a stack that reads on both light and dark headers.
- A grey accent gives a grey stack.
- A theme with no accent (the default) shows the brand palette exactly.
- A theme change crossfades the colours over the micro duration; reduced motion skips it.

## Mono

On a solid brand tile (marketing's comparison badges) the mark draws in one colour, the tile's text colour, each sheet
at its own opacity so the stack still shows. The page's text lines and the grid cells are cut out of their sheets, so
the tile shows through them.

## Wordmark

`Live` is the accent: `brand-600` in light mode, `sky-400` in dark, or the theme accent in the editor. `Doc` is the
surrounding ink (`slate-900`, `slate-100` in dark). The name is written `LiveDoc`, never with the domain. The wordmark
is a logotype, which WCAG 1.4.3 exempts from contrast minimums, and the contrast audits skip it by its
`data-logotype` mark. The wordmark never animates: it stands still while the mark beside it moves. The plain-text wordmark in email follows the same split: `Live` in brand blue, `Doc` in ink.

## Size and motion

The mark sits a size up from the wordmark text, since a solid stack reads smaller than a line icon in the same box,
with a small gap between them:

| Size | Where                     | Mark | Wordmark | Gap  |
| ---- | ------------------------- | ---- | -------- | ---- |
| `sm` | The marketing hero's mock | 20px | 16px     | 8px  |
| `md` | Site headers              | 28px | 18px     | 10px |
| `lg` | The site footer           | 40px | 24px     | 12px |

The editor has no header: its logo is the mark alone, 24px, **without the wordmark**, after the back caret in the
brand group ([Toolbar layout](../007-editor/toolbar-layout.md#the-top-line)).

The mark moves in four ways, each once and each kept to the logo in the site headers and the editor's brand group unless named; the
wordmark holds still through all of them:

**Assemble, as a page loads.** On a full load or a refresh, the header logo builds itself from nothing, before any
script runs:

- The three sheets drop into place back to front, each from a little above, with a soft overshoot.
- The back sheet's grid cells pop in (`full` only), the page's text lines draw from left to right, and the page's
  corner folds down.
- It takes about 1.7 seconds and plays once per load: moving between pages in the app does not replay it.

**Fan, on pointing.** Pointing at the logo, or reaching it by keyboard, fans the stack open:

- The sheets spread apart along the stack's direction, each one more step from the page in front of it, over 700ms,
  easing out, and hold open for as long as the pointer stays.
- On leaving, the stack closes over 450ms, easing out.
- Touch has no hover, so a tap never starts it.

**Press, on clicking.** Pressing the logo (pointer down, or Enter or Space held) draws the sheets a little closer
together and the mark a touch smaller; letting go eases them back. It is small and quick, with no bounce: a
response, not a show.

**Every kind, on the marketing homepage.** Above the hero's question, "What are you making today?", the mark stands
on its own, larger, and its page cycles through the kinds of document LiveDoc makes, with the name beneath: a page,
a sheet, a board and a form, each for a moment, the page lifting slightly as it changes. It runs while it is on
screen and pauses when scrolled away.

Reduced motion holds every one of them still: the assembly and the press become a short fade of the mark, the fan
does not run, and every kind swaps its content with a plain crossfade at a slower pace.

Its pace is listed in [Motion](./motion.md) beside the other hover stories.

## Icons and media

Every surface that shows LiveDoc outside a page gets the mark in the size and form it asks for:

- **Web:** an SVG favicon that follows the browser's scheme, a PNG fallback, and `/favicon.ico` for browsers and
  tools that ask for it by name.
- **Install:** the web app manifest's icons at 192 and 512px, the mark on a transparent ground for `any` (what the
  browser's install dialog and desktop launchers show, so no white square frames it), inside the 80% safe zone on a white tile for `maskable` (so a circle or squircle mask never clips a sheet), and a single-colour `monochrome`
  silhouette for themed launchers.
- **iOS:** an opaque 180px home-screen tile (iOS paints transparency black), with the home-screen title `LiveDoc`.
- **Social:** the share cards (the site's, each feature page's and each help article's) carry the full mark.
- **Email:** the transparent mark beside the plain-text wordmark.
- **Press:** the mark and the lockup (mark plus wordmark) as SVG in light, dark and mono, and as PNG.

`pnpm icons:brand` (`apps/live/scripts/brand-icons/render.mjs`) writes every file, its size and its path from
`packages/ui/src/brand-mark-geometry.ts`; `apps/marketing/lib/brand-icon.test.ts` keeps the committed files in step.

## Links

The header and footer logos link to the homepage, except in the editor app, where each logo goes up
one level: the editor's logo is a back link (**Back**, the brand group's caret and mark) to the Explorer home
(`/explorer/home`), and the Explorer header's logo opens the homepage. In a workspace workbench frame Back goes
where the document was opened from; where there is nowhere to go back to (a document scope frame) the mark has no
caret and is not a link ([Workbench embeds](../013-workspace/workbench-embeds.md#what-renders)). A logo link to the page already open (the footer
on the homepage, either logo there) scrolls back to the top, smoothly unless reduced motion is on,
rather than reloading. A modified click (new tab or window) keeps the browser's behaviour.

## One source

Every copy of the mark (the React component, the favicons, the logo files in `marketing/media/logo/`, the PNG icons, the
email mark, the Apple icon and the social card) is drawn from one geometry and palette module in `@livedoc/ui`. Static files are
regenerated from it and a test fails if one drifts.
