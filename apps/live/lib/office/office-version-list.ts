// The version history panel's list (docs/specs/012-collaboration/review-surfaces.md "Version history"): Current version
// first, then the versions newest first, grouped by day (Today, Yesterday, then the date), each with its time or its
// name over its time, its editors, and for one from a restore "Restored from …". Generic over kinds; dates in the
// reader's own time zone, written in British English.

/** A version as the shell lists it; a kind's version carries at least this. */
export type OfficeVersion = {
  readonly id: string;
  readonly kind: 'automatic' | 'named';
  readonly name: string | null;
  readonly takenAt: number;
  readonly restoredFrom: string | null;
  readonly editors: readonly {
    readonly key: string | null;
    readonly name: string | null;
    readonly color: string | null;
  }[];
};

export type VersionRowEditor = { readonly name: string; readonly colour: string };

export type VersionRow = {
  readonly id: string;
  /** The name, or the time when it has none. */
  readonly title: string;
  /** The time, under a name; null when the title is the time. */
  readonly time: string | null;
  readonly named: boolean;
  readonly editors: readonly VersionRowEditor[];
  /** "Restored from …", for one taken after a restore. */
  readonly restoredFrom: string | null;
};

export type VersionGroup = { readonly label: string; readonly rows: readonly VersionRow[] };

/** An editor whose name went unrecorded (default copy). */
export const VERSION_SOMEONE = 'Someone';
/** A restore whose version has since been thinned away (default copy). */
export const VERSION_EARLIER = 'an earlier version';
/** The neutral grey of an editor with no colour (default). */
export const VERSION_NO_COLOUR = '#5f6368';
const LOCALE = 'en-GB';
const COLOUR = /^#[0-9a-f]{6}$/i;

const dayOf = (at: number) => {
  const d = new Date(at);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

/** The time of day, `05:30`. */
export const versionTime = (at: number): string =>
  new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit' }).format(at);

/** A day's label: Today, Yesterday, else its date, with its year when not this one. */
export function versionDay(at: number, now: number): string {
  const day = dayOf(at);
  const today = dayOf(now);
  if (day === today) return 'Today';
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (day === yesterday.getTime()) return 'Yesterday';
  const sameYear = new Date(at).getFullYear() === new Date(now).getFullYear();
  return new Intl.DateTimeFormat(LOCALE, {
    day: 'numeric',
    month: 'long',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(at);
}

/** A version named as one is named elsewhere: its name, else its date and time. */
export function versionLabel(version: OfficeVersion, now: number): string {
  return version.name ?? `${versionDay(version.takenAt, now)}, ${versionTime(version.takenAt)}`;
}

function editorsOf(version: OfficeVersion): VersionRowEditor[] {
  const seen = new Set<string>();
  const out: VersionRowEditor[] = [];
  for (const editor of version.editors) {
    const name = editor.name ?? VERSION_SOMEONE;
    const id = editor.key ?? `name:${name}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      name,
      colour: editor.color && COLOUR.test(editor.color) ? editor.color : VERSION_NO_COLOUR,
    });
  }
  return out;
}

/** The panel's groups, newest first; with `namedOnly`, the named versions alone. */
export function versionGroups(
  versions: readonly OfficeVersion[],
  now: number,
  namedOnly: boolean,
): VersionGroup[] {
  const byId = new Map(versions.map((v) => [v.id, v]));
  const groups: { label: string; rows: VersionRow[] }[] = [];
  const sorted = [...versions].sort((a, b) => b.takenAt - a.takenAt);
  for (const version of sorted) {
    if (namedOnly && version.kind !== 'named') continue;
    const label = versionDay(version.takenAt, now);
    const time = versionTime(version.takenAt);
    const from = version.restoredFrom ? byId.get(version.restoredFrom) : undefined;
    const row: VersionRow = {
      id: version.id,
      title: version.name ?? time,
      time: version.name ? time : null,
      named: version.kind === 'named',
      editors: editorsOf(version),
      restoredFrom: version.restoredFrom
        ? `Restored from ${from ? versionLabel(from, now) : VERSION_EARLIER}`
        : null,
    };
    const last = groups.at(-1);
    if (last?.label === label) last.rows.push(row);
    else groups.push({ label, rows: [row] });
  }
  return groups;
}
