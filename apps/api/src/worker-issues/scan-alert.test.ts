import type { WorkerIssue } from '@livedoc/api-schema';
import { describe, expect, it } from 'vitest';
import { scanVerdictOf } from './scan-alert';

// docs/specs/016-platform/worker-issues.md "Vulnerability scans".

const scan = (over: Partial<WorkerIssue> = {}): WorkerIssue => ({
  trigger: 'first_sight',
  issueType: 'security',
  title: 'Potential vulnerability scan · source-control · high risk',
  worker: 'docs-nu-api',
  ...over,
});

describe('scanVerdictOf', () => {
  it('reads an issue that is not a scan as no scan', () => {
    expect(scanVerdictOf(scan({ issueType: 'exception' }))).toBe('not_scan');
    expect(scanVerdictOf(scan({ title: 'Some other security finding' }))).toBe('not_scan');
    expect(scanVerdictOf(scan({ title: undefined }))).toBe('not_scan');
  });

  it('tells a scan by its title, case apart', () => {
    expect(scanVerdictOf(scan({ title: 'potential VULNERABILITY scan · x', status: 404 }))).toBe(
      'not_answered',
    );
  });

  it.each(['docs-nu-router', 'docs-nu-live'])(
    'never counts a scan on %s, which serves only the built site, as answered',
    (worker) => {
      expect(scanVerdictOf(scan({ worker }))).toBe('not_answered');
      expect(scanVerdictOf(scan({ worker, status: 200 }))).toBe('not_answered');
    },
  );

  it.each([301, 400, 403, 404, 500])('reads a %i on any worker as not answered', (status) => {
    expect(scanVerdictOf(scan({ status }))).toBe('not_answered');
  });

  it.each([200, 204, 299])('reads a %i on the api or the mcp as answered', (status) => {
    expect(scanVerdictOf(scan({ status }))).toBe('answered');
    expect(scanVerdictOf(scan({ worker: 'docs-nu-mcp', status }))).toBe('answered');
  });

  it('counts a scan with no status, or no worker, as answered: a leak must never go unseen', () => {
    expect(scanVerdictOf(scan())).toBe('answered');
    expect(scanVerdictOf(scan({ worker: undefined }))).toBe('answered');
  });
});
