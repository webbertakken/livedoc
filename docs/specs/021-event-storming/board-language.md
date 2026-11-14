# Board language

The **board language** is the words an Event Storming board's notes share: its terms, where each is used, and one
way to change a term everywhere it is used.
It is deterministic and pure, as the [board reading](board-reading.md) is: no model finds a term or changes one.

## Terms

- **A term** is a word that at least `TERM_MIN_NOTES` (2) workshop notes hold.
- **Words** are runs of letters and digits in a note's words; a word under `TERM_MIN_LETTERS` (3) letters, or one of
  `LANGUAGE_STOP_WORDS` (English), is no term (default).
- **Compared ignoring case**, and a plain plural counts as its singular: "Orders" is the term "Order" (default).
- A term is shown in the casing it is most often written in; on a tie, the first in reading order.
- Each term knows the notes that hold it and the candidate contexts those notes belong to.
- Suggestions are not read: a term is counted from the notes on the board.

## How a term is matched

One rule serves a [reword](suggested-changes.md#a-reword-ripples)'s ripple and Rename Term alike.

- **Whole words, ignoring case.** "Order" matches "order placed" and "Order Closed", never "Reorder" or "Ordering".
- **A plain plural is matched and kept**: "Orders" becomes "Bookings" (default).
- **A term of several words** matches as a run: "Purchase Order".
- **The replacement takes the casing it replaces**: lower case, Capitalised or UPPER CASE; anything else takes the
  new term as typed.
- **Candidate context names are language too**: a name in scope that holds the term changes with the notes.
- A note whose words would come out the same is not changed.
- A term is up to `TERM_MAX` (60) characters and not blank.

## The Language tab

The **Language** tab of the [Review panel](board-review.md) lists the board's terms.

- **The list**: each term, how many notes hold it, and the contexts it is used in; most used first, then by name.
- **A term used in more than one context** is marked so ("2 contexts"): it may be one shared word, or one word
  meaning two things, which is what a context boundary is made of.
- **A filter** narrows the list to one candidate context, or to the notes in none.
- **Choosing a term** shows where it lives: its notes are ringed, the rest of the board dims, and the view fits them.
  Escape, or choosing it again, lets go.
- **Rename Term** opens the chosen term for typing. While a new term is typed the board previews it, exactly as a
  reword's ripple previews; **Rename** keeps it, Escape leaves the board as it was.
  - With a context filter chosen, it renames within that context; otherwise everywhere.
  - It is one undoable step through the ordinary choke point.
- **An empty board, or one with no shared word**, says "No shared terms yet. A term is a word two notes share."

## Share roles

| Role        | May                                                       |
| ----------- | --------------------------------------------------------- |
| Editor      | read the list, choose a term, Rename Term                 |
| Participant | read the list and choose a term; Rename Term is not shown |
| Viewer      | read the list and choose a term                           |

## Telemetry

`Canvas / Used / TermRenamed` (default).

## Where it lives

- Terms and matching: `packages/storm-reading/src/language.ts`.
- The tab: `apps/live/components/canvas/review/LanguageTab.tsx`.
