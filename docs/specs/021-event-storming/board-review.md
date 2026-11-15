# Board review

The **Review panel** is where a person looks a board over before building from it: what the
[reading](board-reading.md) found, the words the board uses, and the story told aloud.
All of it is deterministic: no model is asked, so a deployment without one has the whole panel.

## The panel

- **Review**, a pill in [the corner](suggestions.md#how-a-person-sees-them) beside Ask, opens and closes the panel;
  it says whether the panel is open. For whoever the suggestions corner is not drawn for (a Participant, a Viewer,
  anyone on a locked tab) the pill holds a corner of its own, in the same place; zen mode puts that one away
  (default).
- **The other ways in**: a **Review** row in the Event Storming category, which opens and closes it, and
  **Review Board** in the command palette, which opens it. Both are everyone's: the panel changes nothing by being
  opened.
- **It stands as a card under the corner**, where the suggestions list opens, 360 px wide (ruled 2026-11-15: the
  corner card, of four directions rendered; `ReviewHost` alone says where it stands).
- **One thing open in the corner**: opening the panel closes the Ask popover and folds the suggestions list to its
  button, and opening either of those closes the panel (default).
- **The keyboard**: opening moves it to the tab in hand; Escape closes the panel and gives it back to the pill. A tab
  with something of its own to let go of (a chosen term, a rename under way) takes Escape first (default).
- Three tabs, following the WAI-ARIA tabs pattern: **Check**, **Language** and **Story**. The tab last open is
  remembered on this device; Check the first time (default).
- It reads the board as it is and follows every change, a peer's included.

## Readiness

The **readiness** line heads the Check tab and the [domain export](domain-export.md) dialog.

- It counts what a person would settle before exporting: events, gaps, open hotspots, and events outside every
  candidate context when the board keeps any ("42 events · 3 gaps · 2 open hotspots · 5 events outside a context").
- A board with none of the last three reads "Ready to export"; a board with no event reads "No events yet".
- It never blocks an export: it informs.

## Check

The gaps the reading finds, for a person: until this panel nothing in the editor showed them.

- **Grouped by level**, in the reading's order: flow ("The story has a hole"), notation ("The grammar slipped"),
  question ("Left open").
- **A row** says the gap in words and names its notes. Pointing at it or focusing it brings those notes into view
  and rings them.
- **Add**, on a gap with a remedy, lands a blank note of the remedy's kind where the remedy says (the side of the
  note it names), exactly as a [next-note button](event-storming.md#phase-7-shipped-re-ruled-next-note-buttons)
  lands one, and opens it for typing. One undoable step.
- **Answer**, on an open hotspot's row, opens its [answer](board-structure.md#hotspot-answers) and brings the
  hotspot into view.
- **A row says the gap in the reading's own words** (its message without the note it leads with), so a person and
  an agent read one wording (default).
- **No gap**: "Nothing to check. The story holds."
- A gap is a prompt, never a verdict: nothing is drawn on a note because of one.

## Language

The board's terms: [Board language](board-language.md#the-language-tab).

## Story

The timeline told as sentences, one step per event, so a person can walk it and hear where it stumbles.

- **A step** is one event with what leads to it and what follows: who issues which command ("Customer: Place Order"),
  the event, then each policy and the command it issues ("Whenever Order Placed: Notify kitchen, then Prepare Meal").
  The words are the notes' own; only the joining words are ours.
- **Walking.** The step in hand is highlighted; Next and Previous, or the arrow keys (and Home and End) while the
  list has focus, move through the timeline. The board brings the step's notes into view and rings them. No step is
  in hand until one is taken, and a step stays in hand while the board changes round it (default).
- An answered hotspot is told with its answer.
- A pivotal event's step is followed by a rule naming the phase it closes.
- The loose notes follow the last step, by kind.
- **An empty timeline**: "No events yet. The story starts with one."
- Under reduced motion the view jumps rather than glides.

## Share roles

| Role        | May                                                         |
| ----------- | ----------------------------------------------------------- |
| Editor      | open the panel, walk the story, Add and Answer, Rename Term |
| Participant | open the panel and read all three tabs; no Add, no Rename   |
| Viewer      | open the panel and read all three tabs                      |

## Telemetry

`Canvas / Used / ReviewOpened` (once per opening, however it was opened), `GapNoteAdded` and `StoryWalked` (once
per opening of the Story tab) (default).

## What is drawn on the board

- **A ring** round each note a row, a term or the story's step names: 2 px at screen size, 6 px off the note, the
  brand's 600 on a light canvas and its 300 on a dark one, 3:1 or more against either (default).
- **A chosen term dims the rest of the board**; the ringed notes stay as they are (default).
- Rings and the dim are the person's own view: nobody else sees them, and nothing is written.

## Where it lives

- The readiness and the story's sentences: `packages/storm-reading/src/readiness.ts` and `packages/storm-reading/src/story.ts`.
- Where the panel stands, and its pill: `apps/live/components/canvas/review/ReviewHost.tsx` and `ReviewButton.tsx`;
  the corner's surface `apps/live/components/canvas/corner.ts`; one thing open in it `apps/live/lib/corner-view.ts`.
- The tabs: `ReviewPanel.tsx`, `ReviewCheck.tsx`, `ReviewLanguage.tsx`, `ReviewStory.tsx` and `review-parts.tsx`
  in `apps/live/components/canvas/review/`; a Check row's words `apps/live/lib/review-rows.ts`.
- The person's view (open, tab, rings, dim): `apps/live/lib/review-view.ts`; the rings
  `apps/live/components/canvas/review/ReviewRings.tsx`, the dim `apps/live/app/canvas-motion.css`.
- The working parts and the writes: `apps/live/hooks/canvas/useReviewPanel.ts` and `useReviewActions.ts`.
- The command and the category row: `apps/live/lib/editor-commands.ts` (`review-board`) and
  `apps/live/components/palette/EventStormingBoardRows.tsx`.
- The seeded kitchen and the browser's proof: `apps/live/lib/review-board.fixture.ts`,
  `apps/live/e2e/review-board.ts` and `apps/live/e2e/event-storming-review.spec.ts`.
- Taught in the help centre by `apps/help/app/canvas/event-storming-boards/reviewing-a-board/page.mdx`.
