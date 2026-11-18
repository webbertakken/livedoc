# The Google Docs inventory

Every surface of Google Docs on a computer, as the parity matrix's rows will be drawn from it. Researched November 2026.

- **Shortcuts** are verified against Google's own list,
  [Keyboard shortcuts for Google Docs](https://support.google.com/docs/answer/179738?hl=en&co=GENIE.Platform%3DDesktop)
  (retrieved 2026-11-18).
- **Download formats** are verified against [Drive export formats](https://developers.google.com/workspace/drive/api/guides/ref-export-formats).
- **Limits** are verified against [Files you can store in Google Drive](https://support.google.com/drive/answer/37603).
- **Menus, toolbar, panels and dialogs** are **assumed**: written from the product as generally known in 2026. Google
  ships menu changes often and its help pages describe items one by one, never the whole bar. They are confirmed
  item by item against the reference captures ([captures](reference-captures.md)) before the matrix is final.

## The title row

Document name (rename in place), star, move to folder, document status (saved to Drive, offline), last edit link
(opens version history), comment history, meeting button, the mode switch (Editing, Suggesting, Viewing), Share
(people, general access, copy link), presence avatars, account. A Gemini button sits beside Share.

## Menus

### File

New (document, from a template), Open, Make a copy, Share (with others, publish to web), Email (email this file,
email collaborators), Download (Microsoft Word, OpenDocument, Rich Text, PDF, Plain Text, Web Page zipped, EPUB,
Markdown), Approvals, Rename, Move, Add a shortcut to Drive, Move to trash, Version history (name current version,
see version history), Make available offline, Details, Security limitations, Language, Page setup, Print preview
(with a Print button), Print.

### Edit

Undo, Redo, Cut, Copy, Paste, Paste without formatting, Select all, Delete, Find and replace.

### View

Mode (Editing, Suggesting, Viewing), Show print layout, Show ruler, Show outline, Show equation toolbar, Show
non-printing characters, Full screen, Text width (when pageless: narrow, medium, wide, full), Show tabs and outlines.

### Insert

Image (upload from computer, search the web, Drive, Photos, by URL, camera), Table (grid picker, table templates),
Building blocks (meeting notes, email draft, product roadmap, review tracker, project assets, content launch tracker,
custom building blocks), Smart chips (date, dropdown, people, file, calendar event, place, stopwatch, timer,
variables, finance), Link, Drawing (new, from Drive), Chart (bar, column, line, pie, from Sheets), Symbols (special
characters, equation), Tab, Horizontal line, Emoji, Footnote, Headers and footers (header, footer), Page numbers,
Break (page break, section break next page, section break continuous, column break), Bookmark, Table of contents
(plain text, dotted, with blue links), Comment.

### Format

Text (bold, italic, underline, strikethrough, superscript, subscript, size increase and decrease, capitalisation:
lowercase, UPPERCASE, Title Case), Paragraph styles (Normal text, Title, Subtitle, Heading 1 to 6, each with "Apply"
and "Update to match"; Options: save as my default styles, use my default styles, reset styles), Align and indent
(left, centre, right, justified, increase and decrease indent, indentation options: left, right, special first line
or hanging), Line and paragraph spacing (single, 1.15, 1.5, double, add or remove space before and after, custom
spacing, keep with next, keep lines together, prevent single lines), Columns (one, two, three, more options: count,
spacing, line between), Bullets and numbering (numbered list, bulleted list, checklist, list options: restart
numbering, continue previous numbering, more bullets), Headers and footers (margins, different first page, different
odd and even), Page numbers (where, start at), Page orientation, Switch to pageless format, Table (properties, insert,
delete, merge, split, distribute, sort, pin header rows, cell alignment, borders and shading), Image (crop, size and
rotation, text wrapping, position, alt text, replace image, image options: recolour, transparency, brightness,
contrast, reset), Borders and lines, Clear formatting.

### Tools

Spelling and grammar (check, show suggestions, personal dictionary), Word count (with "display word count while
typing"), Review suggested edits, Compare documents, Citations (style: MLA, APA, Chicago; sources), Linked objects,
Dictionary, Translate document, Voice typing, Notification settings, Preferences (general: automatically capitalise
words, use smart quotes, automatically detect links, automatically detect lists, show link details, show suggested
smart chips, automatically detect Markdown; substitutions list), Accessibility (screen reader support, braille,
speak commands), Activity dashboard, Explore.

### Extensions

Add-ons (get, manage), Apps Script.

### Help

Help, Training, Updates, Help Docs improve, Report abuse, Privacy policy, Terms of service, Function list (Sheets
only), Keyboard shortcuts, the menu search ("Tool finder").

## The toolbar, left to right

Menu search (Tool finder), Undo, Redo, Print, Spelling and grammar check, Paint format, Zoom, Styles, Font, Font size
(with minus and plus), Bold, Italic, Underline, Text colour, Highlight colour, Insert link, Add comment, Insert image,
Align, Line and paragraph spacing, Checklist, Bulleted list, Numbered list, Decrease indent, Increase indent, Clear
formatting, then the overflow (three dots) once the window is narrow, the mode switch at the far right, and the
collapse chevron (hide the menus).

## Context menus

- **On text**: Cut, Copy, Paste, Paste without formatting, Delete, Comment, Suggest edits, Link, Smart chips,
  Format options, Clear formatting, Select all matching text, View more actions (Define, Translate...).
- **On a table cell**: the text menu plus insert row above or below, insert column left or right, delete row, column
  or table, distribute rows and columns, sort table, table properties, merge and unmerge cells.
- **On an image**: crop, replace, image options, alt text, wrap, position, comment, link, delete.
- **On a link, a chip, a heading**: preview, copy, edit, remove; a heading's "Copy heading link".

## Side panels

Outline (document tabs and their headings), Comments (all comments, for you, filters), Version history, Image options,
Explore, Dictionary, Citations, Gemini, Calendar, Keep, Tasks, Contacts, Maps; the Accessibility settings dialog.

## Dialogs

Share, Page setup (pages or pageless; orientation, paper size, page colour, margins; set as default), Word count,
Find and replace, Special characters (search, draw a character), Paragraph styles options, Table properties, Columns
options, Custom spacing, Indentation options, Bullets and numbering list options, Link editor, Bookmark, Insert image
(search, Drive, Photos, URL, camera), Image options panel, Alt text, Compare documents, Translate document, Citations,
Preferences, Personal dictionary, Language, Keyboard shortcuts, Version history naming, Download, Print preview, Email
collaborators, Publish to the web, Details, Offline.

## Shortcuts

The verified list has these groups, each for PC, Mac and ChromeOS: common actions, text formatting, paragraph
formatting, images and drawings, comments and footnotes, menus, text selection with the keyboard and the mouse, screen
reader, document navigation, table navigation, other tools and navigation. The matrix carries each as a row; the full text is Google's page above.

Notable ones a parity build must not miss:

- Mode switch: Editing ⌘⌥⇧Z, Suggesting ⌘⌥⇧X, Viewing ⌘⌥⇧C.
- Tool finder ⌥/; compact mode Ctrl⇧F; paint format copy and paste ⌘⌥C, ⌘⌥V; clear formatting ⌘\.
- Paragraph move up and down Ctrl⇧↑ / ↓; select multiple sections of text Ctrl⌘⇧← / →.
- Comment-focused single keys: R reply, J next, K previous, E resolve, U exit.
- Two-key chords held under Ctrl⌘ (Mac) or Ctrl+Alt (PC): n or p then h (heading), 1 to 6, g (graphic), o (list),
  i (list item), l (link), b (bookmark), w (formatting change), c (comment), u (suggestion), f (footnote), r (edit);
  and table navigation under Ctrl⌘⇧ T then s, d, i, k, b, v, j, l, m, g, e.

## Chips

Date, dropdown (with presets: project status, review status), people, file, calendar event, place, stopwatch, timer,
variables, finance, the @ menu (people, files, dates, building blocks, headings, emoji), suggested chips.

## Modes

Editing, Suggesting (tracked changes, attributed), Viewing (read only, comments visible); print layout on or off;
pages and pageless; compact mode; full screen; screen reader support; braille support.

## Limits

- A document holds up to **1.02 million characters**; a text document converted to Google Docs format can be up to
  50 MB (verified: Drive help).
- Document tabs, comments per document, images per document and table sizes are documented elsewhere and are
  confirmed with the captures (assumed).

## Google-only services (fork C3)

Apps Script, add-ons, Gemini (Help me write, summarise, the side panel), Explore, Drive (open from, save to, shortcuts),
Calendar events and meeting notes, Meet (join, present), Keep, Tasks, Contacts, Maps, Photos, Translate document,
voice typing, Approvals, Publish to the web, email collaborators. Each becomes one matrix row: mapped to LiveDoc's own
or left out for Webber's ruling.
