import { describe, expect, it } from 'vitest';
import { WORKER_ISSUE_LIMITS } from '@livedoc/api-schema';
import { readWorkerIssuePayload, redactAddresses } from './payload';
import { sampleDelivery } from './test-delivery';

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
