# Keyboard shortcuts

**Status: partly built.** A row reads `built` or `the surface's` once its keys run its action, with the test that
proves it.

Every shortcut of Google's [Keyboard shortcuts for Google Sheets](https://support.google.com/docs/answer/181110)
(retrieved 2026-11-25), for PC, Mac and ChromeOS, one row per action. The spreadsheet's registry holds exactly these
rows (`apps/live/lib/spreadsheet/spreadsheet-shortcuts.ts`); a test reads this table and fails on any difference.
How the layer matches keys is the [office shell](../004-interface-design/office-shell.md#shortcut-layer)'s, and so is
the dialog Help › Keyboard Shortcuts opens (Ctrl+/) that lists them; each menu item shows its row's keys.

## Notation

- Keys are written in the text documents' [notation](../034-text-documents/keyboard-shortcuts.md#notation).
- On ChromeOS, Search with an arrow or a digit is the key it stands for (Search+Left is Home, Search+2 is F2); the
  surface hears the key ChromeOS sends.
- Google's `⌘+Shift+*` is written `⌘+Shift+8`: the key pressed, on a US layout.
- Where Google gives one key two rows (Ctrl+Alt+= opens the insert menu, or inserts rows with rows selected), the row
  whose context holds runs.

Statuses: `specified`; `built (<test>)`, run by the shell's layer through the item bound to it; `the surface's
(<test>)`, heard by the spreadsheet's surface itself; `the browser's` (the key is left to the browser, as Google
leaves it); `left out (C3)` (its function is a Google service, [Parity matrix](parity-matrix.md)).

