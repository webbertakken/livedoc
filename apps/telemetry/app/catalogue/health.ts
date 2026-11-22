// Error health and the help centre (docs/specs/017-telemetry/telemetry.md).
// Part of the metric catalogue: import from ../metric-catalogue.

import {
  isApiClientException,
  isDroppedConnection,
  isRecovery,
  isRefusal,
  isServerCrash,
  isServerFault,
  kindOf,
} from '../error-kinds';
import type { Metric, MetricStack } from '../metric-series';
import { chart } from './helpers';

// Error health (Exceptions tab). Every request a caller saw fail (`Error·Api`) lands in exactly one card
// (apiFailureCard in error-kinds.ts). One side of each failure only: a server crash is reported twice, the api
// worker's Internal.<Method>.<Route> and the Http500 its caller saw, so Server Faults and Server Crashes are read
// side by side, never added.
export const SERVER_FAULTS: Metric = {
  rising: 'bad',
  category: 'Error',
  action: 'Api',
  typeIn: isServerFault,
  title: 'Server Faults',
  blurb:
    'Requests the LiveDoc server failed: a 5xx answer seen by the editor, the CLI or an MCP tool, and email sends that failed. Zero is the goal. A server crash appears here as the Http500 its caller saw.',
};

export const REFUSALS: Metric = {
  rising: 'neutral',
  category: 'Error',
  action: 'Api',
  typeIn: isRefusal,
  title: 'Refusals',
  blurb:
    'Requests the server said no to, correctly: a session that ran out, access that was removed, a document in the Trash. Also the editor holding back a request it knew would be refused. These grow with use, so watch for a sudden jump rather than the level.',
};

export const DROPPED_CONNECTIONS: Metric = {
  rising: 'bad',
  category: 'Error',
  action: 'Api',
  typeIn: isDroppedConnection,
  title: 'Dropped Connections',
  blurb:
    'Requests that never got an answer: the connection dropped, or the CLI or an MCP tool gave up waiting. Mostly the network between the person and us, rarely a fault of ours.',
};

export const SERVER_CRASHES: Metric = {
  rising: 'bad',
  category: 'Error',
  action: 'Api',
  typeIn: isServerCrash,
  title: 'Server Crashes',
  blurb:
    'Crashes the LiveDoc server reported about itself, by endpoint. Most also appear as an Http500 in Server Faults, so read the two side by side rather than adding them.',
};

// Error·Client minus the recoveries, plus the editor's own throws on a save or load path, which the server never
// answered (SaveFailed, LoadFailed): Error·Api rows, but no request the server failed, refused or dropped.
export const CLIENT_EXCEPTIONS: Metric = {
  rising: 'bad',
  category: 'Error',
  action: 'Client',
  actionIn: ['Api'],
  typeIn: (type, action) => (action === 'Api' ? isApiClientException(type) : !isRecovery(type)),
  title: 'Client Exceptions',
  blurb:
    'Uncaught exceptions, unhandled promise rejections, and editor areas that failed to render, in the editor and help centre, and saves or loads the editor itself broke before the server could answer.',
};

export const REALTIME_RESYNCS: Metric = {
  rising: 'bad',
  category: 'Error',
  action: 'Client',
  typeIn: (type) => kindOf(type) === 'RealtimeResync',
  title: 'Realtime Resyncs',
  blurb:
    'Not an exception: the editor noticed it had missed live updates and refetched the document to catch up. A rising line means the realtime room is dropping updates.',
};

export const STALE_CHUNK_RELOADS: Metric = {
  rising: 'neutral',
  category: 'Error',
  action: 'Client',
  typeIn: (type) => kindOf(type) === 'StaleChunkReload',
  title: 'Stale Build Reloads',
  blurb:
    'Not an exception: a tab still running an earlier build asked for code the last deploy removed, and loaded the page in full instead of crashing. Expect a small rise after each deploy.',
};

export const WARNINGS: Metric = {
  rising: 'bad',
  category: 'Error',
  action: 'Warning',
  // Every kind of warning: each names its fallback (AiQuota.BrowserReader, …).
  typeIn: () => true,
  title: 'Warnings',
  blurb:
    'Not a failure: a degradation the author was carried through, such as a spent AI budget reading the photo on the device instead. A rising line means a fallback is doing more of the work.',
};

