# Settings

**Status: specified.** The settings are stored with the workbook and saved through the api
([Sheet store](sheet-store.md#changing-the-workbook)); the locale and time zone are applied as
[Formulas](formulas.md#locale) says; the dialog, Tools and View are not built.

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
