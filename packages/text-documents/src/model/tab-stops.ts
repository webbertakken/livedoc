// Tab stops (docs/specs/034-text-documents/text-and-paragraphs.md "Tab stops", standard-mapping.md "The model"):
// positions on a paragraph's line, counted from the text area's start as Word and Google count them, each with an
// alignment and a leader; and where a tab goes among them.

export type TabAlign = 'start' | 'center' | 'end' | 'decimal';
export type TabLeader = 'dot' | 'hyphen' | 'underscore' | 'middle-dot';

/** One stop; lengths in points. `char` is a decimal stop's character, `.` when absent. */
export type TabStop = {
  readonly position: number;
  readonly align: TabAlign;
  readonly leader?: TabLeader;
  readonly char?: string;
};

/** Stops in one paragraph, Word's most. */
export const TAB_STOPS_MAX = 64;
/** A stop's farthest position either way: 22 in, Word's range. */
export const TAB_STOP_MAX_PT = 1584;
/** The default stops' interval where a file names none: 0.5 in, as Google's and Word's. */
export const DEFAULT_TAB_INTERVAL_PT = 36;

/** What a format's tab list says over the stops its paragraph inherits: positions cleared and stops set. */
export type TabEntries = {
  readonly clears: readonly number[];
  readonly sets: readonly TabStop[];
};

// Stops are matched by position in twentieths of a point, the finer of the two formats' units.
const key = (position: number) => Math.round(position * 20);
const round3 = (n: number) => Math.round(n * 1000) / 1000;
// A stop exactly where a tab starts is passed: a tab always moves past it.
const PAST = 0.01;

const same = (a: TabStop, b: TabStop) =>
  key(a.position) === key(b.position) &&
  a.align === b.align &&
  a.leader === b.leader &&
  (a.align !== 'decimal' || (a.char ?? '.') === (b.char ?? '.'));

export const TabStops = {
  /** Sorted by position, one per position, in range, at most `TAB_STOPS_MAX`; and how many were dropped. */
  normalise: (stops: readonly TabStop[]): { stops: TabStop[]; dropped: number } => {
    const seen = new Set<number>();
    const out: TabStop[] = [];
    for (const stop of [...stops].sort((a, b) => a.position - b.position)) {
      if (!Number.isFinite(stop.position) || Math.abs(stop.position) > TAB_STOP_MAX_PT) continue;
      if (seen.has(key(stop.position))) continue;
      seen.add(key(stop.position));
      out.push({ ...stop, position: round3(stop.position) });
    }
    const kept = out.slice(0, TAB_STOPS_MAX);
    return { stops: kept, dropped: stops.length - kept.length };
  },
  equal: (a: readonly TabStop[] | undefined, b: readonly TabStop[] | undefined): boolean =>
    a === b ||
    (a !== undefined &&
      b !== undefined &&
      a.length === b.length &&
      a.every((stop, i) => same(stop, b[i]!))),
  /** Every stop moved by `by` points. */
  shift: (stops: readonly TabStop[], by: number): TabStop[] =>
    stops.map((stop) => ({ ...stop, position: round3(stop.position + by) })),
  /** Word's reading: the inherited stops without those cleared, with those set over them. */
  merge: (inherited: readonly TabStop[], entries: TabEntries): TabStop[] => {
    const cleared = new Set(entries.clears.map(key));
    const set = new Set(entries.sets.map((s) => key(s.position)));
    return TabStops.normalise([
      ...inherited.filter((s) => !cleared.has(key(s.position)) && !set.has(key(s.position))),
      ...entries.sets,
    ]).stops;
  },
  /** What a list says over the stops it inherits, so `merge(inherited, difference(inherited, own))` is `own`. */
  difference: (inherited: readonly TabStop[], own: readonly TabStop[]): TabEntries => {
    const owned = new Set(own.map((s) => key(s.position)));
    return {
      clears: inherited.filter((s) => !owned.has(key(s.position))).map((s) => s.position),
      sets: own.filter((s) => !inherited.some((i) => same(i, s))),
    };
  },
  /**
   * The stop a tab starting at `x` goes to: the first stop past it; on a hanging indent's first line, the indent
   * when it comes first; past the last stop, the next default stop, every `interval` from the text area's start.
   */
  next: (
    stops: readonly TabStop[],
    x: number,
    { interval, hanging }: { interval?: number; hanging?: number } = {},
  ): TabStop => {
    const past = stops.find((s) => s.position > x + PAST);
    if (hanging !== undefined && hanging > x + PAST && (!past || hanging < past.position))
      return { position: hanging, align: 'start' };
    if (past) return past;
    const step = interval !== undefined && interval > 0 ? interval : DEFAULT_TAB_INTERVAL_PT;
    return { position: round3((Math.floor((x + PAST) / step) + 1) * step), align: 'start' };
  },
  /**
   * The space a tab takes, in points: to the stop for a start stop; for the others, less the text after it (its
   * whole for an end stop, half for a centre stop, up to the decimal character for a decimal stop); never below 0.
   */
  width: (stop: TabStop, x: number, after: number): number => {
    const room = stop.position - x;
    const taken = stop.align === 'start' ? 0 : stop.align === 'center' ? after / 2 : after;
    return Math.max(0, room - taken);
  },
} as const;
