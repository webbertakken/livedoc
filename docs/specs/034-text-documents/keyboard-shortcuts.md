# Keyboard shortcuts

**Status: partly built.** Each row reads `built` once its key runs its action, with the test that proves it.

Every shortcut of Google's [Keyboard shortcuts for Google Docs](https://support.google.com/docs/answer/179738?hl=en&co=GENIE.Platform%3DDesktop)
(retrieved 2026-11-20), for PC, Mac and ChromeOS, one row per action. The text document's registry holds exactly these
rows (`apps/live/lib/text-document/text-document-shortcuts.ts`); a test reads this table and fails on any difference.
How the layer matches keys is the [office shell](../004-interface-design/office-shell.md#shortcut-layer)'s, and so is
the [dialog](../004-interface-design/office-shell.md#keyboard-shortcuts-dialog) that lists them.

## Notation

- Keys held together are joined by `+`: `Ctrl+Shift+V`. Letters are written in capitals; `Plus` is the + key.
- Modifiers: `Ctrl`, `Alt`, `Shift`; on a Mac `⌘`, `Option`, `Ctrl`, `Fn`; on ChromeOS also `Search`.
- Other keys: `Enter`, `Esc`, `Space`, `Up`, `Down`, `Left`, `Right`, `Home`, `End`, `PgUp`, `PgDn`, `F7`, `F10`, and
  the characters `/ \ [ ] . , ' ; ~ - 0` to `9`.
- A **sequence** holds its modifiers and presses two keys in turn: `Ctrl+Alt+N, H` is "holding Ctrl and Alt, press N
  then H".
- `[1-6]` stands for each of the digits 1 to 6, one shortcut each.
- Several ways are joined by `or`; a way that holds only in one browser ends `(Chrome)` or `(other browsers)`.
- Pointer rows name the gesture: `Double-click`, `Double-click+drag`, `Triple-click`, `Triple-click+drag`,
  `Shift+right-click`. A row with no way on a platform reads `—`.
- Where Google gives one key two rows (Ctrl+Alt+K resizes a picture and moves to the next edit), the row whose
  context holds runs (a picture selected, version history open); otherwise the first row in this table.

Statuses: `specified`, `built (<test>)`, `the browser's` (the key is left to the browser, as Google leaves it),
`left out (C3)` (its function is a Google service, [Tools](tools.md#google-only-services)).

## Common actions

| Action                         | PC                                       | Mac                         | ChromeOS           | Status                                                   |
| ------------------------------ | ---------------------------------------- | --------------------------- | ------------------ | -------------------------------------------------------- |
| Copy                           | `Ctrl+C`                                 | `⌘+C`                       | `Ctrl+C`           | the browser's                                            |
| Cut                            | `Ctrl+X`                                 | `⌘+X`                       | `Ctrl+X`           | the browser's                                            |
| Paste                          | `Ctrl+V`                                 | `⌘+V`                       | `Ctrl+V`           | the browser's                                            |
| Paste without formatting       | `Ctrl+Shift+V`                           | `⌘+Shift+V`                 | `Ctrl+Shift+V`     | the browser's                                            |
| Undo                           | `Ctrl+Z`                                 | `⌘+Z`                       | `Ctrl+Z`           | built (`text-document-shortcuts.test.tsx`)               |
| Redo                           | `Ctrl+Shift+Z`                           | `⌘+Shift+Z`                 | `Ctrl+Shift+Z`     | built (`text-document-shortcuts.test.tsx`)               |
| Insert or edit link            | `Ctrl+K`                                 | `⌘+K`                       | `Ctrl+K`           | specified                                                |
| Open link                      | `Alt+Enter`                              | `Option+Enter`              | `Alt+Enter`        | specified                                                |
| Show common keyboard shortcuts | `Ctrl+/`                                 | `⌘+/`                       | `Ctrl+/`           | built (`OfficeShortcutsDialog.test.tsx`)                 |
| Save                           | `Ctrl+S`                                 | `⌘+S`                       | `Ctrl+S`           | specified                                                |
| Print                          | `Ctrl+P`                                 | `⌘+P`                       | `Ctrl+P`           | specified                                                |
| Open                           | `Ctrl+O`                                 | `⌘+O`                       | `Ctrl+O`           | built (`text-document-shortcuts.test.tsx`)               |
| Find                           | `Ctrl+F`                                 | `⌘+F`                       | `Ctrl+F`           | specified                                                |
| Find and replace               | `Ctrl+H`                                 | `⌘+Shift+H`                 | `Ctrl+H`           | specified                                                |
| Find again                     | `Ctrl+G`                                 | `⌘+G`                       | `Ctrl+G`           | specified                                                |
| Find previous                  | `Ctrl+Shift+G`                           | `⌘+Shift+G`                 | `Ctrl+Shift+G`     | specified                                                |
| Hide the menus (compact mode)  | `Ctrl+Shift+F`                           | `Ctrl+Shift+F`              | `Ctrl+Shift+F`     | specified                                                |
| Insert page break              | `Ctrl+Enter`                             | `⌘+Enter`                   | `Ctrl+Enter`       | built (`text-document-breaks.test.ts`, `breaks.spec.ts`) |
| Tool finder                    | `Alt+/ or Alt+Shift+Z or Alt+Z (Chrome)` | `Option+/ or Ctrl+Option+Z` | `Alt+Z or Alt+/`   | built (`OfficeToolFinder.test.tsx`)                      |
| Repeat last action             | `Ctrl+Y`                                 | `⌘+Y`                       | —                  | specified                                                |
| Switch to editing              | `Ctrl+Alt+Shift+Z`                       | `⌘+Option+Shift+Z`          | `Ctrl+Alt+Shift+Z` | built (`OfficeModeSwitch.test.tsx`)                      |
| Switch to suggesting           | `Ctrl+Alt+Shift+X`                       | `⌘+Option+Shift+X`          | `Ctrl+Alt+Shift+X` | specified                                                |
| Switch to viewing              | `Ctrl+Alt+Shift+C`                       | `⌘+Option+Shift+C`          | `Ctrl+Alt+Shift+C` | built (`OfficeModeSwitch.test.tsx`)                      |
| Zoom in                        | `Ctrl+Plus`                              | `⌘+Plus`                    | —                  | the browser's                                            |
| Zoom out                       | `Ctrl+-`                                 | `⌘+-`                       | —                  | the browser's                                            |
| Zoom 100%                      | `Ctrl+0`                                 | `⌘+0`                       | —                  | the browser's                                            |

## Text formatting

| Action                | PC                     | Mac              | ChromeOS       | Status |
| --------------------- | ---------------------- | ---------------- | -------------- | ------ |
| Bold                  | `Ctrl+B`               | `⌘+B`            | `Ctrl+B`       | built  |
| Italicize             | `Ctrl+I`               | `⌘+I`            | `Ctrl+I`       | built  |
| Underline             | `Ctrl+U`               | `⌘+U`            | `Ctrl+U`       | built  |
| Strikethrough         | `Alt+Shift+5`          | `⌘+Shift+X`      | `Alt+Shift+5`  | built  |
| Superscript           | `Ctrl+.`               | `⌘+.`            | `Ctrl+.`       | built  |
| Subscript             | `Ctrl+,`               | `⌘+,`            | `Ctrl+,`       | built  |
| Copy text formatting  | `Ctrl+Alt+C`           | `⌘+Option+C`     | `Ctrl+Alt+C`   | built  |
| Paste text formatting | `Ctrl+Alt+V`           | `⌘+Option+V`     | `Ctrl+Alt+V`   | built  |
| Clear text formatting | `Ctrl+\ or Ctrl+Space` | `⌘+\`            | `Ctrl+\`       | built  |
| Increase font size    | `Ctrl+Shift+.`         | `⌘+Shift+.`      | `Ctrl+Shift+.` | built  |
| Decrease font size    | `Ctrl+Shift+,`         | `⌘+Shift+,`      | `Ctrl+Shift+,` | built  |
| Small caps            | `Ctrl+Shift+K`         | `Option+Shift+K` | —              | built  |

## Paragraph formatting

| Action                         | PC                | Mac               | ChromeOS         | Status    |
| ------------------------------ | ----------------- | ----------------- | ---------------- | --------- |
| Increase paragraph indentation | `Ctrl+]`          | `⌘+]`             | `Ctrl+]`         | built     |
| Decrease paragraph indentation | `Ctrl+[`          | `⌘+[`             | `Ctrl+[`         | built     |
| Apply normal text style        | `Ctrl+Alt+0`      | `⌘+Option+0`      | `Ctrl+Alt+0`     | built     |
| Apply heading style [1-6]      | `Ctrl+Alt+[1-6]`  | `⌘+Option+[1-6]`  | `Ctrl+Alt+[1-6]` | built     |
| Left align                     | `Ctrl+Shift+L`    | `⌘+Shift+L`       | `Ctrl+Shift+L`   | built     |
| Center align                   | `Ctrl+Shift+E`    | `⌘+Shift+E`       | `Ctrl+Shift+E`   | built     |
| Right align                    | `Ctrl+Shift+R`    | `⌘+Shift+R`       | `Ctrl+Shift+R`   | built     |
| Justify                        | `Ctrl+Shift+J`    | `⌘+Shift+J`       | `Ctrl+Shift+J`   | built     |
| Numbered list                  | `Ctrl+Shift+7`    | `⌘+Shift+7`       | `Ctrl+Shift+7`   | built     |
| Bulleted list                  | `Ctrl+Shift+8`    | `⌘+Shift+8`       | `Ctrl+Shift+8`   | built     |
| Checklist                      | `Ctrl+Shift+9`    | `⌘+Shift+9`       | —                | built     |
| Move paragraph up              | `Ctrl+Shift+Up`   | `Ctrl+Shift+Up`   | —                | specified |
| Move paragraph down            | `Ctrl+Shift+Down` | `Ctrl+Shift+Down` | —                | specified |

## Images and drawings

| Action                         | PC                | Mac                  | ChromeOS                | Status    |
| ------------------------------ | ----------------- | -------------------- | ----------------------- | --------- |
| Alt text                       | `Ctrl+Alt+Y`      | `⌘+Option+Y`         | `Ctrl+Alt+Y`            | built     |
| Resize larger                  | `Ctrl+Alt+K`      | `⌘+Ctrl+K`           | `Ctrl+Alt+K`            | specified |
| Resize larger horizontally     | `Ctrl+Alt+B`      | `⌘+Ctrl+B`           | `Ctrl+Alt+B`            | specified |
| Resize larger vertically       | `Ctrl+Alt+I`      | `⌘+Ctrl+I`           | `Ctrl+Alt+I`            | specified |
| Resize smaller                 | `Ctrl+Alt+J`      | `⌘+Ctrl+J`           | `Ctrl+Alt+J`            | specified |
| Resize smaller horizontally    | `Ctrl+Alt+W`      | `⌘+Ctrl+W`           | `Ctrl+Alt+W`            | specified |
| Resize smaller vertically      | `Ctrl+Alt+Q`      | `⌘+Ctrl+Q`           | `Ctrl+Alt+Q`            | specified |
| Rotate clockwise by 15°        | `Alt+Right`       | `Option+Right`       | `Alt+Right`             | built     |
| Rotate counterclockwise by 15° | `Alt+Left`        | `Option+Left`        | `Alt+Left`              | built     |
| Rotate counterclockwise by 1°  | `Alt+Shift+Left`  | `Option+Shift+Left`  | `Alt+Shift+Left`        | built     |
| Rotate clockwise by 1°         | `Alt+Shift+Right` | `Option+Shift+Right` | `Alt+Shift+Right`       | built     |
| Close drawing editor           | `Shift+Esc`       | `⌘+Esc or Shift+Esc` | `Ctrl+Esc or Shift+Esc` | specified |

## Comments and footnotes

| Action                                           | PC                 | Mac                | ChromeOS           | Status    |
| ------------------------------------------------ | ------------------ | ------------------ | ------------------ | --------- |
| Insert comment                                   | `Ctrl+Alt+M`       | `⌘+Option+M`       | `Ctrl+Alt+M`       | specified |
| Open comment history                             | `Ctrl+Alt+Shift+A` | `⌘+Option+Shift+A` | `Ctrl+Alt+Shift+A` | specified |
| Enter current comment                            | `Ctrl+Alt+E, C`    | `Ctrl+⌘+E, C`      | `Ctrl+Alt+E, C`    | specified |
| Insert footnote                                  | `Ctrl+Alt+F`       | `⌘+Option+F`       | `Ctrl+Alt+F`       | built     |
| Move to current footnote                         | `Ctrl+Alt+E, F`    | `Ctrl+⌘+E, F`      | `Ctrl+Alt+E, F`    | built     |
| Move to next footnote                            | `Ctrl+Alt+N, F`    | `Ctrl+⌘+N, F`      | `Ctrl+Alt+N, F`    | built     |
| Move to previous footnote                        | `Ctrl+Alt+P, F`    | `Ctrl+⌘+P, F`      | `Ctrl+Alt+P, F`    | built     |
| Move to next suggestion                          | `Ctrl+Alt+N, U`    | `Ctrl+⌘+N, U`      | `Ctrl+Alt+N, U`    | specified |
| Move to previous suggestion                      | `Ctrl+Alt+P, U`    | `Ctrl+⌘+P, U`      | `Ctrl+Alt+P, U`    | specified |
| Review suggested edits                           | `Ctrl+Alt+O, U`    | `Ctrl+⌘+O, U`      | `Ctrl+Alt+O, U`    | specified |
| Move to next comment                             | `Ctrl+Alt+N, C`    | `Ctrl+⌘+N, C`      | `Ctrl+Alt+N, C`    | specified |
| Move to previous comment                         | `Ctrl+Alt+P, C`    | `Ctrl+⌘+P, C`      | `Ctrl+Alt+P, C`    | specified |
| Reply to current comment                         | `R`                | `R`                | `R`                | specified |
| Move to next comment (on a selected comment)     | `J`                | `J`                | `J`                | specified |
| Move to previous comment (on a selected comment) | `K`                | `K`                | `K`                | specified |
| Resolve current comment                          | `E`                | `E`                | `E`                | specified |
| Exit current comment                             | `U`                | `U`                | `U`                | specified |

Google lists Open discussion thread on the same keys as Open comment history; both open the comments panel, so one
row stands for both.

## Menus

| Action                           | PC                                               | Mac                      | ChromeOS                    | Status                               |
| -------------------------------- | ------------------------------------------------ | ------------------------ | --------------------------- | ------------------------------------ |
| Context (right-click) menu       | `Ctrl+Shift+X or Ctrl+Shift+\ or Shift+F10`      | `⌘+Shift+\ or Shift+F10` | `Ctrl+Shift+X or Shift+F10` | built (`OfficeContextMenu.test.tsx`) |
| File menu                        | `Alt+F (Chrome) or Alt+Shift+F (other browsers)` | `Ctrl+Option+F`          | `Alt+F`                     | built (`OfficeMenuBar.test.tsx`)     |
| Edit menu                        | `Alt+E (Chrome) or Alt+Shift+E (other browsers)` | `Ctrl+Option+E`          | `Alt+E`                     | built (`OfficeMenuBar.test.tsx`)     |
| View menu                        | `Alt+V (Chrome) or Alt+Shift+V (other browsers)` | `Ctrl+Option+V`          | `Alt+V`                     | built (`OfficeMenuBar.test.tsx`)     |
| Insert menu                      | `Alt+I (Chrome) or Alt+Shift+I (other browsers)` | `Ctrl+Option+I`          | `Alt+I`                     | built (`OfficeMenuBar.test.tsx`)     |
| Format menu                      | `Alt+O (Chrome) or Alt+Shift+O (other browsers)` | `Ctrl+Option+O`          | `Alt+O`                     | built (`OfficeMenuBar.test.tsx`)     |
| Tools menu                       | `Alt+T (Chrome) or Alt+Shift+T (other browsers)` | `Ctrl+Option+T`          | `Alt+T`                     | built (`OfficeMenuBar.test.tsx`)     |
| Help menu                        | `Alt+H (Chrome) or Alt+Shift+H (other browsers)` | `Ctrl+Option+H`          | `Alt+H`                     | built (`OfficeMenuBar.test.tsx`)     |
| Accessibility menu               | `Alt+A (Chrome) or Alt+Shift+A (other browsers)` | `Ctrl+Option+A`          | `Alt+A`                     | specified                            |
| Input Tools menu                 | `Ctrl+Alt+Shift+K`                               | `⌘+Option+Shift+K`       | `Ctrl+Alt+Shift+K`          | left out (C3)                        |
| Toggle input controls            | —                                                | `⌘+Shift+K`              | —                           | left out (C3)                        |
| Show your browser's context menu | `Shift+right-click`                              | `Shift+right-click`      | `Shift+right-click`         | the browser's                        |

The Accessibility menu shows only while screen reader support is on.

## Text selection with the keyboard

| Action                                             | PC                                            | Mac                                       | ChromeOS                                      | Status                                     |
| -------------------------------------------------- | --------------------------------------------- | ----------------------------------------- | --------------------------------------------- | ------------------------------------------ |
| Select all                                         | `Ctrl+A`                                      | `⌘+A`                                     | `Ctrl+A`                                      | built (`text-document-shortcuts.test.tsx`) |
| Select none                                        | `Ctrl+Alt+U, A`                               | `Ctrl+⌘+U, A`                             | `Ctrl+Alt+U, A`                               | specified                                  |
| Extend selection one character                     | `Shift+Left or Shift+Right`                   | `Shift+Left or Shift+Right`               | `Shift+Left or Shift+Right`                   | specified                                  |
| Extend selection one line                          | `Shift+Up or Shift+Down`                      | `Shift+Up or Shift+Down`                  | `Shift+Up or Shift+Down`                      | specified                                  |
| Extend selection one word                          | `Ctrl+Shift+Left or Ctrl+Shift+Right`         | —                                         | `Ctrl+Shift+Left or Ctrl+Shift+Right`         | specified                                  |
| Extend selection one paragraph                     | —                                             | `Option+Shift+Up or Option+Shift+Down`    | —                                             | specified                                  |
| Extend selection to the beginning of the line      | `Shift+Home`                                  | `Shift+Fn+Left`                           | —                                             | specified                                  |
| Extend selection to the end of the line            | `Shift+End`                                   | `Shift+Fn+Right`                          | —                                             | specified                                  |
| Extend selection to the beginning of the paragraph | —                                             | —                                         | `Ctrl+Shift+Up`                               | specified                                  |
| Extend selection to the end of the paragraph       | —                                             | —                                         | `Ctrl+Shift+Down`                             | specified                                  |
| Extend selection to the beginning of the document  | `Ctrl+Shift+Home`                             | `⌘+Shift+Up`                              | —                                             | specified                                  |
| Extend selection to the end of the document        | `Ctrl+Shift+End`                              | `⌘+Shift+Down`                            | —                                             | specified                                  |
| Select current list item                           | `Ctrl+Alt+Shift+E, I`                         | `Ctrl+⌘+Shift+E, I`                       | `Ctrl+Alt+Shift+E, I`                         | specified                                  |
| Select all list items at current level             | `Ctrl+Alt+Shift+E, O`                         | `Ctrl+⌘+Shift+E, O`                       | `Ctrl+Alt+Shift+E, O`                         | specified                                  |
| Select multiple sections of text                   | `Ctrl+Alt+Shift+Left or Ctrl+Alt+Shift+Right` | `Ctrl+⌘+Shift+Left or Ctrl+⌘+Shift+Right` | `Ctrl+Alt+Shift+Left or Ctrl+Alt+Shift+Right` | built (`text-document-stretches.test.ts`)  |

## Text selection with the mouse

| Action                                   | PC                  | Mac                 | ChromeOS            | Status    |
| ---------------------------------------- | ------------------- | ------------------- | ------------------- | --------- |
| Select word                              | `Double-click`      | `Double-click`      | `Double-click`      | specified |
| Extend selection one word at a time      | `Double-click+drag` | `Double-click+drag` | `Double-click+drag` | specified |
| Select paragraph                         | `Triple-click`      | `Triple-click`      | `Triple-click`      | specified |
| Extend selection one paragraph at a time | `Triple-click+drag` | `Triple-click+drag` | `Triple-click+drag` | specified |

## Screen reader

| Action                                 | PC                          | Mac                 | ChromeOS                    | Status    |
| -------------------------------------- | --------------------------- | ------------------- | --------------------------- | --------- |
| Enable screen reader support           | `Ctrl+Alt+Z or Alt+Shift+~` | `⌘+Option+Z`        | `Ctrl+Alt+Z or Alt+Shift+~` | specified |
| Enable braille support                 | `Ctrl+Alt+H`                | `⌘+Option+H`        | `Ctrl+Alt+H`                | specified |
| Verbalize selection                    | `Ctrl+Alt+A, X`             | `Ctrl+⌘+A, X`       | `Ctrl+Alt+A, X`             | specified |
| Verbalize from cursor location         | `Ctrl+Alt+A, R`             | `Ctrl+⌘+A, R`       | `Ctrl+Alt+A, R`             | specified |
| Announce cursor location               | `Ctrl+Alt+A, L`             | `Ctrl+⌘+A, L`       | `Ctrl+Alt+A, L`             | specified |
| Announce formatting at cursor location | `Ctrl+Alt+A, F`             | `Ctrl+⌘+A, F`       | `Ctrl+Alt+A, F`             | specified |
| Verbalize table row and column headers | `Ctrl+Alt+Shift+T, H`       | `Ctrl+⌘+Shift+T, H` | `Ctrl+Alt+Shift+T, H`       | specified |
| Verbalize table cell location          | `Ctrl+Alt+Shift+T, N`       | `Ctrl+⌘+Shift+T, N` | `Ctrl+Alt+Shift+T, N`       | specified |
| Verbalize table row header             | `Ctrl+Alt+Shift+T, R`       | `Ctrl+⌘+Shift+T, R` | `Ctrl+Alt+Shift+T, R`       | specified |
| Verbalize table column header          | `Ctrl+Alt+Shift+T, C`       | `Ctrl+⌘+Shift+T, C` | `Ctrl+Alt+Shift+T, C`       | specified |
| Show live edits                        | `Ctrl+Alt+Shift+R`          | `⌘+Option+Shift+R`  | `Ctrl+Alt+Shift+R`          | specified |
| Verbalize comment                      | `Ctrl+Alt+A, C`             | `Ctrl+⌘+A, C`       | `Ctrl+Alt+A, C`             | specified |
| Verbalize comment anchor               | `Ctrl+Alt+A, A`             | `Ctrl+⌘+A, A`       | `Ctrl+Alt+A, A`             | specified |
| Verbalize selection formatting         | `Ctrl+Alt+A, S`             | `Ctrl+⌘+A, S`       | `Ctrl+Alt+A, S`             | specified |
| Verbalize cursor location              | `Ctrl+Alt+Shift+A, L`       | `Ctrl+⌘+A, L`       | `Ctrl+Alt+Shift+A, L`       | specified |
| Verbalize word count                   | `Ctrl+Alt+Shift+A, W`       | `Ctrl+⌘+A, W`       | `Ctrl+Alt+Shift+A, W`       | specified |

## Document navigation

| Action                                    | PC                            | Mac               | ChromeOS                      | Status                                 |
| ----------------------------------------- | ----------------------------- | ----------------- | ----------------------------- | -------------------------------------- |
| Show outline                              | `Ctrl+Alt+A, H`               | `Ctrl+⌘+A, H`     | `Ctrl+Alt+A, H`               | built (`TextDocumentOutline.test.tsx`) |
| Move to next heading                      | `Ctrl+Alt+N, H`               | `Ctrl+⌘+N, H`     | `Ctrl+Alt+N, H`               | specified                              |
| Move to previous heading                  | `Ctrl+Alt+P, H`               | `Ctrl+⌘+P, H`     | `Ctrl+Alt+P, H`               | specified                              |
| Move to next heading [1-6]                | `Ctrl+Alt+N, [1-6]`           | `Ctrl+⌘+N, [1-6]` | `Ctrl+Alt+N, [1-6]`           | specified                              |
| Move to previous heading [1-6]            | `Ctrl+Alt+P, [1-6]`           | `Ctrl+⌘+P, [1-6]` | `Ctrl+Alt+P, [1-6]`           | specified                              |
| Move to next graphic                      | `Ctrl+Alt+N, G`               | `Ctrl+⌘+N, G`     | `Ctrl+Alt+N, G`               | specified                              |
| Move to previous graphic                  | `Ctrl+Alt+P, G`               | `Ctrl+⌘+P, G`     | `Ctrl+Alt+P, G`               | specified                              |
| Move to next list                         | `Ctrl+Alt+N, O`               | `Ctrl+⌘+N, O`     | `Ctrl+Alt+N, O`               | specified                              |
| Move to previous list                     | `Ctrl+Alt+P, O`               | `Ctrl+⌘+P, O`     | `Ctrl+Alt+P, O`               | specified                              |
| Move to next item in the current list     | `Ctrl+Alt+N, I`               | `Ctrl+⌘+N, I`     | `Ctrl+Alt+N, I`               | specified                              |
| Move to previous item in the current list | `Ctrl+Alt+P, I`               | `Ctrl+⌘+P, I`     | `Ctrl+Alt+P, I`               | specified                              |
| Move to next link                         | `Ctrl+Alt+N, L`               | `Ctrl+⌘+N, L`     | `Ctrl+Alt+N, L`               | specified                              |
| Move to previous link                     | `Ctrl+Alt+P, L`               | `Ctrl+⌘+P, L`     | `Ctrl+Alt+P, L`               | specified                              |
| Move to next bookmark                     | `Ctrl+Alt+N, B`               | `Ctrl+⌘+N, B`     | `Ctrl+Alt+N, B`               | specified                              |
| Move to previous bookmark                 | `Ctrl+Alt+P, B`               | `Ctrl+⌘+P, B`     | `Ctrl+Alt+P, B`               | specified                              |
| Move to next formatting change            | `Ctrl+Alt+N, W`               | `Ctrl+⌘+N, W`     | `Ctrl+Alt+N, W`               | specified                              |
| Move to previous formatting change        | `Ctrl+Alt+P, W`               | `Ctrl+⌘+P, W`     | `Ctrl+Alt+P, W`               | specified                              |
| Move to next edit                         | `Ctrl+Alt+N, R or Ctrl+Alt+K` | `Ctrl+⌘+N, R`     | `Ctrl+Alt+N, R or Ctrl+Alt+K` | specified                              |
| Move to previous edit                     | `Ctrl+Alt+P, R or Ctrl+Alt+J` | `Ctrl+⌘+P, R`     | `Ctrl+Alt+P, R or Ctrl+Alt+J` | specified                              |
| Move to next tab                          | `Ctrl+Shift+PgDn`             | —                 | —                             | specified                              |
| Move to previous tab                      | `Ctrl+Shift+PgUp`             | —                 | —                             | specified                              |

## Table navigation

| Action                                | PC                    | Mac                 | ChromeOS              | Status |
| ------------------------------------- | --------------------- | ------------------- | --------------------- | ------ |
| Move to the start of the table        | `Ctrl+Alt+Shift+T, S` | `Ctrl+⌘+Shift+T, S` | `Ctrl+Alt+Shift+T, S` | built  |
| Move to the end of the table          | `Ctrl+Alt+Shift+T, D` | `Ctrl+⌘+Shift+T, D` | `Ctrl+Alt+Shift+T, D` | built  |
| Move to the start of the table column | `Ctrl+Alt+Shift+T, I` | `Ctrl+⌘+Shift+T, I` | `Ctrl+Alt+Shift+T, I` | built  |
| Move to the end of the table column   | `Ctrl+Alt+Shift+T, K` | `Ctrl+⌘+Shift+T, K` | `Ctrl+Alt+Shift+T, K` | built  |
| Move to the next table column         | `Ctrl+Alt+Shift+T, B` | `Ctrl+⌘+Shift+T, B` | `Ctrl+Alt+Shift+T, B` | built  |
| Move to the previous table column     | `Ctrl+Alt+Shift+T, V` | `Ctrl+⌘+Shift+T, V` | `Ctrl+Alt+Shift+T, V` | built  |
| Move to the start of the table row    | `Ctrl+Alt+Shift+T, J` | `Ctrl+⌘+Shift+T, J` | `Ctrl+Alt+Shift+T, J` | built  |
| Move to the end of the table row      | `Ctrl+Alt+Shift+T, L` | `Ctrl+⌘+Shift+T, L` | `Ctrl+Alt+Shift+T, L` | built  |
| Move to the next table row            | `Ctrl+Alt+Shift+T, M` | `Ctrl+⌘+Shift+T, M` | `Ctrl+Alt+Shift+T, M` | built  |
| Move to the previous table row        | `Ctrl+Alt+Shift+T, G` | `Ctrl+⌘+Shift+T, G` | `Ctrl+Alt+Shift+T, G` | built  |
| Exit table                            | `Ctrl+Alt+Shift+T, E` | `Ctrl+⌘+Shift+T, E` | `Ctrl+Alt+Shift+T, E` | built  |
| Move to the next table                | `Ctrl+Alt+Shift+N, T` | `Ctrl+⌘+Shift+N, T` | `Ctrl+Alt+Shift+N, T` | built  |
| Move to the previous table            | `Ctrl+Alt+Shift+P, T` | `Ctrl+⌘+Shift+P, T` | `Ctrl+Alt+Shift+P, T` | built  |

## Other tools and navigation

| Action                                | PC                         | Mac                        | ChromeOS                     | Status        |
| ------------------------------------- | -------------------------- | -------------------------- | ---------------------------- | ------------- |
| Open revision history                 | `Ctrl+Alt+Shift+H`         | `⌘+Option+Shift+H`         | `Ctrl+Alt+Shift+H`           | specified     |
| Open Explore tool                     | `Ctrl+Alt+Shift+I`         | `⌘+Option+Shift+I`         | `Ctrl+Alt+Shift+I`           | left out (C3) |
| Open spelling and grammar             | `Ctrl+Alt+X or F7`         | `⌘+Option+X or Fn+F7`      | —                            | specified     |
| Open dictionary                       | `Ctrl+Shift+Y`             | `⌘+Shift+Y`                | `Ctrl+Shift+Y`               | specified     |
| Word count                            | `Ctrl+Shift+C`             | `⌘+Shift+C`                | `Ctrl+Shift+C`               | specified     |
| Show non-printing characters          | `Ctrl+Shift+P`             | `⌘+Shift+P`                | `Ctrl+Shift+P`               | built         |
| Start voice typing                    | `Ctrl+Shift+S`             | `⌘+Shift+S`                | `Ctrl+Shift+S`               | left out (C3) |
| Go to side panel                      | `Ctrl+Alt+. or Ctrl+Alt+,` | `⌘+Option+. or ⌘+Option+,` | `Alt+Shift+. or Alt+Shift+,` | specified     |
| Page up                               | `PgUp`                     | `Fn+Up`                    | `Alt+Up`                     | specified     |
| Page down                             | `PgDn`                     | `Fn+Down`                  | `Alt+Down`                   | specified     |
| Move to the beginning of the document | —                          | —                          | `Ctrl+Search+Left`           | specified     |
| Move to the end of the document       | —                          | `⌘+Down`                   | `Ctrl+Search+Right`          | specified     |
| Move to next misspelling              | `Ctrl+'`                   | `⌘+'`                      | `Ctrl+'`                     | specified     |
| Move to previous misspelling          | `Ctrl+;`                   | `⌘+;`                      | `Ctrl+;`                     | specified     |
| Insert or move to header              | `Ctrl+Alt+O, H`            | `Ctrl+⌘+O, H`              | `Ctrl+Alt+O, H`              | built         |
| Insert or move to footer              | `Ctrl+Alt+O, F`            | `Ctrl+⌘+O, F`              | `Ctrl+Alt+O, F`              | built         |
| Move focus to popup                   | `Ctrl+Alt+E, P`            | `Ctrl+⌘+E, P`              | `Ctrl+Alt+E, P`              | specified     |
| Move focus out of document text       | `Ctrl+Alt+Shift+M`         | `⌘+Option+Shift+M`         | `Ctrl+Alt+Shift+M`           | specified     |
| Return focus to document text         | —                          | `Esc`                      | `Esc`                        | specified     |
| Show person or group info             | `Alt+Right`                | `Option+Right`             | `Alt+Right`                  | left out (C3) |
| Toggle a checkbox                     | `Ctrl+Alt+Enter`           | `⌘+Option+Enter`           | `Ctrl+Alt+Enter`             | built         |

Show person or group info acts on a people chip; chips are left out (C3).
