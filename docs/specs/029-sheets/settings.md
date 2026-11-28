# Settings

**Status: specified; the dialog is built.** The settings are stored with the workbook and saved through the api
([Sheet store](sheet-store.md#changing-the-workbook)); the locale and time zone are applied as
[Formulas](formulas.md#locale) says. The dialog's default font, Tools and View are not built.

A [spreadsheet](spreadsheet.md)'s own settings and the Tools and View items around them.

## Spreadsheet settings

**File › Settings** opens a dialog of two tabs:

- **General**: **Locale** (how numbers, dates and currency read and show, and function argument separators as typed),
  **Time Zone** (what `NOW` and `TODAY` read, and edit history's times), **Display Language** for functions (English
  only to start; names are always stored in English), the default font, and **Cards From** (the Plan document the `CARD` functions read,
  [Plan's links](plan-links.md#the-card-functions)).
- **Calculation**: **Recalculation** (On Change; On Change and Every Minute; On Change and Every Hour: how often
  `NOW`, `TODAY`, `RAND` and `RANDBETWEEN` recalculate), **Iterative Calculation** (off; on with **Max Number of
  Iterations**, 1 to 1,000, default 50, and **Threshold**, default 0.05).
- **Save Settings** writes them, one undo step, seen by everyone; both formats keep them ([Standard mapping](standard-mapping.md)).
- The dialog is Google's **Settings for This Spreadsheet**, opened with the settings as they are; Cancel, Escape or
  closing it changes nothing.
- **Locale** offers a fixed list of locales by their English names (`English (United Kingdom)`), the spreadsheet's own
  added when it is not among them (D510). **Time Zone** offers every zone the browser knows, as Google writes them:
  `(GMT+01:00) Amsterdam`, ordered by offset, then name (D511).
- **Cards From** offers **None** and the Editor's own documents that are neither spreadsheets nor text documents,
  newest first; a document named by someone else that is not theirs shows as **Another Document** and stays chosen
  until changed (D512).
- **Max Number of Iterations** and **Threshold** show only with Iterative Calculation on; a value out of range says
  so under its field ("Enter a whole number from 1 to 1,000", "Enter a number of 0 or more") and Save Settings waits.
- A save the api refuses or cannot reach keeps the dialog open with "The settings couldn't be saved. Try again."
- Undo after Save Settings saves the settings as they were; redo saves them again.
- With iterative calculation off a circular reference shows `#REF!` with "Circular dependency detected" as Google's,
  instead of today's wording.

## Tools

- **Spelling** › **Spell Check**: walks the workbook's text cells with suggestions, **Change**, **Ignore**, **Add to
  Dictionary**; the browser's own dictionaries, no outside service. **Personal Dictionary** lists the added words.
- **Suggestion Controls**: Enable Autocomplete, Enable Formula Suggestions, Enable Formula Corrections, Enable Named
  Function Suggestions; each the person's own.
- **Notification Settings** › **Notification Rules**: email me when any changes are made, or a user submits a form,
  daily or right away; where the deployment has email configured. Where it has none, the item is absent, and nothing
  else depends on it. **Comment Notifications** are LiveDoc's own.
- **Accessibility**: screen reader support on (adds the announcements of [Grid and editing](grid-and-editing.md#accessibility)),
  braille support, announce formula on cell focus.

## View

Show (Gridlines, Formula Bar, Formulas, Protected Ranges), Freeze, Group, Comments, Hidden Sheets, Zoom, Full Screen:
the person's own view except Freeze, Group and Hidden Sheets, which are the sheet's ([Grid and editing](grid-and-editing.md)).

## Defaults

- **D510** The locales offered are a fixed list of common ones (`SPREADSHEET_LOCALES`), named by
  `Intl.DisplayNames`, rather than every tag the browser knows (hundreds, most never chosen). A spreadsheet in
  another locale keeps it, listed first.
- **D511** Time zones are the browser's `Intl.supportedValuesOf('timeZone')`, each labelled by its offset now and its
  city, as Google labels them; the offset is today's, so it follows daylight saving.
- **D512** Cards From lists the Editor's own documents, as Copy To lists spreadsheets (D183), since the api lists no
  document by when the person last opened it.

## Left out

Tools › **Create a New Form** makes a LiveDoc form whose responses land in a new sheet of this workbook, and
**Activity Dashboard** shows who viewed and edited, from the Timeline (an Editor's); Conditional Notifications are
left out (C3 list, ruled 2026-11-18). Extensions
(Add-ons, Macros, Apps Script, AppSheet) is left out (C3) ([Parity matrix](parity-matrix.md)).

## Who may do what

Spreadsheet settings: Editors. Tools and View: everyone, for their own view.

## Telemetry

`Spreadsheet · Changed · Settings`; `Spreadsheet · Toggled · <Setting>` for the person's own switches, fired before
the change is saved.
