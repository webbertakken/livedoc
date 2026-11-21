# Parity matrix

**Status: specified.** Nothing is built. Every row reads `specified` until it is built; a built row names the test
that proves it.

What "all functionality" is measured against (F5, ruled by Webber on 2026-11-21): **every topic of Adobe's own help for Acrobat on
desktop**, 403 topics in its contents as read on 2026-11-21
([The Acrobat inventory](../../research/pdf-documents/acrobat-inventory.md)). One row a topic, under Adobe's own
sections and topic titles. Each row states its rule in one line, the [editing mode](editing-modes.md) it lands in
(or Files, for what Download, sync and sharing own), its status, and the spec that holds the detail. Acrobat's
functions are laid out in LiveDoc's own office shell; its name, logos and artwork never appear in the product.

A row is done when it reads **built** (with its test) or **left out** (with Webber's ruling).

| Status                | Means                                                                            | Rows |
| --------------------- | -------------------------------------------------------------------------------- | ---- |
| `specified`           | In, by the spec named                                                            | 162  |
| `specified, in part`  | In, but for the part its rule names as left out                                  | 26   |
| `left out (<ruling>)` | Not built, by the ruling or fork named                                           | 161  |
| `not a function`      | Not a function of a PDF: installing, updating and troubleshooting Acrobat itself | 54   |
| `built (<test>)`      | Built, with the test that proves it                                              | 0    |

- Left out, by ruling: 7 `left out (C4)`, 1 `left out (F10)`, 1 `left out (F12)`, 50 `left out (F14)`, 102 `left out (F5)`.
- **C4, F5 and F14 are ruled** (Webber, 2026-11-21): the reference is this inventory, and Acrobat's far tools are left
  out, their data in a file kept untouched. A row reading `left out (F5)` is this matrix's reading of the reference,
  topic by topic: Webber may bring any one back in, and the row changes here first.
- **F10 (scans) and F12 (starting from nothing) are open**: their two rows stand as defaults until ruled.
- `not a function` rows are left out under F5's ruling with the rest; they are told apart so the count of functions
  is honest.
- What is left out and why, by group: [Left out](#left-out). What LiveDoc has that the inventory lacks:
  [Beyond the inventory](#beyond-the-inventory).

## What's new

| Topic                                  | Rule                        | Mode | Status         | Spec |
| -------------------------------------- | --------------------------- | ---- | -------------- | ---- |
| What's new in Adobe Acrobat on desktop | Acrobat's own release notes |      | not a function |      |
| Adobe Acrobat on desktop release notes | Acrobat's own release notes |      | not a function |      |

## Get started: learn the basics

| Topic                                                | Rule                                                                                                                             | Mode    | Status             | Spec                                                       |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------ | ---------------------------------------------------------- |
| Acrobat on desktop overview                          | What a PDF document's surface offers, laid out in LiveDoc's office shell                                                         | Viewing | specified          | [Reading surface](reading-surface.md)                      |
| Workspace basics                                     | Title row, menus, toolbar, left panel, pages, side panel and page bar                                                            | Viewing | specified          | [Reading surface](reading-surface.md#layout-top-to-bottom) |
| Technical requirements                               | Acrobat's system requirements; LiveDoc's are a current browser                                                                   |         | not a function     |                                                            |
| Supported file formats                               | A PDF opens as a PDF document; every other file is another kind                                                                  | Files   | specified          | [Files, print and sync](files-print-and-sync.md#opening)   |
| Navigate through pages                               | Next, previous, first, last, go to page, previous and next view, bookmarks; automatic scrolling and article threads are left out | Viewing | specified, in part | [Reading surface](reading-surface.md#the-pages)            |
| Identify Acrobat track and version                   | Telling which Acrobat is installed                                                                                               |         | not a function     |                                                            |
| Asian, European, and Middle Eastern language support | Text in any script draws; new text in a complex script is shaped by the browser and written as glyphs                            | Editing | specified          | [Editing text](editing-text.md#typing)                     |
| Work smarter with the prompt bar                     | Adobe's assistant prompt bar; LiveDoc's agents work through their own tools                                                      |         | left out (F5)      | [Agents](agents.md)                                        |

## Get started: access the app

| Topic                                          | Rule                                                                         | Mode | Status         | Spec |
| ---------------------------------------------- | ---------------------------------------------------------------------------- | ---- | -------------- | ---- |
| Download Acrobat Pro or Standard               | Installing, updating and licensing Acrobat itself; LiveDoc runs in a browser |      | not a function |      |
| Install Acrobat                                | Installing, updating and licensing Acrobat itself; LiveDoc runs in a browser |      | not a function |      |
| Install Acrobat trial                          | Installing, updating and licensing Acrobat itself; LiveDoc runs in a browser |      | not a function |      |
| Install Acrobat Reader                         | Installing, updating and licensing Acrobat itself; LiveDoc runs in a browser |      | not a function |      |
| Install Acrobat Enterprise term or VIP license | Installing, updating and licensing Acrobat itself; LiveDoc runs in a browser |      | not a function |      |
| Install Acrobat 2020                           | Installing, updating and licensing Acrobat itself; LiveDoc runs in a browser |      | not a function |      |
| Download font and spelling packs               | Installing, updating and licensing Acrobat itself; LiveDoc runs in a browser |      | not a function |      |
| Update Acrobat automatically                   | Installing, updating and licensing Acrobat itself; LiveDoc runs in a browser |      | not a function |      |
| Update Adobe Acrobat manually                  | Installing, updating and licensing Acrobat itself; LiveDoc runs in a browser |      | not a function |      |
| Install an older version of Acrobat Reader     | Installing, updating and licensing Acrobat itself; LiveDoc runs in a browser |      | not a function |      |
| Uninstall Adobe Acrobat                        | Installing, updating and licensing Acrobat itself; LiveDoc runs in a browser |      | not a function |      |
| Uninstall Acrobat Reader                       | Installing, updating and licensing Acrobat itself; LiveDoc runs in a browser |      | not a function |      |
| Acrobat Express for enterprise and teams       | Installing, updating and licensing Acrobat itself; LiveDoc runs in a browser |      | not a function |      |

## Get started: preferences and settings

| Topic                                  | Rule                                                                                        | Mode    | Status             | Spec                                                 |
| -------------------------------------- | ------------------------------------------------------------------------------------------- | ------- | ------------------ | ---------------------------------------------------- |
| Set Acrobat as the default PDF program | The operating system's default PDF program                                                  |         | not a function     |                                                      |
| Change display themes                  | The chrome follows the colour scheme; Dark pages is one person's view of the pages          | Viewing | specified          | [Dark pages](dark-pages.md)                          |
| Change Acrobat language                | The app's language is LiveDoc's own setting                                                 |         | not a function     |                                                      |
| Customize side panels                  | One left panel at a time, remembered per person; rearranging panels is left out             | Viewing | specified, in part | [Reading surface](reading-surface.md#the-left-panel) |
| Customize Quick action toolbar         | The toolbar is the editing mode's; a tool's look is remembered, its place is not customised | Viewing | left out (F5)      | [Reading surface](reading-surface.md#the-toolbar)    |
| Keyboard shortcuts                     | Acrobat's keys where the browser and the shell leave them free                              | Viewing | specified          | [Keyboard shortcuts](keyboard-shortcuts.md)          |
| Turn the new Acrobat on or off         | Switching between Acrobat's two interfaces                                                  |         | not a function     |                                                      |
| Set Acrobat update preferences         | Acrobat's updater                                                                           |         | not a function     |                                                      |

## Acrobat AI

| Topic                                       | Rule                                                                              | Mode | Status        | Spec                |
| ------------------------------------------- | --------------------------------------------------------------------------------- | ---- | ------------- | ------------------- |
| Generative AI overview                      | Adobe's assistant; LiveDoc's agents read and change a PDF through their own tools |      | left out (F5) | [Agents](agents.md) |
| Generative AI technical requirements        | Adobe's assistant; LiveDoc's agents read and change a PDF through their own tools |      | left out (F5) | [Agents](agents.md) |
| Explore generative AI in Acrobat            | Adobe's assistant; LiveDoc's agents read and change a PDF through their own tools |      | left out (F5) | [Agents](agents.md) |
| Generative summary in Acrobat               | Adobe's assistant; LiveDoc's agents read and change a PDF through their own tools |      | left out (F5) | [Agents](agents.md) |
| Access generative AI tools in Acrobat       | Adobe's assistant; LiveDoc's agents read and change a PDF through their own tools |      | left out (F5) | [Agents](agents.md) |
| Request AI Assistant access as Teams admins | Adobe's assistant; LiveDoc's agents read and change a PDF through their own tools |      | left out (F5) | [Agents](agents.md) |
| Request AI Assistant access as Teams users  | Adobe's assistant; LiveDoc's agents read and change a PDF through their own tools |      | left out (F5) | [Agents](agents.md) |
| Turn off generative AI features             | Adobe's assistant; LiveDoc's agents read and change a PDF through their own tools |      | left out (F5) | [Agents](agents.md) |
| Administer Acrobat Studio for enterprise    | Adobe's assistant; LiveDoc's agents read and change a PDF through their own tools |      | left out (F5) | [Agents](agents.md) |
| Generative AI usage policy and limitations  | Adobe's assistant; LiveDoc's agents read and change a PDF through their own tools |      | left out (F5) | [Agents](agents.md) |
| Adobe generative AI user disclosures        | Adobe's assistant; LiveDoc's agents read and change a PDF through their own tools |      | left out (F5) | [Agents](agents.md) |
| About podcasts in Adobe Acrobat             | Adobe's assistant; LiveDoc's agents read and change a PDF through their own tools |      | left out (F5) | [Agents](agents.md) |
| Create podcasts in Adobe Acrobat            | Adobe's assistant; LiveDoc's agents read and change a PDF through their own tools |      | left out (F5) | [Agents](agents.md) |
| Generative AI use cases in Acrobat          | Adobe's assistant; LiveDoc's agents read and change a PDF through their own tools |      | left out (F5) | [Agents](agents.md) |
| Overview of prompt writing for AI Assistant | Adobe's assistant; LiveDoc's agents read and change a PDF through their own tools |      | left out (F5) | [Agents](agents.md) |
| Use AI Assistant to get answers in your PDF | Adobe's assistant; LiveDoc's agents read and change a PDF through their own tools |      | left out (F5) | [Agents](agents.md) |
| Generate AI summaries                       | Adobe's assistant; LiveDoc's agents read and change a PDF through their own tools |      | left out (F5) | [Agents](agents.md) |
| React to AI responses in Acrobat            | Adobe's assistant; LiveDoc's agents read and change a PDF through their own tools |      | left out (F5) | [Agents](agents.md) |
| Summarize meeting transcripts in Acrobat    | Adobe's assistant; LiveDoc's agents read and change a PDF through their own tools |      | left out (F5) | [Agents](agents.md) |
| AI Assistant chat history                   | Adobe's assistant; LiveDoc's agents read and change a PDF through their own tools |      | left out (F5) | [Agents](agents.md) |
| Adobe Acrobat AI Assistant Plus             | Adobe's assistant; LiveDoc's agents read and change a PDF through their own tools |      | left out (F5) | [Agents](agents.md) |
| Edit PDFs via chat overview                 | Adobe's assistant; LiveDoc's agents read and change a PDF through their own tools |      | left out (F5) | [Agents](agents.md) |
| Edit PDFs via chat                          | Adobe's assistant; LiveDoc's agents read and change a PDF through their own tools |      | left out (F5) | [Agents](agents.md) |
| Edit PDFs via chat not working in Acrobat   | Adobe's assistant; LiveDoc's agents read and change a PDF through their own tools |      | left out (F5) | [Agents](agents.md) |
| Acrobat AI prompt library for editing PDFs  | Adobe's assistant; LiveDoc's agents read and change a PDF through their own tools |      | left out (F5) | [Agents](agents.md) |
| Edit text with chat                         | Adobe's assistant; LiveDoc's agents read and change a PDF through their own tools |      | left out (F5) | [Agents](agents.md) |
| Format text with chat                       | Adobe's assistant; LiveDoc's agents read and change a PDF through their own tools |      | left out (F5) | [Agents](agents.md) |
| Highlight text with chat                    | Adobe's assistant; LiveDoc's agents read and change a PDF through their own tools |      | left out (F5) | [Agents](agents.md) |
| Redact text with chat in Acrobat            | Adobe's assistant; LiveDoc's agents read and change a PDF through their own tools |      | left out (F5) | [Agents](agents.md) |

## Create PDFs

| Topic                                              | Rule                                                                                                            | Mode    | Status             | Spec                                                                       |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------- | ------------------ | -------------------------------------------------------------------------- |
| Convert files to PDFs                              | Other LiveDoc kinds download as PDF and may be kept as a PDF document; converting files from a disk is left out | Files   | specified, in part | [Files, print and sync](files-print-and-sync.md#other-kinds-meeting-a-pdf) |
| Supported file formats for PDF conversion          | What converts to PDF is what LiveDoc's other kinds write                                                        | Files   | specified, in part | [Files, print and sync](files-print-and-sync.md#other-kinds-meeting-a-pdf) |
| Convert web pages to PDFs                          | Converting a web page by its address                                                                            |         | left out (F5)      |                                                                            |
| Web page conversion settings                       | Converting a web page by its address                                                                            |         | left out (F5)      |                                                                            |
| Create PDFs by printing to file                    | Printing to a PDF is the browser's and the operating system's own                                               |         | left out (F5)      |                                                                            |
| Create a PDF from clipboard content                | A copied picture becomes a page; a copied PDF pasted on the Explorer becomes a PDF document                     | Editing | specified, in part | [Organising pages](organising-pages.md#inserting)                          |
| Create a PDF from scratch                          | A PDF document is never started from nothing                                                                    | Files   | left out (F12)     | [Starting and finding](starting-and-finding.md#starting-one)               |
| Enable XPS to PDF conversion in Acrobat on Windows | A Windows conversion setting                                                                                    |         | left out (F5)      |                                                                            |

## Advanced conversion settings

| Topic                                   | Rule                                | Mode | Status        | Spec |
| --------------------------------------- | ----------------------------------- | ---- | ------------- | ---- |
| Acrobat Distiller overview              | Distiller and PostScript conversion |      | left out (F5) |      |
| Create PDFs using Acrobat Distiller     | Distiller and PostScript conversion |      | left out (F5) |      |
| Create Watched Folders in Acrobat Pro   | Distiller and PostScript conversion |      | left out (F5) |      |
| Adobe PDF presets overview              | Distiller and PostScript conversion |      | left out (F5) |      |
| PostScript to PDF conversion guidelines | Distiller and PostScript conversion |      | left out (F5) |      |
| Adobe PDF settings overview             | Distiller and PostScript conversion |      | left out (F5) |      |
| Share custom PDF settings               | Distiller and PostScript conversion |      | left out (F5) |      |
| Acrobat Distiller fonts overview        | Distiller and PostScript conversion |      | left out (F5) |      |
| Embedding fonts in PDFs overview        | Distiller and PostScript conversion |      | left out (F5) |      |
| Embed fonts using Acrobat Distiller     | Distiller and PostScript conversion |      | left out (F5) |      |
| Find font names in PDFs                 | Distiller and PostScript conversion |      | left out (F5) |      |

## Scan documents to PDFs

| Topic                               | Rule                                                                          | Mode      | Status             | Spec                                        |
| ----------------------------------- | ----------------------------------------------------------------------------- | --------- | ------------------ | ------------------------------------------- |
| Scan documents                      | Driving a scanner; a scan arrives as a PDF                                    |           | left out (F5)      | [Scans](scans.md#editing-a-scans-words)     |
| Recognize text in scanned documents | Text recognition in the browser, on demand, by language and page range        | Reviewing | specified          | [Scans](scans.md#recognising)               |
| Fix text issues in scanned PDFs     | Low-confidence words are stepped through and corrected                        | Reviewing | specified          | [Scans](scans.md#reviewing-recognised-text) |
| Edit scanned documents              | A scan's words are not edited as the author's; text is added over the picture | Editing   | left out (F10)     | [Scans](scans.md#editing-a-scans-words)     |
| Enhance images                      | Enhancing a camera picture                                                    |           | left out (F5)      | [Scans](scans.md#editing-a-scans-words)     |
| Enhance scanned documents           | Straightening, cleaning and recompressing a scan                              |           | left out (F5)      | [Scans](scans.md#editing-a-scans-words)     |
| Scanned PDF settings                | Language and pages; output style and compression choices are left out         | Reviewing | specified, in part | [Scans](scans.md#recognising)               |

## Optimise PDFs

| Topic                                                 | Rule                                                                         | Mode    | Status    | Spec                                                   |
| ----------------------------------------------------- | ---------------------------------------------------------------------------- | ------- | --------- | ------------------------------------------------------ |
| Reduce PDF file size                                  | Three presets, each saying what it costs, the result shown before it is kept | Editing | specified | [Document tools](document-tools.md#reducing-file-size) |
| Reduce PDF file size with advanced options            | Advanced: picture resolution and quality, fonts, what to discard             | Editing | specified | [Document tools](document-tools.md#reducing-file-size) |
| Reduce PDF file size by unembedding fonts             | Unembedding only fonts every reader has                                      | Editing | specified | [Document tools](document-tools.md#reducing-file-size) |
| View storage space used by different elements in PDFs | Properties > Size: what takes the file's bytes                               | Viewing | specified | [Document tools](document-tools.md#properties)         |
| PDF optimizer settings                                | The optimiser's settings as one Advanced dialog                              | Editing | specified | [Document tools](document-tools.md#reducing-file-size) |

## Edit text

| Topic                                     | Rule                                                                   | Mode    | Status             | Spec                                             |
| ----------------------------------------- | ---------------------------------------------------------------------- | ------- | ------------------ | ------------------------------------------------ |
| Add new text                              | A new text box, in the default font                                    | Editing | specified          | [Editing text](editing-text.md#boxes-as-objects) |
| Change, replace, or delete text           | Type, delete and replace in a text box, reflowed inside it             | Editing | specified          | [Editing text](editing-text.md#typing)           |
| Format text                               | Font, size, weight, colour, alignment, spacing, scale                  | Editing | specified          | [Editing text](editing-text.md#formatting)       |
| Adjust text boxes                         | Move, resize, rotate, split and join text boxes                        | Editing | specified          | [Editing text](editing-text.md#boxes-as-objects) |
| Set default fonts                         | The default font for new text and for characters a file's font lacks   | Editing | specified          | [Editing text](editing-text.md#formatting)       |
| Edit numbered or bulleted lists           | Bulleted and numbered items continue, renumber and indent              | Editing | specified          | [Editing text](editing-text.md#typing)           |
| Check spellings and manage accepted words | The browser's spelling while typing; a document-wide check is left out | Editing | specified, in part | [Editing text](editing-text.md#typing)           |

## Edit images or objects

| Topic                                  | Rule                                                           | Mode    | Status        | Spec                           |
| -------------------------------------- | -------------------------------------------------------------- | ------- | ------------- | ------------------------------ |
| Add images                             | Add a picture, kept in its own encoding, with alternative text | Editing | specified     | [Objects](objects.md#pictures) |
| Modify images                          | Replace, move, resize, rotate, flip, crop                      | Editing | specified     | [Objects](objects.md#pictures) |
| Edit images with external applications | Editing a picture in another program; Replace takes the result |         | left out (F5) | [Objects](objects.md#pictures) |
| Add objects                            | Shapes drawn into the page; arrange, align, distribute         | Editing | specified     | [Objects](objects.md#shapes)   |
| Delete images                          | Delete a picture from the page                                 | Editing | specified     | [Objects](objects.md#pictures) |

## Adobe Express

| Topic                                                      | Rule                  | Mode | Status        | Spec |
| ---------------------------------------------------------- | --------------------- | ---- | ------------- | ---- |
| Adobe Express in Acrobat overview                          | Another Adobe product |      | left out (F5) |      |
| Generate AI images from text                               | Another Adobe product |      | left out (F5) |      |
| Stylize PDFs using Adobe Express design tools              | Another Adobe product |      | left out (F5) |      |
| Design PDFs using Adobe Express                            | Another Adobe product |      | left out (F5) |      |
| Edit images with Adobe Express in Acrobat                  | Another Adobe product |      | left out (F5) |      |
| Create marketing documents using Adobe Express             | Another Adobe product |      | left out (F5) |      |
| About cover pages in Acrobat                               | Another Adobe product |      | left out (F5) |      |
| Generate a cover page                                      | Another Adobe product |      | left out (F5) |      |
| Create designs with Adobe Express in Acrobat               | Another Adobe product |      | left out (F5) |      |
| About creating designs with Adobe Express in Adobe Acrobat | Another Adobe product |      | left out (F5) |      |
| Stylize PDFs with Adobe Express templates                  | Another Adobe product |      | left out (F5) |      |
| Translate text using Adobe Express in Acrobat              | Another Adobe product |      | left out (F5) |      |

## Links and attachments

| Topic                           | Rule                                                                      | Mode    | Status    | Spec                                               |
| ------------------------------- | ------------------------------------------------------------------------- | ------- | --------- | -------------------------------------------------- |
| Add links to PDFs               | A link to a page view, a named place, a web address or a LiveDoc document | Editing | specified | [Objects](objects.md#links)                        |
| Add attachments to PDFs         | Embed a file in the PDF                                                   | Editing | specified | [Document tools](document-tools.md#embedded-files) |
| Change link formatting in PDFs  | Invisible or a visible rectangle, with its line                           | Editing | specified | [Objects](objects.md#links)                        |
| Move or resize a link rectangle | Move and resize a link's rectangle                                        | Editing | specified | [Objects](objects.md#links)                        |
| Open attachments in PDFs        | Saved only by a person; an embedded PDF opens as a new PDF document       | Viewing | specified | [Security](security.md#embedded-files)             |
| Link to destinations            | A link to a named place                                                   | Editing | specified | [Objects](objects.md#links)                        |
| Manage link destinations        | Named places listed, added, renamed, deleted                              | Editing | specified | [Objects](objects.md#links)                        |

## PDF properties

| Topic                                     | Rule                                                             | Mode    | Status    | Spec                                           |
| ----------------------------------------- | ---------------------------------------------------------------- | ------- | --------- | ---------------------------------------------- |
| Document properties and metadata overview | Description, Security, Fonts and Size                            | Viewing | specified | [Document tools](document-tools.md#properties) |
| Create document properties                | Custom properties by name and value                              | Editing | specified | [Document tools](document-tools.md#properties) |
| Edit document metadata                    | Title, author, subject, keywords, written to both metadata homes | Editing | specified | [Document tools](document-tools.md#properties) |
| View document metadata                    | Everyone who reads the document reads its properties             | Viewing | specified | [Document tools](document-tools.md#properties) |

## Organise pages

| Topic                               | Rule                                                           | Mode    | Status    | Spec                                                                      |
| ----------------------------------- | -------------------------------------------------------------- | ------- | --------- | ------------------------------------------------------------------------- |
| Delete pages in PDFs                | Delete pages; their marks return on undo                       | Editing | specified | [Organising pages](organising-pages.md#deleting-extracting-and-replacing) |
| Move or copy pages within PDFs      | Drag, cut and paste, duplicate, reverse                        | Editing | specified | [Organising pages](organising-pages.md#moving-and-duplicating)            |
| Move or copy pages between two PDFs | Copy and move pages between two PDF documents                  | Editing | specified | [Organising pages](organising-pages.md#moving-and-duplicating)            |
| Rotate pages in PDFs                | Rotate pages in the file; View rotates one person's view       | Editing | specified | [Organising pages](organising-pages.md#rotating-cropping-and-resizing)    |
| Replace pages in PDFs               | Replace page content, keeping what sits on top                 | Editing | specified | [Organising pages](organising-pages.md#deleting-extracting-and-replacing) |
| Renumber pages in PDFs              | Page labels by range, style, prefix and start                  | Editing | specified | [Organising pages](organising-pages.md#page-labels)                       |
| Split PDFs                          | Split by pages, bookmarks, size or chosen places               | Editing | specified | [Organising pages](organising-pages.md#splitting)                         |
| Extract pages from PDFs             | Extract pages as a new PDF document                            | Editing | specified | [Organising pages](organising-pages.md#deleting-extracting-and-replacing) |
| Crop pages in PDFs                  | Crop by box or margins; what is cropped is hidden, not removed | Editing | specified | [Organising pages](organising-pages.md#rotating-cropping-and-resizing)    |

## Backgrounds and watermarks

| Topic                       | Rule                                                             | Mode    | Status    | Spec                                            |
| --------------------------- | ---------------------------------------------------------------- | ------- | --------- | ----------------------------------------------- |
| Add watermarks to PDFs      | Text or picture, rotation, opacity, behind or in front, by pages | Editing | specified | [Document tools](document-tools.md#watermarks)  |
| Remove watermarks           | Remove a watermark                                               | Editing | specified | [Document tools](document-tools.md#watermarks)  |
| Update watermarks           | Update a watermark, another program's included                   | Editing | specified | [Document tools](document-tools.md#watermarks)  |
| Add backgrounds to PDFs     | A colour or picture behind everything                            | Editing | specified | [Document tools](document-tools.md#backgrounds) |
| Remove background from PDFs | Remove the background                                            | Editing | specified | [Document tools](document-tools.md#backgrounds) |
| Update backgrounds in PDFs  | Update the background                                            | Editing | specified | [Document tools](document-tools.md#backgrounds) |

## Headers and footers

| Topic                              | Rule                                   | Mode    | Status    | Spec                                                    |
| ---------------------------------- | -------------------------------------- | ------- | --------- | ------------------------------------------------------- |
| Add headers and footers to PDFs    | Six boxes of text and tokens, by pages | Editing | specified | [Document tools](document-tools.md#headers-and-footers) |
| Remove headers and footers         | Remove headers and footers             | Editing | specified | [Document tools](document-tools.md#headers-and-footers) |
| Add page numbers to PDFs           | Page numbers in a style and pattern    | Editing | specified | [Document tools](document-tools.md#headers-and-footers) |
| Modify headers and footers in PDFs | Update headers and footers             | Editing | specified | [Document tools](document-tools.md#headers-and-footers) |

## Bates numbering

| Topic                                                     | Rule                                                           | Mode    | Status         | Spec                                                |
| --------------------------------------------------------- | -------------------------------------------------------------- | ------- | -------------- | --------------------------------------------------- |
| Add Bates numbering in Acrobat Pro                        | Bates numbering; such numbers in a file are page content, kept | Editing | left out (F14) | [Organising pages](organising-pages.md#page-labels) |
| Add Bates numbering to existing file names in Acrobat Pro | Bates numbering; such numbers in a file are page content, kept | Editing | left out (F14) | [Organising pages](organising-pages.md#page-labels) |
| Remove Bates numbering in Acrobat Pro                     | Bates numbering; such numbers in a file are page content, kept | Editing | left out (F14) | [Organising pages](organising-pages.md#page-labels) |
| Search for Bates-numbered PDFs in Acrobat Pro             | Bates numbering; such numbers in a file are page content, kept | Editing | left out (F14) | [Organising pages](organising-pages.md#page-labels) |

## Combine files

| Topic                                   | Rule                                                       | Mode    | Status        | Spec                                              |
| --------------------------------------- | ---------------------------------------------------------- | ------- | ------------- | ------------------------------------------------- |
| Combine files into one PDF              | Several PDFs and LiveDoc documents into a new PDF document | Editing | specified     | [Organising pages](organising-pages.md#inserting) |
| Rearrange or resize combined files      | Order and page ranges set before combining                 | Editing | specified     | [Organising pages](organising-pages.md#inserting) |
| Insert one PDF into another             | Insert a PDF's pages                                       | Editing | specified     | [Organising pages](organising-pages.md#inserting) |
| Insert a blank page into a PDF          | Insert a blank page                                        | Editing | specified     | [Organising pages](organising-pages.md#inserting) |
| Insert web pages into a PDF             | Inserting a web page by its address                        |         | left out (F5) | [Organising pages](organising-pages.md#inserting) |
| Insert a clipboard selection into a PDF | A copied picture becomes a page                            | Editing | specified     | [Organising pages](organising-pages.md#inserting) |
| Embed PDFs in OLE container documents   | OLE containers are a desktop technology                    |         | left out (F5) |                                                   |

## PDF layers

| Topic                    | Rule                                                                                   | Mode    | Status             | Spec                                                 |
| ------------------------ | -------------------------------------------------------------------------------------- | ------- | ------------------ | ---------------------------------------------------- |
| PDF layers overview      | A file's PDF layers are listed                                                         | Viewing | specified          | [Reading surface](reading-surface.md#the-left-panel) |
| Import files as layers   | Authoring PDF layers                                                                   |         | left out (F14)     | [Reading surface](reading-surface.md#the-left-panel) |
| Manage PDF layers        | Show and hide a PDF layer, for one person; renaming, locking and deleting are left out | Viewing | specified, in part | [Reading surface](reading-surface.md#the-left-panel) |
| Reorder PDF layers       | Authoring PDF layers                                                                   |         | left out (F14)     | [Reading surface](reading-surface.md#the-left-panel) |
| Edit layer properties    | Authoring PDF layers                                                                   |         | left out (F14)     | [Reading surface](reading-surface.md#the-left-panel) |
| Add layer navigation     | An action that sets a PDF layer's state is never performed                             |         | left out (F14)     | [Security](security.md#links-and-actions)            |
| Merge and flatten layers | A flattened download merges PDF layers as shown                                        | Editing | specified, in part | [Document tools](document-tools.md#flattening)       |

## Geospatial PDFs

| Topic                                            | Rule                                    | Mode | Status         | Spec |
| ------------------------------------------------ | --------------------------------------- | ---- | -------------- | ---- |
| Geospatial PDFs overview                         | Measuring on maps; the pages still draw |      | left out (F14) |      |
| Create geospatial PDFs                           | Measuring on maps; the pages still draw |      | left out (F14) |      |
| Import shapefiles to geospatial PDFs             | Measuring on maps; the pages still draw |      | left out (F14) |      |
| Find map locations on geospatial PDFs            | Measuring on maps; the pages still draw |      | left out (F14) |      |
| Calculate distances and areas on geospatial PDFs | Measuring on maps; the pages still draw |      | left out (F14) |      |
| Customize geospatial measurements                | Measuring on maps; the pages still draw |      | left out (F14) |      |
| Export geospatial markups                        | Measuring on maps; the pages still draw |      | left out (F14) |      |

## PDF actions

| Topic                          | Rule                                                                                     | Mode    | Status             | Spec                                      |
| ------------------------------ | ---------------------------------------------------------------------------------------- | ------- | ------------------ | ----------------------------------------- |
| PDF actions overview           | Go to a place and open a web address are followed; every other action is never performed | Viewing | specified, in part | [Security](security.md#links-and-actions) |
| Add actions to PDF elements    | A link or bookmark goes to a place or an address; no other action is made                | Editing | specified, in part | [Objects](objects.md#links)               |
| Add actions to page thumbnails | Page actions are never performed, and none is made                                       |         | left out (F14)     | [Security](security.md#links-and-actions) |

## About signatures

| Topic                                      | Rule                                                                    | Mode      | Status    | Spec                                            |
| ------------------------------------------ | ----------------------------------------------------------------------- | --------- | --------- | ----------------------------------------------- |
| Digital signatures overview                | A certificate signature over the file's bytes                           | Reviewing | specified | [Signing](signing.md#certificate-signatures)    |
| E-signatures overview                      | A drawn signature: draw, type or upload                                 | Reviewing | specified | [Signing](signing.md#drawn-signatures)          |
| Prepare for certified digital signing      | Certify with what may change afterwards                                 | Reviewing | specified | [Signing](signing.md#certified-files)           |
| Permissions and limitations of signed PDFs | Reviewing keeps signatures valid; Editing breaks them and says so first | Reviewing | specified | [Signing](signing.md#changes-after-a-signature) |

## Request e-signatures

| Topic                          | Rule                                 | Mode | Status        | Spec                  |
| ------------------------------ | ------------------------------------ | ---- | ------------- | --------------------- |
| Send documents for e-signature | Sending a document out for signature |      | left out (C4) | [Signing](signing.md) |
| Request e-signatures in bulk   | Sending a document out for signature |      | left out (C4) | [Signing](signing.md) |
| Manage agreements              | Sending a document out for signature |      | left out (C4) | [Signing](signing.md) |
| Manage agreements sent in bulk | Sending a document out for signature |      | left out (C4) | [Signing](signing.md) |

## Manage digital signatures

| Topic                                             | Rule                                                                                    | Mode      | Status         | Spec                                               |
| ------------------------------------------------- | --------------------------------------------------------------------------------------- | --------- | -------------- | -------------------------------------------------- |
| Certify PDFs                                      | Certify a PDF                                                                           | Reviewing | specified      | [Signing](signing.md#certified-files)              |
| Compare signed document versions                  | View a signed version and compare it with now                                           | Viewing   | specified      | [Signing](signing.md#the-signatures-panel)         |
| Validate digital signatures                       | Intact or not, what it covers, whom the certificate names, what LiveDoc has not checked | Viewing   | specified      | [Signing](signing.md#the-signatures-panel)         |
| View signed and certified PDF portfolios          | Portfolios are kept untouched; their files are listed                                   |           | left out (F14) | [Document tools](document-tools.md#embedded-files) |
| Set certificate trust level                       | A browser holds no list of trusted issuers; LiveDoc says it has not checked             |           | left out (F5)  | [Signing](signing.md#the-signatures-panel)         |
| Set preferences for validating digital signatures | The check is one fixed check, with no preferences                                       |           | left out (F5)  | [Signing](signing.md#the-signatures-panel)         |

## Fill and sign documents

| Topic                                    | Rule                                                            | Mode      | Status             | Spec                                         |
| ---------------------------------------- | --------------------------------------------------------------- | --------- | ------------------ | -------------------------------------------- |
| E-sign agreements                        | Place a drawn signature or initials                             | Reviewing | specified          | [Signing](signing.md#drawn-signatures)       |
| Add digital signatures                   | Sign with a certificate file read in the browser                | Reviewing | specified          | [Signing](signing.md#certificate-signatures) |
| Personalize digital signatures           | The visible appearance: name, date, reason, place, a graphic    | Reviewing | specified          | [Signing](signing.md#certificate-signatures) |
| Modify e-signatures                      | Move, resize, delete and manage kept signatures                 | Reviewing | specified          | [Signing](signing.md#drawn-signatures)       |
| Add time stamps                          | A trusted time stamp where the host configured an authority     | Reviewing | specified, in part | [Signing](signing.md#certificate-signatures) |
| Add verification information             | Verification information where the host configured an authority | Reviewing | specified, in part | [Signing](signing.md#certificate-signatures) |
| Set up roaming ID accounts               | Certificates held by a service                                  |           | left out (C4)      | [Signing](signing.md)                        |
| Manage certificates on directory servers | Certificate directory servers                                   |           | left out (F5)      | [Signing](signing.md)                        |

## PDF Spaces

| Topic                                               | Rule                       | Mode | Status        | Spec |
| --------------------------------------------------- | -------------------------- | ---- | ------------- | ---- |
| Unlock AI-powered productivity with PDF Spaces      | An Adobe workspace product |      | left out (F5) |      |
| Create PDF Spaces                                   | An Adobe workspace product |      | left out (F5) |      |
| Get smarter insights with personalized AI Assistant | An Adobe workspace product |      | left out (F5) |      |
| View citations in responses                         | An Adobe workspace product |      | left out (F5) |      |
| Collaborating on PDF Spaces                         | An Adobe workspace product |      | left out (F5) |      |
| Share PDF Spaces                                    | An Adobe workspace product |      | left out (F5) |      |
| Review PDF Spaces                                   | An Adobe workspace product |      | left out (F5) |      |
| Supported file formats and limitations              | An Adobe workspace product |      | left out (F5) |      |
| PDF Spaces FAQ                                      | An Adobe workspace product |      | left out (F5) |      |
| Send PDF Spaces as links in emails                  | An Adobe workspace product |      | left out (F5) |      |
| Customize PDF Spaces Overview                       | An Adobe workspace product |      | left out (F5) |      |

## Forms: basics

| Topic                 | Rule                                                                                   | Mode      | Status             | Spec                        |
| --------------------- | -------------------------------------------------------------------------------------- | --------- | ------------------ | --------------------------- |
| PDF forms overview    | A PDF's fields, filled together                                                        | Reviewing | specified          | [Fields](fields.md)         |
| PDF forms preferences | Highlight fields and remembered entries; Acrobat's other form preferences are left out | Reviewing | specified, in part | [Fields](fields.md#filling) |

## Forms: create

| Topic                                                                  | Rule                                                                 | Mode    | Status        | Spec                                                           |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------- | ------- | ------------- | -------------------------------------------------------------- |
| Convert documents to PDF forms                                         | Detect fields proposes a field for each blank, made only when ticked | Editing | specified     | [Building fields](building-fields.md#detecting-fields)         |
| Create PDF forms from scratch                                          | Every field type, drawn or placed                                    | Editing | specified     | [Building fields](building-fields.md#the-field-tools)          |
| Align form fields                                                      | Align, centre, distribute, match size                                | Editing | specified     | [Building fields](building-fields.md#arranging-fields)         |
| Copy form fields                                                       | Duplicate, multiple copies, across pages                             | Editing | specified     | [Building fields](building-fields.md#arranging-fields)         |
| Move form fields                                                       | Move a field                                                         | Editing | specified     | [Building fields](building-fields.md#arranging-fields)         |
| Resize form fields                                                     | Resize a field                                                       | Editing | specified     | [Building fields](building-fields.md#arranging-fields)         |
| Select multiple form fields                                            | Select several fields                                                | Editing | specified     | [Building fields](building-fields.md#arranging-fields)         |
| Enable filling and saving rights in PDF forms for Acrobat Reader users | Needs Adobe's own signing key                                        |         | left out (F5) | [Building fields](building-fields.md#together-and-in-the-file) |

## Forms: fill and sign

| Topic                                | Rule                                                               | Mode      | Status    | Spec                                           |
| ------------------------------------ | ------------------------------------------------------------------ | --------- | --------- | ---------------------------------------------- |
| Check if a PDF form is fillable      | A notice says whether a PDF has fields; fields are highlighted     | Reviewing | specified | [Fields](fields.md#filling)                    |
| Fill and sign forms                  | Fill every field type, checked as each is left                     | Reviewing | specified | [Fields](fields.md#filling)                    |
| Fill and sign flat forms             | Text, tick, cross, dot, circle and line on a PDF with no fields    | Reviewing | specified | [Fields](fields.md#a-pdf-with-no-fields)       |
| Fill forms automatically             | Remembered entries, off until turned on, kept in this browser only | Reviewing | specified | [Fields](fields.md#filling)                    |
| Check security settings in PDF forms | Properties > Security says what the file allows                    | Viewing   | specified | [Document tools](document-tools.md#properties) |

## Forms: customise fields

| Topic                                  | Rule                                                                                          | Mode    | Status             | Spec                                                                  |
| -------------------------------------- | --------------------------------------------------------------------------------------------- | ------- | ------------------ | --------------------------------------------------------------------- |
| Change form field settings             | A field's properties in the side panel                                                        | Editing | specified          | [Building fields](building-fields.md#properties)                      |
| Form fields general settings           | General: name, tooltip, visibility, read-only, required                                       | Editing | specified          | [Building fields](building-fields.md#properties)                      |
| Field specific properties              | Options by field type                                                                         | Editing | specified          | [Building fields](building-fields.md#properties)                      |
| Field formatting options               | Number, percentage, date, time and special formats                                            | Editing | specified          | [Building fields](building-fields.md#properties)                      |
| Configure form fields for calculations | Sum, product, average, minimum, maximum and simple formulas; custom scripts are never written | Editing | specified, in part | [Building fields](building-fields.md#properties)                      |
| Set form field navigation              | Tab order by rows, columns, structure or by hand                                              | Editing | specified          | [Building fields](building-fields.md#tab-order-and-calculation-order) |

## Forms: barcodes

| Topic                            | Rule                                                      | Mode    | Status         | Spec                                        |
| -------------------------------- | --------------------------------------------------------- | ------- | -------------- | ------------------------------------------- |
| Barcodes overview                | Barcode fields; one in a file is shown and kept untouched | Editing | left out (F14) | [Fields](fields.md#what-a-files-fields-are) |
| Add and test barcode fields      | Barcode fields; one in a file is shown and kept untouched | Editing | left out (F14) | [Fields](fields.md#what-a-files-fields-are) |
| Manage custom barcode parameters | Barcode fields; one in a file is shown and kept untouched | Editing | left out (F14) | [Fields](fields.md#what-a-files-fields-are) |
| Customize barcode fields         | Barcode fields; one in a file is shown and kept untouched | Editing | left out (F14) | [Fields](fields.md#what-a-files-fields-are) |

## Forms: share

| Topic                               | Rule                                                  | Mode      | Status             | Spec                                                      |
| ----------------------------------- | ----------------------------------------------------- | --------- | ------------------ | --------------------------------------------------------- |
| Share PDF forms                     | Share the document; a Participant fills and signs     | Files     | specified          | [PDF document](pdf-document.md#share-roles)               |
| Track shared PDF forms              | Collecting many people's answers is a Form tab's work |           | left out (F5)      | [Fields](fields.md#field-data)                            |
| Send PDF forms for e-signature      | Sending a document out for signature                  |           | left out (C4)      | [Signing](signing.md)                                     |
| Share certified copies of PDF forms | Certify, then share the document                      | Reviewing | specified, in part | [Signing](signing.md#certified-files)                     |
| Print PDF forms                     | Print with field values or blank                      | Viewing   | specified          | [Files, print and sync](files-print-and-sync.md#printing) |

## Share documents

| Topic                                             | Rule                                                          | Mode  | Status             | Spec                                                   |
| ------------------------------------------------- | ------------------------------------------------------------- | ----- | ------------------ | ------------------------------------------------------ |
| Share links to PDFs                               | LiveDoc's share dialog, links and roles                       | Files | specified          | [PDF document](pdf-document.md#share-roles)            |
| Manage access to the shared file                  | Editor, Participant and Viewer                                | Files | specified          | [PDF document](pdf-document.md#share-roles)            |
| Share PDFs via email                              | Email this file, where the host has email configured          | Files | specified, in part | [Files, print and sync](files-print-and-sync.md#email) |
| About reviewing on internal servers               | Review servers; a LiveDoc document is reviewed live           |       | left out (F5)      | [Comments](comments.md#in-the-file)                    |
| Send PDFs for review via internal servers         | Review servers; a LiveDoc document is reviewed live           |       | left out (F5)      | [Comments](comments.md#in-the-file)                    |
| Enable commenting for Reader users in Acrobat Pro | Needs Adobe's own key; anyone with a Participant link reviews |       | left out (F5)      | [PDF document](pdf-document.md#share-roles)            |

## Comment preferences

| Topic                             | Rule                                                  | Mode      | Status    | Spec                              |
| --------------------------------- | ----------------------------------------------------- | --------- | --------- | --------------------------------- |
| Change author name on comments    | A comment's author is the person's display name       | Reviewing | specified | [Comments](comments.md#authors)   |
| Set comment properties            | A mark's look, and making it the default for its kind | Reviewing | specified | [Marks](marks.md#changing-a-mark) |
| Set or change text box properties | A Text mark's font, size, colour and alignment        | Reviewing | specified | [Marks](marks.md#changing-a-mark) |

## Review documents

| Topic                                           | Rule                                                                      | Mode      | Status             | Spec                                        |
| ----------------------------------------------- | ------------------------------------------------------------------------- | --------- | ------------------ | ------------------------------------------- |
| Insert text                                     | An Insert text mark                                                       | Reviewing | specified          | [Marks](marks.md#kinds)                     |
| Replace text                                    | A Replace text mark                                                       | Reviewing | specified          | [Marks](marks.md#kinds)                     |
| Add attachments as comments                     | A Pinned file mark                                                        | Reviewing | specified          | [Marks](marks.md#kinds)                     |
| Add comments in callouts                        | A Callout mark                                                            | Reviewing | specified          | [Marks](marks.md#kinds)                     |
| Add comments to selected text or images         | Comment on selected text or an area                                       | Reviewing | specified          | [Comments](comments.md#anchors)             |
| Add markups                                     | Highlight, underline, strikethrough, squiggly underline                   | Reviewing | specified          | [Marks](marks.md#kinds)                     |
| Change markup colors                            | Colours from the one colour picker                                        | Reviewing | specified          | [Marks](marks.md#changing-a-mark)           |
| Add comments using sticky notes or chat bubbles | A Note mark                                                               | Reviewing | specified          | [Marks](marks.md#kinds)                     |
| Add comments in text boxes                      | A Text mark                                                               | Reviewing | specified          | [Marks](marks.md#kinds)                     |
| Add comments to videos in Acrobat Pro           | Media a file embeds is not played                                         |           | left out (F5)      | [Marks](marks.md#kinds)                     |
| Add shapes, lines, and freeform drawings        | Drawing, line, arrow, rectangle, ellipse, polygon, cloud, connected lines | Reviewing | specified          | [Marks](marks.md#kinds)                     |
| Delete comments                                 | Delete a mark; its thread is kept as on deleted content                   | Reviewing | specified          | [Marks](marks.md#changing-a-mark)           |
| Edit comments                                   | Edit one's own comment                                                    | Reviewing | specified          | [Comments](comments.md#threads)             |
| Group and ungroup comments                      | Group and ungroup marks                                                   | Reviewing | specified          | [Marks](marks.md#changing-a-mark)           |
| Join PDF reviews                                | Opening a shared document is joining its review                           | Reviewing | specified, in part | [PDF document](pdf-document.md#share-roles) |

## Stamps

| Topic                               | Rule                                                | Mode      | Status    | Spec                     |
| ----------------------------------- | --------------------------------------------------- | --------- | --------- | ------------------------ |
| Add or modify stamps                | Standard stamps, placed, resized, rotated           | Reviewing | specified | [Marks](marks.md#stamps) |
| Create custom stamps                | Custom stamps from a picture or a PDF page          | Reviewing | specified | [Marks](marks.md#stamps) |
| Create custom dynamic stamps        | Dynamic stamps with the stamper's name and the time | Reviewing | specified | [Marks](marks.md#stamps) |
| Delete custom stamps and categories | Manage stamps: rename, delete, categories           | Reviewing | specified | [Marks](marks.md#stamps) |
| Update digital stamp identities     | A dynamic stamp's name is the person's display name | Reviewing | specified | [Marks](marks.md#stamps) |

## Manage reviews

| Topic                                 | Rule                                                       | Mode      | Status             | Spec                                                       |
| ------------------------------------- | ---------------------------------------------------------- | --------- | ------------------ | ---------------------------------------------------------- |
| View comments                         | The comments panel, with filters and search                | Viewing   | specified          | [Comments](comments.md#the-comments-panel)                 |
| Add reactions to comments             | Emoji reactions on a comment                               | Reviewing | specified          | [Comments](comments.md#threads)                            |
| Reply to comments                     | Replies, written into the file as replies                  | Reviewing | specified          | [Comments](comments.md#threads)                            |
| Mark comments as unread or resolved   | Unread, resolve and reopen                                 | Reviewing | specified          | [Comments](comments.md#threads)                            |
| Find comments                         | Search and filter comments                                 | Viewing   | specified          | [Comments](comments.md#the-comments-panel)                 |
| Check for new comments                | New comments arrive live; there is nothing to check for    | Viewing   | specified, in part | [Comments](comments.md#threads)                            |
| Unlock comments                       | Lock and unlock a mark                                     | Reviewing | specified          | [Marks](marks.md#changing-a-mark)                          |
| Spell-check comments                  | The browser's spelling in the composer                     | Reviewing | specified, in part | [Comments](comments.md#threads)                            |
| Publish comments from other reviewers | Publishing to a review server; comments are live           |           | left out (F5)      | [Comments](comments.md#in-the-file)                        |
| Manage shared files                   | Shared documents are found in the Explorer                 | Files     | specified          | [Starting and finding](starting-and-finding.md#finding-it) |
| Track shared PDF reviews              | Review trackers; the Inbox carries threads and assignments |           | left out (F5)      | [Comments](comments.md#notifications)                      |

## Protect with passwords

| Topic                                        | Rule                                                                            | Mode    | Status             | Spec                                                               |
| -------------------------------------------- | ------------------------------------------------------------------------------- | ------- | ------------------ | ------------------------------------------------------------------ |
| Password security overview                   | An open password and a permissions password                                     | Editing | specified          | [Redaction and protection](redaction-and-protection.md#protection) |
| Add passwords to PDFs                        | Set an open password                                                            | Editing | specified          | [Redaction and protection](redaction-and-protection.md#protection) |
| Remove passwords from PDFs                   | Remove protection, given its password                                           | Editing | specified          | [Redaction and protection](redaction-and-protection.md#protection) |
| Encrypt PDFs with passwords                  | AES-256 always; what is encrypted is chosen                                     | Editing | specified          | [Redaction and protection](redaction-and-protection.md#protection) |
| Restrict PDF editing                         | Permissions for changes                                                         | Editing | specified          | [Redaction and protection](redaction-and-protection.md#protection) |
| Restrict printing, editing, and copying PDFs | Permissions for printing, changes and copying                                   | Editing | specified          | [Redaction and protection](redaction-and-protection.md#protection) |
| Regain access to locked PDFs                 | A permissions password lifts the limits; LiveDoc cannot recover a lost password | Viewing | specified, in part | [Opening](opening.md#passwords)                                    |
| PDF security options                         | One cipher, AES-256; older ciphers are read and never written                   | Editing | specified, in part | [Redaction and protection](redaction-and-protection.md#protection) |

## Encrypt with certificates

| Topic                                                  | Rule                                                       | Mode | Status         | Spec                           |
| ------------------------------------------------------ | ---------------------------------------------------------- | ---- | -------------- | ------------------------------ |
| Encrypt PDFs with certificates                         | Encrypting to certificates; such a file is refused by name |      | left out (F14) | [Opening](opening.md#refusals) |
| Change encryption settings                             | Encrypting to certificates; such a file is refused by name |      | left out (F14) | [Opening](opening.md#refusals) |
| Import certificates overview                           | Encrypting to certificates; such a file is refused by name |      | left out (F14) | [Opening](opening.md#refusals) |
| Import certificates from digital signatures in PDFs    | Encrypting to certificates; such a file is refused by name |      | left out (F14) | [Opening](opening.md#refusals) |
| Import certificates from emails                        | Encrypting to certificates; such a file is refused by name |      | left out (F14) | [Opening](opening.md#refusals) |
| Import certificates from the Windows Certificate Store | Encrypting to certificates; such a file is refused by name |      | left out (F14) | [Opening](opening.md#refusals) |
| Verify certificate information                         | Encrypting to certificates; such a file is refused by name |      | left out (F14) | [Opening](opening.md#refusals) |
| Delete trusted certificates                            | Encrypting to certificates; such a file is refused by name |      | left out (F14) | [Opening](opening.md#refusals) |

## Digital IDs

| Topic                          | Rule                                                                 | Mode      | Status             | Spec                                         |
| ------------------------------ | -------------------------------------------------------------------- | --------- | ------------------ | -------------------------------------------- |
| Digital ID overview            | A person's own certificate file; stores and tokens are left out      | Reviewing | specified, in part | [Signing](signing.md#certificate-signatures) |
| Digital ID protection          | The certificate file never leaves the browser and its key is dropped | Reviewing | specified          | [Signing](signing.md#certificate-signatures) |
| Create self-signed digital IDs | LiveDoc issues no certificates; a person brings their own            |           | left out (C4)      | [Signing](signing.md)                        |
| Set a default digital ID       | No certificate is kept, so none is a default                         |           | left out (F5)      | [Signing](signing.md#certificate-signatures) |
| Register digital IDs           | Certificate stores and tokens                                        |           | left out (F5)      | [Signing](signing.md#certificate-signatures) |
| Delete digital IDs             | No certificate is kept, so none is deleted                           |           | left out (F5)      | [Signing](signing.md#certificate-signatures) |
| Manage digital ID passwords    | A certificate file's password is its own program's to change         |           | left out (F5)      | [Signing](signing.md#certificate-signatures) |

## Redact PDFs

| Topic                                               | Rule                                                                                       | Mode    | Status    | Spec                                                                                |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------- | --------- | ----------------------------------------------------------------------------------- |
| About redacting and sanitizing PDFs in Acrobat Pro  | Redaction and removing hidden information, each replacing the stored file with its history | Editing | specified | [Redaction and protection](redaction-and-protection.md)                             |
| Types of redactable data                            | Text, pictures, shapes, marks, field values and the words they left elsewhere in the file  | Editing | specified | [Redaction and protection](redaction-and-protection.md#applying)                    |
| Redact sensitive content in Acrobat Pro             | Mark, review, then apply                                                                   | Editing | specified | [Redaction and protection](redaction-and-protection.md#marking)                     |
| Search and redact text in Acrobat Pro               | Find text to redact: words, lists and patterns                                             | Editing | specified | [Redaction and protection](redaction-and-protection.md#marking)                     |
| Text redaction properties in Acrobat Pro            | Fill colour and overlay text                                                               | Editing | specified | [Redaction and protection](redaction-and-protection.md#marking)                     |
| Redact images in PDFs                               | A picture's pixels under a mark are replaced in the picture itself                         | Editing | specified | [Redaction and protection](redaction-and-protection.md#applying)                    |
| Change redaction appearance in Acrobat Pro          | How a redaction mark looks before and after applying                                       | Editing | specified | [Redaction and protection](redaction-and-protection.md#marking)                     |
| Sanitize PDFs in Acrobat Pro                        | Remove hidden information, listed with counts                                              | Editing | specified | [Redaction and protection](redaction-and-protection.md#removing-hidden-information) |
| Apply multiple codes to a redaction in Acrobat Pro  | One or several redaction codes on a mark                                                   | Editing | specified | [Redaction and protection](redaction-and-protection.md#marking)                     |
| Create redaction codes and code sets in Acrobat Pro | Make sets of redaction codes                                                               | Editing | specified | [Redaction and protection](redaction-and-protection.md#marking)                     |
| Edit redaction codes and code sets in Acrobat Pro   | Edit and delete codes and sets                                                             | Editing | specified | [Redaction and protection](redaction-and-protection.md#marking)                     |

## Protected view

| Topic                                      | Rule                                                                            | Mode    | Status    | Spec                                 |
| ------------------------------------------ | ------------------------------------------------------------------------------- | ------- | --------- | ------------------------------------ |
| Protected View and Protected Mode overview | Every PDF is parsed inside WebAssembly in a worker, always; there is no setting | Viewing | specified | [Security](security.md#the-boundary) |
| Enable or disable protected view           | Every PDF is parsed inside WebAssembly in a worker, always; there is no setting | Viewing | specified | [Security](security.md#the-boundary) |
| Bypass protected view restrictions         | Every PDF is parsed inside WebAssembly in a worker, always; there is no setting | Viewing | specified | [Security](security.md#the-boundary) |

## Security risks

| Topic                                     | Rule                                                                              | Mode    | Status         | Spec                                      |
| ----------------------------------------- | --------------------------------------------------------------------------------- | ------- | -------------- | ----------------------------------------- |
| Acrobat and PDF content security overview | The trust boundary and the rule for each abuse case                               | Viewing | specified      | [Security](security.md)                   |
| Security warnings in PDFs                 | What a file wanted and was not allowed is listed, not asked                       | Viewing | specified      | [Security](security.md#links-and-actions) |
| Security warning triggers                 | Each case and its rule                                                            | Viewing | specified      | [Security](security.md#abuse-cases)       |
| Respond to security warnings              | An address is shown before it is opened; nothing else asks                        | Viewing | specified      | [Security](security.md#links-and-actions) |
| Allow or block links to other websites    | Only http, https and mailto, asked each time, with no setting                     | Viewing | specified      | [Security](security.md#links-and-actions) |
| Restrict access to JavaScript APIs        | No script from a file ever runs                                                   | Viewing | specified      | [Security](security.md#scripts)           |
| Allow attachments to start applications   | An embedded file is never opened or run by LiveDoc                                | Viewing | specified      | [Security](security.md#embedded-files)    |
| Block or allow file attachments           | A type that runs carries a warning before it is saved; there are no lists to keep | Viewing | specified      | [Security](security.md#embedded-files)    |
| Reset attachment permissions              | There are no attachment permissions to reset                                      |         | not a function | [Security](security.md#embedded-files)    |

## Security policies

| Topic                                                            | Rule                                     | Mode | Status         | Spec |
| ---------------------------------------------------------------- | ---------------------------------------- | ---- | -------------- | ---- |
| Security policies overview                                       | Organisation policies and rights servers |      | left out (F14) |      |
| Server-based security policies overview                          | Organisation policies and rights servers |      | left out (F14) |      |
| Protect PDFs with password security policies                     | Organisation policies and rights servers |      | left out (F14) |      |
| Create certificate security policies                             | Organisation policies and rights servers |      | left out (F14) |      |
| Create file attachment security policies                         | Organisation policies and rights servers |      | left out (F14) |      |
| Apply security policies to Outlook attachments                   | Organisation policies and rights servers |      | left out (F14) |      |
| Copy, edit, or delete security policies                          | Organisation policies and rights servers |      | left out (F14) |      |
| Revoke policy-protected PDFs                                     | Organisation policies and rights servers |      | left out (F14) |      |
| Export security settings                                         | Organisation policies and rights servers |      | left out (F14) |      |
| Microsoft Purview Information Protection content markings in PDF | Organisation policies and rights servers |      | left out (F14) |      |
| Microsoft Purview Information Protection support in Acrobat      | Organisation policies and rights servers |      | left out (F14) |      |

## Enhanced security

| Topic                                                | Rule                                      | Mode    | Status        | Spec                                 |
| ---------------------------------------------------- | ----------------------------------------- | ------- | ------------- | ------------------------------------ |
| Enable enhanced security                             | Always on; no setting weakens it          | Viewing | specified     | [Security](security.md#the-boundary) |
| Turn on sandbox protection                           | The sandbox is WebAssembly in a worker    | Viewing | specified     | [Security](security.md#the-boundary) |
| Specify privileged locations for trusted content     | No location is privileged                 |         | left out (F5) | [Security](security.md#the-boundary) |
| Ways to allow trusted content with enhanced security | No content is trusted more than any other | Viewing | specified     | [Security](security.md#the-boundary) |

## Set up and print

| Topic                                                      | Rule                                                              | Mode    | Status         | Spec                                                         |
| ---------------------------------------------------------- | ----------------------------------------------------------------- | ------- | -------------- | ------------------------------------------------------------ |
| Adobe PDF printer settings on Windows                      | Adobe's PDF printer driver                                        |         | not a function |                                                              |
| Set Adobe PDF printer properties on Windows                | Adobe's PDF printer driver                                        |         | not a function |                                                              |
| Save documents as PDFs                                     | Download the PDF; other kinds download as PDF                     | Files   | specified      | [Files, print and sync](files-print-and-sync.md#downloading) |
| Save documents as PostScript files                         | PostScript output                                                 |         | left out (F5)  |                                                              |
| Print PDFs with mixed page sizes                           | The browser prints the PDF itself, each page at its size          | Viewing | specified      | [Files, print and sync](files-print-and-sync.md#printing)    |
| Print large documents                                      | Tiling a large page over several sheets                           |         | left out (F14) | [Files, print and sync](files-print-and-sync.md#printing)    |
| Print multiple pages per sheet                             | Several pages a sheet, in the browser's dialog                    | Viewing | specified      | [Files, print and sync](files-print-and-sync.md#printing)    |
| Print bookmarked pages                                     | Printing a bookmark's pages; a page range does it                 |         | left out (F5)  | [Files, print and sync](files-print-and-sync.md#printing)    |
| Adjust page size for printing                              | Scale and fit, in the browser's dialog                            | Viewing | specified      | [Files, print and sync](files-print-and-sync.md#printing)    |
| Create and use custom page sizes                           | Custom paper sizes are the printer driver's                       |         | left out (F5)  | [Files, print and sync](files-print-and-sync.md#printing)    |
| Print settings                                             | Pages, marks and fields asked by LiveDoc; the rest by the browser | Viewing | specified      | [Files, print and sync](files-print-and-sync.md#printing)    |
| Make PDFs print-ready with Acrobat Pro                     | Print production                                                  |         | left out (F14) |                                                              |
| Turn off the Save As dialog box when printing to Adobe PDF | Adobe's PDF printer driver                                        |         | not a function |                                                              |

## Special print modes

| Topic                                  | Rule                                                       | Mode    | Status             | Spec                                                      |
| -------------------------------------- | ---------------------------------------------------------- | ------- | ------------------ | --------------------------------------------------------- |
| Print comments                         | Print with marks, without them, or with a comments summary | Viewing | specified          | [Files, print and sync](files-print-and-sync.md#printing) |
| Print layers                           | PDF layers print as the file sets them                     | Viewing | specified, in part | [Files, print and sync](files-print-and-sync.md#printing) |
| Print PDFs with unembedded Asian fonts | A printer driver's font handling                           |         | left out (F5)      |                                                           |
| Enable protected print mode on Windows | A Windows print mode                                       |         | not a function     |                                                           |

## Duplex and multi-page printing

| Topic                                                    | Rule                                 | Mode    | Status        | Spec                                                      |
| -------------------------------------------------------- | ------------------------------------ | ------- | ------------- | --------------------------------------------------------- |
| Create print presets                                     | Print presets stored in the file     |         | left out (F5) | [Files, print and sync](files-print-and-sync.md#printing) |
| Enable double-sided printing                             | Two sides, in the browser's dialog   | Viewing | specified     | [Files, print and sync](files-print-and-sync.md#printing) |
| Print on both sides of the paper                         | Two sides, in the browser's dialog   | Viewing | specified     | [Files, print and sync](files-print-and-sync.md#printing) |
| Manually print double-sided in face-down output printers | Manual duplex by odd and even passes |         | left out (F5) | [Files, print and sync](files-print-and-sync.md#printing) |
| Manually print double-sided in face-up output printers   | Manual duplex by odd and even passes |         | left out (F5) | [Files, print and sync](files-print-and-sync.md#printing) |

## Booklets, posters and banners

| Topic                               | Rule       | Mode | Status         | Spec                                                      |
| ----------------------------------- | ---------- | ---- | -------------- | --------------------------------------------------------- |
| Booklet printing with Adobe Acrobat | Imposition |      | left out (F14) | [Files, print and sync](files-print-and-sync.md#printing) |
| Print booklets                      | Imposition |      | left out (F14) | [Files, print and sync](files-print-and-sync.md#printing) |
| Print large-sized documents         | Imposition |      | left out (F14) | [Files, print and sync](files-print-and-sync.md#printing) |

## Colour and print quality

| Topic                                   | Rule             | Mode | Status         | Spec                                                      |
| --------------------------------------- | ---------------- | ---- | -------------- | --------------------------------------------------------- |
| Color management in Acrobat Pro         | Print production |      | left out (F14) | [Files, print and sync](files-print-and-sync.md#printing) |
| Print color composites in Acrobat Pro   | Print production |      | left out (F14) | [Files, print and sync](files-print-and-sync.md#printing) |
| Print color separations in Acrobat Pro  | Print production |      | left out (F14) | [Files, print and sync](files-print-and-sync.md#printing) |
| Specify trapping details in Acrobat Pro | Print production |      | left out (F14) | [Files, print and sync](files-print-and-sync.md#printing) |
| Preview overprint in Acrobat Pro        | Print production |      | left out (F14) | [Files, print and sync](files-print-and-sync.md#printing) |

## Convert to other formats

| Topic                                   | Rule                                                        | Mode  | Status             | Spec                                                                       |
| --------------------------------------- | ----------------------------------------------------------- | ----- | ------------------ | -------------------------------------------------------------------------- |
| Convert PDFs to image formats           | Pages as PNG or JPEG pictures                               | Files | specified          | [Files, print and sync](files-print-and-sync.md#downloading)               |
| Convert PDFs to Word formats            | Open as a text document, a copy, then download as Word      | Files | specified, in part | [Files, print and sync](files-print-and-sync.md#other-kinds-meeting-a-pdf) |
| Convert PDFs to Microsoft Excel formats | Not written from a PDF document                             |       | left out (F5)      | [Files, print and sync](files-print-and-sync.md#downloading)               |
| Convert PDFs to PowerPoint format       | Not written from a PDF document                             |       | left out (F5)      | [Files, print and sync](files-print-and-sync.md#downloading)               |
| Convert PDFs to PostScript files        | PostScript output                                           |       | left out (F5)      | [Files, print and sync](files-print-and-sync.md#downloading)               |
| Convert PDF to HTML web pages           | Not written from a PDF document                             |       | left out (F5)      | [Files, print and sync](files-print-and-sync.md#downloading)               |
| Convert PDFs to text formats            | The text by page, as plain text                             | Files | specified          | [Files, print and sync](files-print-and-sync.md#downloading)               |
| Convert PDFs to RTFs                    | Open as a text document, a copy, then download as Rich Text | Files | specified, in part | [Files, print and sync](files-print-and-sync.md#other-kinds-meeting-a-pdf) |

## Troubleshoot

| Topic                                                               | Rule                           | Mode | Status         | Spec |
| ------------------------------------------------------------------- | ------------------------------ | ---- | -------------- | ---- |
| Error while updating Acrobat on Windows                             | Troubleshooting Acrobat itself |      | not a function |      |
| Unable to download and install Adobe Acrobat Reader                 | Troubleshooting Acrobat itself |      | not a function |      |
| Acrobat Reader updates not applied on Windows                       | Troubleshooting Acrobat itself |      | not a function |      |
| Acrobat installation errors                                         | Troubleshooting Acrobat itself |      | not a function |      |
| Acrobat shows sign-in errors                                        | Troubleshooting Acrobat itself |      | not a function |      |
| Adobe Acrobat crashes                                               | Troubleshooting Acrobat itself |      | not a function |      |
| AcroCEF and RdrCEF process error                                    | Troubleshooting Acrobat itself |      | not a function |      |
| Acrobat is not responding and shows a running instance error        | Troubleshooting Acrobat itself |      | not a function |      |
| Acrobat failed to load core DLL                                     | Troubleshooting Acrobat itself |      | not a function |      |
| Applications crash on ARM64-based Windows devices                   | Troubleshooting Acrobat itself |      | not a function |      |
| AI Assistant or Generative summary show errors                      | Troubleshooting Acrobat itself |      | not a function |      |
| AI Assistant doesn't appear in Acrobat                              | Troubleshooting Acrobat itself |      | not a function |      |
| Acrobat crashes on macOS                                            | Troubleshooting Acrobat itself |      | not a function |      |
| Missing or blank tools pane in Acrobat                              | Troubleshooting Acrobat itself |      | not a function |      |
| Unable to fill forms in Acrobat                                     | Troubleshooting Acrobat itself |      | not a function |      |
| Unable to edit XFA forms                                            | Troubleshooting Acrobat itself |      | not a function |      |
| Can't enable forms for Acrobat Reader users                         | Troubleshooting Acrobat itself |      | not a function |      |
| Markup and tracked changes not exported from Word to PDF            | Troubleshooting Acrobat itself |      | not a function |      |
| Error when deleting pages in PDFs                                   | Troubleshooting Acrobat itself |      | not a function |      |
| Adobe PDF Printer is missing from the printer list                  | Troubleshooting Acrobat itself |      | not a function |      |
| Error while printing PDFs in Acrobat                                | Troubleshooting Acrobat itself |      | not a function |      |
| Unable to connect to the scanner                                    | Troubleshooting Acrobat itself |      | not a function |      |
| Negative image while scanning with Acrobat                          | Troubleshooting Acrobat itself |      | not a function |      |
| Error while scanning files in Acrobat                               | Troubleshooting Acrobat itself |      | not a function |      |
| Unable to print selected area using the snapshot tool               | Troubleshooting Acrobat itself |      | not a function |      |
| Unable to print a PDF with mixed pages in Acrobat on Windows        | Troubleshooting Acrobat itself |      | not a function |      |
| Known and fixed issues in Adobe Acrobat                             | Troubleshooting Acrobat itself |      | not a function |      |
| Acrobat compatibility warning for Rosetta on Mac with Apple Silicon | Troubleshooting Acrobat itself |      | not a function |      |

## Left out

What a PDF document does not do, by group, each with what happens to a file that carries it. Nothing here is a "Pro"
feature held back: what is left out is left out for everyone.

| Group                                                                                        | Why                                                             | A file that carries it                               | By  |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------- | --- |
| Sending a document out for signature; certificates from a service                            | A workflow of its own                                           | Signed files are read and checked                    | C4  |
| LiveDoc-issued or self-signed certificates                                                   | A person brings their own certificate file                      | n/a                                                  | C4  |
| Bates numbering                                                                              | A legal numbering tool, far from reading, reviewing and editing | The numbers are page content, kept                   | F14 |
| Barcode fields                                                                               | Need a script engine to compute                                 | Shown as drawn, kept untouched                       | F14 |
| Encrypting to certificates                                                                   | Needs a person's certificate store                              | Refused by name, the bytes kept and downloadable     | F14 |
| Security policies and rights servers                                                         | Organisation services outside LiveDoc                           | Refused by name                                      | F14 |
| Geospatial measuring                                                                         | A mapping tool                                                  | Pages draw; the data is kept untouched               | F14 |
| Authoring PDF layers                                                                         | A production tool                                               | Layers are shown, hidden per person and kept         | F14 |
| Page and thumbnail actions; the Action Wizard                                                | Macros; agents cover batch work                                 | Actions are listed, kept and never run               | F14 |
| Imposition and print production: booklets, posters, tiling, separations, trapping, overprint | Print shop tools                                                | Output intents and print marks are kept              | F14 |
| Portfolios' layout and navigator                                                             | Deprecated presentation of a collection                         | The cover page shows; its files are listed and saved | F14 |
| Adobe's assistant, PDF Spaces, Adobe Express                                                 | Other Adobe products; LiveDoc's agents have their own tools     | n/a                                                  | F5  |
| Distiller, PostScript, XPS, web page and disk file conversion                                | Conversion on a desktop; other LiveDoc kinds download as PDF    | n/a                                                  | F5  |
| Driving a scanner; enhancing a scan's picture                                                | A device and an image editor                                    | A scan arrives as a PDF and is recognised            | F5  |
| Editing a scan's words as the author's                                                       | Recognition is wrong one word in twenty at best                 | Text is added over the picture                       | F10 |
| Writing Excel, PowerPoint, HTML or PostScript from a PDF                                     | Conversions with heavy losses                                   | Open as a text document is the way to an office file | F5  |
| Review servers, review trackers, publishing comments                                         | A LiveDoc document is reviewed live, by sharing it              | Comments in a file are read as threads               | F5  |
| Reader-enabling a file (filling and commenting rights)                                       | Needs Adobe's own signing key                                   | Such rights are kept untouched                       | F5  |
| A list of trusted certificate issuers; trust settings                                        | No browser exposes one to a page                                | LiveDoc says what it has not checked                 | F5  |
| Certificate stores, tokens and directory servers                                             | Desktop key stores                                              | n/a                                                  | F5  |
| Customising the toolbar and panels                                                           | The toolbar is the editing mode's                               | n/a                                                  | F5  |
| Starting a PDF from nothing                                                                  | A PDF arrives, or is made from another document                 | n/a                                                  | F12 |
| Running a file's scripts; XFA layout                                                         | No script from a file ever runs; XFA shows its static pages     | Scripts and XFA data are kept as they came           | F11 |
| Playing media a file embeds: sound, video, 3D, rich media                                    | Decoders and players outside the boundary                       | Shown as the file's own poster, kept untouched       | F5  |
| Authoring accessibility: tags, reading order, structure                                      | A tool of its own; alternative text for pictures is in          | Tags are read, used and kept                         | F5  |
| Read out loud, reflow view, automatic scrolling, article threads                             | The screen reader and the browser read; threads are rare        | Article threads are kept untouched                   | F5  |
| Measuring tools (distance, perimeter, area)                                                  | A drawing-office tool                                           | Measurement marks draw as the file has them          | F5  |
| Editing a path's points; editing a picture in another program                                | A drawing program's work                                        | Shapes are changed as wholes                         | F5  |

F11 is asked with the count on real forms before fields are built; until then its default stands
([Fields](fields.md#formats-and-calculations)).

## Beyond the inventory

What a PDF document does that the reference does not, each with its spec:

| Function                                                     | Spec                                                                             |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Several people and agents changing one PDF at once, live     | [Live editing and storage](live-editing-and-storage.md)                          |
| Presence: who is on which page, what they hold               | [Live editing and storage](live-editing-and-storage.md#presence)                 |
| No Save button; a file handed out always holds every change  | [Saving](saving.md)                                                              |
| An unchanged PDF leaving byte for byte                       | [Saving](saving.md#an-unchanged-file)                                            |
| Dark pages, per person, never in the file                    | [Dark pages](dark-pages.md)                                                      |
| Mentions, assigned actions and the Inbox on a PDF's comments | [Comments](comments.md)                                                          |
| Version history of every change, and document branches       | [Live editing and storage](live-editing-and-storage.md#branches)                 |
| Agents: text views, changesets, previews                     | [Agents](agents.md)                                                              |
| Repository sync as a native file, and the Drive mirror       | [Files, print and sync](files-print-and-sync.md#repository-sync)                 |
| Offline, in This Browser                                     | [Live editing and storage](live-editing-and-storage.md#offline-and-this-browser) |

## Tests

- The matrix's rows equal the inventory's topics, one for one, by a test that reads both.
- Every `specified` row's spec link resolves to a heading; every `built` row's test exists.
- No row reads `specified` once the kind is done: each is `built` or `left out`.
