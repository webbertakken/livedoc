# Verify a tab's export

How to check what the Export dialog really produces for a tab (a new tab kind, a new element, a change to an image
renderer), in the browser, without saving files to the Downloads folder. Specs: [Plan tabs](../specs/026-plan/plan-tabs.md#export)
for Plan tabs, [Export fidelity](../specs/020-import-export/export-fidelity.md) for what an image draws.

1. Use the running dev server and a document of your own (never someone's real document). Make it from `/new`
   with a template that has the kind you are checking (Project Planner has Board tabs and a Dashboard; Start Planning
   on a new tab adds a Sheet tab from Budget).
2. Put real content in first: a couple of cards on a board, a template's sheet, a dashboard with views and notes.
   An empty board or view only proves the empty state.
3. Open the tab, then its tab menu (the ⋯ on its pill), then **Export**. Check the format cards against the kind's
   row in the spec's table: nothing missing, nothing extra.
4. Pick an image format. The preview is the same SVG the SVG download writes. To see it at full size, run in the page:

   ```js
   const s = [...document.querySelectorAll('[role=dialog] svg')].pop();
   const d = document.createElement('div');
   d.id = '__ov';
   d.style.cssText = 'position:fixed;inset:0;z-index:999999;background:#888;overflow:auto';
   const c = s.cloneNode(true);
   c.setAttribute('width', '1300');
   c.removeAttribute('height');
   d.appendChild(c);
   document.body.appendChild(d);
   ```

   Screenshot it, scroll it, then remove `#__ov`. Read the root's `viewBox` for the image's size.

5. Look for: content drawn where the tab shows it (not the canvas hidden underneath), the right size, every slot or
   column present, text not overlapping, nothing left as a bare labelled box that the editor draws as a chart.
6. To check the real files (PNG and PDF rasterise per element, so they can differ from the SVG), capture the download
   instead of saving it. `downloadBlob` clicks a temporary link and revokes its URL after a second, so read the blob at
   once:

   ```js
   window.__dl = [];
   window.__origClick ??= HTMLAnchorElement.prototype.click;
   HTMLAnchorElement.prototype.click = function () {
     if (!this.download) return window.__origClick.call(this);
     const name = this.download;
     fetch(this.href)
       .then((r) => r.blob())
       .then((blob) => window.__dl.push({ name, blob, url: URL.createObjectURL(blob) }));
   };
   ```

   Press **Download PNG** (or SVG, PDF), then show `window.__dl.at(-1).url` in an `<img>` (PNG), read its text (SVG:
   `await blob.text()`), or read the header (PDF: its `MediaBox` is the page in points, 0.75 a CSS px). A PNG is twice
   the image's size.

7. For text formats, read the dialog's `textarea` value. A Dashboard's JSON should carry `kind: "dashboard"` and its
   `dashboard` rows; import it back (tab menu, **Import**) to prove the round trip.
8. Don't rasterise the live DOM to compare: a DOM-to-image capture of the editor froze the page for over 45 seconds and
   came out blank (slots animate in and lazy-mount). Compare the preview with a screenshot of the tab instead.
9. Reload the page when done, so the patched `click` is gone, and close your browser tab.

## Text documents

A text document has no Export dialog: File > Download writes each format
([Files and print](../specs/034-text-documents/files-and-print.md#downloading)). Prove every format with readers
LiveDoc did not write, after a change to a writer, a reader or the model.

1. Run the e2e stack (`pnpm e2e:stack`, or the office project's stack) and write a throwaway Playwright spec under
   `apps/live/e2e/office/`; delete it afterwards. Downloads go through Playwright's `download` event and `saveAs`, so
   nothing lands in the Downloads folder and the step above's patched `click` is not needed.
2. Open real files with File > Open on a new text document, never one typed for the test alone:
   `packages/text-documents/corpus/word/SampleDoc.docx` (two pages, two fonts, a colour) and `VariousPictures.docx`
   (pictures). Wait for the heading to name the file before downloading.
3. Download each item of File > Download in turn: `.docx`, `.odt`, `.fodt`, `.rtf`, `.pdf`, `.txt`, the zipped Web
   Page, `.epub` and `.md`. The other format's download asks first: press the conversion dialog's **Download**
   (`[data-conversion-dialog="listed"]`).
4. Read the word processing files with LibreOffice, under a CPU slot and with a profile of its own, so an open
   LibreOffice is not disturbed:
   `spinner slot run cpu -- soffice -env:UserInstallation=file:///tmp/lo-verify --headless --convert-to "txt:Text (encoded):UTF8" --outdir <dir> <files>`.
   Convert the source `.docx` the same way, squeeze whitespace in both, and compare: `.docx`, `.odt`, `.fodt` and
   `.rtf` each hold the source's text exactly.
5. Read the PDF with poppler: `pdfinfo` says `Producer: LiveDoc`, `Tagged: yes`, the page count and the page size
   the document sets; `pdffonts` says `yes` under `emb` for every font; `pdftotext` gives the source's text;
   `pdfimages -list` lists each picture (with its soft mask where it has transparency).
6. Test the archives with `unzip -tq` (Web Page and EPUB). The EPUB's first entry is `mimetype`, stored
   (`unzip -Zv <file> mimetype` says `none (stored)`); the Web Page holds `<name>.html` and `images/1.png` on.
7. Read `.txt` and `.md` against the spec's rules for them: a paragraph a line; a picture as `[alt]` in Plain Text and
   escaped `\[alt\]` in Markdown.
8. Read `pdffonts` against the document's fonts: a font LiveDoc carries under another name is written in its match
   (`SampleDoc.docx`'s body, Calibri by its theme, in Carlito), and one it does not carry in its fallback (Arial
   Black in Arimo), as the editor draws them. Anything else that differs is a bug, written up with the file that
   shows it.
