// Reading a Workers Issues delivery (docs/specs/016-platform/worker-issues.md "The receiver" steps 7-8, "Reading the
// payload"). Cloudflare documents the Notifications envelope but not what `data` holds for an issue, and Issues is in
// beta, so every name is looked for where the Issues API models put it, matched case and separator apart, and
// whatever is not named is carried as bounded text. Nothing here refuses a delivery because its shape moved.
import {
  WORKER_ISSUE_LIMITS,
  type WorkerIssue,
  type WorkerIssueTrigger,
} from '@livedoc/api-schema';

export type WorkerIssuePayload =
  | { kind: 'test' }
  | { kind: 'unknown_shape' }
  | {
      kind: 'delivery';
      issue: WorkerIssue;
      runId: string | null;
      payload: Record<string, unknown>;
    };

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const norm = (key: string) => key.toLowerCase().replace(/[_-]/g, '');

// A field by name, case and separator apart: `firstObserved` finds `first_observed`.
function field(o: unknown, name: string): unknown {
  if (!isObj(o)) return undefined;
  const want = norm(name);
  const key = Object.keys(o).find((k) => norm(k) === want);
  return key === undefined ? undefined : o[key];
}

// A field down a path, each step by name, or the first element of a list where a step names one.
function at(o: unknown, ...names: string[]): unknown {
  let here: unknown = o;
  for (const name of names) {
    here = field(here, name);
    if (Array.isArray(here)) here = here[0];
  }
  return here;
}

const text = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim() : undefined;
const firstText = (...vs: unknown[]) => vs.map(text).find((v) => v !== undefined);
const firstObj = (...vs: unknown[]) => vs.find(isObj);

// Addresses that never reach a card or an email (the spec's "never keeps"): emails, then IPv4, then IPv6 (three
// colons or more, or a `::`), so a time (`22:11:05`) or a stack position (`route.ts:12:3`) is left alone.
const ADDRESSES: readonly [RegExp, string][] = [
  [/[^\s@]+@[^\s@]+\.[^\s@]+/g, '[email]'],
  [/(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?![\d.])/g, '[address]'],
  [/(?<![0-9a-f:])(?:[0-9a-f]{1,4}:){3,7}[0-9a-f]{1,4}(?![0-9a-f:])/gi, '[address]'],
  [
    /(?<![0-9a-f:])(?:[0-9a-f]{1,4}:){1,7}:(?:[0-9a-f]{1,4}(?::[0-9a-f]{1,4}){0,6})?(?![0-9a-f:])/gi,
    '[address]',
  ],
];

export function redactAddresses(s: string): string {
  return ADDRESSES.reduce((t, [re, stand]) => t.replace(re, stand), s);
}

type Bounded = Exclude<keyof typeof WORKER_ISSUE_LIMITS, 'time'>;
// Cut first, so the patterns only ever see a bounded text; then redact.
const kept = (s: string | undefined, bound: Bounded) =>
  s === undefined ? undefined : redactAddresses(s.slice(0, WORKER_ISSUE_LIMITS[bound]));

const whole = (v: unknown, min: number, max: number) =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : undefined;

// An ISO time from epoch seconds or milliseconds (under 1e12 is seconds), or a date string.
function isoTime(v: unknown): string | undefined {
  const ms =
    typeof v === 'number' && Number.isFinite(v) && v > 0
      ? v < 1e12
        ? v * 1000
        : v
      : typeof v === 'string'
        ? Date.parse(v)
        : NaN;
  if (!Number.isFinite(ms)) return undefined;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

const TRIGGERS: Readonly<Record<string, WorkerIssueTrigger>> = {
  occurrencethreshold: 'first_sight',
  recurrenceafterinactivity: 'recurrence',
};

// A named trigger; else, from the count, first sight for an issue seen once ("What a delivery carries").
function triggerOf(raw: string | undefined, count: number | undefined): WorkerIssueTrigger {
  const named = raw && TRIGGERS[norm(raw)];
  if (named) return named;
  return count === 1 ? 'first_sight' : 'unknown';
}

const ISSUE_TYPE_PREFIX = /^issue_type_/;

function issueTypeOf(raw: string | undefined): string | undefined {
  const type = raw?.toLowerCase().replace(ISSUE_TYPE_PREFIX, '');
  return type || undefined;
}

// The worker an issue's `services` list names first: an entry that is a name, or an object naming one.
function serviceOf(services: unknown): string | undefined {
  if (!Array.isArray(services)) return undefined;
  for (const entry of services) {
    const name = firstText(
      entry,
      field(entry, 'name'),
      field(entry, 'service'),
      field(entry, 'scriptName'),
    );
    if (name) return name;
  }
  return undefined;
}

// The path of a URL, never its query; or nothing for text that is not one.
function pathOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).pathname;
  } catch {
    return undefined;
  }
}