// Headed by the faults someone actually hit, each once: server faults plus client exceptions. Server crashes would
// count those faults a second time, refusals are the api answering correctly, dropped connections never reached us,
// and resyncs are recoveries, so none of them joins the headline.
export const EXCEPTIONS: MetricStack = {
  rising: 'bad',
  stack: true,
  title: 'Exceptions',
  blurb:
    'Faults people hit, from the server and in the editor, beside the server crashes behind them, the refusals and dropped connections that were not faults, the realtime resyncs and stale build reloads that recovered, and the warnings the author was carried through. Zero is the goal.',
  members: [
    SERVER_FAULTS,
    SERVER_CRASHES,
    REFUSALS,
    DROPPED_CONNECTIONS,
    CLIENT_EXCEPTIONS,
    REALTIME_RESYNCS,
    STALE_CHUNK_RELOADS,
    WARNINGS,
  ],
  headline: [SERVER_FAULTS, CLIENT_EXCEPTIONS],
  seeAlso: { section: 'exceptions', label: 'See Each Error in Health' },
};

// Load recovery (docs/specs/007-editor/load-recovery.md): what people did on the load-error screen
// and the help centre's Repair page. The load's own timeouts and fallbacks are Warnings above.
const isDiagnostics = (t: string | null) => t === 'Diagnostics' || t === 'Diagnostics.Help';

export const DIAGNOSTICS_COPIED = chart(
  'UI',
  'Copied',
  'Diagnostics Copied',
  'A diagnostics report copied for support, from a failed load or the Repair page.',
  { typeIn: isDiagnostics, rising: 'bad' },
);

export const BROWSER_REPAIRS = chart(
  'UI',
  'Cleared',
  'Browser Repairs',
  "A browser's LiveDoc settings and caches cleared to get a document loading again.",
  { rising: 'bad' },
);

export const LOAD_RECOVERY: MetricStack = {
  rising: 'bad',
  stack: true,
  title: 'Load Recovery',
  blurb:
    'Diagnostics copied and browsers repaired when a document would not load. A rising line means people are getting stuck opening documents.',
  members: [DIAGNOSTICS_COPIED, BROWSER_REPAIRS],
  headline: BROWSER_REPAIRS,
};

// Help centre (Help tab has the rankings).
export const ARTICLE_VIEWS = chart(
  'Help',
  'View',
  'Article Views',
  'Help-centre articles opened, across every article.',
);

export const MARKED_HELPFUL = chart(
  'Help',
  'Helpful',
  'Marked Helpful',
  'Readers who tapped "yes, this helped" on an article.',
);

export const MARKED_NOT_HELPFUL = chart(
  'Help',
  'Unhelpful',
  'Marked Not Helpful',
  'Readers who tapped "not really": the articles worth rewriting.',
  { rising: 'bad' },
);

export const HELP_SEARCHES = chart(
  'Help',
  'Searched',
  'Help Searches',
  'Searches in the help centre that found something.',
  { types: ['Results'] },
);

export const DRY_HELP_SEARCHES = chart(
  'Help',
  'Searched',
  'Dry Help Searches',
  'Help searches that found nothing: the articles that do not exist yet.',
  { types: ['NoResults'], rising: 'bad' },
);

export const HELP_CENTRE: MetricStack = {
  stack: true,
  title: 'Help Centre',
  blurb: 'Articles read, votes cast on them, and what people searched for.',
  members: [ARTICLE_VIEWS, MARKED_HELPFUL, MARKED_NOT_HELPFUL, HELP_SEARCHES, DRY_HELP_SEARCHES],
  headline: ARTICLE_VIEWS,
  seeAlso: { section: 'help', label: 'See Each Article in Pages & Help' },
};

// Report a Bug (docs/specs/016-platform/bug-reports.md "Telemetry"): forms opened beside reports sent.
export const BUG_FORMS_OPENED = chart(
  'Feedback',
  'Opened',
  'Bug Forms Opened',
  'Times someone opened the Report a Bug form.',
  { types: ['Bug'], rising: 'neutral' },
);

export const BUG_REPORTS_SENT = chart(
  'Feedback',
  'Completed',
  'Bug Reports Sent',
  'Bug reports sent: filed on the private board, or kept to be filed shortly. A rise is something to look into.',
  { types: ['Bug'], rising: 'bad' },
);

export const BUG_REPORTS: MetricStack = {
  stack: true,
  title: 'Bug Reports',
  blurb: 'The Report a Bug form opened, and the reports sent from it.',
  members: [BUG_FORMS_OPENED, BUG_REPORTS_SENT],
  headline: BUG_REPORTS_SENT,
};
