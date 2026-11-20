# Parity matrix

**Status: partly built.** Every row reads `specified` until it is built; a built row names the test that proves it.

One row per entry of the [Google Docs inventory](../../research/docs-open-standard/google-docs-inventory.md). Each
row states its rule in one line, its status, and the spec that holds the detail. A row is done when it reads **built**
(with its test) or **left out** (with Webber's ruling). Fork C3 is ruled: core only, so scripting, add-ons, any
assistant, smart chips and Google's own services read **left out (C3)**. Rows that could read either way are listed in
[Either way](#either-way), asked of Webber once.

Statuses: `specified`, `built (<test>)`, `left out (<ruling>)`, `left out (C3)`, `either way` (on the list below).

## Title row

| Row              | Rule                                                                               | Status                                                               | Spec                                                             |
| ---------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Name             | The document's name, renamed in place, with its format (`.DOCX`, `.ODT`) beside it | built (`OfficeTitleRow.test.tsx`, `office-title-row.spec.ts`)        | [Editing surface](editing-surface.md#the-title-row)              |
| Star             | Favourite the document (LiveDoc's favourites)                                      | built (`OfficeTitleRow.test.tsx`, `office-title-row.spec.ts`)        | [Editing surface](editing-surface.md#the-title-row)              |
| Move             | Move to a folder (LiveDoc's folders)                                               | built (`OfficeTitleRow.test.tsx`, `office-title-row.spec.ts`)        | [Editing surface](editing-surface.md#the-title-row)              |
| Save status      | Saved, saving, offline, in This Browser                                            | built (`OfficeSaveStatus.test.tsx`, `text-document-offline.spec.ts`) | [Editing surface](editing-surface.md#the-title-row)              |
| Last edit        | "Last edit was …" opens version history                                            | specified                                                            | [Review](review.md#version-history)                              |
| Comment history  | Opens the comments panel                                                           | specified                                                            | [Review](review.md#comments)                                     |
| Meeting button   | Join or present in a meeting                                                       | left out (C3)                                                        | [Tools](tools.md#google-only-services)                           |
| Mode switch      | Editing, Suggesting, Viewing                                                       | specified                                                            | [Review](review.md#editing-modes)                                |
| Share            | LiveDoc's share dialog, links and roles                                            | built (`OfficeTitleRow.test.tsx`, `office-title-row.spec.ts`)        | [Files and print](files-and-print.md#sharing)                    |
| Presence         | Avatars of everyone on the document                                                | built (`OfficeTitleRow.test.tsx`, `office-title-row.spec.ts`)        | [Live editing and storage](live-editing-and-storage.md#presence) |
| Assistant button | Gemini, or any assistant                                                           | left out (C3)                                                        | [Tools](tools.md#google-only-services)                           |

## File menu

| Row                      | Rule                                                                            | Status                                                        | Spec                                                            |
| ------------------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------- |
| New: document            | A new blank text document in a new browser tab                                  | specified                                                     | [Starting and finding](starting-and-finding.md)                 |
| New: from a template     | The template gallery's text documents                                           | specified                                                     | [Starting and finding](starting-and-finding.md)                 |
| Open                     | Open a LiveDoc document or a file from the computer                             | specified                                                     | [Files and print](files-and-print.md#opening)                   |
| Make a copy              | Copy with name, folder, comments, suggestions options                           | specified                                                     | [Files and print](files-and-print.md#make-a-copy)               |
| Share: share with others | The share dialog                                                                | built (`OfficeTitleRow.test.tsx`, `office-title-row.spec.ts`) | [Files and print](files-and-print.md#sharing)                   |
| Share: publish to web    | LiveDoc's public view link and embed                                            | either way                                                    | [Files and print](files-and-print.md#sharing)                   |
| Email: this file         | Send as an attachment through the host's email, when configured                 | either way                                                    | [Files and print](files-and-print.md#email)                     |
| Email: collaborators     | Message everyone on the document, when email is configured                      | either way                                                    | [Files and print](files-and-print.md#email)                     |
| Download: Microsoft Word | `.docx`: the document itself when OOXML, a converted copy when ODF              | specified                                                     | [Files and print](files-and-print.md#downloading)               |
| Download: OpenDocument   | `.odt` (and `.fodt`): the document itself when ODF, a converted copy when OOXML | specified                                                     | [Files and print](files-and-print.md#downloading)               |
| Convert to Word format   | A person converts an ODF text document to OOXML, losses listed first (C1)       | specified                                                     | [Standard mapping](standard-mapping.md#conversion)              |
| Convert to OpenDocument  | A person converts an OOXML text document to ODF, losses listed first (C1)       | specified                                                     | [Standard mapping](standard-mapping.md#conversion)              |
| Download: Rich Text      | `.rtf`                                                                          | specified                                                     | [Files and print](files-and-print.md#downloading)               |
| Download: PDF            | `.pdf`, text as text                                                            | specified                                                     | [Files and print](files-and-print.md#downloading)               |
| Download: Plain Text     | `.txt`                                                                          | specified                                                     | [Files and print](files-and-print.md#downloading)               |
| Download: Web Page       | `.html` zipped with its pictures                                                | specified                                                     | [Files and print](files-and-print.md#downloading)               |
| Download: EPUB           | `.epub`                                                                         | specified                                                     | [Files and print](files-and-print.md#downloading)               |
| Download: Markdown       | `.md`                                                                           | specified                                                     | [Files and print](files-and-print.md#downloading)               |
| Approvals                | Request and record approvals                                                    | left out (C3)                                                 | [Tools](tools.md#google-only-services)                          |
| Rename                   | Rename the document                                                             | built (`OfficeTitleRow.test.tsx`, `office-title-row.spec.ts`) | [Editing surface](editing-surface.md#the-title-row)             |
| Move                     | Move to a folder                                                                | built (`OfficeTitleRow.test.tsx`, `office-title-row.spec.ts`) | [Editing surface](editing-surface.md#the-title-row)             |
| Add a shortcut to Drive  | Drive-only                                                                      | left out (C3)                                                 | [Tools](tools.md#google-only-services)                          |
| Move to trash            | LiveDoc's Trash                                                                 | specified                                                     | [Files and print](files-and-print.md#trash)                     |
| Version history          | Name current version; see version history                                       | specified                                                     | [Review](review.md#version-history)                             |
| Make available offline   | LiveDoc's This Browser and offline open                                         | specified                                                     | [Live editing and storage](live-editing-and-storage.md#offline) |
| Details                  | Owner, dates, location, size, statistics                                        | specified                                                     | [Files and print](files-and-print.md#details)                   |
| Security limitations     | Lists what an import dropped (macros, remote pictures)                          | specified                                                     | [Files and print](files-and-print.md#import-report)             |
| Language                 | The document's language, for spelling and hyphenation                           | specified                                                     | [Tools](tools.md#language)                                      |
| Page setup               | Pages or pageless; orientation, paper, colour, margins; set as default          | specified                                                     | [Page layout](page-layout.md#page-setup)                        |
| Print preview            | The pages as printed, with Print                                                | specified                                                     | [Files and print](files-and-print.md#printing)                  |
| Print                    | ⌘P, the browser's print of the laid-out pages                                   | specified                                                     | [Files and print](files-and-print.md#printing)                  |

## Edit menu

| Row                      | Rule                                     | Status                                     | Spec                                                         |
| ------------------------ | ---------------------------------------- | ------------------------------------------ | ------------------------------------------------------------ |
| Undo, Redo               | Personal undo and redo                   | built (`text-document-shortcuts.test.tsx`) | [Live editing and storage](live-editing-and-storage.md#undo) |
| Cut, Copy, Paste         | Clipboard with formatting                | specified                                  | [Text and paragraphs](text-and-paragraphs.md#clipboard)      |
| Paste without formatting | ⌘⇧V, plain text in the surrounding style | specified                                  | [Text and paragraphs](text-and-paragraphs.md#clipboard)      |
| Select all               | ⌘A, the whole body of the document tab   | built (`text-document-shortcuts.test.tsx`) | [Text and paragraphs](text-and-paragraphs.md#selection)      |
| Delete                   | Removes the selection                    | specified                                  | [Text and paragraphs](text-and-paragraphs.md#selection)      |
| Find and replace         | ⌘H, the dialog                           | specified                                  | [Tools](tools.md#find-and-replace)                           |

## View menu

| Row                          | Rule                                      | Status                                 | Spec                                                                  |
| ---------------------------- | ----------------------------------------- | -------------------------------------- | --------------------------------------------------------------------- |
| Mode                         | Editing, Suggesting, Viewing              | specified                              | [Review](review.md#editing-modes)                                     |
| Show print layout            | Pages with gaps, or one continuous column | specified                              | [Page layout](page-layout.md#print-layout)                            |
| Show ruler                   | The ruler on or off                       | specified                              | [Editing surface](editing-surface.md#the-ruler)                       |
| Show outline                 | The outline panel                         | built (`TextDocumentOutline.test.tsx`) | [Links and navigation](links-and-navigation.md#the-outline)           |
| Show equation toolbar        | The equation toolbar under the main one   | specified                              | [Objects](objects.md#equations)                                       |
| Show non-printing characters | ¶, spaces, tabs and breaks drawn          | specified                              | [Text and paragraphs](text-and-paragraphs.md#non-printing-characters) |
| Full screen                  | Menus and toolbar hidden until Escape     | specified                              | [Editing surface](editing-surface.md#compact-and-full-screen)         |
| Text width                   | Pageless: narrow, medium, wide, full      | specified                              | [Page layout](page-layout.md#pageless)                                |
| Show tabs and outlines       | The outline panel with document tabs      | specified                              | [Links and navigation](links-and-navigation.md#the-outline)           |

## Insert menu

| Row                           | Rule                                                                                | Status        | Spec                                                              |
| ----------------------------- | ----------------------------------------------------------------------------------- | ------------- | ----------------------------------------------------------------- |
| Image: upload from computer   | Upload into the document                                                            | specified     | [Objects](objects.md#pictures)                                    |
| Image: search the web         | LiveDoc's own image search, where configured                                        | either way    | [Objects](objects.md#pictures)                                    |
| Image: Drive, Photos          | Google's stores                                                                     | left out (C3) | [Tools](tools.md#google-only-services)                            |
| Image: by URL                 | Fetched once, copied into the gallery                                               | specified     | [Objects](objects.md#pictures)                                    |
| Image: camera                 | Take a picture with the device camera                                               | either way    | [Objects](objects.md#pictures)                                    |
| Image: LiveDoc gallery        | LiveDoc's own image gallery (LiveDoc's addition)                                    | specified     | [Objects](objects.md#pictures)                                    |
| Table: grid                   | Up to 20 × 20 from the grid                                                         | specified     | [Tables](tables.md#inserting)                                     |
| Table: templates              | Google's table templates                                                            | specified     | [Tables](tables.md#inserting)                                     |
| Building blocks               | Meeting notes, email draft, roadmap, review tracker, assets, launch tracker, custom | either way    | [Objects](objects.md#building-blocks)                             |
| Smart chips: date             | A date chip; in a file, kept as its text                                            | left out (C3) | [Links and navigation](links-and-navigation.md)                   |
| Smart chips: dropdown         | A dropdown chip with options and colours; in a file, kept as its text               | left out (C3) | [Links and navigation](links-and-navigation.md)                   |
| Smart chips: people           | A person on the document or a team; in a file, kept as its text                     | left out (C3) | [Links and navigation](links-and-navigation.md)                   |
| Smart chips: file             | A LiveDoc document; in a file, kept as its text                                     | left out (C3) | [Links and navigation](links-and-navigation.md)                   |
| Smart chips: calendar event   | Google Calendar                                                                     | left out (C3) | [Tools](tools.md#google-only-services)                            |
| Smart chips: place            | Google Maps                                                                         | left out (C3) | [Tools](tools.md#google-only-services)                            |
| Smart chips: stopwatch, timer | A live stopwatch or timer; in a file, kept as its text                              | left out (C3) | [Links and navigation](links-and-navigation.md)                   |
| Smart chips: variables        | Named values reused through the document; in a file, kept as its text               | left out (C3) | [Links and navigation](links-and-navigation.md)                   |
| Smart chips: finance          | Google Finance                                                                      | left out (C3) | [Tools](tools.md#google-only-services)                            |
| Link                          | ⌘K                                                                                  | specified     | [Links and navigation](links-and-navigation.md#links)             |
| Drawing: new                  | A LiveDoc canvas drawing in the document                                            | specified     | [Objects](objects.md#drawings)                                    |
| Drawing: from Drive           | A LiveDoc document's tab as a drawing (in Drive's place)                            | specified     | [Objects](objects.md#drawings)                                    |
| Chart                         | Bar, column, line, pie, from a LiveDoc spreadsheet (plan 0020)                      | specified     | [Objects](objects.md#charts)                                      |
| Symbols: special characters   | Search, browse by category, draw to find                                            | specified     | [Objects](objects.md#special-characters)                          |
| Symbols: equation             | An equation with its toolbar                                                        | specified     | [Objects](objects.md#equations)                                   |
| Tab                           | A new document tab                                                                  | specified     | [Text document](text-document.md#tabs-inside-one-text-document)   |
| Horizontal line               | A line across the text                                                              | specified     | [Objects](objects.md#horizontal-line)                             |
| Emoji                         | The emoji picker                                                                    | specified     | [Objects](objects.md#emoji)                                       |
| Footnote                      | ⌘⌥F                                                                                 | specified     | [Page layout](page-layout.md#footnotes)                           |
| Headers and footers           | Insert or move to header, footer                                                    | specified     | [Page layout](page-layout.md#headers-and-footers)                 |
| Page numbers                  | Where they go, where they start                                                     | specified     | [Page layout](page-layout.md#page-numbers)                        |
| Break: page                   | ⌘Enter                                                                              | specified     | [Page layout](page-layout.md#breaks)                              |
| Break: section (next page)    | A new section on a new page                                                         | specified     | [Page layout](page-layout.md#breaks)                              |
| Break: section (continuous)   | A new section on the same page                                                      | specified     | [Page layout](page-layout.md#breaks)                              |
| Break: column                 | Ends the column                                                                     | specified     | [Page layout](page-layout.md#breaks)                              |
| Bookmark                      | A named place in the body                                                           | specified     | [Links and navigation](links-and-navigation.md#bookmarks)         |
| Table of contents             | Plain text, dotted, with blue links                                                 | specified     | [Links and navigation](links-and-navigation.md#table-of-contents) |
| Comment                       | ⌘⌥M                                                                                 | specified     | [Review](review.md#comments)                                      |

## Format menu

| Row                           | Rule                                                                              | Status    | Spec                                                                 |
| ----------------------------- | --------------------------------------------------------------------------------- | --------- | -------------------------------------------------------------------- |
| Text: bold, italic, underline | ⌘B, ⌘I, ⌘U                                                                        | specified | [Text and paragraphs](text-and-paragraphs.md#text-formatting)        |
| Text: strikethrough           | ⌘⇧X                                                                               | specified | [Text and paragraphs](text-and-paragraphs.md#text-formatting)        |
| Text: superscript, subscript  | ⌘. and ⌘,                                                                         | specified | [Text and paragraphs](text-and-paragraphs.md#text-formatting)        |
| Text: size up and down        | ⌘⇧. and ⌘⇧,                                                                       | specified | [Text and paragraphs](text-and-paragraphs.md#text-formatting)        |
| Text: capitalisation          | lowercase, UPPERCASE, Title Case                                                  | specified | [Text and paragraphs](text-and-paragraphs.md#text-formatting)        |
| Text: small caps              | ⌘⇧K (Option⇧K on Mac)                                                             | specified | [Text and paragraphs](text-and-paragraphs.md#text-formatting)        |
| Paragraph styles              | Normal text, Title, Subtitle, Heading 1 to 6; apply; update to match              | specified | [Text and paragraphs](text-and-paragraphs.md#paragraph-styles)       |
| Paragraph styles: options     | Save as my default styles, use my default styles, reset styles                    | specified | [Text and paragraphs](text-and-paragraphs.md#default-styles)         |
| Align and indent              | Left, centre, right, justified; indent more and less; indentation options         | specified | [Text and paragraphs](text-and-paragraphs.md#alignment-and-indents)  |
| Line and paragraph spacing    | Presets, before and after, custom; keep with next, together, prevent single lines | specified | [Text and paragraphs](text-and-paragraphs.md#spacing-and-keep-rules) |
| Columns                       | One, two, three; count, spacing, line between                                     | specified | [Page layout](page-layout.md#columns)                                |
| Bullets and numbering         | Numbered, bulleted, checklist; list options                                       | specified | [Lists](lists.md)                                                    |
| Headers and footers options   | Margins, different first page, different odd and even                             | specified | [Page layout](page-layout.md#headers-and-footers)                    |
| Page numbers options          | Where, start at                                                                   | specified | [Page layout](page-layout.md#page-numbers)                           |
| Page orientation              | Portrait, landscape, per section                                                  | specified | [Page layout](page-layout.md#page-setup)                             |
| Switch to pageless format     | Pageless on and off                                                               | specified | [Page layout](page-layout.md#pageless)                               |
| Table                         | Properties, insert, delete, merge, split, distribute, sort, pin header rows       | specified | [Tables](tables.md)                                                  |
| Image                         | Crop, size and rotation, wrapping, position, alt text, replace, options           | specified | [Objects](objects.md#pictures)                                       |
| Borders and lines             | Paragraph borders and shading                                                     | specified | [Text and paragraphs](text-and-paragraphs.md#borders-and-shading)    |
| Clear formatting              | ⌘\                                                                                | specified | [Text and paragraphs](text-and-paragraphs.md#clear-formatting)       |

## Tools menu

| Row                    | Rule                                                | Status        | Spec                                                      |
| ---------------------- | --------------------------------------------------- | ------------- | --------------------------------------------------------- |
| Spelling and grammar   | Check, suggestions on and off, personal dictionary  | specified     | [Tools](tools.md#spelling-and-grammar)                    |
| Word count             | ⌘⇧C; display while typing                           | specified     | [Tools](tools.md#word-count)                              |
| Review suggested edits | The review panel                                    | specified     | [Review](review.md#reviewing-suggestions)                 |
| Compare documents      | A new document of suggestions between two           | specified     | [Review](review.md#compare-documents)                     |
| Citations              | MLA, APA, Chicago; sources; insert, bibliography    | either way    | [Tools](tools.md#citations)                               |
| Linked objects         | Charts and drawings linked to their sources; update | either way    | [Objects](objects.md#linked-objects)                      |
| Dictionary             | ⌘⇧Y, definitions                                    | either way    | [Tools](tools.md#dictionary)                              |
| Translate document     | A translated copy, through a configured service     | left out (C3) | [Tools](tools.md#google-only-services)                    |
| Voice typing           | ⌘⇧S                                                 | left out (C3) | [Tools](tools.md#google-only-services)                    |
| Notification settings  | Comments, edits                                     | specified     | [Review](review.md#notifications)                         |
| Preferences            | The typing aids and substitutions                   | specified     | [Text and paragraphs](text-and-paragraphs.md#typing-aids) |
| Accessibility          | Screen reader support, braille, speak commands      | specified     | [Tools](tools.md#accessibility-settings)                  |
| Activity dashboard     | Who viewed and when                                 | either way    | [Tools](tools.md#activity)                                |
| Explore                | Google search beside the document                   | left out (C3) | [Tools](tools.md#google-only-services)                    |

## Extensions and Help

| Row                                             | Rule                                     | Status                                   | Spec                                                     |
| ----------------------------------------------- | ---------------------------------------- | ---------------------------------------- | -------------------------------------------------------- |
| Add-ons                                         | Google's marketplace                     | left out (C3)                            | [Tools](tools.md#google-only-services)                   |
| Apps Script                                     | Google's scripting                       | left out (C3)                            | [Tools](tools.md#google-only-services)                   |
| Agents (LiveDoc's own)                          | MCP and the CLI in their place           | specified                                | [Agents and sync](agents-and-sync.md)                    |
| Help                                            | The help centre's text document articles | specified                                | [Editing surface](editing-surface.md#the-menu-bar)       |
| Keyboard shortcuts                              | ⌘/, the dialog                           | built (`OfficeShortcutsDialog.test.tsx`) | [Editing surface](editing-surface.md#keyboard-shortcuts) |
| Tool finder                                     | ⌥/, search the menus                     | built (`OfficeToolFinder.test.tsx`)      | [Editing surface](editing-surface.md#tool-finder)        |
| Report abuse, privacy, terms, updates, training | LiveDoc's own pages                      | specified                                | [Editing surface](editing-surface.md#the-menu-bar)       |

## Toolbar

| Row                           | Rule                                       | Status                                                   | Spec                                                                |
| ----------------------------- | ------------------------------------------ | -------------------------------------------------------- | ------------------------------------------------------------------- |
| Tool finder                   | Search the menus                           | built (`OfficeToolbar.test.tsx`, `office-shell.spec.ts`) | [Editing surface](editing-surface.md#the-toolbar)                   |
| Undo, Redo, Print             | As the menus                               | specified                                                | [Editing surface](editing-surface.md#the-toolbar)                   |
| Spelling and grammar check    | Opens the check                            | specified                                                | [Editing surface](editing-surface.md#the-toolbar)                   |
| Paint format                  | Copy formatting once, double-click to keep | specified                                                | [Text and paragraphs](text-and-paragraphs.md#paint-format)          |
| Zoom                          | 50 to 200 percent, Fit                     | built (`OfficeToolbar.test.tsx`, `office-shell.spec.ts`) | [Editing surface](editing-surface.md#zoom)                          |
| Styles, Font, Font size       | Menus and the size field with − and +      | specified                                                | [Editing surface](editing-surface.md#the-toolbar)                   |
| Bold, Italic, Underline       | Toggles                                    | specified                                                | [Editing surface](editing-surface.md#the-toolbar)                   |
| Text colour, Highlight colour | The one colour picker                      | specified                                                | [Text and paragraphs](text-and-paragraphs.md#colour)                |
| Link, Comment, Image          | As the menus                               | specified                                                | [Editing surface](editing-surface.md#the-toolbar)                   |
| Align, Spacing                | Menus                                      | specified                                                | [Editing surface](editing-surface.md#the-toolbar)                   |
| Checklist, Bulleted, Numbered | Toggles with a menu of styles              | specified                                                | [Lists](lists.md)                                                   |
| Indent less and more          | ⌘[ and ⌘]                                  | specified                                                | [Text and paragraphs](text-and-paragraphs.md#alignment-and-indents) |
| Clear formatting              | ⌘\                                         | specified                                                | [Text and paragraphs](text-and-paragraphs.md#clear-formatting)      |
| Overflow                      | Controls past the width go into a ⋮ menu   | specified                                                | [Editing surface](editing-surface.md#the-toolbar)                   |
| Mode switch                   | Editing, Suggesting, Viewing               | specified                                                | [Review](review.md#editing-modes)                                   |
| Hide the menus                | Compact mode, Ctrl⇧F                       | specified                                                | [Editing surface](editing-surface.md#compact-and-full-screen)       |

## Either way

Rows that could read either way under C3 (core only), asked of Webber once with this matrix:

- **Building blocks**: templates of tables and text are core; most of Google's use dropdown, people and date chips.
- **Image: search the web**: LiveDoc's own image search exists for the canvas; on the web it is an outside service.
- **Image: camera**: the device's camera, no outside service.
- **Email: this file, collaborators**: LiveDoc's own email, where a host configures it.
- **Share: publish to web**: LiveDoc's public view link and embed.
- **Dictionary**: definitions need a dictionary service or a shipped dictionary.
- **Citations**: core writing; Google's source search is a service.
- **Activity dashboard**: who viewed and when, from LiveDoc's own opens.
- **Linked objects**: charts and drawings linked to their LiveDoc sources.
- **Grammar**: spelling is core; grammar needs a server (fork D5, ruled: none on docs.nu, hosts may configure one).

## Context menus, side panels and dialogs

| Row                                          | Rule                                                   | Status                                                          | Spec                                                            |
| -------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------- | --------------------------------------------------------------- |
| Context menu: text                           | As the inventory lists                                 | specified                                                       | [Editing surface](editing-surface.md#context-menus)             |
| Context menu: table                          | Rows, columns, cells, properties                       | specified                                                       | [Tables](tables.md#context-menu)                                |
| Context menu: image                          | Crop, replace, options, alt text, wrap                 | specified                                                       | [Objects](objects.md#pictures)                                  |
| Context menu: link, chip                     | Preview, copy, edit, remove                            | specified                                                       | [Links and navigation](links-and-navigation.md#links)           |
| Panel: outline                               | Document tabs and their headings                       | headings built (`TextDocumentOutline.test.tsx`); tabs specified | [Links and navigation](links-and-navigation.md#the-outline)     |
| Panel: comments                              | All, for you, filters                                  | specified                                                       | [Review](review.md#comments)                                    |
| Panel: version history                       | Versions, who changed what                             | specified                                                       | [Review](review.md#version-history)                             |
| Panel: image options                         | Size, rotation, wrap, position, recolour, adjustments  | specified                                                       | [Objects](objects.md#pictures)                                  |
| Panel: Calendar, Keep, Tasks, Contacts, Maps | Google's side apps                                     | left out (C3)                                                   | [Tools](tools.md#google-only-services)                          |
| Dialog: every dialog of the inventory        | Each in its area's spec, on the shell's dialog pattern | specified                                                       | [Office shell](../004-interface-design/office-shell.md#dialogs) |

## Shortcuts

Every shortcut of Google's list for PC, Mac and ChromeOS is a row of [Keyboard shortcuts](keyboard-shortcuts.md), with
its own status there. Shortcuts of left-out rows (voice typing, Explore, input tools, people chips) follow their row.

## Modes and limits

| Row                          | Rule                      | Status    | Spec                                                          |
| ---------------------------- | ------------------------- | --------- | ------------------------------------------------------------- |
| Editing, Suggesting, Viewing | One person's editing mode | specified | [Review](review.md#editing-modes)                             |
| Print layout, pageless       | Per document              | specified | [Page layout](page-layout.md)                                 |
| Compact mode, full screen    | Per person                | specified | [Editing surface](editing-surface.md#compact-and-full-screen) |
| Screen reader, braille       | Per person                | specified | [Tools](tools.md#accessibility-settings)                      |
| 1.02 million characters      | `TEXT_DOCUMENT_MAX_CHARS` | specified | [Text document](text-document.md#limits)                      |