const DASHBOARD = 'https://dash.cloudflare.com/';
const ACCOUNT_ID = /^[0-9a-f]{32}$/;
const WORKER_NAME = /^[a-z0-9-]{1,63}$/;

// The dashboard link a delivery names; else, from the account and the worker, the worker's Issues page.
function linkOf(data: Obj, issue: Obj, accountId: unknown, worker: string | undefined) {
  const named = [
    ...['url', 'link', 'issueUrl', 'dashboardUrl'].map((n) => field(data, n)),
    ...['url', 'link', 'dashboardUrl'].map((n) => field(issue, n)),
  ]
    .map(text)
    .find((v) => v?.startsWith(DASHBOARD));
  if (named) return named;
  const account = text(accountId);
  if (!account || !ACCOUNT_ID.test(account) || !worker || !WORKER_NAME.test(worker))
    return undefined;
  return `${DASHBOARD}${account}/workers/services/view/${worker}/production/issues?status=active`;
}

// Names the reader takes, never repeated among the other fields; the containers are walked, their named leaves not.
const READ = new Set(
  [
    'id',
    'issueId',
    'title',
    'type',
    'service',
    'services',
    'scriptName',
    'count',
    'issueCount',
    'stateCorrelationId',
    'firstObserved',
    'lastObserved',
    'name',
    'message',
    'stack',
    'lastError',
    'method',
    'path',
    'url',
    'statusCode',
    'timestamp',
    'versionId',
    'version',
    'triggerType',
    'trigger',
    'runId',
    'link',
    'issueUrl',
    'dashboardUrl',
    'occurrences',
    'trail',
    'logs',
  ].map(norm),
);

// Keys never carried, whatever they hold (the spec's "never keeps"): headers, cookies, credentials, addresses,
// queries and bodies.
const NEVER = [
  'header',
  'cookie',
  'auth',
  'token',
  'secret',
  'password',
  'email',
  'useragent',
  'address',
  'forwarded',
  'query',
  'body',
];
const isNever = (key: string) => {
  const k = norm(key);
  return k.endsWith('ip') || NEVER.some((n) => k.includes(n));
};

const OTHER_DEPTH = 4;
const OTHER_VALUE_MAX = 200;
const ENVELOPE_OTHERS = ['alert_type', 'alert_event', 'policy_name'] as const;

// The other fields as `path: value` lines: the envelope's kinds, then every scalar leaf of `data` not already read.
function otherFields(payload: Obj, data: Obj | undefined): string | undefined {
  const lines: string[] = [];
  for (const key of ENVELOPE_OTHERS) {
    const v = text(payload[key]);
    if (v) lines.push(`${key}: ${v.slice(0, OTHER_VALUE_MAX)}`);
  }
  const walk = (o: Obj, prefix: string, depth: number) => {
    for (const [key, v] of Object.entries(o)) {
      if (READ.has(norm(key)) || isNever(key)) continue;
      const path = `${prefix}${key}`;
      if (Array.isArray(v))
        lines.push(`${path}: [${v.length} ${v.length === 1 ? 'item' : 'items'}]`);
      else if (isObj(v)) {
        if (depth < OTHER_DEPTH) walk(v, `${path}.`, depth + 1);
      } else if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
        if (v !== '') lines.push(`${path}: ${String(v).slice(0, OTHER_VALUE_MAX)}`);
      }
    }
  };
  if (data) walk(data, '', 1);
  return lines.length ? lines.join('\n') : undefined;
}

