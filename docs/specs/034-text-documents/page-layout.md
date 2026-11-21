# Page layout

**Status: partly built.** Page setup, page orientation, pageless, the page drawn at its setup, laying out onto pages,
breaks, sections and columns are built; the rest is specified.

Pages, sections, breaks, columns, headers and footers, page numbers and footnotes in a [text document](text-document.md).
The layout is drawn by the measured DOM layout the research recommends
([Layout engine](../../research/docs-open-standard/layout-engine.md)), and print and PDF reuse it.

## Page setup

File > Page setup, a dialog with two tabs, **Pages** and **Pageless**:

- **Pages**: apply to (whole document, this section, this point forward); orientation (portrait, landscape); paper size
  (Letter, Tabloid, Legal, Statement, Executive, Folio, A3, A4, A5, B4, B5; and any size a file brings); page colour
  (the one colour picker); margins top, bottom, left, right (cm or in); **Set as default** (stored with the person) and
  **OK**.
- **Pageless**: background colour; **Set as default**; **OK**.
- A new text document's page setup: the person's default, else Letter in the United States and Canada and A4
  elsewhere by the browser's locale, margins 1 in (2.54 cm), white, portrait (assumed: Google's defaults; confirmed with
  the captures).

The Pages tab, rule by rule:

- **Paper sizes**, portrait, as Google lists them: Letter 8.5 × 11 in, Tabloid 11 × 17 in, Legal 8.5 × 14 in,
  Statement 5.5 × 8.5 in, Executive 7.25 × 10.5 in, Folio 8.5 × 13 in, A3 297 × 420 mm, A4 210 × 297 mm, A5 148 × 210
  mm, B4 250 × 353 mm, B5 176 × 250 mm. Each option reads its name and size in the person's unit.
