import { describe, expect, it } from 'vitest';
import type { WorkerIssue } from '@livedoc/api-schema';
import type { Env } from '../types';
import { workerIssueEmail } from './worker-issue-email';

// docs/specs/016-platform/worker-issues.md "The email".

const env = { APP_BASE_URL: 'https://app.test' } as unknown as Env;
const issue: WorkerIssue = {
  trigger: 'first_sight',
  worker: 'docs-nu-api',
  error: 'TypeError: <boom>',
  stack: 'TypeError: <boom>\n    at secret-frame (route.ts:1:2)',
  route: 'GET /api/home',
  count: 2,
  firstSeen: '2026-11-10T22:11:00.000Z',
  link: 'https://dash.cloudflare.com/acc/workers/services/view/docs-nu-api/production/issues?status=active',
};

describe('workerIssueEmail', () => {
  it('names a first sight as a new error in its worker', () => {
    const email = workerIssueEmail(env, issue, { kind: 'filed', number: 12 }, 'tracker');
    expect(email.kind).toBe('WorkerIssue');
    expect(email.subject).toBe('New error in docs-nu-api: TypeError: <boom>');
    expect(email.html).toContain('A new error in docs-nu-api');
    expect(email.html).toContain('TypeError: &lt;boom&gt;');
    expect(email.html).toContain('GET /api/home');
    expect(email.html).toContain('2026-11-10 22:11 UTC');
    expect(email.html).toContain('#12 on the Bug Tracker');
    expect(email.html).toContain('href="https://app.test/document/tracker"');
    expect(email.html).toContain(`href="${issue.link}"`);
    expect(email.unsubscribeUrl).toBeUndefined();
  });

  it('names a recurrence as an error back in its worker', () => {
    const email = workerIssueEmail(
      env,
      { ...issue, trigger: 'recurrence' },
      { kind: 'waiting' },
      'tracker',
    );
    expect(email.subject).toBe('Error back in docs-nu-api: TypeError: <boom>');
    expect(email.html).toContain('An error is back in docs-nu-api');
    expect(email.html).toContain('Waiting to be filed on the Bug Tracker');
  });

  it('never carries the stack', () => {
    const email = workerIssueEmail(env, issue, { kind: 'filed', number: 1 }, 'tracker');
    expect(email.html).not.toContain('secret-frame');
    expect(email.text).not.toContain('secret-frame');
  });

  it('carries a plain text twin', () => {
    const { text } = workerIssueEmail(env, issue, { kind: 'filed', number: 3 }, 'tracker');
    expect(text).toBe(
      [
        'A new error in docs-nu-api',
        '',
        'TypeError: <boom> appeared for the first time.',
        '',
        'Route: GET /api/home',
        'Count: 2',
        'First seen: 2026-11-10 22:11 UTC',
        'Card: #3 on the Bug Tracker',
        '',
        'Open the Bug Tracker: https://app.test/document/tracker',
        `See it in Cloudflare: ${issue.link}`,
      ].join('\n'),
    );
  });

  it('reads well with nothing but a trigger', () => {
    const email = workerIssueEmail(env, { trigger: 'unknown' }, { kind: 'waiting' }, null);
    expect(email.subject).toBe('New worker error: an unnamed error');
    expect(email.html).not.toContain('Open the Bug Tracker');
  });

  it('names a recurrence without a worker', () => {
    const email = workerIssueEmail(
      env,
      { trigger: 'recurrence', error: 'E' },
      { kind: 'waiting' },
      null,
    );
    expect(email.subject).toBe('Worker error back: E');
    expect(email.html).toContain('A worker error is back');
  });

  it('keeps a long subject to one line of 80 characters', () => {
    const email = workerIssueEmail(
      env,
      { ...issue, error: `E\n${'x'.repeat(200)}` },
      { kind: 'waiting' },
      null,
    );
    expect(email.subject).toHaveLength(80);
    expect(email.subject).not.toContain('\n');
  });
});