function errorOf(occurrence: Obj | undefined, issue: Obj, run: Obj | undefined) {
  const name = text(at(occurrence, 'error', 'name'));
  const message = text(at(occurrence, 'error', 'message'));
  if (message) return name ? `${name}: ${message}` : message;
  return firstText(field(issue, 'lastError'), field(run, 'lastError'), name);
}

function routeOf(occurrence: Obj | undefined) {
  const method = text(at(occurrence, 'invocation', 'method'));
  const path =
    text(at(occurrence, 'invocation', 'path')) ?? pathOf(text(at(occurrence, 'invocation', 'url')));
  if (!path) return method;
  return method ? `${method} ${path}` : path;
}

function issueOf(payload: Obj, data: Obj): WorkerIssue {
  const issue = firstObj(field(data, 'issue')) ?? data;
  const occurrence = firstObj(
    ...['occurrence', 'latestOccurrence', 'lastOccurrence', 'occurrences'].map((n) => at(data, n)),
    ...['occurrence', 'latestOccurrence', 'lastOccurrence', 'occurrences'].map((n) => at(issue, n)),
  );
  const run = firstObj(field(data, 'run'), field(data, 'activity'), field(data, 'automationRun'));
  const trigger = firstText(
    field(run, 'triggerType'),
    field(data, 'triggerType'),
    field(data, 'trigger'),
    at(data, 'trigger', 'type'),
  );
  const count = whole(
    field(issue, 'count') ?? field(run, 'issueCount') ?? field(issue, 'occurrences'),
    0,
    Number.MAX_SAFE_INTEGER,
  );
  const worker = kept(
    firstText(
      field(issue, 'service'),
      serviceOf(field(issue, 'services')),
      field(issue, 'scriptName'),
      at(occurrence, 'worker', 'scriptName'),
      field(data, 'worker'),
      at(data, 'worker', 'scriptName'),
    ),
    'worker',
  );
  const version = firstText(
    at(occurrence, 'worker', 'versionId'),
    at(occurrence, 'worker', 'version'),
    at(occurrence, 'worker', 'version', 'id'),
    field(issue, 'versionId'),
  );
  const out: WorkerIssue = { trigger: triggerOf(trigger, count) };
  const put = <K extends keyof WorkerIssue>(key: K, value: WorkerIssue[K] | undefined) => {
    if (value !== undefined) out[key] = value;
  };
  put('worker', worker);
  put('issueType', kept(issueTypeOf(text(field(issue, 'type'))), 'issueType'));
  put(
    'issueId',
    kept(firstText(field(issue, 'id'), field(issue, 'issueId'), field(run, 'issueId')), 'issueId'),
  );
  put('title', kept(text(field(issue, 'title')), 'title'));
  put('error', kept(errorOf(occurrence, issue, run), 'error'));
  put('stack', kept(text(at(occurrence, 'error', 'stack')), 'stack'));
  put('route', kept(routeOf(occurrence), 'route'));
  put('status', whole(at(occurrence, 'invocation', 'statusCode'), 100, 599));
  put('count', count);
  put('firstSeen', isoTime(field(issue, 'firstObserved')));
  put('lastSeen', isoTime(field(issue, 'lastObserved') ?? field(occurrence, 'timestamp')));
  put('version', kept(version, 'version'));
  put('link', kept(linkOf(data, issue, payload['account_id'], worker), 'link'));
  put('summary', kept(text(payload['text']), 'summary'));
  put('other', kept(otherFields(payload, data), 'other'));
  return out;
}

export function readWorkerIssuePayload(raw: unknown): WorkerIssuePayload {
  if (!isObj(raw)) return { kind: 'unknown_shape' };
  const data = isObj(raw['data']) ? raw['data'] : undefined;
  const alertType = text(raw['alert_type']);
  if (!data && !alertType) return text(raw['text']) ? { kind: 'test' } : { kind: 'unknown_shape' };
  const issue = issueOf(raw, data ?? {});
  const run =
    data && firstObj(field(data, 'run'), field(data, 'activity'), field(data, 'automationRun'));
  const runId =
    text(field(run, 'id')) ??
    text(field(data, 'runId')) ??
    text(field(data, 'stateCorrelationId')) ??
    null;
  return { kind: 'delivery', issue, runId, payload: raw };
}
