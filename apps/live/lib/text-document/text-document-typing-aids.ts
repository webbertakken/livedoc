// A person's typing aids (docs/specs/034-text-documents/text-and-paragraphs.md "Typing aids", tools.md "Preferences"):
// which aids are on, and their substitutions. Kept in their preferences with only what differs from Google's, so the
// whole set stays small beside the rest of the preferences (PREFERENCES_BODY_MAX).
import { debugLog } from '@/lib/debug-log';
import { readUserPreferences, writeUserPreferences } from '@/lib/user-preferences';

export type Substitution = {
  readonly replace: string;
  readonly with: string;
  readonly on: boolean;
};

export type TypingAids = {
  readonly capitalise: boolean;
  readonly smartQuotes: boolean;
  readonly links: boolean;
  readonly lists: boolean;
  readonly markdown: boolean;
  /** Automatic substitution: the list below on at all. */
  readonly substitution: boolean;
  readonly pairs: readonly Substitution[];
};

export const TYPING_AID_SWITCHES = [
  'capitalise',
  'smartQuotes',
  'links',
  'lists',
  'markdown',
] as const;
export type TypingAidSwitch = (typeof TYPING_AID_SWITCHES)[number];

/** Google's substitutions in Google's order (text-and-paragraphs.md "Typing aids", from Webber's captures). */
export const DEFAULT_SUBSTITUTIONS: readonly (readonly [string, string])[] = [
  ['(c)', '©'],
  ['(r)', '®'],
  ['tm', '™'],
  ['c/o', '℅'],
  ['...', '…'],
  ['1/2', '½'],
  ['1/3', '⅓'],
  ['1/4', '¼'],
  ['1/5', '⅕'],
  ['1/6', '⅙'],
  ['1/8', '⅛'],
  ['2/3', '⅔'],
  ['3/4', '¾'],
  ['2/5', '⅖'],
  ['3/5', '⅗'],
  ['4/5', '⅘'],
  ['5/6', '⅚'],
  ['3/8', '⅜'],
  ['5/8', '⅝'],
  ['7/8', '⅞'],
  ['<--', '←'],
  ['<==', '⇐'],
  ['<=>', '⇔'],
  ['==>', '⇒'],
  ['-->', '→'],
  ['--', '–'],
  ['---', '—'],
];

/**
 * A person's own pairs at most, and how long each side may be (default): about 3,000 characters kept at most, room the
 * preferences' PREFERENCES_BODY_MAX leaves beside a full account and its default styles.
 */
export const SUBSTITUTIONS_OWN_MAX = 20;
export const REPLACE_MAX = 20;
export const WITH_MAX = 100;

/** What is kept: the switches that differ, the defaults turned off or removed, and the person's own pairs. */
type StoredAids = {
  off?: TypingAidSwitch[];
  on?: TypingAidSwitch[];
  substitution?: false;
  defaultsOff?: string[];
  defaultsRemoved?: string[];
  own?: [string, string, boolean][];
};

const DEFAULT_ON: Record<TypingAidSwitch, boolean> = {
  capitalise: true,
  smartQuotes: true,
  links: true,
  lists: true,
  markdown: false,
};

const DEFAULT_PAIRS = new Map(DEFAULT_SUBSTITUTIONS);

const isString = (v: unknown): v is string => typeof v === 'string';
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter(isString) : []);
const isSwitch = (v: string): v is TypingAidSwitch =>
  (TYPING_AID_SWITCHES as readonly string[]).includes(v);

/** Whether a pair may be kept: both sides filled and within their lengths. */
export const isKeepable = (replace: string, withText: string): boolean =>
  replace.trim() !== '' &&
  withText !== '' &&
  replace.length <= REPLACE_MAX &&
  withText.length <= WITH_MAX &&
  !/\s/.test(replace);

