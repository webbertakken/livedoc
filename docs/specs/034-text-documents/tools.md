# Tools

**Status: being built.** Word count, spelling (Dutch and French, with the card, the personal dictionary and automatic
correction) and Preferences are built; the other parts below are still to come.

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

- **One checker**: Hunspell dictionaries run by nspell (MIT) in a Web Worker, each loaded the first time text in its
  language is checked, never on the main thread ([Spelling](../../research/docs-open-standard/spelling.md)).
- **Dictionaries shipped**: Dutch (BSD or CC-BY) and French (MPL-2.0), each listed with its licence on the licences
  page. German and Spanish (GPL) are not shipped (director, 2026-11-27).
- **Which dictionary**: text's language is the document's (File > Language), else the browser's; any Dutch takes
  Dutch, any French French. A run that carries its own language follows it.
- **Underlines**: where a dictionary ships, LiveDoc draws its own wavy red underline under each misspelt word, and the
  browser's own check is off for that text (no double underlines); text in any other language keeps the browser's own
  check, underlines and right-click suggestions (director, 2026-11-27).
- **Not checked**: words with a digit, an underscore, `@` or `/` in them, web and mail addresses, words in capitals
  only, and code blocks. The word being typed is underlined once the caret leaves it.
- **Right-click on a misspelt word**: the context menu opens with up to five suggestions, then **Add to personal
  dictionary** (Google's words, help 57859) and **Ignore**, above its usual items. Choosing a suggestion replaces the
  word, one undo step.
- **Tools > Spelling and grammar**, in Google's order: Spelling and grammar check, Show spelling suggestions, then
  Personal dictionary (Show grammar suggestions only where a grammar server is configured).
- **Spelling and grammar check** (⌘⌥X, F7, the toolbar's button) opens a card at the top right of the writing, beside
  it rather than over it, walking the body's misspellings from the caret: the word selected in the writing, "Change
  ‹word› to" with up to five suggestions to choose from, **Accept**, **Ignore**, **Add to personal dictionary**,
  Previous and Next; each of the first three moves on to the next. With none left the card says "No spelling
  suggestions"; a word with none says "No suggestions" and cannot be accepted. Escape or Close returns to the writing.
  Its look and copy are (default) until a capture. **Ignore** sets the word aside in this document until it is closed.
- **Next and previous misspelling** (⌘' and ⌘;): select the next or previous misspelt word, wrapping at either end,
  without the card.
- **Headers, footers and footnotes** are checked and underlined as the body is, with the same context menu while one is
  being edited.
- **Personal dictionary** (Tools > Spelling and grammar > Personal dictionary): per person, stored with the account
  (in this browser for a guest), shared by all their text documents and, later, spreadsheets; words are checked as
  written, up to 400 of them (the preferences' 16 KB), each up to 48 characters. Its dialog has a field and **Add**,
  then the words in alphabetical order, each with a remove button; a change is kept at once. At the limit, adding a
  word says "Your personal dictionary is full. Remove a word to add another."; a word with a space or past 48
  characters, "Enter one word, without spaces, up to 48 characters."; a word already there, "That word is already in
  your dictionary." With none, the dialog says "No words yet" (default).
- **Who**: the underlines and the card show for everyone who can change the text (Editing or Suggesting); a Viewer sees
  no underlines. Accepting in Suggesting makes a suggestion. The personal dictionary is the person's own, whatever
  their role.
- **Budgets**: a dictionary's load under 3 MB, the first check of a 50-page document within 1 s after its dictionary
  loads, a keystroke's check off the main thread and within the existing input budgets.
- Show spelling suggestions (Tools > Spelling and grammar): per person, on by default; off hides LiveDoc's underlines
  and turns the browser's check off too.
- **Grammar** needs a server: shown only where the host configures one (fork D5, ruled: none on docs.nu; a self-hoster may configure one).
- Show grammar suggestions: per person, present only where a grammar server is configured.
- **Automatically correct spelling** (Preferences, on by default as Google's): a misspelt word with one correction the
  checker is sure of is corrected as the word ends (a space, punctuation, Enter), its own undo step, as a typing aid is.
  Sure means exactly one swap of two neighbouring letters spelt right, else exactly one suggestion one edit away. A
  word with a capital after its first letter, a personal or ignored word, and code are never corrected; the word keeps
  its first letter's case. The correction lands only if the word is still as typed when the check answers.
  It acts in the body; headers, footers and footnotes are checked and underlined but not corrected (default).
- **Always correct to ‹suggestion›** (the context menu on a misspelt word, Google's, help 12022089): the word replaced
  by its first suggestion now, and the pair added to the person's substitutions (Preferences > Substitutions), so it is
  corrected as typed from then on; at the substitutions' limit it says so. Its place in the menu is (default).

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

Everyone may find, count words, look up words and open the outline; spelling shows to whoever can change the text; only Editors replace (a Participant replaces as
suggestions under D7); preferences and accessibility settings are each person's own.

## Telemetry

`Search · Used · TextDocumentFind`, `TextDocumentReplaceAll`; `Document · Changed · TextDocumentSpellingAccepted` (a
suggestion taken), `TextDocumentSpellingCorrected` (corrected while typing), `TextDocumentAlwaysCorrect`,
`TextDocumentDictionaryAdded`; `UI · Opened · TextDocumentWordCount`, `TextDocumentSpelling`,
`TextDocumentCitations`; `UI · Toggled · TextDocumentWordCountWhileTypingOn`, `TextDocumentWordCountWhileTypingOff`,
`TextDocumentSpellingSuggestionsOn`, `TextDocumentSpellingSuggestionsOff` (each before it is kept),
`TextDocumentScreenReader`. Never text.
