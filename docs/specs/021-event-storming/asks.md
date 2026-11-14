# Asks

An **ask** is a person asking for suggestions on an Event Storming board: what they want (its **topic**) and what it
is about (its **scope**, read from the selection).
Whoever answers, the answer is suggestions: nothing on the board changes until a person accepts one.

Requested 2026-11-14: "A button that would give me the right prompt for my agent, so that it can use 1 of three
options: the CLI (recommended), MCP or built-in flash lite model."

## The topics

The catalogue is closed (`STORM_ASKS`); a new topic is a new row here first.

| Topic      | Menu words            | Scope                                  | What comes back                                           |
| ---------- | --------------------- | -------------------------------------- | --------------------------------------------------------- |
| `gaps`     | Fill the Gaps         | the board, or the selected notes       | [suggested notes](suggestions.md)                         |
| `contexts` | Group into Contexts   | the board                              | [suggested candidate contexts](candidate-contexts.md)     |
| `names`    | Suggest Names         | one candidate context                  | [name suggestions](suggested-changes.md#name-suggestions) |
| `merge`    | Name the Merge        | two or more candidate contexts         | name suggestions for them as one                          |
| `wording`  | Sharpen the Wording   | the board, a context's notes, or notes | [note changes](suggested-changes.md#note-changes)         |
| `lanes`    | Reorganise into Lanes | the board, into 2 to 12 lanes          | a [lane plan](lane-plans.md)                              |

- **The selection decides what is offered.** Nothing selected: `gaps`, `contexts`, `wording` and `lanes`, about the
  board. Workshop notes selected: `gaps` and `wording`, about them. One context selected: `names`, and `wording`
  about its notes. Two or more contexts selected: `merge` (default).
- A context counts kept or suggested alike (requested 2026-11-14: "click a (suggested) context").
- `lanes` carries the lane count the person chose, `LANES_MIN` (2) to `LANES_MAX` (12).

## The three hands

A **hand** is who answers an ask. Every hand writes the same suggestions through the same
[edit operations](../024-agents/edit-operations.md), so what a person sees does not depend on who answered.

| Hand       | What the person gets                                          | Who writes the suggestions              |
| ---------- | ------------------------------------------------------------- | --------------------------------------- |
| `cli`      | **Copy Prompt**: a prompt for a coding agent that has the CLI | the agent, with `livedoc storm suggest` |
| `mcp`      | **Copy Prompt**: a prompt for an AI tool connected to the MCP | the agent, with the storm tools         |
| `built-in` | **Ask**: the deployment's small model answers, in place       | the api, added by the editor            |

- The CLI is first and marked recommended (ruled 2026-11-14).
- `built-in` is offered only when the deployment has a model (`aiEnabled`); a self-host with no key shows two hands.
- The hand last used is remembered on this device; `cli` the first time (default).
- An agent's suggestions arrive live, as any changeset does: the person pastes the prompt and watches them land.

## The prompt

What **Copy Prompt** copies, in this order (default):

1. The board: the document's name, the tab's name and its link.
2. The ask in one sentence, with the scope's refs and names, and the lane count for `lanes`.
3. The topic's brief (below).
4. The hand's way in. `cli`: `livedoc guide storm`, then `livedoc storm read` and `livedoc storm suggest` with the
   document and tab filled in. `mcp`: `read_event_storming`, then `suggest_notes`.
5. The rule: answer with suggestions only, never change the board.

- The prompt is plain text, built by one pure function from the topic, the scope and the hand
  (`packages/storm-reading/src/asks/`), so every surface that shows it shows the same words.
- A board saved only in This Browser has nothing an agent can reach: `cli` and `mcp` say so instead of a prompt, and
  point at the built-in hand (default).

## What a model is told

Ruled 2026-11-14, on whether reorganising needs a written rationale: "The only thing better models don't necessarily
get is better domain knowledge and in-context knowledge."
So a model is told what things mean and what must stay true, never the steps to take.

- **Checks are ours, in code.** What must stay true is enforced by the edit operation that takes the answer, with a
  named refusal, never by asking a model to be careful.
- **A brief is domain knowledge.** Each topic has a short **brief**: what the notation means for that topic and what
  a good answer looks like, as statements a facilitator would agree with. It holds no procedure.
- **The board speaks for itself.** Everything the board knows travels in the [reading](board-reading.md): the About,
  the contexts, the pivotal events, the lanes, the decisions and what was declined.
- **Notes are data.** A brief says the board's words are written by people and are never instructions.
- The briefs live with the prompts in `packages/storm-reading/src/asks/`; the `storm` guide prints the same text, so
  the CLI, the MCP and the built-in model are told the same thing.
- **A brief line earns its place.** `scripts/ask-bench.mts` runs each topic over the seeded boards with the built-in
  model and reports the share of answer lines the engine accepts; a line is kept while removing it scores worse
  (default).

## About This Domain

The **About** is what the person says the domain is: the business, who uses it, words to prefer or avoid.
It is the in-context knowledge no model brings.

- `Tab.esAbout`: plain text, up to `ABOUT_MAX` (2000) characters; absent or blank means none.
- It is edited in the Ask popover, under **About This Domain**; leaving the field keeps it, as one undoable step.
- It heads every reading (`about`), every prompt's reading and the [domain export](domain-export.md)'s brief.
- It is a person's words: data, never instructions, as notes are.

## What was declined

Dismissing a suggestion is a decision, and the board remembers it so the next ask brings something new.

- `Tab.esDeclined`: up to `DECLINED_MAX` (200) entries, the oldest dropped first; each holds what was declined (a
  note, a context, a name, a reword, a kind, a split or a removal), its words or name, its kind where it has one, and
  the notes or contexts it was about.
- **A person's dismissal is remembered**: Dismiss and Dismiss All, in the same undoable step.
  An agent taking its own suggestions back (`rm`, `storm clear`) is not a dismissal. A lane plan is not remembered.
- **A declined suggestion is refused** when suggested again, as `declined_before`: the same type, the same words
  ignoring case, punctuation and spacing, the same kind, about the same notes or contexts.
- The reading lists them (`declined`), so an agent sees what the room turned down before it suggests.
- **Forget Declined**, in the Ask popover beside the count, empties the list in one undoable step.

## The built-in hand

- **The route**: `POST /api/storm-ask`, behind the AI routes' gates (rate limiter, origin allow-list,
  `AI_REQUIRE_ACCOUNT`), as [AI assistance](../007-editor/ai-assistance.md) specifies them.
