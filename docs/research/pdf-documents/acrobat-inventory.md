# The Acrobat inventory

What "all functionality" is measured against (fork F5): every topic of Adobe's own help for Acrobat on desktop, read
from its contents page on 2026-11-21 (verified: https://helpx.adobe.com/acrobat/desktop.html lists 403 topics in 13
sections; the list is kept beside the plan). Adobe's name, logos and artwork never appear in LiveDoc: this is a list
of functions, laid out in LiveDoc's own office shell.

## What the inventory is, and is not

- It is **topic level**: one row per help topic ("Rotate pages in PDFs", "Add comments in callouts"). That is the
  grain Phase 3's parity matrix starts from.
- It is **not yet dialog level**: each topic's page (most are 150 to 400 words) is read when its matrix row is
  written, for the controls, limits and copy it names. Adobe's pages answer a browser and refuse a script (verified:
  `curl` gets 403; a browser fetch reads them).
- **Shortcuts** come from one page, "Keyboard shortcuts in Acrobat on desktop" (verified: fetched whole, kept beside
  the plan), in twelve tables: the tools pane, switching tools, task panes, comments, scrolling and zooming, filling
  forms, portfolios, general navigation, navigation panels, the Help window, accessibility, and working with forms.
- **Captures** of Acrobat's surfaces are not public in a form that may be kept; Webber is asked for the few a phase
  needs, one or two at a time, as plan 0019 does.

## Where each section lands

"Lands in" is the editing mode a function belongs to (C2), or Files for what Download, sync and sharing own.
"Proposed standing" is this research's reading. Webber ruled F5 and F14 as proposed on 2026-11-21; the
[parity matrix](../../specs/035-pdf-documents/parity-matrix.md) holds each topic's standing from then on.

