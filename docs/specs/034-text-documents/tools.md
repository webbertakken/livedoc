# Tools

**Status: specified.** Nothing is built.

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

- ⌘⇧C opens the dialog: pages, words, characters, characters excluding spaces, of the document or the selection;
  **Display word count while typing** shows a floating box at the bottom left (words; a press cycles pages, characters,
  characters excluding spaces).
- Counts follow Google's rules: words split at white space and punctuation that separates words; footnotes, headers and
  footers not counted (assumed: Google's; confirmed with the captures).

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

Tools > Preferences: **General** (the typing aids of [Text and paragraphs](text-and-paragraphs.md#typing-aids), ruler
units) and **Substitutions**. Per person.

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
`TextDocumentSpelling`, `TextDocumentCitations`; `UI · Toggled · TextDocumentScreenReader`. Never text.
