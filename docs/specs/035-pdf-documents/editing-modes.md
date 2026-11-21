# Editing modes

**Status: specified.** Nothing is built.

How one person works on a [PDF document](pdf-document.md) right now. Webber asked for "a mode where you read, mark
text, fill forms, place comments and sign, but also a mode for real editing"; ruling C2 names them **Reviewing** and
**Editing**, beside **Viewing**. The switch is the shared one of the
[review surfaces](../012-collaboration/review-surfaces.md#the-editing-mode-switch).

## The three

| Editing mode  | Is for                                                            | Changes                                                                      | Written to the file as                   |
| ------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------- |
| **Viewing**   | Reading: scroll, zoom, find, select and copy, follow links, print | Nothing                                                                      | Nothing                                  |
| **Reviewing** | Marking text, placing comments, filling fields, signing           | What sits **on top of** a page: marks, comments, field values, signatures    | An addition; the stored file stays whole |
| **Editing**   | Real editing                                                      | The **pages themselves**: page content, page order, the document's structure | A rewritten file                         |

- The line between Reviewing and Editing is the file's own: a PDF keeps what sits on a page apart from the page's
  content ([The standard](../../research/pdf-documents/the-standard.md#what-the-design-leans-on)). So Reviewing never
  breaks a signature a file came with, and Editing always does ([Signing](signing.md#changes-after-a-signature)).
- **Editing holds Reviewing.** Everything Reviewing does stays possible in Editing: a mark is still selected, moved and
  answered, a field still filled. Editing adds; it takes nothing away.
- **Viewing shows the PDF as a reader shows it**: marks drawn, fields showing their values, signatures in place.
  Comment threads stay closed until their mark is pressed; **View > Marks** hides every mark for that person.

## What each mode offers

| Area                                                                                                                       | Viewing | Reviewing | Editing |
| -------------------------------------------------------------------------------------------------------------------------- | ------- | --------- | ------- |
| Read, find, copy, links, bookmarks, thumbnails, PDF layers, zoom                                                           | Yes     | Yes       | Yes     |
| Download, print ([Files, print and sync](files-print-and-sync.md))                                                         | Yes     | Yes       | Yes     |
| Read marks and comments; the comments panel                                                                                | Yes     | Yes       | Yes     |
| The signatures panel: who signed, what is intact ([Signing](signing.md))                                                   | Yes     | Yes       | Yes     |
| Add, change and delete [marks](marks.md); [comments](comments.md)                                                          | No      | Yes       | Yes     |
| [Fill fields](fields.md)                                                                                                   | No      | Yes       | Yes     |
| [Sign](signing.md): drawn and certificate signatures                                                                       | No      | Yes       | Yes     |
| Recognise a scan's text for finding and marking ([Scans](scans.md))                                                        | No      | Yes       | Yes     |
| [Edit text](editing-text.md) and [objects](objects.md)                                                                     | No      | No        | Yes     |
| [Organise pages](organising-pages.md)                                                                                      | No      | No        | Yes     |
| [Document tools](document-tools.md), [build fields](building-fields.md), [redact and protect](redaction-and-protection.md) | No      | No        | Yes     |

## Switching

- The switch is the office shell's ([Modes](../004-interface-design/office-shell.md#modes)), at the right of the title
  row ([Reading surface](reading-surface.md#the-title-row)). A PDF document declares its three modes to it, in this
  order, each with its glyph, name, one line, the least level that reaches it and the level its menus and toolbar are
  drawn for:

| Mode          | Line under its name                  | Reached from  | Drawn for     | Keys `(default)` |
| ------------- | ------------------------------------ | ------------- | ------------- | ---------------- |
| **Reviewing** | Mark text, comment, fill in and sign | `participate` | `participate` | ⌘⌥⇧X             |
| **Editing**   | Change the pages themselves          | `edit`        | `edit`        | ⌘⌥⇧Z             |
| **Viewing**   | Read or print the PDF                | `view`        | `view`        | ⌘⌥⇧C             |

- The keys are a text document's for the same three places in the switch, so one habit serves both kinds; on Windows
  and Linux ⌘ is Ctrl and ⌥ is Alt.
- **A person starts in Reviewing**, or in Viewing when their level allows no more `(default)`: the shell starts a
  person in the first mode their level reaches, which is why Reviewing is declared first. An Editor starts in
  Reviewing too: real editing is entered on purpose.
- **The menus are the mode's.** The shell draws them for the mode's level: Viewing lists what a Viewer has,
  Reviewing adds what a Participant has, Editing lists everything. A tool of a mode the person is not in is not
  listed; View > Mode and the switch are how a mode is entered, and the change is announced politely to a screen
  reader ("Editing").
- **The toolbar is the mode's.** Viewing shows the reading tools; Reviewing adds the mark, comment, fill and sign
  tools; Editing shows the page content tools, with Reviewing's tools one menu away
  ([Reading surface](reading-surface.md#the-toolbar)).
- **Entering Editing** shows each page's text as [text boxes](editing-text.md#text-boxes) and its objects as
  selectable; **leaving Editing** shows the pages as written. Entering it on a PDF with certificate signatures warns
  first ([Signing](signing.md#changes-after-a-signature), fork F8).
- A mode never grants more than the level: a mode the level does not allow is not listed, its tools are not in the
  menus, and its changes are refused by the room whatever a client sends.
- The mode is kept while the document is open, per tab, and never stored: each open starts as above `(default)`.
- A PDF that asks for no changes by its permissions opens in Viewing until its permissions password is given
  ([Opening](opening.md#passwords), fork F9); a PDF that cannot be read has no switch.

## What the others see

- An editing mode is **one person's**. Nobody follows a switch, and no content changes by it.
- Every change a person makes is seen by everyone at once, whatever mode each is in: a mark made in Reviewing appears
  for someone Viewing, and a paragraph retyped in Editing redraws for someone Reviewing.
- Presence shows where each person is and what they hold: their page in the thumbnails, their text selection, the mark
  or text box they have selected outlined in their colour with their name
  ([Live editing and storage](live-editing-and-storage.md#presence)). A person's avatar tooltip names their mode
  ("Ada, editing") `(default)`.
- **A text box someone is typing in** is theirs while they type: others see it change and cannot place a caret in it
  until it is left ([Editing text](editing-text.md#together)).

## Share roles

Fork F7 `(default)`: the modes line up with the access levels.

| Role            | Modes listed                | Starts in |
| --------------- | --------------------------- | --------- |
| **Editor**      | Viewing, Reviewing, Editing | Reviewing |
| **Participant** | Viewing, Reviewing          | Reviewing |
| **Viewer**      | Viewing                     | Viewing   |

- A Viewer's switch has one entry and is shown as a plain label, as a text document's Viewer sees it.
- The gates are the session's `can`: `pdfReviews` for everything Reviewing changes, `pdfEdits` for everything Editing
  changes; a Participant's Reviewing ops ride `PARTICIPATION_OP_KINDS`, as a text document's suggestions do.

## Keyboard and accessibility

- The switch is a menu button with the mode as its accessible name ("Editing mode: Reviewing"); arrow keys move, Enter
  chooses, Escape closes and returns focus.
- Each mode's keys work from anywhere on the surface but a text field.
- Switching never moves the reading position or the selection; where the selection has no meaning in the new mode (a
  text box, on leaving Editing) it becomes the text it held.

## Telemetry and observability

- `UI · Changed · PdfDocumentMode` when a person changes it, by the switch, its menu item or its keys: the shell's
  own event, with the kind's mode type.
- Fingerprint: `[pdf] mode-refused` (with the op kind and the level) when the room refuses a change the level does not
  allow.

## Errors

- A change refused for the level is undone locally with the toast "You can view this PDF, but not change it." (a
  Viewer) or "You can review this PDF, but not edit its pages." (a Participant).
- A level lowered while a person is in a mode it no longer reaches moves them to their starting mode, as the shell
  does for every kind, with the same toast.
