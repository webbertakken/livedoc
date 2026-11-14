import { ES_NOTE_GAP, ES_NOTE_SIZE_PX } from '@livedoc/document';

// The board reading's numbers (docs/specs/021-event-storming/board-reading.md), one block because they are one model.

// How many lanes apart two notes can still relate; the same reach the lane snap offers (ES_CANDIDATE_REACH_LANES).
export const READING_REACH_LANES = 2;

// How many changes to what the board says a refusal names (docs/specs/021-event-storming/lane-plans.md "What must
// stay true"): enough for an agent to change its plan, few enough to read.
export const READING_CHANGES_SHOWN = 5;

// How far apart Arrange and Reorder stands two columns (docs/specs/021-event-storming/arrange.md "How the board
// arranges"): three gutters, as the storm graph lays a wall out, and wider a gutter at a time, up to a square note and
// a gutter, where the closer spacing would change what the board says (default).
export const ARRANGE_COLUMN_GAP = ES_NOTE_GAP * 3;
export const ARRANGE_COLUMN_GAP_STEP = ES_NOTE_GAP;
export const ARRANGE_COLUMN_GAP_MAX = ES_NOTE_SIZE_PX.square.width + ES_NOTE_GAP;

// The tense checks run only when at least this share of the worded events reads as English past tense, so a board
// written in another language finds none, never false ones (default).
export const TENSE_CHECK_MIN_SHARE = 0.5;

// Common English irregular past forms, as the last word of an event ("Order Paid", "Ticket Sold").
// prettier-ignore
export const PAST_TENSE_IRREGULARS: ReadonlySet<string> = new Set([
  'arose', 'ate', 'awoke', 'became', 'began', 'bent', 'bound', 'bought', 'broke', 'broken', 'brought', 'built',
  'burnt', 'came', 'caught', 'chose', 'chosen', 'clung', 'cut', 'dealt', 'did', 'done', 'drawn', 'drew', 'driven',
  'drove', 'dug', 'eaten', 'fell', 'fallen', 'felt', 'fled', 'flew', 'flown', 'forbade', 'forgot', 'forgotten',
  'forgave', 'forgiven', 'fought', 'found', 'froze', 'frozen', 'gave', 'given', 'gone', 'got', 'gotten', 'grew',
  'grown', 'had', 'held', 'hid', 'hidden', 'hit', 'hung', 'kept', 'knew', 'known', 'laid', 'led', 'left', 'lent',
  'let', 'lit', 'lost', 'made', 'meant', 'met', 'overdrawn', 'overridden', 'paid', 'put', 'quit', 'ran', 'read',
  'rang', 'rebuilt', 'redone', 'reset', 'resent', 'rewritten', 'rode', 'rose', 'run', 'said', 'sat', 'saw', 'seen',
  'sent', 'set', 'shed', 'shot', 'shown', 'shut', 'slid', 'sold', 'sought', 'spent', 'split', 'spoke', 'spoken',
  'spread', 'stood', 'stole', 'stolen', 'struck', 'stuck', 'swept', 'swore', 'sworn', 'swung', 'taken', 'taught',
  'thought', 'threw', 'thrown', 'told', 'took', 'torn', 'understood', 'undone', 'upheld', 'upset', 'withdrawn',
  'withdrew', 'withheld', 'woke', 'won', 'wore', 'worn', 'wound', 'wrote', 'written',
]);

// The board language (docs/specs/021-event-storming/board-language.md "Terms"): a term is a word at least this many
// notes share (safe range: 2 to 5), of at least this many letters (safe range: 2 to 4) (default).
export const TERM_MIN_NOTES = 2;
export const TERM_MIN_LETTERS = 3;

// English words that carry no domain meaning, so they are never terms (default).
// prettier-ignore
export const LANGUAGE_STOP_WORDS: ReadonlySet<string> = new Set([
  'all', 'and', 'any', 'are', 'but', 'can', 'did', 'does', 'each', 'for', 'from', 'had', 'has', 'have', 'her', 'his',
  'into', 'its', 'may', 'not', 'off', 'one', 'our', 'out', 'per', 'than', 'that', 'the', 'their', 'them', 'then',
  'there', 'these', 'they', 'this', 'too', 'under', 'upon', 'via', 'was', 'were', 'when', 'whenever', 'which', 'who',
  'will', 'with', 'you', 'your',
]);
