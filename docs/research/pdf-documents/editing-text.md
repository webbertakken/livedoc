# Editing text in place

What "real editing" of a page's own text takes (ruling C2's Editing). Researched November 2026 with spikes on PDFium,
the only candidate that edits a page's content ([The engine](engine.md)).

## What a page's text is

- A PDF holds no lines and no paragraphs. The first page of a paper is **151 text objects**, a median of 18
  characters each and 89 at most, in 12 fonts (verified). An object is whatever the producer wrote in one go: a word,
  part of a line, a title.
- Each object has a font, a size, a transform and a string of **glyph codes in that font's own encoding**. The
  engine maps them to characters where the file says how (`ToUnicode`), and flags where it cannot
  (`FPDFText_HasUnicodeMapError` is in the build: verified).
- Most fonts are **subsets**: only the glyphs the page used are in the file.

## What the engine does (verified)

| Asked                                              | Result                                                                                                               |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Replace an object's words with glyphs its font has | Works: the words change, the page regenerates, the file is valid                                                     |
| Type a glyph the subset lacks (`Żółw ΩЖ §`)        | **Silently wrong**: the call succeeds, the missing glyphs are dropped or replaced (`ÿółw ÿ2026 §` reads back)        |
| Add a new text object in a font loaded whole       | Works, every glyph reads back; the file grows by 414 KB for one 760 KB font: the engine embeds it without subsetting |
| Regenerate a page with nothing changed             | Pixel-identical on 86 of 88 corpus pages, one within 0.01%, one 15.5% different                                      |
| Move, scale, rotate, delete an object              | The object's matrix and the page's object list (`FPDFPageObj_Transform`, `FPDFPage_RemoveObject`)                    |

So the engine gives the verbs; four things are LiveDoc's own to build.

## What LiveDoc builds

**1. Boxes of lines and paragraphs, from fragments.** Entering Editing groups a page's text objects:

| Design                          | How                                                                                                                                               | Verdict                                                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **A. Geometry**                 | Objects on one baseline with word-sized gaps are a line; lines with the same left edge, font and leading are a paragraph; a gutter splits columns | The default: works on any file, wrong on unusual layouts                                                         |
| **B. The file's own structure** | A tagged PDF names its paragraphs and their order (`FPDF_StructTree_GetForPage`)                                                                  | Used where present and consistent; most files are untagged (23 of the 104 corpus files poppler reads are tagged) |
| **C. One box an object**        | No grouping                                                                                                                                       | What the engine gives for free: typing never reflows; unusable for a sentence                                    |

Recommended: B where the tags cover the page, A otherwise, and the person can always split or join a box by hand.

**2. Reflow inside a box.** Typing changes a line's width. LiveDoc lays the box's words out again (its own line
breaking, with each font's glyph widths from the engine: `FPDFFont_GetGlyphWidth`), then writes the box back as fresh
text objects, one a line, and removes the old ones. Text outside the box never moves: a PDF page does not flow.

**3. Glyphs the font lacks.** Before any write, every typed character is checked against the font's glyphs; a missing
one is never sent to `FPDFText_SetText`. Three ways to supply it:

| Design                                         | For                                                                                                       | Against                                      |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| **A. The same family from the document fonts** | The typed words match their neighbours when the family is one LiveDoc serves                              | Most embedded fonts are not in the catalogue |
| **B. A metric-compatible substitute**          | Always available: the catalogue's substitution table ([Fonts](../../specs/004-interface-design/fonts.md)) | Looks close, not the same; said in a notice  |
| **C. Refuse the character**                    | Never changes the look                                                                                    | A person cannot type their own name          |

Recommended: A, then B with the notice "Some characters use <font>, because <original> in this file has no glyph for
them." The run with the new font is its own text object.

**4. Subsetting what is added.** A font added whole costs hundreds of kilobytes a face (verified: 414 KB). The face
is subset to the glyphs used before it is embedded (LibPDF subsets TrueType and OpenType: verified in its feature
list, not yet run; the repo's own font code is the alternative), and one subset serves the whole document.

## Scripts and directions

- Right-to-left and vertical text are stored as positioned glyphs like any other; the corpus's Arabic and vertical
  files draw alike in both readers (verified). Editing them needs shaping (ligatures, joining forms) that the page's
  subset font cannot give for new text, so new text in a complex script always goes through a whole font shaped by
  the browser's text engine, then written as glyph codes (assumed: not spiked; the riskiest part of Editing, to be
  spiked in Phase 12 before its boxes are refined).
- Type 3 fonts (glyphs as drawings) have no characters to type with; their text is edited only by replacing the box
  in a document font.

## Guards

- **Before and after**: an edit that changes pixels outside its own box is undone and reported, since one page in 88
  does not survive regeneration ([The engine](engine.md)).
- **Tagged files**: an edit keeps the structure tree's link to the changed text where the engine keeps it; where it
  cannot, the file's PDF/UA claim is removed with a notice ([Accessibility](accessibility.md)).
- **Signed files**: fork F8.
