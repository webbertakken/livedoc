// The Inbox's model (docs/specs/013-workspace/inbox.md §1.1 to §1.3; docs/specs/013-workspace/inbox.md): the
// feed's rows laid out
// as one list, newest first, under date dividers, with the filter bar's choices and counts, and what each row says
// about itself (who, what, why, where). Worked out once per read, never per render.

import type {
  ActivityAction,
  ActivityCard,
  ActivityCardThread,
  ActivityFormResponses,
  ActivityThread,
} from '@livedoc/api-schema';
import { activityRowKey, type ActivityFeed, type Located } from '@/app/explorer/useActivityFeed';
import { cardDeepLinkHref, collabDeepLinkHref, formResponsesHref } from '@/lib/collab-deep-link';

/** What a row is, as the telemetry names it (`Activity·Selected`). */
export type InboxEntryKind = 'Action' | 'Card' | 'Thread' | 'CardThread' | 'FormResponses';

export type InboxEntry =
  | { key: string; kind: 'Action'; forMe: boolean; row: Located<ActivityAction>; at: number }
  | { key: string; kind: 'Card'; forMe: true; row: Located<ActivityCard>; at: number }
  | { key: string; kind: 'Thread'; forMe: false; row: Located<ActivityThread>; at: number }
  | { key: string; kind: 'CardThread'; forMe: false; row: Located<ActivityCardThread>; at: number }
  | { key: string; kind: 'FormResponses'; forMe: false; row: ActivityFormResponses; at: number };

type FeedRows = Pick<ActivityFeed, 'assignedToMe' | 'youAssigned' | 'threads' | 'formResponses'>;

/** Every row, newest first, keyed by `activityRowKey`. */
export function inboxEntries(feed: FeedRows): InboxEntry[] {
  const out: InboxEntry[] = [];
  for (const r of feed.assignedToMe) {
    if (r.kind === 'card') {
      const { kind: _kind, ...row } = r;
      out.push({ key: activityRowKey.card(row), kind: 'Card', forMe: true, row, at: r.updatedAt });
    } else {
      const { kind: _kind, ...row } = r;
      out.push({
        key: activityRowKey.action(row),
        kind: 'Action',
        forMe: true,
        row,
        at: r.updatedAt,
      });
    }
  }
  for (const row of feed.youAssigned) {
    out.push({
      key: activityRowKey.action(row),
      kind: 'Action',
      forMe: false,
      row,
      at: row.updatedAt,
    });
  }
  for (const r of feed.threads) {
    if (r.kind === 'card') {
      const { kind: _kind, ...row } = r;
      out.push({
        key: activityRowKey.cardThread(row),
        kind: 'CardThread',
        forMe: false,
        row,
        at: r.latest.at,
      });
    } else {
      const { kind: _kind, ...row } = r;
      out.push({
        key: activityRowKey.thread(row),
        kind: 'Thread',
        forMe: false,
        row,
        at: r.latest.at,
      });
    }
  }
  for (const row of feed.formResponses) {
    out.push({
      key: activityRowKey.form(row),
      kind: 'FormResponses',
      forMe: false,
      row,
      at: row.latestAt,
    });
  }
  return out.sort((a, b) => b.at - a.at);
}

// ---------- The filter bar ------------------------------------------------------------------------------------

/** `mine`: My Actions; `waiting`: Assigned by Me; `comments`: threads; `forms`: Form Responses. */
export const INBOX_FILTERS = ['all', 'mine', 'waiting', 'comments', 'forms'] as const;
export type InboxFilter = (typeof INBOX_FILTERS)[number];

export const INBOX_FILTER_LABEL: Record<InboxFilter, string> = {
  all: 'All',
  mine: 'My Actions',
  waiting: 'Assigned by Me',
  comments: 'Comments',
  forms: 'Form Responses',
};

/** The type a filter change reports (`Activity·Changed`). */
export const INBOX_FILTER_TELEMETRY: Record<InboxFilter, string> = {
  all: 'All',
  mine: 'MyActions',
  waiting: 'AssignedByMe',
  comments: 'Comments',
  forms: 'FormResponses',
};

export function isInboxFilter(v: unknown): v is InboxFilter {
  return typeof v === 'string' && (INBOX_FILTERS as readonly string[]).includes(v);
}

export function entryFilter(e: InboxEntry): Exclude<InboxFilter, 'all'> {
  switch (e.kind) {
    case 'Action':
    case 'Card':
      return e.forMe ? 'mine' : 'waiting';
    case 'Thread':
    case 'CardThread':
      return 'comments';
    case 'FormResponses':
      return 'forms';
  }
}

export function filterEntries(
  entries: readonly InboxEntry[],
  f: InboxFilter,
): readonly InboxEntry[] {
  return f === 'all' ? entries : entries.filter((e) => entryFilter(e) === f);
}

/** How many rows each filter holds, in one pass. */
export function inboxFilterCounts(entries: readonly InboxEntry[]): Record<InboxFilter, number> {
  const c: Record<InboxFilter, number> = {
    all: entries.length,
    mine: 0,
    waiting: 0,
    comments: 0,
    forms: 0,
  };
  for (const e of entries) c[entryFilter(e)] += 1;
  return c;
}

// ---------- The date dividers ---------------------------------------------------------------------------------

export type InboxBucket = 'today' | 'week' | 'older';

export const INBOX_BUCKET_LABEL: Record<InboxBucket, string> = {
  today: 'Today',
  week: 'Earlier This Week',
  older: 'Older',
};

/** Earlier This Week is the six days before today (§1.2). */
export const INBOX_WEEK_DAYS = 6;

