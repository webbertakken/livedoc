# Tools

**Status: being built.** Word count is built; the other parts below are still to come.

Find and replace, word count, spelling and grammar, the dictionary, citations, preferences, accessibility settings,
language and activity in a [text document](text-document.md), and what fork C3 (ruled: core only) leaves out.

## Find and replace

- ⌘F opens a small find box at the top right: the count ("3 of 12"), Next (⌘G, Enter) and Previous (⌘⇧G, Shift+Enter),
  matches tinted, the current one stronger; Escape closes.
- ⌘H (⌘⇧H on a Mac) opens the **Find and replace** dialog: Find, Replace with, **Match case**, **Match using regular
  expressions** (JavaScript's syntax, `$1` in Replace), **Ignore Latin diacritics**; Previous, Next, **Replace**,
  **Replace all**.
- Search covers the current document tab's body, headers, footers and footnotes; **Replace all** is one undo step and
  one change for collaborators; in Suggesting mode each replacement is a suggestion.
- A regular expression that does not compile shows "That isn't a valid regular expression"; a search is stopped after
  10,000 matches ("Showing the first 10,000 matches").

## Word count

As Google Docs’ Tools > Word count ([Google Docs Editors Help 39003](https://support.google.com/docs/answer/39003?hl=en),
fetched 2026-11-27); the look is (default) until a capture of Google’s dialog.

- **The dialog**: Tools > Word count and ⌘⇧C open an office dialog **Word count**: rows **Pages**, **Words**,
  **Characters**, **Characters excluding spaces**, each with its count; with a selection, each reads "12 of 340" (the
  selection’s of the document’s), Pages always the document’s. Pages shows only where pages are laid out (not
  pageless, not on a phone) (default). Under the rows the checkbox **Display word count while typing**; **OK** closes.
- **While typing**: with the checkbox on, a small box at the bottom left of the writing shows "340 words" ("12 of 340
  words" with a selection), kept current as anyone writes; a press on it cycles words, characters, characters
  excluding spaces, then pages where laid out (default). The checkbox is the person’s own, kept with their account,
  else this browser, for every text document (default).
- **What counts**: the current document tab’s body, tables included; headers, footers and footnotes are not counted
  unless selected (help 39003: "Unless you select a section of the document, word count applies to everything except
  headers, footers, and footnotes"). Words are the browser’s word segmentation (`Intl.Segmenter`, word-like
  segments), so white space and punctuation that separates words split them, "don’t" stays one word and a CJK run
  counts its words (default); characters are what a reader sees as one character (grapheme clusters), paragraph breaks
  not counted, and pictures, equations and footnote marks count nothing (default).
- **Who**: everyone who can read the document, Viewers included.

## Spelling and grammar

- Misspelt words are underlined by the browser's own check, at no cost, offline and self-hosted, with its suggestions
  on right-click.
- **Spelling and grammar check** (⌘⌥X, F7, the toolbar's button) opens a card at the top right walking each misspelling
  with suggestions, **Accept**, **Ignore**, **Add to dictionary**, Next and Previous (⌘' and ⌘;), run on Hunspell
  dictionaries with permissive licences, loaded per language on demand
  ([Spelling](../../research/docs-open-standard/spelling.md)).
- **Personal dictionary** (Tools > Spelling and grammar > Personal dictionary): stored with the account (in this
  browser for a guest), shared by the person's documents.
- **Grammar** needs a server: shown only where the host configures one (fork D5, ruled: none on docs.nu; a self-hoster may configure one).
- Show spelling suggestions, show grammar suggestions: per person.
- **Automatically correct spelling** (Preferences): a misspelt word with one suggestion the checker is sure of is
  corrected as the word ends, its own undo step, as a typing aid is.

## Dictionary

⌘⇧Y opens a side panel with the definition of the selected word; either way under C3 (needs a shipped dictionary
or a service).

## Citations

Tools > Citations: a side panel to choose a style (MLA, APA, Chicago author-date), add sources by hand (book, website,
journal article, …, with their fields), cite one at the caret, and insert a bibliography; either way under C3
(Google's source search is a service, the rest is core).

## Language

File > Language: the document's language, used for spelling, hyphenation and smart quotes; written to both formats.

## Preferences

Tools > Preferences: an office dialog titled **Preferences** with two tabs, **General** and **Substitutions**, and
Cancel and OK; nothing changes until OK. Per person, kept with their account, else this browser.

- **General** (as Webber's capture of Google's dialog has it, 2026-11-21), checkboxes in this order:
  **Automatically capitalise words**, **Use smart quotes**, **Automatically detect links**, **Automatically detect
  lists**, **Enable Markdown** ([Text and paragraphs](text-and-paragraphs.md#typing-aids)); **Automatically correct
  spelling** ([Spelling and grammar](#spelling-and-grammar)); **Show link details**
  ([Links](links-and-navigation.md#links)); **Insert emoji using the colon character** ([Objects](objects.md#emoji)).
  Google's **Show Smart Reply suggestions** is an assistant's, left out (C3). An option whose feature is not built yet
  shows dimmed, "Coming soon" under it, as a menu item does ([Office shell](../004-interface-design/office-shell.md)).
  Google's General tab holds no ruler units: the ruler follows the browser's language.
- **Substitutions**: Automatic substitution (a checkbox over the list); a Replace and a With field to add a pair
  (Enter or leaving the With field adds it); then every pair as a checkbox, its Replace and With fields, and a remove
  button ("Remove substitution (c)"). A pair with an empty Replace or With is not kept.
- The tabs are a `tablist`; the list is a table of labelled fields, reached by Tab.

## Accessibility settings

Tools > Accessibility: **Turn on screen reader support** (⌘⌥Z): the editor announces edits, formatting and position, and
the Accessibility menu appears with Google's verbalise commands (⌘⌥ A then X, R, L, F, …); **Turn on braille support**;
**Show spelling suggestions in the dictionary panel**. Per person.

## Activity

Tools > Activity dashboard: who viewed the document and when, from LiveDoc's own opens; either way under C3.

## Google-only services

Left out (fork C3, ruled), each with its parity row: Apps Script and add-ons; Gemini and any assistant; smart chips;
voice typing; translate document; Explore; Drive (open from, add a shortcut), Photos, Calendar events, meeting notes and
Meet; Keep, Tasks, Contacts and Maps panels; Approvals. Their menu items are not shown.

## Share roles

Everyone may find, count words, look up words and open the outline; only Editors replace (a Participant replaces as
suggestions under D7); preferences and accessibility settings are each person's own.

## Telemetry

`Search · Used · TextDocumentFind`, `TextDocumentReplaceAll`; `UI · Opened · TextDocumentWordCount`,
`TextDocumentSpelling`, `TextDocumentCitations`; `UI · Toggled · TextDocumentWordCountWhileTypingOn`,
`TextDocumentWordCountWhileTypingOff` (before it is kept), `TextDocumentScreenReader`. Never text.