- The paper shown is the one the page has either way round, to within half a point (a file's rounding). A size a file
  brings that is none of them shows as **Custom** with its size, first in the list, and is kept until another is picked.
- **Orientation**: landscape lays the paper's longer side across. Switching swaps the page's width and height and keeps
  the margins as they are (assumed: Google's).
- **Margins** are shown and typed in the person's unit, as indents are (inches where the browser's language is
  American English, centimetres elsewhere; two decimals). A field takes 0 to 55.88 cm (22 in), else "Enter a number
  from 0 to 55.88." Left and right together leave the text at least 1 in (72 pt) wide, top and bottom at least 1 in
  high, else both fields of the pair read "Margins leave too little room for text." (default) While any field is
  refused, OK is held.
- **Page colour**: the one colour picker in its swatch skin, with the office colour rows; white is stored as no
  colour, so the file writes none.
- **The dialog shows the section the caret is in**: its paper, orientation and margins.
- **Apply to** (Google's): **Whole document**; **This section**, while the document has more than one section; **This
  point forward**; **Selected content**, while text is selected. Whole document is chosen when the dialog opens.
  - **Whole document** sets every section's paper, orientation and margins.
  - **This section** sets the caret's section's.
  - **This point forward** ends the section at the caret with a section break (next page), as Insert > Break does, and
    sets the new section's and every later one's.
  - **Selected content** puts the paragraphs the selection touches in a section of their own, with a section break
    (next page) before and after them where none is; a continuous one there becomes next page, as Google's does; and
    sets that section's.
  - The page colour is the whole document's in both formats, whatever Apply to says. The Pageless tab has no Apply to.
  - Each choice is one undo step with the breaks it makes.
- **OK** applies what changed as one undo step and returns focus to the writing; nothing changed changes nothing.
  **Cancel** and Escape change nothing.
- **Set as default** keeps the tab's paper, orientation, margins and colour as the person's default page setup, in
  their [preferences](../007-editor/user-preferences.md) as default styles are; the dialog stays open, the button reads
  **Saved as default** until a field changes, and a polite live region says so (default). It changes no document.
- **A new text document starts in its maker's default page setup**, the first time its maker opens it in the browser
  tab that made it, as default styles do ([Default styles](text-and-paragraphs.md#default-styles)): their default, else
  the locale's paper (A4 outside the United States and Canada). Never an undo step. A file opened keeps its own setup;
  someone else's new document keeps its maker's.
- A saved default that does not read back as a page setup is ignored whole and logged
  `[text-document] default page setup unreadable`.

Format > **Page orientation** is a small dialog of the two orientations, applying to the whole document as Page
setup's does, one undo step (assumed: Google's).

- **Each page is drawn at its section's setup**: its paper's width and height, its margins, and the document's
  page colour; pages of different widths are centred one under another, and each section's writing has its own text
  width. The ruler shows and sets the margins of the section the caret is in
  ([Editing surface](editing-surface.md#the-ruler)).
  A page colour is drawn as a fill is on the paper it is on: as written in the light scheme, its lightness mirrored on
  dark paper ([The page in the dark scheme](editing-surface.md#the-page-in-the-dark-scheme)); the writing's inks are
  drawn for the paper, not for the page colour, as Google draws them on white (default). Margins dragged on the ruler:
  `Tab · Changed · TextDocumentMargins`.

## Print layout

View > Show print layout on: pages with gaps between them, headers, footers and footnotes drawn. Off: one column with
page breaks shown as lines, no headers or footers. Per person.

- **A person's own**, kept in this browser, on by default (Google's), as the ruler is; a Viewer chooses it too. The item
  is checked while it is on; dimmed while the document is pageless, which has no pages either way (Google's).
- **Off**, the writing is one sheet at the first section's width, as on a phone: no gaps, headers, footers or page
  numbers (a page number shows 1), each break drawn as its dotted line ([Breaks](#breaks)); columns are one column.
- Telemetry `UI · Toggled · TextDocumentPrintLayout`, counted before the change is kept.

## Pageless

Format > Switch to pageless format: the document has no pages, breaks, headers, footers, page numbers or columns (they
are kept, hidden, and come back when switched back); pictures may be wider than the text; wide tables scroll. View >
Text width: narrow, medium, wide, full (per person). Printing and PDF of a pageless document lay it on pages with the
pages' setup.

- **Pageless is the document's**, shared by everyone on it, as the paper is: Format > **Switch to pageless format**
  turns it on, and the same item reads **Switch to pages format** while it is on; one undo step either way. The tab
  chosen in Page setup is the format OK leaves the document in (Google's), so Page setup is the other way to switch.
- The **Pageless tab** holds **Background colour**: the page colour, the same value the Pages tab sets, so a colour
  outlives a switch either way (default); OK there changes only the colour and the format, leaving what the Pages tab
  holds as the document has it; **Set as default** keeps the person's default as pageless with that colour,
  and a new document they make starts pageless.
- **Drawn pageless**: no sheet and no grey ground; the background colour (or the paper's white or dark) fills the
  document's whole area, and the writing is a centred column at the text width, never wider than the window less
  0.5 in each side, with 0.5 in above the first line (default). The page setup's margins and paper are kept, unused,
  for printing and for switching back.
- **View > Text width**, a person's own kept in this browser: **Narrow** 6.5 in, **Medium** 8 in, **Wide** 10 in, and
  **Full** the window less 0.5 in each side (default widths; Google names them only); Medium until chosen (default).
  The chosen one is checked; the items are dimmed while the document has pages (Google's). Telemetry
  `UI · Changed · TextDocumentTextWidth<Width>`, counted before it is kept.
- **The ruler pageless** spans the column: indents and tab stops as on a page, no margins to drag.
- In the file: [Extensions](standard-mapping.md#extensions); another suite shows the document on its pages.

## Laying out

- **The pages**: the writing is laid onto pages one under another, centred on the ground, 12 px apart at 100% zoom
  (default), 24 px of ground above the first and below the last; each page a sheet of its paper, its page colour and
  a light shadow; the last page is a whole page however little it holds. Each page has the setup of the section its
  first line belongs to.
- **A page fills** with lines from the top of its text area (the page less its margins) down; a line that would cross
  the foot of the text area starts the next page. Lines break by the paragraph's alignment and the browser's line
  breaking, so a paragraph that does not fit breaks **between two of its lines**, never inside one.
- A paragraph's space before is kept at the top of a page; its space after never pushes a line onto the next page
  (assumed: Google's).
- **Prevent single lines** (widows and orphans of two): a paragraph never leaves its first line alone at a page's
  foot nor its last line alone at a page's head; the lines move on to the next page in pairs.
- **Keep lines together**: a paragraph that does not fit where it starts moves whole to the next page.
- **Keep with next**: a paragraph moves to the next page with the paragraph after it when that one starts there; a run
  of paragraphs keeping with the next moves as one. Headings keep with the next paragraph by default.
- A keep rule gives way when keeping it would leave a page empty: a paragraph, or a run kept together, taller than a
  page, or already at a page's top, breaks where the page fills.
- **Page break before**: a paragraph that has it starts a new page, unless it is already at a page's top.
- A **section break** that starts its section on the next page starts a new page after its line; on an odd or even
  page (a file's), it leaves the page between blank when the next page is the wrong one. A continuous one breaks no
  page.
- Content kept from a file, drawn as a placeholder, and a section break's line move whole.
- Pictures in line move with their line; wrapped and fixed ones keep their position on the page and the text flows
  round them.
- **No pages** are laid out when the document is pageless or on a phone, where the writing flows to the window
  ([Editing surface](editing-surface.md#phone-and-tablet)); a page break is then a break in the column only.
- The layout is **incremental**: an edit measures only the paragraphs it changed, lays out from the page holding the
  paragraph before the first of them, and stops at the first page that starts where it started before, so typing on
  page 300 costs what typing on page 1 does ([Performance](#performance)). A change of text width, styles, the
  document's default text or loaded fonts measures every paragraph again.
- **What is read**: the space between pages is drawn, never text; a screen reader reads the writing as one, the caret
  moves across a page's end as across a line's, and Backspace or Delete at a page's edge deletes the character on the
  other side.
- Logs: `[text-document] layout` with the pages, the paragraphs measured, the page laid from and where it settled, and
  the time it took.

## Breaks

- Insert > Break: **Page break** (⌘Enter, Ctrl+Enter elsewhere), **Section break (next page)**, **Section break
  (continuous)** and **Column break**, which is dimmed while the caret's section has one column, as Google's
  ([Columns](#columns)).
- **A page break** ends the paragraph at the caret, a selection replaced, and starts the rest on a new page: the new
  paragraph has its own **page break before**, which is how both formats hold one (`fo:break-before="page"`,
  `w:pageBreakBefore`). At a paragraph's start the paragraph moves to the new page and an empty one stays behind.
- **Format > Line & paragraph spacing > Add page break before** is a switch beside the keep rules, on for every
  paragraph the selection touches unless all have it, then off for all, as Google's (2021).
- **A column break** ends the paragraph at the caret as a page break does, and starts the rest at the top of the next
  column; after a section's last column, on the next page. The new paragraph has its own **column break before**:
  ODF's `fo:break-before="column"`; Word has no paragraph property for it, so it is written as a `w:br` of the column
  type at the paragraph's start, and such a break read back as the paragraph's column break before.
- **Backspace** at the start of a paragraph with its own page or column break before takes the break away and nothing
  else, one undo step; the next Backspace joins as ever. **Delete** at the end of the paragraph before it does the same.
- **A section break** ends the paragraph at the caret and puts the break between the two halves: the new section
  starts on the next page or continues the page, with the page setup of the section the caret was in.
- **Drawn**: in print layout a page or column break is where the writing moves on, and a section break shows nothing.
  With non-printing characters shown, or where no pages are laid out (pageless, a phone), each shows as a dotted line
  with its name, **Page break** or **Column break** above its paragraph, **Section break (next page)** or **Section
  break (continuous)** on its own line, in the muted ink of the non-printing characters: never text, never read by a
  screen reader; a section break is selected and deleted whole.
- A Word file's page break inside a paragraph (`w:br` of the page type, kept as the file has it) starts a new page at
  the line after it, or before the next paragraph when nothing follows it; a column break (`w:br` of the column type)
  starts the next column the same way.
- In a section of one column, a column break starts a new page, as Word lays one (assumed); where no pages are laid out
  it is a break in the column only.
- A section has its own page setup, columns, headers and footers and page numbering.
- Share roles: an Editor inserts and removes breaks; a Participant and a Viewer see none of the items.

## Columns

Format > Columns: one, two or three; **More options**: count (1 to 3), spacing (cm or in), **Line between columns**.
Per section. Text fills the first column down the page, then the next.

- **The submenu**: **One column**, **Two columns**, **Three columns**, the caret's section's count checked, and
  **More options**, which opens **Column options**. Dimmed while the document is pageless, as Google's.
- **Column options**, a dialog: **Presets** (one, two or three columns, drawn as small pages), **Number of columns**
  (1 to 3), **Spacing** in the person's unit, **Line between columns**; **Cancel** and **Apply**. It opens at the
  caret's section's columns; Presets and Number of columns are one choice shown twice.
- **Spacing** is the gap between two columns, 0.5 in (36 pt) for a section that has none yet (assumed: Google's). A
  field takes 0 up to what leaves every column at least 0.5 in (36 pt) wide, else "Enter a number from 0 to
  <most>." in the person's unit, and Apply is held (default). With one column the spacing and the line are dimmed.
- **What they apply to**: with text selected, the paragraphs it touches become a section of their own, a section
  break (continuous) made before and after them where none is (a break already there stays as it is), as Google's;
  else the caret's section. One undo step with the breaks it makes; a choice that changes nothing changes nothing.
- **Laid out**: a section's columns share its text width, each `(width − spacing × (count − 1)) / count` wide, left
  to right. A column fills from the top of the section's part of the page (the text area's top, or the foot of what a
  continuous section break left above it) down to the foot of the text area; then the next column starts at that top;
  after the last column the next page. Lines break between columns as between pages: a paragraph splits between two
  of its lines, and keep with next, keep lines together, prevent single lines and page break before apply with the
  column for the page; a page break or a next-page section break still starts a new page.
- **Balanced**: a section of columns that a continuous section break ends lays its last page's part in columns as
  even as its lines allow, the shortest that holds it, and the next section starts under the longest column (assumed:
  Google's, as Word's). Elsewhere columns fill one after another.
- **Line between columns**: a thin line in the middle of each gap, from the top of the section's part of the page to
  the foot of its longest column, in the writing's ink.
- A paragraph is drawn across columns, and onto the next page, as one: the caret, selection and a screen reader move
  through it as through any paragraph. Where the browser cannot carry a paragraph from a page's columns onto the next
  page (no CSS `column-wrap`), that paragraph moves whole to the next page (default).
- **One column** where no pages are laid out: pageless, on a phone, and with print layout off; the columns are kept
  and come back.
- In the file: `style:columns` (`fo:column-count`, `fo:column-gap`, `style:column-sep` for the line) on the page
  layout or the continuous section; `w:cols` (`w:num`, `w:space`, `w:sep`). Columns of unequal widths read as equal
  ([Documented losses](standard-mapping.md#documented-losses)).
- **The ruler** shows the caret's column: the gaps grey, the indents and tab stops measured from the column's start
  ([Editing surface](editing-surface.md#the-ruler)).
- Share roles as page setup's ([Share roles](#share-roles)). Telemetry `Tab · Changed · TextDocumentColumns`, from the
  submenu and the dialog alike. Logs `[text-document] columns` with the count, the scope and the sections changed.

## Headers and footers

A section's pages each have a **header** in the top margin and a **footer** in the bottom one, as Google's and Word's.

- **What a header is**: writing of its own, paragraphs as the body's (styles, text and paragraph formatting, lists,
  tab stops, kept content), and later pictures, tables and fields ([Page numbers](#page-numbers)). A footer is the same.
- **Which one a page shows**: a section's headers are its **default** header, and, when it has them switched on, a
  **first page** header (with **Different first page**) and an **even page** header (with **Different odd and even**,
  then the default is the odd pages'). The first page is the section's first; a page is odd or even by its number. The
  same for footers.
- **Linked to previous**: a section's header of one kind (default, first page or even page) that it has not made its
  own is the previous section's of that kind, as Word's; the first section's is none, an empty margin. **Link to
  previous** (in the header's bar, [editing](#editing-headers-and-footers)) is on until the section gets its own, and
  turned back on gives its own away for the previous section's. Different first page and Different odd and even are
  each section's own; a section without them follows its own setting, never the previous section's (default).
- **The header margin** is the distance from the paper's top edge to the header's top, and **the footer margin** from
  the bottom edge to the footer's foot: 0.5 in (36 pt) each, Google's, for a section that has none (assumed: Google's).
  Each is per section, in its page setup.
- **Drawn** on every page laid out: the header from the header margin down, at the section's text width and left
  margin; the footer up from the footer margin. A header taller than the room above the top margin pushes the body's
  first line down by what it overflows, and a footer taller than its room pushes the body's foot up, as Word's and
  Google's (default: the room is the margin less the header margin). While the body is edited a header and footer are
  drawn in the writing's ink at full strength (Google's); an empty one draws nothing and pushes nothing.
- **A page's section** for its header and footer is the section its first line belongs to, as for its setup; the
  page is that section's **first page** when it starts with the section's first line (the document's first page for
  the first section), so a continuous section's first page header shows only where the section starts a page
  (default). A page's number counts every page laid out before it, blank ones too.
- A **blank page** left for an odd or even page section start draws no header or footer (default).
- A page draws the same header as every other page showing it, formatting, lists and tab stops alike; one header
  shared by sections of different widths is laid out at each section's text width.
- **Read**: a drawn header or footer is never read with the body, nor reached by the caret, until it is entered
  ([editing](#editing-headers-and-footers)); its text is found by the document's search (the digest's search text).
- **Pageless**, on a phone and with print layout off no header or footer is drawn; they are kept and come back.
- In the file:
  - ODF: a master page's `style:header`, `style:header-first` and `style:header-left` (even pages), and the same for
    footers, each holding paragraphs as the body does; `style:header-first` present is Different first page and
    `style:header-left` Different odd and even. A master page has no linking: a section that links writes the previous
    section's header into its own master page, and reading, a master page whose header is the previous section's
    (the same XML) reads as linked (default). The page layout's `fo:margin-top` is the header margin when there is a
    header, the header's `style:header-style` holding `fo:min-height` (the top margin less the header margin) and
    `style:dynamic-spacing="true"`, so the body starts at the top margin, as LibreOffice reads a Word file; read back,
    the top margin is the layout's margin plus the header's height and spacing. Footers mirror it at the foot.
  - OOXML: header and footer parts (`w:hdr`, `w:ftr`) each holding paragraphs, referenced from the section's
    `w:sectPr` by `w:headerReference` / `w:footerReference` with `w:type` `default`, `first` or `even` and a
    relationship; `w:titlePg` is Different first page; a missing reference is linked to previous. Different odd and
    even is the whole document's in Word (`w:evenAndOddHeaders` in settings): written when any section has it, a
    section without it then writing its default header as its even one too; read, every section has it. The header
    and footer margins are `w:pgMar`'s `w:header` and `w:footer`.
- Telemetry `Tab · Changed · TextDocumentHeaderFooter` when a header or footer is made, removed, linked or unlinked,
  or its options change; logs `[text-document] header footer` with the section, kind and what changed.

### Editing headers and footers

- Insert > **Headers and footers** > **Header** (⌘⌥O ⌘⌥H) and **Footer** (⌘⌥O ⌘⌥F), or a double-click in the top or
  bottom margin of a page, puts the caret in that page's header or footer at its end, making it when it is none.
  The menu's page is the one the body's caret is on (the last page starting at or before the caret's paragraph).
- **Which one is edited**: the header the page shows, a linked one too, so an edit shows on every page drawing it, the
  previous section's included (Word's). A page showing none makes one: one empty paragraph in Normal text, the
  section's own in the page's slot (first page, even page or default), under a new random id (default).
- Making, removing, linking and unlinking a header are steps of the body's undo; typing and formatting in a header
  are steps of the header's own undo, which Undo and Redo use while it is edited (default).
- **While a header or footer is edited** the body is drawn faded (Google's), a thin line under the header (over the
  footer) marks its edge, and a bar under it holds **Different first page** (a checkbox), **Link to previous** (a
  checkbox, in a section after the first) and **Options** (a menu: **Header format** or **Footer format**, opening
  Headers and footers options, **Page numbers**, and **Remove header** or **Remove footer**).
- **The bar** stands under the header's line (over the footer's), at the text area's left, Google's; it is a toolbar
  named "Header options" or "Footer options", reached from the header or footer with **Alt+F10** and left back to it
  with **Escape** (the editors' convention, default).
  - **Different first page** switches the section's own setting; the caret moves into the header the page now shows,
    made when the page shows none (default).
  - **Link to previous** is checked while the section has no header of its own in the page's slot. Unchecked, the
    section gets its own copy of the header it showed (Word's); checked again, its own is given away for the previous
    section's, which the caret moves into (default).
  - **Remove header** takes the section's own header in that slot away and leaves for the body; dimmed while the
    header is linked to the previous section's (default). **Page numbers** opens the Page numbers dialog.
- Every page drawing that header shows the edit as it is typed. Text and paragraph formatting, the toolbar, undo and
  the clipboard work in it as in the body; Select all selects its writing. Breaks and columns are dimmed while a
  header or footer is edited (Google's); the edited one is read as a text box named "Header" or "Footer" (default).
- **Escape**, or a press on the body, leaves it with the caret where the body had it; empty, it is removed.
- **Headers and footers options**, a dialog titled "Headers & footers" (Google's): **Margins**, **Header** (from the
  top) and **Footer** (from the bottom), in the person's unit; **Layout**, **Different first page** and **Different
  odd and even**; **Apply to**, **This section** or **Whole document** (with more than one section); **Cancel** and
  **Apply**. A margin takes 0 up to the page's height less 1 in, else "Enter a number from 0 to <most>." (default).
  Format > **Headers & footers** and the bar's **Header format** (**Footer format**) open it for the section of the
  edited header, else of the body's caret.
  - It shows that section's margins and switches, and opens on This section (default).
  - Whole document sets every section's margins and switches alike; a margin then takes 0 up to the shortest page's
    height less 1 in (default).
  - Apply while a header or footer is edited moves the caret into the one the page now shows, made when it shows
    none, as the bar's switches do (default); Apply with nothing changed changes and counts nothing (default).
- Every change is one undo step. Share roles as page setup's ([Share roles](#share-roles)): a Participant and a Viewer
  read headers and footers and cannot enter them.

## Page numbers

A **page number** and a **page count** are fields: characters the document works out, as Google's, Word's and
LibreOffice's.

- **What they show**: a page number shows the number of the page it is drawn on, a page count how many pages the
  document has. Each takes the formatting at the caret where it is put, and is one character to the caret: deleted,
  copied, pasted and undone whole; copied into another app it is its text (default).
- **Where**: a page number belongs in a header or footer, where every page draws its own; one in the body shows the
  number of the page its paragraph starts on (default). A page count may stand anywhere.
- **Drawn** as the page's number or count in the writing's own characters, read as them; a header being
  edited shows its page's (default). The text a field keeps for the file is the one it held when it arrived or was
  put (default); the other suites work it out again on opening.
- **Numbering**: pages count from the document's first, blank ones too ([Headers and footers](#headers-and-footers)),
  unless a section **starts at** a number: its first page then has that number and the pages after it count on.
- **Pageless**, on a phone and with print layout off, where no pages are laid out, a page number in the body shows 1
  and a page count 1 (default); headers and footers are not drawn there.
- **Insert > Page numbers** opens a submenu, Google's: four presets, **Page count** and **More options**; the presets
  are rows of the menu where Google draws tiles (default: the shell's menus hold rows).
  - The presets are named **Header, every page**, **Header, not the first page**, **Footer, every page** and **Footer,
    not the first page** (default names, Google's tiles): each puts a page number, aligned right, in the default
    header (footer) every section shows, and in a section's even page one where it has one, for the whole document
    (Google's; the even page one, default).
  - A header already holding a page number keeps it; an empty one takes it in its paragraph; one with writing takes
    it in a new paragraph at its end, aligned right; a section showing none gets one of its own (default).
  - A header changed so is written as a new copy the section names instead, so the change is one step of the body's
    undo (default).
  - **Not the first page** switches Different first page on in the first section and takes page numbers out of its
    first page header; **every page** puts one in that header too when the section has one (default).
  - **Page count** puts a page count at the caret, in the body or in the header or footer edited.
- **More options**, the bar's **Page numbers** and Format > **Page numbers** open the **Page numbers** dialog:
  **Position**, **Header** or **Footer**; **Show on first page** (a checkbox); **Numbering**, **Continue from previous
  section** or **Start at** a number from 0 to 9999 (else "Enter a number from 0 to 9999.", default); **Apply to**,
  **This section** or **Whole document** (with more than one section); **Cancel** and **Apply**. It opens at the
  section of the edited header, else of the body's caret, with Header, Show on first page and that section's
  numbering (default); Apply puts page numbers in that position as a preset does, for the scope chosen.
  - Show on first page unchecked is Not the first page for the section (the first, for the whole document), as a
    preset; checked, every page (default).
  - Start at sets the section's start; for the whole document the first section's, the others continuing; Continue
    takes the start away from every section in scope (default).
- Every change is one undo step. Share roles as page setup's ([Share roles](#share-roles)).
- In the file:
  - ODF: `text:page-number` (`text:select-page="current"`) and `text:page-count`, holding the number last drawn; a
    section's start as `style:page-number` on its first paragraph's paragraph properties (`auto` to continue).
  - OOXML: `w:fldSimple` with the instruction `PAGE` or `NUMPAGES` and its result run; a complex field (`w:fldChar`)
    whose instruction is `PAGE` or `NUMPAGES`, with no switch but `\* MERGEFORMAT` or `\* Arabic`, reads as the same
    field; written as `w:fldSimple`. A section's start as `w:pgNumType`'s `w:start` in its `w:sectPr`.
  - A field in another form (letters or Roman numerals, another page's number, other switches) stays kept content,
    written back as it came and drawn as the text it holds (default).
- Telemetry `Element · Added · TextDocumentPageNumbers` from a preset and the dialog, `Element · Added ·
TextDocumentPageCount` from Page count; logs `[text-document] page numbers` with the position, first page, start
  and scope.

## Footnotes

- Insert > Footnote (⌘⌥F) puts a numbered mark at the caret and the caret in its note at the foot of the page.
- Numbered 1, 2, 3 through the document; drawn below a short rule at the foot of the page their mark falls on,
  continuing on the next page when long.
- Endnotes in an arriving file are kept and drawn at the document's end.

## Watermark and line numbers

Neither exists in Google Docs' menus for text documents today (assumed); a watermark or line numbering in an arriving
file is kept and drawn where the format holds it.

## Performance

| Budget                                   | Value                                                                 |
| ---------------------------------------- | --------------------------------------------------------------------- |
| Keystroke to painted character, any page | 16 ms at the 75th percentile on the reference laptop (set in Phase 4) |
| Re-layout after a paste of 10 pages      | 100 ms                                                                |

(default) Both are confirmed against the tracer bullet's measurements in Phase 4.

## Share roles

Editors change page setup, breaks, columns, headers, footers, page numbers and footnotes; a Participant only as
suggestions (D7); a Viewer chooses print layout and text width for themself. Until suggestions are built a
Participant and a Viewer see none of Page setup, Page orientation and Columns.

## Telemetry

- `Tab · Changed · TextDocumentPageSetup`, `TextDocumentPageOrientation`, `TextDocumentPageless`,
  `TextDocumentColumns`, `TextDocumentHeaderFooter`.
- `Element · Added · TextDocumentBreak<Kind>` (`Page`, `Column`, `SectionNextPage`, `SectionContinuous`),
  `TextDocumentFootnote`, `TextDocumentPageNumbers`, `TextDocumentPageCount`.
- Add page break before is a keep rule (`Element · Changed · TextDocumentKeepRule`).
- `UI · Changed · TextDocumentPageDefault` when Set as default keeps one, before it is kept. Never text.
- `UI · Toggled · TextDocumentPrintLayout` and `UI · Changed · TextDocumentTextWidth<Width>` (`Narrow`, `Medium`, `Wide`,
  `Full`), a person's view, before it is kept.