| Adobe's help section                                    | Topics | Lands in  | Proposed standing                                                                      |
| ------------------------------------------------------- | ------ | --------- | -------------------------------------------------------------------------------------- |
| `get-started/access-the-app`                            | 13     | -         | Left out: installing and signing in to Acrobat itself                                  |
| `get-started/learn-the-basics`                          | 8      | Viewing   | In: opening, the workspace, navigating, viewing modes                                  |
| `get-started/preferences-and-settings`                  | 8      | Viewing   | In part: the shortcuts and the view preferences; the rest is the app's own settings    |
| `create-documents/create-pdfs`                          | 8      | Files     | In part: other LiveDoc kinds download as PDF; converting files from a disk is left out |
| `create-documents/explore-advanced-conversion-settings` | 11     | -         | Left out: Distiller and PostScript conversion                                          |
| `create-documents/optimize-pdfs`                        | 5      | Editing   | In: reduce file size; the fine-grained optimiser as one dialog                         |
| `create-documents/scan-documents-to-pdfs`               | 7      | Editing   | In part (F10): recognise text in a scan; driving a scanner is left out                 |
| `edit-documents/edit-text-in-pdfs`                      | 7      | Editing   | In                                                                                     |
| `edit-documents/edit-images-or-objects`                 | 5      | Editing   | In                                                                                     |
| `edit-documents/organize-pages`                         | 9      | Editing   | In                                                                                     |
| `edit-documents/combine-files`                          | 7      | Editing   | In: merge PDFs and insert pages; portfolios are kept untouched                         |
| `edit-documents/add-backgrounds-and-watermarks`         | 6      | Editing   | In                                                                                     |
| `edit-documents/use-headers-and-footers`                | 4      | Editing   | In                                                                                     |
| `edit-documents/apply-bates-numbering`                  | 4      | Editing   | Open: a legal numbering tool; proposed left out                                        |
| `edit-documents/use-links-and-attachments`              | 7      | Editing   | In                                                                                     |
| `edit-documents/edit-pdf-properties`                    | 4      | Editing   | In: metadata and document properties                                                   |
| `edit-documents/pdf-layers`                             | 7      | Viewing   | In part: show and hide layers; authoring layers is left out                            |
| `edit-documents/geospatial-pdfs`                        | 7      | -         | Left out: measuring on maps; the pages still draw                                      |
| `edit-documents/apply-pdf-actions`                      | 3      | -         | Left out: the Action Wizard (batch macros); agents cover batch work                    |
| `edit-documents/enhance-pdfs-with-adobe-express`        | 12     | -         | Left out: another Adobe product                                                        |
| `e-sign-documents/fill-sign-documents`                  | 8      | Reviewing | In (C4): drawn and certificate signatures, time stamps, verification                   |
| `e-sign-documents/learn-about-signatures`               | 4      | Reviewing | In: the signatures panel and validity                                                  |
| `e-sign-documents/manage-digital-signatures`            | 6      | Reviewing | In: validate, view versions signed, remove                                             |
| `e-sign-documents/request-e-signatures`                 | 4      | -         | Left out by C4: sending a document out for signature                                   |
| `work-with-pdf-forms/fill-sign-forms`                   | 5      | Reviewing | In                                                                                     |
| `work-with-pdf-forms/explore-basics`                    | 2      | Reviewing | In                                                                                     |
| `work-with-pdf-forms/create-forms`                      | 8      | Editing   | In                                                                                     |
| `work-with-pdf-forms/customize-form-fields`             | 6      | Editing   | In, with scripts answered by safe functions only (F11)                                 |
| `work-with-pdf-forms/insert-barcodes`                   | 4      | Editing   | Open: barcode fields; proposed left out, kept untouched                                |
| `work-with-pdf-forms/share-forms`                       | 5      | Files     | In part: export and import field data; collecting responses is a Form tab's            |
| `share-and-review-documents/review-documents`           | 15     | Reviewing | In                                                                                     |
| `share-and-review-documents/use-stamps`                 | 5      | Reviewing | In                                                                                     |
| `share-and-review-documents/manage-comment-preferences` | 3      | Reviewing | In part: author name and colours follow the account                                    |
| `share-and-review-documents/manage-reviews`             | 11     | Reviewing | In as LiveDoc does it: live review replaces sent reviews and trackers                  |
| `share-and-review-documents/share-documents`            | 6      | Files     | In as LiveDoc's share dialog and roles                                                 |
| `protect-documents/protect-with-passwords`              | 8      | Editing   | In (F9)                                                                                |
| `protect-documents/redact-pdfs`                         | 11     | Editing   | In                                                                                     |
| `protect-documents/mitigate-security-risks`             | 9      | Viewing   | In as rules: no script runs, links filtered (the security research)                    |
| `protect-documents/enhanced-security`                   | 4      | Viewing   | In as rules, with no setting to weaken them                                            |
| `protect-documents/use-protected-view`                  | 3      | Viewing   | In as rules: every PDF is parsed in a worker                                           |
| `protect-documents/encrypt-with-certificates`           | 8      | -         | Open: certificate encryption; proposed left out, such a file is refused by name        |
| `protect-documents/manage-digital-ids`                  | 7      | Reviewing | In part: a person's `.p12`, read in the browser; stores and tokens are left out        |
| `protect-documents/security-policies`                   | 11     | -         | Left out: organisation policies and rights servers                                     |
| `print-documents/set-up-and-print-pdfs`                 | 13     | Viewing   | In: the browser's print, with and without marks                                        |
| `print-documents/print-duplex-and-multi-page-document`  | 5      | Viewing   | In as the browser's print dialog offers it                                             |
| `print-documents/booklets-posters-banners`              | 3      | -         | Left out: imposition                                                                   |
| `print-documents/color-print-quality`                   | 5      | -         | Left out: print production                                                             |
| `print-documents/use-secure-and-special-print-mode`     | 4      | -         | Left out                                                                               |
| `save-export-documents/convert-to-other-formats`        | 8      | Files     | In part: as a text document through 0019's import, pictures of pages, plain text       |
| `use-acrobat-ai/`                                       | 29     | -         | Left out of this plan: LiveDoc's agents read and edit a PDF through their own tools    |
| `explore-pdf-spaces/`                                   | 11     | -         | Left out: an Adobe workspace product                                                   |
| `troubleshoot/`                                         | 28     | -         | Not functions                                                                          |
| `whats-new/`                                            | 2      | -         | Not functions                                                                          |