- A row the surface hears is listed and shown beside its item as built, but never run by the layer: the grid
  ([Moving around](grid-and-editing.md#moving-around)), the area cycle and the editor's history keys know where
  focus is, so Ctrl+Z in the name box undoes its typing, never the sheet.
- A format key runs its item wherever focus is in the surface, a cell being edited included, as Google's does: Ctrl+B
  mid-edit makes the cell bold (default, D138).

## Common actions

| Action                         | PC                             | Mac                          | ChromeOS                 | Status                                                  |
| ------------------------------ | ------------------------------ | ---------------------------- | ------------------------ | ------------------------------------------------------- |
| Select column                  | `Ctrl+Space`                   | `Ctrl+Space`                 | `Ctrl+Space`             | the surface's (`spreadsheet-surface-shortcuts.test.ts`) |
| Select row                     | `Shift+Space`                  | `Shift+Space`                | `Shift+Space`            | the surface's (`spreadsheet-surface-shortcuts.test.ts`) |
| Select all                     | `Ctrl+A or Ctrl+Shift+Space`   | `⌘+A or ⌘+Shift+Space`       | `Ctrl+A`                 | the surface's (`spreadsheet-surface-shortcuts.test.ts`) |
| Select current region          | —                              | `⌘+Shift+8 or Ctrl+Shift+8`  | —                        | specified                                               |
| Undo                           | `Ctrl+Z`                       | `⌘+Z`                        | `Ctrl+Z`                 | the surface's (`spreadsheet-surface-shortcuts.test.ts`) |
| Redo                           | `Ctrl+Y or Ctrl+Shift+Z or F4` | `⌘+Y or ⌘+Shift+Z or Fn+F4`  | `Ctrl+Y or Ctrl+Shift+Z` | the surface's (`spreadsheet-surface-shortcuts.test.ts`) |
| Find                           | `Ctrl+F`                       | `⌘+F`                        | `Ctrl+F`                 | the surface's (`spreadsheet-surface-shortcuts.test.ts`) |
| Find and replace               | `Ctrl+H`                       | `⌘+Shift+H`                  | `Ctrl+H`                 | the surface's (`spreadsheet-surface-shortcuts.test.ts`) |
| Fill range                     | `Ctrl+Enter`                   | `⌘+Enter`                    | `Ctrl+Enter`             | the surface's (`spreadsheet-surface-shortcuts.test.ts`) |
| Fill down                      | `Ctrl+D`                       | `⌘+D`                        | `Ctrl+D`                 | the surface's (`spreadsheet-surface-shortcuts.test.ts`) |
| Fill right                     | `Ctrl+R`                       | `⌘+R`                        | `Ctrl+R`                 | the surface's (`spreadsheet-surface-shortcuts.test.ts`) |
| Save                           | `Ctrl+S`                       | `⌘+S`                        | `Ctrl+S`                 | specified                                               |
| Open                           | `Ctrl+O`                       | `⌘+O`                        | `Ctrl+O`                 | built (`spreadsheet-shortcuts.test.tsx`)                |
| Print                          | `Ctrl+P`                       | `⌘+P`                        | `Ctrl+P`                 | specified                                               |
| Copy                           | `Ctrl+C`                       | `⌘+C`                        | `Ctrl+C`                 | the browser's                                           |
| Cut                            | `Ctrl+X`                       | `⌘+X`                        | `Ctrl+X`                 | the browser's                                           |
| Paste                          | `Ctrl+V`                       | `⌘+V`                        | `Ctrl+V`                 | the browser's                                           |
| Paste values only              | `Ctrl+Shift+V`                 | `⌘+Shift+V`                  | `Ctrl+Shift+V`           | the surface's (`spreadsheet-surface-shortcuts.test.ts`) |
| Show common keyboard shortcuts | `Ctrl+/`                       | `⌘+/`                        | `Ctrl+/`                 | built (`spreadsheet-shortcuts.test.tsx`)                |
| Insert new sheet               | `Shift+F11`                    | `Shift+Fn+F11`               | —                        | built (`spreadsheet-shortcuts.test.tsx`)                |
| Compact controls               | `Ctrl+Shift+F`                 | `Ctrl+Shift+F`               | `Ctrl+Shift+F`           | specified                                               |
| Show or hide the menus         | —                              | `⌘+Option+R or Ctrl+Shift+F` | —                        | specified                                               |
| Input tools on or off          | `Ctrl+Shift+K`                 | `⌘+Shift+K`                  | `Ctrl+Shift+K`           | specified                                               |
| Select input tools             | `Ctrl+Alt+Shift+K`             | `⌘+Option+Shift+K`           | `Ctrl+Alt+Shift+K`       | specified                                               |
| Tool finder                    | `Alt+/`                        | `Option+/`                   | `Alt+/`                  | built (`spreadsheet-shortcuts.test.tsx`)                |
| Rename sheet                   | `Alt+1`                        | —                            | —                        | the surface's (`spreadsheet-surface-shortcuts.test.ts`) |
| Convert range to table         | `Ctrl+Alt+T`                   | `⌘+Option+T`                 | `Alt+Shift+T`            | built (`spreadsheet-tables.spec.ts`)                    |

## Format cells

| Action               | PC                            | Mac                                           | ChromeOS                      | Status                                                  |
| -------------------- | ----------------------------- | --------------------------------------------- | ----------------------------- | ------------------------------------------------------- |
| Bold                 | `Ctrl+B`                      | `⌘+B or ⌘+2 or Ctrl+2`                        | `Ctrl+B`                      | built (`spreadsheet-shortcuts.test.tsx`)                |
| Underline            | `Ctrl+U`                      | `⌘+U or ⌘+4 or Ctrl+4`                        | `Ctrl+U`                      | built (`spreadsheet-shortcuts.test.tsx`)                |
| Italic               | `Ctrl+I`                      | `⌘+I or ⌘+3 or Ctrl+3`                        | `Ctrl+I`                      | built (`spreadsheet-shortcuts.test.tsx`)                |
| Strikethrough        | `Alt+Shift+5`                 | `⌘+Shift+X or ⌘+5 or Ctrl+5`                  | `Alt+Shift+5`                 | built (`spreadsheet-shortcuts.test.tsx`)                |
| Center align         | `Ctrl+Shift+E`                | `⌘+Shift+E`                                   | `Ctrl+Shift+E`                | built (`spreadsheet-shortcuts.test.tsx`)                |
| Left align           | `Ctrl+Shift+L`                | `⌘+Shift+L`                                   | `Ctrl+Shift+L`                | built (`spreadsheet-shortcuts.test.tsx`)                |
| Right align          | `Ctrl+Shift+R`                | `⌘+Shift+R`                                   | `Ctrl+Shift+R`                | built (`spreadsheet-shortcuts.test.tsx`)                |
| Apply top border     | `Alt+Shift+1`                 | `Option+Shift+1`                              | `Alt+Shift+1`                 | built (`spreadsheet-shortcuts.test.tsx`)                |
| Apply right border   | `Alt+Shift+2`                 | `Option+Shift+2`                              | `Alt+Shift+2`                 | built (`spreadsheet-shortcuts.test.tsx`)                |
| Apply bottom border  | `Alt+Shift+3`                 | `Option+Shift+3`                              | `Alt+Shift+3`                 | built (`spreadsheet-shortcuts.test.tsx`)                |
| Apply left border    | `Alt+Shift+4`                 | `Option+Shift+4`                              | `Alt+Shift+4`                 | built (`spreadsheet-shortcuts.test.tsx`)                |
| Remove borders       | `Alt+Shift+6`                 | `Option+Shift+6`                              | `Alt+Shift+6`                 | built (`spreadsheet-shortcuts.test.tsx`)                |
| Apply outer border   | `Alt+Shift+7 or Ctrl+Shift+7` | `Option+Shift+7 or ⌘+Shift+7 or Ctrl+Shift+7` | `Alt+Shift+7 or Ctrl+Shift+7` | built (`spreadsheet-shortcuts.test.tsx`)                |
| Insert link          | `Ctrl+K`                      | `⌘+K`                                         | `Ctrl+K`                      | specified                                               |
| Insert time          | `Ctrl+Shift+;`                | `⌘+Shift+;`                                   | `Ctrl+Shift+;`                | the surface's (`spreadsheet-surface-shortcuts.test.ts`) |
| Insert date          | `Ctrl+;`                      | `⌘+;`                                         | `Ctrl+;`                      | the surface's (`spreadsheet-surface-shortcuts.test.ts`) |
| Insert date and time | `Ctrl+Alt+Shift+;`            | `⌘+Option+Shift+;`                            | `Ctrl+Alt+Shift+;`            | specified                                               |
| Format as decimal    | `Ctrl+Shift+1`                | `Ctrl+Shift+1`                                | `Ctrl+Shift+1`                | built (`spreadsheet-shortcuts.test.tsx`)                |
| Format as time       | `Ctrl+Shift+2`                | `Ctrl+Shift+2`                                | `Ctrl+Shift+2`                | built (`spreadsheet-shortcuts.test.tsx`)                |
| Format as date       | `Ctrl+Shift+3`                | `Ctrl+Shift+3`                                | `Ctrl+Shift+3`                | built (`spreadsheet-shortcuts.test.tsx`)                |
| Format as currency   | `Ctrl+Shift+4`                | `Ctrl+Shift+4`                                | `Ctrl+Shift+4`                | built (`spreadsheet-shortcuts.test.tsx`)                |
| Format as percentage | `Ctrl+Shift+5`                | `Ctrl+Shift+5`                                | `Ctrl+Shift+5`                | built (`spreadsheet-shortcuts.test.tsx`)                |
| Format as exponent   | `Ctrl+Shift+6`                | `Ctrl+Shift+6`                                | `Ctrl+Shift+6`                | built (`spreadsheet-shortcuts.test.tsx`)                |
| Clear formatting     | `Ctrl+\`                      | `⌘+\`                                         | `Ctrl+\`                      | built (`spreadsheet-shortcuts.test.tsx`)                |

## Navigate the spreadsheet

| Action                                  | PC                         | Mac                           | ChromeOS                     | Status                                                  |
| --------------------------------------- | -------------------------- | ----------------------------- | ---------------------------- | ------------------------------------------------------- |
| Move to beginning of row                | `Home`                     | `Fn+Left`                     | `Search+Left`                | the surface's (`spreadsheet-surface-shortcuts.test.ts`) |
| Move to beginning of sheet              | `Ctrl+Home`                | `⌘+Fn+Left`                   | `Ctrl+Search+Left`           | the surface's (`spreadsheet-surface-shortcuts.test.ts`) |
| Move to end of row                      | `End`                      | `Fn+Right`                    | `Search+Right`               | the surface's (`spreadsheet-surface-shortcuts.test.ts`) |
| Move to end of sheet                    | `Ctrl+End`                 | `⌘+Fn+Right`                  | `Ctrl+Search+Right`          | the surface's (`spreadsheet-surface-shortcuts.test.ts`) |
| Move to first cell in row with data     | —                          | —                             | `Ctrl+Left`                  | the surface's (`spreadsheet-surface-shortcuts.test.ts`) |
| Move to last cell in row with data      | —                          | —                             | `Ctrl+Right`                 | the surface's (`spreadsheet-surface-shortcuts.test.ts`) |
| Scroll to active cell                   | `Ctrl+Backspace`           | `⌘+Backspace`                 | `Ctrl+Backspace`             | the surface's (`spreadsheet-surface-shortcuts.test.ts`) |
| Move to next sheet                      | `Alt+Down`                 | `Option+Down or Option+Right` | `Ctrl+Shift+Search+Down`     | the surface's (`spreadsheet-surface-shortcuts.test.ts`) |
| Move to previous sheet                  | `Alt+Up`                   | `Option+Up or Option+Left`    | `Ctrl+Shift+Search+Up`       | the surface's (`spreadsheet-surface-shortcuts.test.ts`) |
| Display list of sheets                  | `Alt+Shift+K`              | `Option+Shift+K`              | `Alt+Shift+K`                | the surface's (`spreadsheet-surface-shortcuts.test.ts`) |
| Open hyperlink                          | `Alt+Enter`                | `Option+Enter`                | `Alt+Enter`                  | specified                                               |
| Open Explore                            | `Ctrl+Alt+Shift+I`         | `⌘+Option+Shift+I`            | `Ctrl+Alt+Shift+I`           | left out (C3)                                           |
| Cycle focus between main areas          | `Ctrl+Alt+. or Ctrl+Alt+,` | `⌘+Option+. or ⌘+Option+,`    | `Alt+Shift+. or Alt+Shift+,` | the surface's (`spreadsheet-surface-shortcuts.test.ts`) |
| Move focus out of spreadsheet           | `Ctrl+Alt+Shift+M`         | `Ctrl+⌘+Shift+M`              | `Ctrl+Alt+Shift+M`           | the surface's (`spreadsheet-surface-shortcuts.test.ts`) |
| Move to quicksum                        | `Alt+Shift+Q`              | `Option+Shift+Q`              | `Alt+Shift+Q`                | the surface's (`spreadsheet-surface-shortcuts.test.ts`) |
| Move focus to popup                     | `Ctrl+Alt+E, P`            | `Ctrl+⌘+E, P`                 | `Ctrl+Alt+E, P`              | specified                                               |
| Open drop-down menu on filtered cell    | `Ctrl+Alt+R`               | `Ctrl+⌘+R`                    | `Ctrl+Alt+R`                 | built (`useFilterMenuShortcut.test.tsx`)                |
| Show "Go to range" dialog               | —                          | `Ctrl+G`                      | —                            | specified                                               |
| Find and replace with Find tab selected | —                          | `Ctrl+F`                      | —                            | the surface's (`spreadsheet-surface-shortcuts.test.ts`) |
| Open revision history                   | `Ctrl+Alt+Shift+H`         | `⌘+Option+Shift+H`            | `Ctrl+Alt+Shift+H`           | specified                                               |
| Close drawing editor                    | `Shift+Esc`                | `⌘+Esc or Shift+Esc`          | `Ctrl+Esc or Shift+Esc`      | specified                                               |

## Notes and comments

| Action                                           | PC                 | Mac                | ChromeOS           | Status    |
| ------------------------------------------------ | ------------------ | ------------------ | ------------------ | --------- |
| Insert or edit note                              | `Shift+F2`         | `Shift+F2`         | `Shift+Search+2`   | specified |
| Insert or edit comment                           | `Ctrl+Alt+M`       | `⌘+Option+M`       | `Ctrl+Alt+M`       | specified |
| Open comment discussion thread                   | `Ctrl+Alt+Shift+A` | `⌘+Option+Shift+A` | `Ctrl+Alt+Shift+A` | specified |
| Enter current comment                            | `Ctrl+Alt+E, C`    | `Ctrl+⌘+E, C`      | `Ctrl+Alt+E, C`    | specified |
| Move to next comment                             | `Ctrl+Alt+N, C`    | `Ctrl+⌘+N, C`      | `Ctrl+Alt+N, C`    | specified |
| Move to previous comment                         | `Ctrl+Alt+P, C`    | `Ctrl+⌘+P, C`      | `Ctrl+Alt+P, C`    | specified |
| Reply to current comment                         | `R`                | `R`                | `R`                | specified |
| Move to next comment (on a selected comment)     | `J`                | `J`                | `J`                | specified |
| Move to previous comment (on a selected comment) | `K`                | `K`                | `K`                | specified |
| Resolve current comment                          | `E`                | `E`                | `E`                | specified |
| Exit current comment                             | `U`                | `U`                | `U`                | specified |

## Menus

| Action                                 | PC                                               | Mac                      | ChromeOS                    | Status                                                  |
| -------------------------------------- | ------------------------------------------------ | ------------------------ | --------------------------- | ------------------------------------------------------- |
| File menu                              | `Alt+F (Chrome) or Alt+Shift+F (other browsers)` | `Ctrl+Option+F`          | `Alt+F`                     | built (`spreadsheet-shortcuts.test.tsx`)                |
| Edit menu                              | `Alt+E (Chrome) or Alt+Shift+E (other browsers)` | `Ctrl+Option+E`          | `Alt+E`                     | built (`spreadsheet-shortcuts.test.tsx`)                |
| View menu                              | `Alt+V (Chrome) or Alt+Shift+V (other browsers)` | `Ctrl+Option+V`          | `Alt+V`                     | built (`spreadsheet-shortcuts.test.tsx`)                |
| Insert menu                            | `Alt+I (Chrome) or Alt+Shift+I (other browsers)` | `Ctrl+Option+I`          | `Alt+I`                     | built (`spreadsheet-shortcuts.test.tsx`)                |
| Format menu                            | `Alt+O (Chrome) or Alt+Shift+O (other browsers)` | `Ctrl+Option+O`          | `Alt+O`                     | built (`spreadsheet-shortcuts.test.tsx`)                |
| Data menu                              | `Alt+D (Chrome) or Alt+Shift+D (other browsers)` | `Ctrl+Option+D`          | `Alt+D`                     | built (`spreadsheet-shortcuts.test.tsx`)                |
| Tools menu                             | `Alt+T (Chrome) or Alt+Shift+T (other browsers)` | `Ctrl+Option+T`          | `Alt+T`                     | built (`spreadsheet-shortcuts.test.tsx`)                |
| Open insert menu (with cells selected) | `Ctrl+Alt+=`                                     | `⌘+Option+=`             | `Ctrl+Alt+=`                | specified                                               |
| Open delete menu (with cells selected) | `Ctrl+Alt+-`                                     | `⌘+Option+-`             | `Ctrl+Alt+-`                | specified                                               |
| Form menu                              | `Alt+M (Chrome) or Alt+Shift+M (other browsers)` | `Ctrl+Option+M`          | `Alt+M`                     | specified                                               |
| Add-ons menu                           | `Alt+N (Chrome) or Alt+Shift+N (other browsers)` | `Ctrl+Option+N`          | `Alt+N`                     | left out (C3)                                           |
| Help menu                              | `Alt+H (Chrome) or Alt+Shift+H (other browsers)` | `Ctrl+Option+H`          | `Alt+H`                     | built (`spreadsheet-shortcuts.test.tsx`)                |
| Accessibility menu                     | `Alt+A (Chrome) or Alt+Shift+A (other browsers)` | `Ctrl+Option+A`          | `Alt+A`                     | specified                                               |
| Sheet menu                             | `Alt+Shift+S`                                    | `Option+Shift+S`         | `Ctrl+Shift+S`              | specified                                               |
| Context menu                           | `Ctrl+Shift+\ or Shift+F10`                      | `⌘+Shift+\ or Shift+F10` | `Ctrl+Shift+\ or Shift+F10` | the surface's (`spreadsheet-surface-shortcuts.test.ts`) |
| Table column menu                      | `Ctrl+Alt+\`                                     | `⌘+Option+\`             | `Ctrl+Alt+\`                | built (`SheetTablesLayer.test.tsx`)                     |

## Rows and columns

| Action                                             | PC                | Mac                  | ChromeOS          | Status                                                  |
| -------------------------------------------------- | ----------------- | -------------------- | ----------------- | ------------------------------------------------------- |
| Insert rows above (with rows selected)             | `Ctrl+Alt+=`      | `⌘+Option+=`         | `Ctrl+Alt+=`      | the surface's (`spreadsheet-surface-shortcuts.test.ts`) |
| Insert rows below                                  | —                 | —                    | —                 | specified                                               |
| Insert columns to the left (with columns selected) | `Ctrl+Alt+=`      | `⌘+Option+=`         | `Ctrl+Alt+=`      | the surface's (`spreadsheet-surface-shortcuts.test.ts`) |
| Insert columns to the right                        | —                 | —                    | —                 | specified                                               |
| Delete rows (with rows selected)                   | `Ctrl+Alt+-`      | `⌘+Option+-`         | `Ctrl+Alt+-`      | the surface's (`spreadsheet-surface-shortcuts.test.ts`) |
| Delete columns (with columns selected)             | `Ctrl+Alt+-`      | `⌘+Option+-`         | `Ctrl+Alt+-`      | the surface's (`spreadsheet-surface-shortcuts.test.ts`) |
| Hide row                                           | `Ctrl+Alt+9`      | `⌘+Option+9`         | `Ctrl+Alt+9`      | the surface's (`spreadsheet-surface-shortcuts.test.ts`) |
| Unhide row                                         | `Ctrl+Shift+9`    | `⌘+Shift+9`          | `Ctrl+Shift+9`    | the surface's (`spreadsheet-surface-shortcuts.test.ts`) |
| Hide column                                        | `Ctrl+Alt+0`      | `⌘+Option+0`         | `Ctrl+Alt+0`      | the surface's (`spreadsheet-surface-shortcuts.test.ts`) |
| Unhide column                                      | `Ctrl+Shift+0`    | `⌘+Shift+0`          | `Ctrl+Shift+0`    | the surface's (`spreadsheet-surface-shortcuts.test.ts`) |
| Group rows or columns                              | `Alt+Shift+Right` | `Option+Shift+Right` | `Alt+Shift+Right` | the surface's (`spreadsheet-surface-shortcuts.test.ts`) |
| Ungroup rows or columns                            | `Alt+Shift+Left`  | `Option+Shift+Left`  | `Alt+Shift+Left`  | the surface's (`spreadsheet-surface-shortcuts.test.ts`) |
| Expand grouped rows or columns                     | `Alt+Shift+Down`  | `Option+Shift+Down`  | `Alt+Shift+Down`  | the surface's (`spreadsheet-surface-shortcuts.test.ts`) |
| Collapse grouped rows or columns                   | `Alt+Shift+Up`    | `Option+Shift+Up`    | `Alt+Shift+Up`    | the surface's (`spreadsheet-surface-shortcuts.test.ts`) |

## Formulas

| Action                                                    | PC                     | Mac                                  | ChromeOS                           | Status                                                  |
| --------------------------------------------------------- | ---------------------- | ------------------------------------ | ---------------------------------- | ------------------------------------------------------- |
| Show all formulas                                         | `Ctrl+~`               | `Ctrl+~`                             | `Ctrl+~`                           | built (`spreadsheet-shortcuts.test.tsx`)                |
| Insert array formula                                      | `Ctrl+Shift+Enter`     | `⌘+Shift+Enter`                      | `Ctrl+Shift+Enter`                 | the surface's (`spreadsheet-surface-shortcuts.test.ts`) |
| Collapse an expanded array formula                        | `Ctrl+E`               | `⌘+E`                                | `Ctrl+E`                           | specified                                               |
| Show or hide formula help (when entering a formula)       | `Shift+F1`             | `Shift+Fn+F1`                        | `Shift+Search+1`                   | specified                                               |
| Full or compact formula help (when entering a formula)    | `F1`                   | `Fn+F1`                              | `Search+1`                         | specified                                               |
| Absolute or relative references (when entering a formula) | `F4`                   | `Fn+F4`                              | `Search+4`                         | the surface's (`spreadsheet-surface-shortcuts.test.ts`) |
| Toggle formula result previews (when entering a formula)  | `F9`                   | `Fn+F9`                              | `Search+9`                         | specified                                               |
| Resize formula bar                                        | `Ctrl+Up or Ctrl+Down` | `Ctrl+Option+Up or Ctrl+Option+Down` | `Ctrl+Shift+Up or Ctrl+Shift+Down` | specified                                               |
| Toggle formula range selection (when entering a formula)  | `F2 or Ctrl+E`         | `F2 or Ctrl+E`                       | `F2 or Ctrl+E`                     | specified                                               |

## Screen readers

| Action                        | PC                 | Mac                | ChromeOS           | Status                                                  |
| ----------------------------- | ------------------ | ------------------ | ------------------ | ------------------------------------------------------- |
| Turn on screen reader support | `Ctrl+Alt+Z`       | `⌘+Option+Z`       | `Ctrl+Alt+Z`       | specified                                               |
| Enable braille support        | `Ctrl+Alt+H`       | `⌘+Option+H`       | `Ctrl+Alt+H`       | specified                                               |
| Read column                   | `Ctrl+Alt+Shift+C` | `⌘+Option+Shift+C` | `Ctrl+Alt+Shift+C` | the surface's (`spreadsheet-surface-shortcuts.test.ts`) |
| Read row                      | `Ctrl+Alt+Shift+R` | `⌘+Option+Shift+R` | `Ctrl+Alt+Shift+R` | the surface's (`spreadsheet-surface-shortcuts.test.ts`) |

## Ways not listed

- Google's three-step menu paths (Alt+I, then R, then R inserts a row above) are not listed: a sequence is two keys.
  The menus' Alt keys and arrows reach the same items; a row with none of its other ways reads `—`.
- Google's keys for Portugal, Italy, Germany and Spain (Ctrl+Shift+H for Insert time, Ctrl+Shift+D for Insert date,
  Ctrl+Alt+Shift+N for Insert date and time) are not kept: one set of keys holds for every locale (default, D139).
- ChromeOS's Move to top left of sheet and Move to bottom right of sheet share Move to beginning and end of sheet's
  keys, and its Hide rows is Hide row; one row each.
