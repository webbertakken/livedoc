// The board reading's numbers (docs/specs/021-event-storming/board-reading.md), one block because they are one model.

// How many lanes apart two notes can still relate; the same reach the lane snap offers (ES_CANDIDATE_REACH_LANES).
export const READING_REACH_LANES = 2;

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