export const TypingAids = {
  /** Google's: every aid on but Markdown, every substitution on. */
  defaults: (): TypingAids => ({
    ...DEFAULT_ON,
    substitution: true,
    pairs: DEFAULT_SUBSTITUTIONS.map(([replace, w]) => ({ replace, with: w, on: true })),
  }),

  /** The aids kept in the preferences, read back checked; anything unreadable is Google's. */
  parse: (raw: unknown): TypingAids => {
    const base = TypingAids.defaults();
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return base;
    const stored = raw as Record<string, unknown>;
    const off = new Set(strings(stored.off).filter(isSwitch));
    const on = new Set(strings(stored.on).filter(isSwitch));
    const defaultsOff = new Set(strings(stored.defaultsOff));
    const removed = new Set(strings(stored.defaultsRemoved));
    const own = (Array.isArray(stored.own) ? stored.own : [])
      .filter(
        (p): p is [string, string, boolean] =>
          Array.isArray(p) &&
          isString(p[0]) &&
          isString(p[1]) &&
          typeof p[2] === 'boolean' &&
          isKeepable(p[0], p[1]),
      )
      .slice(0, SUBSTITUTIONS_OWN_MAX)
      .map(([replace, w, isOn]) => ({ replace, with: w, on: isOn }));
    const switches = Object.fromEntries(
      TYPING_AID_SWITCHES.map((s) => [s, on.has(s) ? true : off.has(s) ? false : DEFAULT_ON[s]]),
    ) as Record<TypingAidSwitch, boolean>;
    return {
      ...switches,
      substitution: stored.substitution !== false,
      pairs: [
        ...own,
        ...base.pairs
          .filter((p) => !removed.has(p.replace))
          .map((p) => ({ ...p, on: !defaultsOff.has(p.replace) })),
      ],
    };
  },

  /** What the preferences keep of these aids: only what differs from Google's. */
  stored: (aids: TypingAids): StoredAids => {
    const out: StoredAids = {};
    const off = TYPING_AID_SWITCHES.filter((s) => DEFAULT_ON[s] && !aids[s]);
    const on = TYPING_AID_SWITCHES.filter((s) => !DEFAULT_ON[s] && aids[s]);
    if (off.length > 0) out.off = off;
    if (on.length > 0) out.on = on;
    if (!aids.substitution) out.substitution = false;
    const present = new Set<string>();
    const own: [string, string, boolean][] = [];
    const defaultsOff: string[] = [];
    for (const pair of aids.pairs) {
      if (DEFAULT_PAIRS.get(pair.replace) === pair.with) {
        present.add(pair.replace);
        if (!pair.on) defaultsOff.push(pair.replace);
      } else own.push([pair.replace, pair.with, pair.on]);
    }
    const removed = DEFAULT_SUBSTITUTIONS.map(([r]) => r).filter((r) => !present.has(r));
    if (defaultsOff.length > 0) out.defaultsOff = defaultsOff;
    if (removed.length > 0) out.defaultsRemoved = removed;
    if (own.length > 0) out.own = own;
    return out;
  },

  /** How many of the pairs are the person's own (not Google's as it is). */
  ownCount: (aids: TypingAids): number =>
    aids.pairs.filter((p) => DEFAULT_PAIRS.get(p.replace) !== p.with).length,

  /** The pairs that act now: none while Automatic substitution is off. */
  active: (aids: TypingAids): readonly Substitution[] =>
    aids.substitution ? aids.pairs.filter((p) => p.on) : [],
} as const;

/** The person's typing aids, from their preferences. */
export const readTypingAids = (): TypingAids =>
  TypingAids.parse(readUserPreferences().textDocumentTypingAids);

/** Keeps the person's typing aids, on the freshest preferences, synced for `ownerId`. */
export function saveTypingAids(aids: TypingAids, ownerId: string | null): void {
  const { textDocumentTypingAids: _old, ...prefs } = readUserPreferences();
  const stored = TypingAids.stored(aids);
  writeUserPreferences(
    Object.keys(stored).length > 0 ? { ...prefs, textDocumentTypingAids: stored } : prefs,
    ownerId,
  );
  debugLog('[text-document] preferences saved', { kept: Object.keys(stored) });
}
