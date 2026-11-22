# Keyboard shortcuts

**Status: specified; a first slice is built.** A row reads `specified` until its test names it, then `built`.

Every keyboard shortcut of a [PDF document](pdf-document.md), in one registry the office shell's
[shortcut layer](../004-interface-design/office-shell.md) reads for its menus, tooltips and shortcuts dialog. The
reference is Acrobat's own shortcut page (verified: fetched whole on 2026-11-21 and kept beside plan 0022): where
Acrobat has a key for a function LiveDoc has, the key is Acrobat's, unless the browser or the shell already owns it.

## Rules

- ⌘ is Ctrl and ⌥ is Alt on Windows and Linux; a row gives the Mac's keys.
- **Single-key tools** (H, V, U, …) work while focus is on the pages and no text is being typed: never in a field, a
  text box, a comment or a dialog. They can be turned off in Settings > Accessibility ("Single-key shortcuts"), as
  WCAG 2.1.4 asks.
- A key of a tool the person's level does not allow does nothing and is not listed for them.
- A tool key works in the editing mode that lists its tool; in another mode it does nothing
  ([Editing modes](editing-modes.md#switching)).
- **Left out, because the browser owns them**: ⌘W, ⌘T, ⌘N, ⌘Tab and F5 keep the browser's meaning. Acrobat's
  window, portfolio, Help window and tools pane keys have nothing to act on here.
- The shell's own keys (menus by access key, the tool finder, the shortcuts dialog, F6 between regions) are the
  shell's ([Office shell](../004-interface-design/office-shell.md)).

## Reading

| Action                                  | Keys                                  | Acrobat's                             | Status    |
| --------------------------------------- | ------------------------------------- | ------------------------------------- | --------- |
| Scroll up, down                         | ↑, ↓                                  | The same                              | specified |
| Previous screen, next screen            | Page Up or ⇧Space, Page Down or Space | Page Up or ⇧Enter, Page Down or Enter | specified |
| Previous page, next page                | ←, → (or ⌘Page Up, ⌘Page Down)        | The same                              | specified |
| First page, last page                   | Home, End                             | The same                              | specified |
| Go to page                              | ⌘⇧N                                   | The same                              | specified |
| Previous view, next view                | ⌥←, ⌥→                                | The same                              | specified |
| Zoom in, zoom out                       | ⌘=, ⌘-                                | The same                              | specified |
| Actual size, fit page, fit width        | ⌘1, ⌘0, ⌘2                            | The same †                            | specified |
| Rotate view clockwise, counterclockwise | ⌘⇧+, ⌘⇧-                              | The same †                            | specified |
| Read mode                               | ⌘⌥H                                   | Ctrl H †                              | specified |
| Full screen                             | ⌘⌥L                                   | ⌘L †                                  | specified |
| Find                                    | ⌘F                                    | The same                              | specified |
| Next result, previous result            | ⌘G or Enter, ⌘⇧G or ⇧Enter            | F3 or ⌘G                              | specified |
| Print                                   | ⌘P                                    | The same                              | specified |
| Properties                              | ⌘D                                    | The same                              | specified |
| Dark pages on and off                   | ⌘⌥D `(default)`                       | None                                  | specified |
| Show or hide marks                      | ⌘⇧8                                   | The same                              | specified |

- † A key Acrobat shows in its menus, not on its shortcut page (assumed, from the product as known; checked against
  Webber's captures when the parity is proven).
- Enter and ⇧Enter turn screens in Acrobat; here Enter acts on what has focus, so Space and ⇧Space turn them, as in a
  browser's own reader.
- ⌘L is the browser's address bar, so full screen is ⌘⌥L.

## Tools

| Action                                               | Keys             | Acrobat's                | Mode      | Status    |
| ---------------------------------------------------- | ---------------- | ------------------------ | --------- | --------- |
| Select                                               | V                | The same                 | Every     | built     |
| Hand; the hand while held                            | H; Space         | The same                 | Every     | specified |
| Zoom to a dragged area                               | Z                | The same                 | Every     | specified |
| Return to Select                                     | Escape           | The same                 | Every     | built     |
| Comment (a note)                                     | S                | The same                 | Reviewing | specified |
| Highlight; cycle Highlight, Underline, Strikethrough | U; ⇧U            | The same                 | Reviewing | specified |
| Text mark                                            | X                | The same                 | Reviewing | specified |
| Drawing; cycle the shapes                            | D; ⇧D            | The same                 | Reviewing | specified |
| Cloud                                                | Q                | The same                 | Reviewing | specified |
| Stamp                                                | K                | K or J                   | Reviewing | specified |
| Sign                                                 | G `(default)`    | None                     | Reviewing | specified |
| Edit text                                            | T                | The same                 | Editing   | specified |
| Object tool                                          | O                | R, O                     | Editing   | specified |
| Link                                                 | L                | The same                 | Editing   | specified |
| Crop                                                 | C                | The same                 | Editing   | specified |
| Text field; cycle the field types                    | F; ⇧F            | The same                 | Editing   | specified |
| Mark for redaction                                   | ⇧Y               | The same                 | Editing   | specified |
| Insert blank page                                    | ⌘⇧T              | The same                 | Editing   | specified |
| Insert pages from a file                             | ⌘⇧I              | The same                 | Editing   | specified |
| Delete pages                                         | ⌘⇧D              | The same                 | Editing   | specified |
| Editing mode: Viewing, Reviewing, Editing            | ⌘⌥⇧C, ⌘⌥⇧X, ⌘⌥⇧Z | None (a text document's) | Every     | specified |

## Selections, marks and comments

| Action                                               | Keys                             | Acrobat's                | Status    |
| ---------------------------------------------------- | -------------------------------- | ------------------------ | --------- |
| Move the text caret                                  | Arrow keys; ⌥ by word; ⌘ by line | Arrow keys               | specified |
| Extend the text selection                            | ⇧ with the caret keys            | The same                 | specified |
| Copy; select all                                     | ⌘C; ⌘A                           | The same                 | specified |
| Comment on the selection                             | ⌘⌥M                              | None (a text document's) | specified |
| Next, previous mark, link or field                   | Tab, ⇧Tab                        | The same                 | specified |
| Open the focused mark's comment                      | Enter                            | The same                 | specified |
| Reply to the comment in focus                        | R                                | The same                 | specified |
| Resolve the thread in focus                          | E                                | None                     | specified |
| Tick the thread in focus (a person's own check mark) | ⇧K                               | The same                 | specified |
| Clear the comments panel's filters                   | ⌘8                               | The same                 | specified |
| Leave the thread                                     | Escape                           | The same                 | specified |
| Move the selected mark or object                     | Arrow keys; ⇧ by 10              | Arrow keys               | specified |
| Resize it                                            | ⌥ with arrow keys `(default)`    | None                     | specified |
| Delete it                                            | Delete or Backspace              | The same                 | specified |
| Undo, redo                                           | ⌘Z, ⌘⇧Z                          | The same †               | built     |
| The comments panel                                   | ⌘⌥⇧A                             | None (a text document's) | specified |

## Fields

| Action                                  | Keys               | Acrobat's | Status    |
| --------------------------------------- | ------------------ | --------- | --------- |
| Next field, previous field              | Tab, ⇧Tab          | The same  | specified |
| Accept a single-line field and leave it | Enter              | The same  | specified |
| A new line in a multi-line field        | Enter              | The same  | specified |
| Leave a field without its change        | Escape             | The same  | specified |
| Tick or untick                          | Space or Enter     | Enter     | specified |
| Next, previous radio button of a group  | ↓ or →, ↑ or ←     | The same  | specified |
| Open a dropdown; choose                 | ⌥↓ or Space; Enter | The same  | specified |
| Highlight fields                        | ⇧L                 | The same  | specified |

## Building fields

Acrobat's keys while fields are being built, with fields selected: align left L, right R, top T, bottom B; centre
horizontally ⇧H, vertically ⇧V; show tab order ⇧N; preview P. They apply only while
[Building fields](building-fields.md) is open, where they shadow the single-key tools.

## Panels

| Action                                  | Keys                     | Acrobat's | Status    |
| --------------------------------------- | ------------------------ | --------- | --------- |
| Move between the regions of the surface | F6, ⇧F6                  | The same  | specified |
| Open the left panel and focus it        | ⌘⇧F5 or ⌘⌥⇧T `(default)` | ⌘⇧F5      | specified |
| Next, previous item of a panel          | ↓, ↑                     | The same  | specified |
| Expand, collapse a bookmark             | →, ←                     | The same  | specified |
| Expand every bookmark                   | ⇧\*                      | The same  | specified |
| Select a range of thumbnails            | ⇧ with arrow keys        | The same  | specified |

## Left out

| Acrobat's keys for                                                   | Why                                                                          |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| The tools pane, task panes, the Help window, document windows        | Acrobat's own application frame                                              |
| PDF portfolios                                                       | Portfolios are kept untouched, not browsed                                   |
| The 3D and multimedia tools, the JavaScript debugger, Output Preview | Left out ([Parity matrix](parity-matrix.md#left-out))                        |
| Read out loud, Reflow, Edit Tag, Touch Up Reading Order              | The screen reader and the browser do the reading; authoring tags is left out |

## Tests

- Every row is a test that presses the keys on the surface and asserts the action, on each platform's notation.
- The registry's test refuses two actions on one key within one scope, and a key the browser reserves.
- With "Single-key shortcuts" off, no single-key tool fires.