Of 403 topics: 191 are in, 53 in part, 16 open and 143 proposed left out (verified: counted from the table). Most of
what is left out is not a function of a PDF editor: Adobe's assistant and workspace products (40 topics),
troubleshooting and release notes (30), installing and signing in (13), Distiller and print production (23).

## Forks the inventory raises

- **F5**, ruled as proposed (Webber, 2026-11-21): Acrobat's function inventory is the reference, at this page's 403 topics.
- **F14, the inventory's edge**, ruled as proposed (Webber, 2026-11-21): tools Acrobat has that sit far from reading, reviewing and editing are
  left out, with the file's own data for each kept untouched. They are Bates numbering (4 topics), barcode fields (4),
  encrypting to certificates (8; such a file is refused by name, since it cannot be opened without the person's
  certificate store), the Action Wizard (3), geospatial measuring (7), authoring layers (part of 7), imposition and
  print production (12), security policies and rights servers (11).

## Every topic

One line per section, Adobe's own topic titles.

- **`get-started/access-the-app`**: Download Acrobat Pro or Standard; Install Acrobat; Install Acrobat trial; Install Acrobat Reader; Install Acrobat Enterprise term or VIP license; Install Acrobat 2020; Download font and spelling packs; Update Acrobat automatically; Update Adobe Acrobat manually; Install an older version of Acrobat Reader; Uninstall Adobe Acrobat; Uninstall Acrobat Reader; Acrobat Express for enterprise and teams.
- **`get-started/learn-the-basics`**: Acrobat on desktop overview; Workspace basics; Technical requirements; Supported file formats; Navigate through pages; Identify Acrobat track and version; Asian, European, and Middle Eastern language support; Work smarter with the prompt bar.
- **`get-started/preferences-and-settings`**: Set Acrobat as the default PDF program; Change display themes; Change Acrobat language; Customize side panels; Customize Quick action toolbar; Keyboard shortcuts; Turn the new Acrobat on or off; Set Acrobat update preferences.
- **`create-documents/create-pdfs`**: Convert files to PDFs; Supported file formats for PDF conversion; Convert web pages to PDFs; Web page conversion settings; Create PDFs by printing to file; Create a PDF from clipboard content; Create a PDF from scratch; Enable XPS to PDF conversion in Acrobat on Windows.
- **`create-documents/explore-advanced-conversion-settings`**: Acrobat Distiller overview; Create PDFs using Acrobat Distiller; Create Watched Folders in Acrobat Pro; Adobe PDF presets overview; PostScript to PDF conversion guidelines; Adobe PDF settings overview; Share custom PDF settings; Acrobat Distiller fonts overview; Embedding fonts in PDFs overview; Embed fonts using Acrobat Distiller; Find font names in PDFs.
- **`create-documents/optimize-pdfs`**: Reduce PDF file size; Reduce PDF file size with advanced options; Reduce PDF file size by unembedding fonts; View storage space used by different elements in PDFs; PDF optimizer settings.
- **`create-documents/scan-documents-to-pdfs`**: Scan documents; Recognize text in scanned documents; Fix text issues in scanned PDFs; Edit scanned documents; Enhance images; Enhance scanned documents; Scanned PDF settings.
- **`edit-documents/edit-text-in-pdfs`**: Add new text; Change, replace, or delete text; Format text; Adjust text boxes; Set default fonts; Edit numbered or bulleted lists; Check spellings and manage accepted words.
- **`edit-documents/edit-images-or-objects`**: Add images; Modify images; Edit images with external applications; Add objects; Delete images.
- **`edit-documents/organize-pages`**: Delete pages in PDFs; Move or copy pages within PDFs; Move or copy pages between two PDFs; Rotate pages in PDFs; Replace pages in PDFs; Renumber pages in PDFs; Split PDFs; Extract pages from PDFs; Crop pages in PDFs.
- **`edit-documents/combine-files`**: Combine files into one PDF; Rearrange or resize combined files; Insert one PDF into another; Insert a blank page into a PDF; Insert web pages into a PDF; Insert a clipboard selection into a PDF; Embed PDFs in OLE container documents.
- **`edit-documents/add-backgrounds-and-watermarks`**: Add watermarks to PDFs; Remove watermarks; Update watermarks; Add backgrounds to PDFs; Remove background from PDFs; Update backgrounds in PDFs.
- **`edit-documents/use-headers-and-footers`**: Add headers and footers to PDFs; Remove headers and footers; Add page numbers to PDFs; Modify headers and footers in PDFs.
- **`edit-documents/apply-bates-numbering`**: Add Bates numbering in Acrobat Pro; Add Bates numbering to existing file names in Acrobat Pro; Remove Bates numbering in Acrobat Pro; Search for Bates-numbered PDFs in Acrobat Pro.
- **`edit-documents/use-links-and-attachments`**: Add links to PDFs; Add attachments to PDFs; Change link formatting in PDFs; Move or resize a link rectangle; Open attachments in PDFs; Link to destinations; Manage link destinations.
- **`edit-documents/edit-pdf-properties`**: Document properties and metadata overview; Create document properties; Edit document metadata; View document metadata.
- **`edit-documents/pdf-layers`**: PDF layers overview; Import files as layers; Manage PDF layers; Reorder PDF layers; Edit layer properties; Add layer navigation; Merge and flatten layers.
- **`edit-documents/geospatial-pdfs`**: Geospatial PDFs overview; Create geospatial PDFs; Import shapefiles to geospatial PDFs; Find map locations on geospatial PDFs; Calculate distances and areas on geospatial PDFs; Customize geospatial measurements; Export geospatial markups.
- **`edit-documents/apply-pdf-actions`**: PDF actions overview; Add actions to PDF elements; Add actions to page thumbnails.
- **`edit-documents/enhance-pdfs-with-adobe-express`**: Adobe Express in Acrobat overview; Generate AI images from text; Stylize PDFs using Adobe Express design tools; Design PDFs using Adobe Express; Edit images with Adobe Express in Acrobat; Create marketing documents using Adobe Express; About cover pages in Acrobat; Generate a cover page; Create designs with Adobe Express in Acrobat; About creating designs with Adobe Express in Adobe Acrobat; Stylize PDFs with Adobe Express templates; Translate text using Adobe Express in Acrobat.
- **`e-sign-documents/fill-sign-documents`**: E-sign agreements; Add digital signatures; Personalize digital signatures; Modify e-signatures; Add time stamps; Add verification information; Set up roaming ID accounts; Manage certificates on directory servers.
- **`e-sign-documents/learn-about-signatures`**: Digital signatures overview; E-signatures overview; Prepare for certified digital signing; Permissions and limitations of signed PDFs.
- **`e-sign-documents/manage-digital-signatures`**: Certify PDFs; Compare signed document versions; Validate digital signatures; View signed and certified PDF portfolios; Set certificate trust level; Set preferences for validating digital signatures.
- **`e-sign-documents/request-e-signatures`**: Send documents for e-signature; Request e-signatures in bulk; Manage agreements; Manage agreements sent in bulk.
- **`work-with-pdf-forms/fill-sign-forms`**: Check if a PDF form is fillable; Fill and sign forms; Fill and sign flat forms; Fill forms automatically; Check security settings in PDF forms.
- **`work-with-pdf-forms/explore-basics`**: PDF forms overview; PDF forms preferences.
- **`work-with-pdf-forms/create-forms`**: Convert documents to PDF forms; Create PDF forms from scratch; Align form fields; Copy form fields; Move form fields; Resize form fields; Select multiple form fields; Enable filling and saving rights in PDF forms for Acrobat Reader users.
- **`work-with-pdf-forms/customize-form-fields`**: Change form field settings; Form fields general settings; Field specific properties; Field formatting options; Configure form fields for calculations; Set form field navigation.
- **`work-with-pdf-forms/insert-barcodes`**: Barcodes overview; Add and test barcode fields; Manage custom barcode parameters; Customize barcode fields.
- **`work-with-pdf-forms/share-forms`**: Share PDF forms; Track shared PDF forms; Send PDF forms for e-signature; Share certified copies of PDF forms; Print PDF forms.
- **`share-and-review-documents/review-documents`**: Insert text; Replace text; Add attachments as comments; Add comments in callouts; Add comments to selected text or images; Add markups; Change markup colors; Add comments using sticky notes or chat bubbles; Add comments in text boxes; Add comments to videos in Acrobat Pro; Add shapes, lines, and freeform drawings; Delete comments; Edit comments; Group and ungroup comments; Join PDF reviews.
- **`share-and-review-documents/use-stamps`**: Add or modify stamps; Create custom stamps; Create custom dynamic stamps; Delete custom stamps and categories; Update digital stamp identities.
- **`share-and-review-documents/manage-comment-preferences`**: Change author name on comments; Set comment properties; Set or change text box properties.
- **`share-and-review-documents/manage-reviews`**: View comments; Add reactions to comments; Reply to comments; Mark comments as unread or resolved; Find comments; Check for new comments; Unlock comments; Spell-check comments; Publish comments from other reviewers; Manage shared files; Track shared PDF reviews.
- **`share-and-review-documents/share-documents`**: Share links to PDFs; Manage access to the shared file; Share PDFs via email; About reviewing on internal servers; Send PDFs for review via internal servers; Enable commenting for Reader users in Acrobat Pro.
- **`protect-documents/protect-with-passwords`**: Password security overview; Add passwords to PDFs; Remove passwords from PDFs; Encrypt PDFs with passwords; Restrict PDF editing; Restrict printing, editing, and copying PDFs; Regain access to locked PDFs; PDF security options.
- **`protect-documents/redact-pdfs`**: About redacting and sanitizing PDFs in Acrobat Pro; Types of redactable data; Redact sensitive content in Acrobat Pro; Search and redact text in Acrobat Pro; Text redaction properties in Acrobat Pro; Redact images in PDFs; Change redaction appearance in Acrobat Pro; Sanitize PDFs in Acrobat Pro; Apply multiple codes to a redaction in Acrobat Pro; Create redaction codes and code sets in Acrobat Pro; Edit redaction codes and code sets in Acrobat Pro.
- **`protect-documents/mitigate-security-risks`**: Acrobat and PDF content security overview; Security warnings in PDFs; Security warning triggers; Respond to security warnings; Allow or block links to other websites; Restrict access to JavaScript APIs; Allow attachments to start applications; Block or allow file attachments; Reset attachment permissions.
- **`protect-documents/enhanced-security`**: Enable enhanced security; Turn on sandbox protection; Specify privileged locations for trusted content; Ways to allow trusted content with enhanced security.
- **`protect-documents/use-protected-view`**: Protected View and Protected Mode overview; Enable or disable protected view; Bypass protected view restrictions.
- **`protect-documents/encrypt-with-certificates`**: Encrypt PDFs with certificates; Change encryption settings; Import certificates overview; Import certificates from digital signatures in PDFs; Import certificates from emails; Import certificates from the Windows Certificate Store; Verify certificate information; Delete trusted certificates.
- **`protect-documents/manage-digital-ids`**: Digital ID overview; Digital ID protection; Create self-signed digital IDs; Set a default digital ID; Register digital IDs; Delete digital IDs; Manage digital ID passwords.
- **`protect-documents/security-policies`**: Security policies overview; Server-based security policies overview; Protect PDFs with password security policies; Create certificate security policies; Create file attachment security policies; Apply security policies to Outlook attachments; Copy, edit, or delete security policies; Revoke policy-protected PDFs; Export security settings; Microsoft Purview Information Protection content markings in PDF; Microsoft Purview Information Protection support in Acrobat.
- **`print-documents/set-up-and-print-pdfs`**: Adobe PDF printer settings on Windows; Set Adobe PDF printer properties on Windows; Save documents as PDFs; Save documents as PostScript files; Print PDFs with mixed page sizes; Print large documents; Print multiple pages per sheet; Print bookmarked pages; Adjust page size for printing; Create and use custom page sizes; Print settings; Make PDFs print-ready with Acrobat Pro; Turn off the Save As dialog box when printing to Adobe PDF.
- **`print-documents/print-duplex-and-multi-page-document`**: Create print presets; Enable double-sided printing; Print on both sides of the paper; Manually print double-sided in face-down output printers; Manually print double-sided in face-up output printers.
- **`print-documents/booklets-posters-banners`**: Booklet printing with Adobe Acrobat; Print booklets; Print large-sized documents.
- **`print-documents/color-print-quality`**: Color management in Acrobat Pro; Print color composites in Acrobat Pro; Print color separations in Acrobat Pro; Specify trapping details in Acrobat Pro; Preview overprint in Acrobat Pro.
- **`print-documents/use-secure-and-special-print-mode`**: Print comments; Print layers; Print PDFs with unembedded Asian fonts; Enable protected print mode on Windows.
- **`save-export-documents/convert-to-other-formats`**: Convert PDFs to image formats; Convert PDFs to Word formats; Convert PDFs to Microsoft Excel formats; Convert PDFs to PowerPoint format; Convert PDFs to PostScript files; Convert PDF to HTML web pages; Convert PDFs to text formats; Convert PDFs to RTFs.
- **`use-acrobat-ai/`**: Generative AI overview; Generative AI technical requirements; Explore generative AI in Acrobat; Generative summary in Acrobat; Access generative AI tools in Acrobat; Request AI Assistant access as Teams admins; Request AI Assistant access as Teams users; Turn off generative AI features; Administer Acrobat Studio for enterprise; Generative AI usage policy and limitations; Adobe generative AI user disclosures; About podcasts in Adobe Acrobat; Create podcasts in Adobe Acrobat; Generative AI use cases in Acrobat; Overview of prompt writing for AI Assistant; Use AI Assistant to get answers in your PDF; Generate AI summaries; React to AI responses in Acrobat; Summarize meeting transcripts in Acrobat; AI Assistant chat history; Adobe Acrobat AI Assistant Plus; Edit PDFs via chat overview; Edit PDFs via chat; Edit PDFs via chat not working in Acrobat; Acrobat AI prompt library for editing PDFs; Edit text with chat; Format text with chat; Highlight text with chat; Redact text with chat in Acrobat.
- **`explore-pdf-spaces/`**: Unlock AI-powered productivity with PDF Spaces; Create PDF Spaces; Get smarter insights with personalized AI Assistant; View citations in responses; Collaborating on PDF Spaces; Share PDF Spaces; Review PDF Spaces; Supported file formats and limitations; PDF Spaces FAQ; Send PDF Spaces as links in emails; Customize PDF Spaces Overview.
- **`troubleshoot/`**: Error while updating Acrobat on Windows; Unable to download and install Adobe Acrobat Reader; Acrobat Reader updates not applied on Windows; Acrobat installation errors; Acrobat shows sign-in errors; Adobe Acrobat crashes; AcroCEF and RdrCEF process error; Acrobat is not responding and shows a running instance error; Acrobat failed to load core DLL; Applications crash on ARM64-based Windows devices; AI Assistant or Generative summary show errors; AI Assistant doesn’t appear in Acrobat; Acrobat crashes on macOS; Missing or blank tools pane in Acrobat; Unable to fill forms in Acrobat; Unable to edit XFA forms; Can't enable forms for Acrobat Reader users; Markup and tracked changes not exported from Word to PDF; Error when deleting pages in PDFs; Adobe PDF Printer is missing from the printer list; Error while printing PDFs in Acrobat; Unable to connect to the scanner; Negative image while scanning with Acrobat; Error while scanning files in Acrobat; Unable to print selected area using the snapshot tool; Unable to print a PDF with mixed pages in Acrobat on Windows; Known and fixed issues in Adobe Acrobat; Acrobat compatibility warning for Rosetta on Mac with Apple Silicon.
- **`whats-new/`**: What’s new in Adobe Acrobat on desktop; Adobe Acrobat on desktop release notes.
