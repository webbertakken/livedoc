# Content search

Search finds a document by what it holds as well as by its name.
Names match in the browser ([Explorer filters](explorer-filters.md#matching)); content matches in the api Worker,
in a D1 full-text index each document's room keeps current ([Document storage](../006-document/document-storage.md)).
Both forgive a typo and ignore case and accents.

This spec is the api's side: what is indexed, who finds what, how it matches and ranks, and what it answers.
How matches are shown belongs to the search's own presentation (the Ctrl K search, specified separately), which
reads this answer.

## Words

- **Search text**: the text of one tab as content search sees it, which its room pushes to the index.
- **Content match**: a document found by its search text, with the tab and the stretch that matched.
- **Trigram**: three letters or digits in a row from one word; the index's unit of matching.
- **Short word**: a query word under 3 characters, too short to hold a trigram.

## What is searched

A tab's search text is, in reading order:

- the tab's name;
- every element's texts that the agents' `find` view searches: label, note, table cells, entity fields, checklist
  items, chart nodes, code and comments ([Document views](../024-agents/document-views.md));
- its articles' text, its pages' titles and its form's title, questions and choices;
- on a Sheet tab, the inputs of its sheets' cells.

A document's items (titles and text fields) are one more search text of the document, under no tab.
Each search text is cut at 32,768 characters; what lies past it is not found.
Image pixels, file bytes, links' targets and stroke shapes are not searched.

## Who finds what

- A reader finds only documents they may open, by the same rule as the lists: their own, their joined teams', and
  those shared with them, never one in the Trash.
- A reader whose access to a document is through a tab-scoped link finds only that tab's text.
- Documents in **This Browser** are matched by name only: their content never reaches the api.
- A document a link no longer reaches, or a team the reader has left, drops out at once, as from the lists.

## Matching

- The query is folded as names are: lower case, accents stripped, split into words wherever a character is neither
  letter nor digit ([Explorer filters](explorer-filters.md#matching)).
- **Words of 3 characters or more** match by their trigrams: a tab matches when at least half of the query's trigrams
  appear in its search text, so a typo or two still finds the word.
- **Short words** must start a word of the search text.
- **A query of short words only** matches by those word starts alone.
- Every word of the query must be satisfied in one tab, as every word of a name must be.
- A document matches by its best tab; the search answers at most 50 documents.

## Ranking

- Content matches come best first: by how well the tab's text fits the query (`bm25`), then by how many of the
  query's trigrams it holds, then newest saved first.
- A query of short words only ranks its content matches newest saved first.
- How content matches sit beside name matches is the presentation's.

## What it answers

- Per matched document: the document, the tab it was found in and its name (none for the document's items), and a
  line of the tab's text around the match, at most about 160 characters, cut at word boundaries with an ellipsis,
  with the matched stretches given as ranges, never as markup.
- An answer for a query that is no longer current is the caller's to discard.

## Freshness

The index trails a write by up to about a minute, the outbox's pace; a document is always found by its name at once.
The index and its read ship ahead of the content move and hold nothing until the rooms feed them.

## Limits and abuse

- A query is at most 512 characters, as the lens is; only its first 32 distinct trigrams are matched.
- Each person may search at most 120 times a minute; past it the api answers 429, and name matching still works.
- The index stores no text the reader could not already read in the document.

## Telemetry

None in the api; what the presentation counts is its own ([Telemetry](../017-telemetry/telemetry.md)).

## Not part of it

- The wiki's in-wiki search and `livedoc search` ([Wiki](../032-wikis/wiki.md#search)) may read the same index later;
  their result shapes are theirs.
- Search inside one open document stays the editor's own Find.

## Defaults

Each default below was applied where this spec is silent or qualitative, and holds until a human confirms it.
The code cites each by its id.

- **D179** How the index stores text for the share test and the snippet: An external-content FTS5 table over
  `content_search`, which keeps the text as written and folded (default).
- **D180** Whether the half-of-trigrams rule applies per word or per query: Per long word, so every word must be found,
  as names require (default).
- **D181** How many FTS candidates the share filter sees: 500, ranked by `bm25`, before the filter (default).
- **D182** How the snippet is made: Cut in the Worker from the answered rows' text, whole words marked; never SQLite's
  `snippet()` (default).
- **D183** Where a document's items are indexed: One row per document under the tab key `~items`, never for a tab-scoped
  reader (default).
- **D184** Which rate limiter: A new `SEARCH_RATE_LIMITER`, 120 a minute per person (default).