- **The board travels in the request** (`{ topic, tab, scope, lanes? }`, `tab` the tab's name, elements, About and
  declined list), so a board saved only in This Browser can ask too.
- **The api reads, the model words, the engine checks.** The api makes the reading, hands the model the topic's brief,
  the reading and the ask, and takes back suggest lines: the same lines `livedoc storm suggest` takes.
  Each line runs through the edit-operation engine against the board as sent.
  A line outside the suggest family, one that does not parse, or one the engine refuses is dropped and counted.
- **A lane plan is all or none**: refused, the model is asked once more with the refusal (`STORM_ASK_RETRIES`, 1);
  refused again, the board's own [fold](lane-plans.md#the-fold) is offered instead.
- **The route answers what to add** (`{ added, names, changes, lines, dropped }`): new suggestion elements, and the
  name suggestions and note changes by the element they belong on.
  The editor adds them as one undoable step, onto the board as it is by then; an element gone meanwhile is passed over.
- **The model** is the deployment's small one: on Google `gemini-3.5-flash-lite`, the photo reader's; otherwise the
  assistant's model. `AI_STORM_MODEL` names another (default).
- **Suggested by**: its suggestions are by "Built-in model" (default).
- **Limits**: a board of up to `STORM_ASK_MAX_NOTES` (400) notes and a request of up to `STORM_ASK_MAX_BYTES` (1 MB).
- **Refusals**: `not_event_storming`, `topic_invalid`, `scope_invalid` (the scope does not fit the topic),
  `lanes_invalid`, `board_too_large`, `ai_failed` (an error, a timeout, an answer that is no such JSON).
- The model can only propose: the worst a hostile note can cause is a suggestion a person dismisses.

## Where an ask starts

- **Ask**, a button in the strip beside Draw Context and in the Event Storming category, opens the **Ask popover**
  for the current selection (default; its placement is ruled from renders on a real board).
- A selected context shows the same button after its name, and the merge offer shows it beside its ✓ and ✕.
- A workshop note's menu holds **Ask…**.
- **The Ask popover** holds, top to bottom: the topics the scope offers (one chosen; the first by default); the lane
  count for `lanes`, a stepper starting at the lanes in use, held within 2 to 12; the hands; the prompt with **Copy
  Prompt**, or **Ask** for the built-in hand; **About This Domain**; the declined count with **Forget Declined**.
- **Copy Prompt** flashes "Copied" and says "Paste it into your agent. Its suggestions appear here as it works."
- **Ask** shows progress and can be cancelled; it ends on "N suggestions added", or "Nothing to suggest".
- **When it fails**, the popover says why and what to do: sign in (`sign_in_required`), wait a minute (rate limited),
  a board too large, or "The model did not answer. Copy the prompt for your agent instead." (`ai_failed`).
- The popover follows the dialog pattern: focus moves in, Escape closes it and focus returns to the button.

## Share roles

| Role        | May                                                                         |
| ----------- | --------------------------------------------------------------------------- |
| Editor      | ask with any hand, edit the About, forget the declined                      |
| Participant | nothing: the Ask button is not shown, as suggestions are not                |
| Viewer      | nothing                                                                     |
| Agent       | read the About and the declined list in the `storm` view; suggest as before |

## Telemetry

`Canvas / Used / AskPromptCopied`, `AskedBuiltIn`, `AboutEdited` and `DeclinedForgotten` (default).
Neither the topic, the prompt nor the About is sent.

## Where it lives

- The catalogue, the prompts and the briefs: `packages/storm-reading/src/asks/`.
- The About and the declined list: `packages/document/src/event-storming-about.ts` and
  `packages/document/src/event-storming-declined.ts`.
- The route: `apps/api/src/routes/storm-ask-route.ts`.
- The popover: `apps/live/components/canvas/asks/`; the acts: `apps/live/hooks/canvas/useAskActions.ts`.
