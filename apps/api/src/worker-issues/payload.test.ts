import { describe, expect, it } from 'vitest';
import { WORKER_ISSUE_LIMITS } from '@livedoc/api-schema';
import { readWorkerIssuePayload, redactAddresses } from './payload';
import { realTimeDelivery, sampleDelivery } from './test-delivery';

// docs/specs/016-platform/worker-issues.md "The receiver" steps 7-8 and "Reading the payload".

const read = (raw: unknown) => {
  const out = readWorkerIssuePayload(raw);
  if (out.kind !== 'delivery') throw new Error(`expected a delivery, got ${out.kind}`);
  return out;
};

describe('readWorkerIssuePayload', () => {
  it('reads every field it can name from the Issues API shapes', () => {
    const { issue, runId } = read(sampleDelivery());
    expect(runId).toBe('run_1');
    expect(issue).toEqual({
      trigger: 'first_sight',
      worker: 'docs-nu-api',
      issueId: 'iss_1',
      title: 'TypeError: boom',
      error: 'TypeError: boom',
      stack: 'TypeError: boom\n    at home (src/home/route.ts:12:3)',
      route: 'GET /api/home',
      status: 500,
      count: 2,
      firstSeen: '2026-11-10T22:11:00.000Z',
      lastSeen: '2026-11-10T22:11:02.000Z',
      version: 'ver_9',
      link: 'https://dash.cloudflare.com/0123456789abcdef0123456789abcdef/workers/services/view/docs-nu-api/production/issues?status=active',
      summary: 'docs-nu-api has a new issue: TypeError: boom',
      other:
        'alert_type: workers_observability_issue\nalert_event: ALERT_STATE_EVENT_START\npolicy_name: First sight',
    });
  });

  // "What a delivery carries": the first real delivery, card 49 on docs.nu's Bug Tracker.
  it('reads what a real delivery carries: the worker, the run, the type and the count', () => {
    const { issue, runId } = read(realTimeDelivery());
    expect(runId).toBe('e50f27fa-9839-4fd8-88dc-cd5b74e667a2');
    expect(issue).toEqual({
      trigger: 'first_sight',
      worker: 'docs-nu-router',
      issueType: 'exception',
      issueId: '1234fa22-84a6-407f-b3de-cf1b73e13e85',
      title: 'HttpServerError · HTTP 500',
      count: 1,
      firstSeen: '2026-11-24T18:03:21.636Z',
      lastSeen: '2026-11-24T18:03:21.636Z',
      link: 'https://dash.cloudflare.com/0123456789abcdef0123456789abcdef/workers/services/view/docs-nu-router/production/issues?status=active',
      summary: realTimeDelivery().text,
      other: [
        'alert_type: workers_observability_real_time_issue',
        'alert_event: ALERT_STATE_EVENT_START',
        'policy_name: Workers Issues: docs.nu Bug Tracker',
        'issue.fingerprint: b660f90e385b980521d1f72ecced7b68',
        'issue.status: ISSUE_STATUS_ACTIVE',
        'state_event: ALERT_STATE_EVENT_START',
      ].join('\n'),
    });
  });

  it('reads a service named by an object in the list, and skips what names none', () => {
    const named = (services: unknown[]) => read(realTimeDelivery({ services })).issue.worker;
    expect(named([{ name: 'docs-nu-api' }])).toBe('docs-nu-api');
    expect(named([{ service: 'docs-nu-mcp' }])).toBe('docs-nu-mcp');
    expect(named([{ scriptName: 'docs-nu-live' }])).toBe('docs-nu-live');
    expect(named([3, '', 'docs-nu-router'])).toBe('docs-nu-router');
    expect(named([])).toBeUndefined();
  });

  it('reads the issue type, its prefix and case apart', () => {
    const typed = (type: string) => read(realTimeDelivery({ type })).issue.issueType;
    expect(typed('ISSUE_TYPE_SECURITY')).toBe('security');
    expect(typed('security')).toBe('security');
    expect(typed('ISSUE_TYPE_LOG')).toBe('log');
    expect(typed('ISSUE_TYPE_SOMETHING_NEW')).toBe('something_new');
    expect(read({ data: { issue: { type: 3 } } }).issue.issueType).toBeUndefined();
  });

  it('leaves the trigger unknown for an unnamed trigger once the issue was seen again', () => {
    const { issue } = read(realTimeDelivery({ occurrences: 4 }));
    expect(issue).toMatchObject({ trigger: 'unknown', count: 4 });
  });

  it('keeps a named trigger whatever the count', () => {
    expect(read(sampleDelivery({ trigger: 'recurrence_after_inactivity' })).issue.trigger).toBe(
      'recurrence',
    );
    const once = sampleDelivery({ trigger: 'recurrence_after_inactivity' });
    once.data.issue.count = 1;
    expect(read(once).issue.trigger).toBe('recurrence');
  });

  it('reads snake case names as their camel case twins', () => {
    const { issue, runId } = read({
      text: 'x',
      data: {
        issue: {
          issue_id: 'iss_2',
          title: 'E',
          service: 'docs-nu-mcp',
          first_observed: 1_762_812_660,
        },
        run: { id: 'run_2', trigger_type: 'recurrence_after_inactivity' },
        latest_occurrence: {
          error: { message: 'gone' },
          invocation: { url: 'https://docs.nu/api/x/y' },
        },
      },
    });
    expect(runId).toBe('run_2');
    expect(issue).toMatchObject({
      trigger: 'recurrence',
      issueId: 'iss_2',
      worker: 'docs-nu-mcp',
      firstSeen: '2025-11-10T22:11:00.000Z',
      error: 'gone',
      route: '/api/x/y',
    });
  });

  it('finds the issue in data itself and the occurrence in a list', () => {
    const { issue } = read({
      alert_type: 'x',
      data: {
        id: 'iss_3',
        title: 'T',
        service: 'docs-nu-router',
        occurrences: [
          { error: { name: 'RangeError', message: 'r' }, worker: { scriptName: 'ignored' } },
        ],
        trigger: { type: 'occurrence_threshold' },
      },
    });
    expect(issue).toMatchObject({
      issueId: 'iss_3',
      worker: 'docs-nu-router',
      error: 'RangeError: r',
    });
    expect(issue.trigger).toBe('first_sight');
  });

  it('falls back to the last error of the run', () => {
    const { issue } = read({ data: { activity: { lastError: 'Worker threw' } } });
    expect(issue.error).toBe('Worker threw');
    expect(issue.trigger).toBe('unknown');
  });

  it('takes a dashboard link the payload names, and no other link', () => {
    const named = 'https://dash.cloudflare.com/acc/workers/issues/iss_1';
    expect(read({ data: { issue: { url: named } } }).issue.link).toBe(named);
    expect(read({ data: { issue: { url: 'https://evil.example/x' } } }).issue.link).toBeUndefined();
  });

  it('carries a delivery whose data moved as its envelope and other fields', () => {
    const { issue, runId } = read({
      text: 'Something happened',
      alert_type: 'workers_issue_v2',
      data: { things: { kind: 'new', size: 3, list: [1, 2] } },
    });
    expect(runId).toBeNull();
    expect(issue).toEqual({
      trigger: 'unknown',
      summary: 'Something happened',
      other:
        'alert_type: workers_issue_v2\nthings.kind: new\nthings.size: 3\nthings.list: [2 items]',
    });
  });

  it('keeps no header, cookie, address or query among the other fields', () => {
    const { issue } = read({
      data: {
        request: {
          headers: { authorization: 'Bearer x' },
          cookie: 'c',
          clientIp: '203.0.113.9',
          ip: '203.0.113.9',
          user_agent: 'Firefox',
          email: 'a@b.co',
          query: 'tz=Europe',
          colo: 'AMS',
        },
        trail: [{ message: 'log' }],
      },
    });
    expect(issue.other).toBe('request.colo: AMS');
  });

  it('replaces addresses in every kept text', () => {
    const { issue } = read({
      text: 'from 203.0.113.9 for webber@example.com',
      data: { occurrence: { error: { message: 'denied 2001:db8::1 at 10:11:12' } } },
    });
    expect(issue.summary).toBe('from [address] for [email]');
    expect(issue.error).toBe('denied [address] at 10:11:12');
  });

  it('cuts each text to its bound', () => {
    const { issue } = read({
      text: 't'.repeat(5_000),
      data: {
        occurrence: { error: { message: 'm', stack: 's'.repeat(9_000) } },
        issue: { service: 'w'.repeat(99) },
      },
    });
    expect(issue.summary).toHaveLength(WORKER_ISSUE_LIMITS.summary);
    expect(issue.stack).toHaveLength(WORKER_ISSUE_LIMITS.stack);
    expect(issue.worker).toHaveLength(WORKER_ISSUE_LIMITS.worker);
  });

  it('drops a status or count that is not a whole number in range', () => {
    const { issue } = read({
      data: { issue: { count: -2 }, occurrence: { invocation: { statusCode: 'x' } } },
    });
    expect(issue.count).toBeUndefined();
    expect(issue.status).toBeUndefined();
  });

  it('reads a text-only payload as the destination test', () => {
    expect(readWorkerIssuePayload({ text: 'Hello World!' })).toEqual({ kind: 'test' });
  });

  it.each([null, [], 'x', 3, {}, { name: 'n' }, { text: 3 }])(
    'refuses %j as an unknown shape',
    (raw) => {
      expect(readWorkerIssuePayload(raw)).toEqual({ kind: 'unknown_shape' });
    },
  );
});

describe('redactAddresses', () => {
  it.each([
    ['call 198.51.100.23 now', 'call [address] now'],
    ['v6 2001:0db8:85a3:0000:0000:8a2e:0370:7334 end', 'v6 [address] end'],
    ['short fe80::1', 'short [address]'],
    ['mail me@x.io', 'mail [email]'],
    ['at 22:11:05 in file.ts:12:3', 'at 22:11:05 in file.ts:12:3'],
    ['version 1.2.3', 'version 1.2.3'],
  ])('turns %j into %j', (text, out) => {
    expect(redactAddresses(text)).toBe(out);
  });
});