/** Today starts at local midnight; the week six days before that. */
export function bucketEdges(now: number): { today: number; week: number } {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const today = d.getTime();
  d.setDate(d.getDate() - INBOX_WEEK_DAYS);
  return { today, week: d.getTime() };
}

export function bucketOf(at: number, edges: { today: number; week: number }): InboxBucket {
  if (at >= edges.today) return 'today';
  return at >= edges.week ? 'week' : 'older';
}

// ---------- What a row says -------------------------------------------------------------------------------------

/** Why a row is here, as its third line says it: the kind picks the icon. */
export type InboxReason = {
  kind: 'assigned' | 'waiting' | 'mention' | 'yours' | 'commented' | 'responses';
  label: string;
};

export type InboxFacts = {
  /** Who is behind it, or what stands in where no one person does. */
  who: string;
  /** A person's colour for the row's disc; null where no person stands behind the row. */
  person: { name: string; color?: string; self?: boolean } | null;
  /** The row asks something of the reader: semibold. */
  needsYou: boolean;
  title: string;
  reason: InboxReason | null;
  /** The pane's sentence before its age: "Priya mentioned you". */
  byline: string;
  /** The tab and element (or board) under the document. */
  where: string[];
  document: { name: string; via: 'own' | 'team' | 'shared'; teamId: string | null };
  local: boolean;
};

/** A person's first name, for a reason that must stay short ("Waiting on Bo"). */
export const firstName = (name: string | null | undefined): string | null =>
  name?.trim().split(/\s+/)[0] || null;

const responses = (n: number, capital: boolean) =>
  capital
    ? `${n} New ${n === 1 ? 'Response' : 'Responses'}`
    : `${n} new ${n === 1 ? 'response' : 'responses'}`;

type ThreadFacts = Pick<ActivityThread, 'mentionsYou' | 'onYourDocument' | 'youCommented'>;

// A mention is the most direct reason, so it wins; then the document being theirs, until they comment.
function threadReason(t: ThreadFacts): InboxReason | null {
  if (t.mentionsYou) return { kind: 'mention', label: 'Mentioned You' };
  if (t.onYourDocument && !t.youCommented) return { kind: 'yours', label: 'On Your Document' };
  return t.youCommented ? { kind: 'commented', label: 'You Commented' } : null;
}

function threadByline(who: string, reason: InboxReason | null): string {
  if (reason?.kind === 'mention') return `${who} mentioned you`;
  if (reason?.kind === 'yours') return `${who} commented on your document`;
  return `${who} wrote last`;
}

const cardWhere = (r: Pick<ActivityCard, 'board'>) =>
  r.board ? [r.board.tabName, r.board.title] : ['Not on a board'];

export function entryFacts(e: InboxEntry): InboxFacts {
  const local = 'local' in e.row && e.row.local === true;
  const document = { name: e.row.documentName, via: e.row.via, teamId: e.row.teamId };
  switch (e.kind) {
    case 'Action': {
      const r = e.row;
      if (e.forMe) {
        const self = r.createdByMe;
        const who = self ? 'You' : r.assigner.name?.trim() || 'A teammate';
        return {
          who,
          person: { name: who, self },
          needsYou: true,
          title: r.name || 'Action',
          reason: { kind: 'assigned', label: 'To Do' },
          byline: self ? 'You assigned this to yourself' : `${who} assigned this to you`,
          where: [r.tabName, r.elementLabel],
          document,
          local,
        };
      }
      const who = r.assignee.name?.trim() || 'A teammate';
      return {
        who,
        person: { name: who },
        needsYou: false,
        title: r.name || 'Action',
        reason: { kind: 'waiting', label: `Waiting on ${firstName(who) ?? 'a teammate'}` },
        byline: `Waiting on ${who}`,
        where: [r.tabName, r.elementLabel],
        document,
        local,
      };
    }
    case 'Card':
      return {
        who: 'Plan card',
        person: null,
        needsYou: true,
        title: `#${e.row.key} ${e.row.title}`,
        reason: { kind: 'assigned', label: 'To Do' },
        byline: 'Assigned to you',
        where: cardWhere(e.row),
        document,
        local,
      };
    case 'Thread':
    case 'CardThread': {
      const r = e.row;
      const who = r.latest.authorName.trim() || 'A teammate';
      const reason = threadReason(r);
      return {
        who,
        person: { name: who, color: r.latest.authorColor },
        needsYou: reason?.kind === 'mention' || reason?.kind === 'yours',
        title: e.kind === 'CardThread' ? `#${e.row.key} ${e.row.title}` : e.row.elementLabel,
        reason,
        byline: threadByline(who, reason),
        where: e.kind === 'CardThread' ? cardWhere(e.row) : [e.row.tabName],
        document,
        local,
      };
    }
    case 'FormResponses':
      return {
        who: 'Form Responses',
        person: null,
        needsYou: true,
        title: e.row.heading || 'Form',
        reason: { kind: 'responses', label: responses(e.row.unseen, true) },
        byline: responses(e.row.unseen, false),
        where: [],
        document,
        local: false,
      };
  }
}

/** Where Open goes: the editor at the element, the card, or the form's board (§1.8). */
export function entryHref(e: InboxEntry): string {
  switch (e.kind) {
    case 'Action':
      return collabDeepLinkHref(e.row, 'action');
    case 'Thread':
      return collabDeepLinkHref(e.row, 'comments');
    case 'Card':
    case 'CardThread':
      return cardDeepLinkHref(e.row);
    case 'FormResponses':
      return formResponsesHref(e.row);
  }
}
