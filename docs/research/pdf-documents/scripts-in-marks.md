# Every script in a mark's words

The question: how does a Text, a Callout or a stamp write words Helvetica cannot write (Greek, Cyrillic, Hebrew, Arabic,
Indic scripts, Thai, Chinese, Japanese, Korean) into the file's appearance, so no reader shows a question mark?
Researched 2026-11-24 against LibPDF 0.5.3, PDFium (the engine's reader) and harfbuzzjs 1.6.4.
Each claim is tagged **verified** (how), **inferred** (from what) or **assumed**.
The spike is kept beside plan 0022 (`plans/assets/0022/spikes/noto-embedding.probe.test.ts`), never in the tree.

## The faces

- **Noto** is the Noto project's family, licensed under the SIL Open Font License 1.1: a face may be bundled and
  embedded, and the licence binds the font, never a document made with it (verified: `OFL.txt` of
  notofonts/latin-greek-cyrillic, its preamble and condition 5).
- Noto declares no Reserved Font Name, so a subset (a derivative) may keep the name (verified: the same file's
  copyright line names none).
- One face covers Latin, Greek and Cyrillic; every other script has a face of its own (verified: the notofonts
  distribution's file list).
- Sizes of the unhinted TTFs, regular weight (verified: downloaded from the Noto project's own distribution,
  `notofonts.github.io/fonts`, and gzipped at level 9):

| Face                    | Script                 | Bytes      | Gzipped   |
| ----------------------- | ---------------------- | ---------- | --------- |
| Noto Sans               | Latin, Greek, Cyrillic | 431,364    | 223,001   |
| Noto Sans (Bold)        | the same               | 432,376    | 228,476   |
| Noto Sans Hebrew        | Hebrew                 | 16,836     | 8,863     |
| Noto Sans Arabic        | Arabic                 | 142,140    | 66,076    |
| Noto Sans Devanagari    | Devanagari             | 184,228    | 76,447    |
| Noto Sans Bengali       | Bengali                | 103,704    | 55,148    |
| Noto Sans Thai          | Thai                   | 20,960     | 11,526    |
| Noto Sans Armenian      | Armenian               | 18,772     | 9,896     |
| Noto Sans Georgian      | Georgian               | 35,300     | 20,161    |
| Noto Sans SC (CJK, OTF) | Simplified Chinese     | ~8,540,000 | not taken |

- Chinese, Japanese and Korean are about 8.5 MB a weight a region, as CFF OpenType (verified: the noto-cjk
  repository's `Sans/SubsetOTF/SC` listing); they are fetched only when a file needs them, or not at all (a fork).

## What the writer does

- LibPDF embeds a TrueType face as a Type0 font, Identity-H, its content codes the glyph ids (verified: its types,
  and the spike's appearance drawn by PDFium).
- **LibPDF 0.5.3 embeds the whole face**, subset or not: 20 characters of Noto Sans add 239,765 bytes to the file,
  20 Arabic characters 68,476 (verified: the spike, an incremental save measured against the stored file).
- **A face subset by HarfBuzz first, its glyph ids kept** (`HB_SUBSET_FLAGS_RETAIN_GIDS`), is 5,896 bytes for those
  20 characters, and the file grows by 4,232; PDFium draws exactly the same ink as with the whole face (verified: the
  spike, 1,260 dark pixels both ways).
- harfbuzzjs 1.6.4 is MIT; its shaper `harfbuzz.wasm` is 444,394 bytes (179,144 gzipped), its subsetter
  `harfbuzz-subset.wasm` 683,531 (275,445 gzipped), the subsetter's C API exported with no imports (verified: the
  package, `npm view`, and the module's export list).

## Shaping

- Arabic joins its letters and Indic scripts reorder and combine theirs: a face's character map alone draws them
  wrong. HarfBuzz shapes a line into glyph ids and positions, in visual order (verified: "السلام عليكم" shaped to 13
  glyphs of Noto Sans Arabic, written as glyph ids, drawn by PDFium; inferred for the visual order, from HarfBuzz's
  documentation).
- A shaped glyph has an offset and an advance of its own (a mark above a letter, kerning): the appearance places each
  glyph (`TJ` adjustments, or a `Tm` a glyph) rather than trusting the font's widths (inferred: HarfBuzz's positions).
- A shaped run's words are kept for copying through the font's `ToUnicode`, which maps a glyph back to its
  characters; a ligature maps one glyph to several (assumed: not yet spiked).
- Hebrew and Thai need no joining; Hebrew runs right to left, so its glyphs are written in visual order (inferred).

## Layout must agree

- The surface lays out a mark's words (`TypedLayout`, `StampLayout`) with Helvetica's widths; a character Helvetica
  cannot write is measured as the stand-in (verified: `helvetica.ts`).
- Set in Noto, such a character has another width, so a line measured as the stand-in may overflow its box in the
  file (inferred: a CJK ideograph is 1,000 units, the stand-in 556).
- So the layout measures each run in the face that will set it, the same on the surface and in the bake; with
  shaping, that is the shaped run's advance (inferred).

## Findings for the spec

- Subset with HarfBuzz, glyph ids kept, then embed: a few kilobytes a script a file, not hundreds.
- Shaping (Arabic, Indic) needs the HarfBuzz shaper beside the subsetter: about 455 KB gzipped together, loaded
  only when a mark's words need a face beyond Helvetica.
- Faces load the same way: only the scripts a file's words use, from the app's own origin.
- CJK at 8.5 MB a weight is the open fork: load it on demand, or keep the stand-in for CJK.

## Decided

- Chinese, Japanese and Korean faces are fetched on demand from the app's own origin, only when a file's marks hold
  them, then subset into the file (director, 2026-11-24).
- Self-hosters get every face with the static build; each face stays under Cloudflare Pages' 25 MiB a file, is cached
  immutably, and a fetch that fails shows progress or a clear message, never a silent question mark.

## Since

- Fontsource serves each Noto family as static TrueType subsets by script (WOFF, its tables zlib-compressed), with
  their layout tables, and Chinese, Japanese and Korean as about a hundred slices of about 45 KB each (verified:
  `@fontsource/noto-sans` 5.3.0 and `@fontsource/noto-sans-sc` 5.3.1, their files' table lists).
- So LiveDoc serves those files, subsets them itself (glyph ids kept, only `glyf` and `loca` cut) and loads
  HarfBuzz's shaper alone: the subsetter's 275 KB gzipped are never loaded
  ([Marks](../../specs/035-pdf-documents/marks.md#loading)).
