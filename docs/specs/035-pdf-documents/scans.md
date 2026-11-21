# Scans

**Status: specified.** Nothing is built.

A **scanned page** is a PDF page that is a picture of a page: it has no text to select, find, mark, read aloud or
search. **Text recognition** reads its words in the browser, on demand (fork F10 `(default)`). The research is
[Text recognition](../../research/pdf-documents/text-recognition.md).

## Knowing a scanned page

- A page is a scanned page when it has no text of its own (or only invisible text) and one picture covers at least
  `PDF_SCAN_PICTURE_SHARE` of it. A page with a picture and real text beside it is not.
- A file with scanned pages shows the notice "These pages are scans. Recognise their text to find and mark words."
  with **Recognise text**; Find says how many pages it could not search
  ([Reading surface](reading-surface.md#find)).
- A scanned page that already carries invisible text (another program recognised it) is read as text at once:
  selected, found and marked as any page's, with nothing to recognise.

## Recognising

- **Tools > Recognise text** (Reviewing's, so a Participant may): a dialog asks the **language** (one or several, the
  person's own first) and the **pages** (all scanned pages, a range, the page in view).
- **It runs in the browser**, in worker threads, page by page, the pages in view first: no page, picture or word
  leaves the browser, and no outside service is called.
- **The engine and a language's data load only now**, from LiveDoc's own origin: about 4 MB the first time for the
  engine and one language, about 3 MB for each further language; cached afterwards, so recognition works offline and
  self-hosted.
- **Progress** shows in the notice bar: "Recognising text: page 12 of 40", with **Cancel**; what is done is kept.
  Reading and marking go on meanwhile; the surface never waits.
- A page is drawn for recognition at its picture's own resolution, at most `PDF_OCR_MAX_DPI`; a picture under
  `PDF_OCR_MIN_DPI` is recognised and flagged "Low resolution: words may be wrong".
- About 4 seconds a page on one thread; pages are shared among `PDF_OCR_WORKERS` workers.
- Skew is measured and allowed for; the page itself is not straightened, cleaned or recompressed.

## What recognition gives

- **Recognised words join the live changes as each page is read**, by page name, each word with its place and a
  confidence ([Live editing and storage](live-editing-and-storage.md#the-layout)). So everyone on the document can
  at once select, find, copy and mark the scan's text, and content search finds it; nobody recognises a page twice.
- **The file is not changed by this.** A bake writes recognised words into the file only where a person asked
  (below); until then a download is still a picture, and the download dialog says "This PDF's recognised text is in
  LiveDoc only. Include it in the file?"
- Recognised text is **marked as recognised** wherever it is quoted: in agents' views, in Find's results, in the
  accessible tree ("recognised text").
- A word below `PDF_OCR_LOW_CONFIDENCE` is selectable and findable like the rest, and tinted in **Review recognised
  text**.

## Writing it into the file

- **Tools > Recognise text > Include in the file** (Editing's, an Editor's): writes each page's recognised words as
  **invisible text** over the picture, word for word in place, so every reader selects and searches it. The
  picture is untouched.
- It changes page content: a rewrite, breaking certificate signatures, asked first on a signed file
  ([Signing](signing.md#changes-after-a-signature)).
- **Download > PDF** on a scan with recognised text offers "Include recognised text" for that download alone,
  leaving the document as it is.

## Reviewing recognised text

- **Review recognised text** steps through low-confidence words, each shown as its picture beside what was read,
  with a field to correct it; Accept moves on. Corrections are live changes, attributed.
- Correcting changes the recognised word (what is found and selected), never the picture.

## Editing a scan's words

Left out `(default)`: at best one word in twenty is wrong on dense small type, so a scan's words are not edited as if
they were the author's.

- In Editing, a scanned page has no text boxes; the page offers **Add text** (a new text box over the picture) and
  **Redact** (which removes the picture's pixels).
- Replacing a scan with editable text is another kind's work: **Open as a text document** makes a copy through the
  text document's import ([Files, print and sync](files-print-and-sync.md#other-kinds-meeting-a-pdf)).
- Driving a scanner, and enhancing a scan's picture (straighten, clean, sharpen), are left out
  ([Parity matrix](parity-matrix.md#left-out)).

## Limits

| Constant                 | Value | Why                                                                                    |
| ------------------------ | ----- | -------------------------------------------------------------------------------------- |
| `PDF_SCAN_PICTURE_SHARE` | 0.85  | `(default)` As Dark pages tells a scan from a photograph; safe range 0.7 to 0.95       |
| `PDF_OCR_MIN_DPI`        | 150   | Under it fewer than 9 words in 10 are found (measured: 69.6% at 100 dpi, 92.3% at 150) |
| `PDF_OCR_MAX_DPI`        | 300   | `(default)` Above it time grows and accuracy does not (95.6% at 300)                   |
| `PDF_OCR_WORKERS`        | 2     | `(default)` Half the device's cores, at most 4, at least 1                             |
| `PDF_OCR_LOW_CONFIDENCE` | 0.6   | `(default)` Below it a word is offered for review; safe range 0.4 to 0.8               |
| `PDF_OCR_MAX_LANGUAGES`  | 3     | `(default)` Languages in one run; each is about 3 MB and slows a page                  |

## Share roles

| Role            | Scans                                                                                              |
| --------------- | -------------------------------------------------------------------------------------------------- |
| **Editor**      | Recognises, reviews, corrects, includes recognised text in the file                                |
| **Participant** | Recognises, reviews and corrects, as part of Reviewing (F7, ruled): it changes nothing of the page |
| **Viewer**      | Selects, finds and copies text others recognised; recognises nothing                               |

## Keyboard and accessibility

- A scanned page without recognised text tells a screen reader so and names the action
  ([Accessibility](accessibility.md#the-accessible-tree)); once recognised, its words are its tree, in reading
  order.
- Progress is a polite live region, updated at most every five pages; Cancel is reachable while it runs.
- Review recognised text is fully keyed: Enter accepts, Tab moves between the word and its correction.

## Telemetry and observability

- `Pdf · Started · Recognition`, `Pdf · Ended · Recognition.<Done|Cancelled|Failed>`,
  `Pdf · Changed · RecognisedTextIncluded`, `Pdf · Changed · RecognisedWordCorrected`. Never a word or a language
  beyond its code.
- Fingerprints: `[pdf] recognition pages=<n> ms=<n> workers=<n> languages=<codes> low-confidence=<n>`,
  `[pdf] recognition-data loaded bytes=<n> cached=<bool>`, `[pdf] recognition failed reason=<reason>`.

## Errors

| When                                | A person sees                                                          |
| ----------------------------------- | ---------------------------------------------------------------------- |
| The language data cannot be fetched | "Text recognition couldn't load. Check your connection and try again." |
| A page fails                        | "Page 12 couldn't be read." in the summary; the rest carry on          |
| The device runs out of memory       | "This device ran out of memory. Recognise fewer pages at a time."      |
| No text is found on a page          | "No text was found on page 3."                                         |
