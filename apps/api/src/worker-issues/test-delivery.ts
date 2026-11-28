// A Workers Issues delivery for the receiver's tests (docs/specs/016-platform/worker-issues.md "Reading the
// payload"): the Notifications envelope Cloudflare documents, with `data` shaped as the Issues API models an issue,
// its latest occurrence and the automation run, and the shape a real delivery has. Not a `.test.ts`
// file, so vitest doesn't collect it as a suite.

export const SAMPLE_ACCOUNT_ID = '0123456789abcdef0123456789abcdef';

export function sampleDelivery(overrides: { runId?: string; trigger?: string; ts?: number } = {}) {
  return {
    name: 'First sight',
    text: 'docs-nu-api has a new issue: TypeError: boom',
    ts: overrides.ts ?? 1_794_348_662,
    account_id: SAMPLE_ACCOUNT_ID,
    policy_id: 'pol_1',
    policy_name: 'First sight',
    alert_type: 'workers_observability_issue',
    alert_correlation_id: 'corr_1',
    alert_event: 'ALERT_STATE_EVENT_START',
    data: {
      issue: {
        id: 'iss_1',
        title: 'TypeError: boom',
        service: 'docs-nu-api',
        count: 2,
        firstObserved: 1_794_348_660_000,
        lastObserved: 1_794_348_662_000,
      },
      occurrence: {
        error: {
          name: 'TypeError',
          message: 'boom',
          stack: 'TypeError: boom\n    at home (src/home/route.ts:12:3)',
        },
        invocation: { method: 'GET', path: '/api/home', statusCode: 500 },
        worker: { scriptName: 'docs-nu-api', versionId: 'ver_9' },
        trail: [{ type: 'log', level: 'error', message: 'api error route=home', timestamp: 1 }],
      },
      run: {
        id: overrides.runId ?? 'run_1',
        issueId: 'iss_1',
        triggerType: overrides.trigger ?? 'occurrence_threshold',
      },
    },
  };
}

// The first real delivery (docs/specs/016-platform/worker-issues.md "What a delivery carries"), rebuilt from the card
// it filed: a router `500` on 24 November 2026. What the card did not show (the list's entries, the account) is the
// likeliest form, and the tests read both forms where it matters.
export function realTimeDelivery(
  overrides: { services?: unknown[]; type?: string; occurrences?: number } = {},
) {
  return {
    name: 'Workers Issues: docs.nu Bug Tracker',
    text: [
      "Real-Time Issue 'HttpServerError · HTTP 500' detected in docs-nu-router.",
      '',
      '- Issue ID: 1234fa22-84a6-407f-b3de-cf1b73e13e85',
      '- Type: Exception',
      '- Status: Active',
      `- Occurrences: ${overrides.occurrences ?? 1}`,
      '- First observed: 2026-11-24T18:03:21.636Z',
      '- Last observed: 2026-11-24T18:03:21.636Z',
    ].join('\n'),
    ts: 1_795_543_420,
    account_id: SAMPLE_ACCOUNT_ID,
    policy_name: 'Workers Issues: docs.nu Bug Tracker',
    alert_type: 'workers_observability_real_time_issue',
    alert_event: 'ALERT_STATE_EVENT_START',
    data: {
      issue: {
        id: '1234fa22-84a6-407f-b3de-cf1b73e13e85',
        title: 'HttpServerError · HTTP 500',
        fingerprint: 'b660f90e385b980521d1f72ecced7b68',
        type: overrides.type ?? 'ISSUE_TYPE_EXCEPTION',
        status: 'ISSUE_STATUS_ACTIVE',
        services: overrides.services ?? ['docs-nu-router'],
        occurrences: overrides.occurrences ?? 1,
        first_observed: '2026-11-24T18:03:21.636Z',
        last_observed: '2026-11-24T18:03:21.636Z',
      },
      state_correlation_id: 'e50f27fa-9839-4fd8-88dc-cd5b74e667a2',
      state_event: 'ALERT_STATE_EVENT_START',
    },
  };
}

// A scan alert (docs/specs/016-platform/worker-issues.md "Vulnerability scans"), shaped as a real delivery: a security
// issue whose title names the probe family; a status only when the test gives one, as no real delivery names it.
export function scanDelivery(
  overrides: { service?: string | null; status?: number; runId?: string; ts?: number } = {},
) {
  const service = overrides.service === undefined ? 'docs-nu-api' : overrides.service;
  const base = realTimeDelivery({ services: service === null ? [] : [service] });
  const title = 'Potential vulnerability scan · secret-files · high risk';
  return {
    ...base,
    text: `Real-Time Issue '${title}' detected.`,
    ts: overrides.ts ?? base.ts,
    data: {
      ...base.data,
      issue: {
        ...base.data.issue,
        id: service === null ? undefined : 'iss_scan',
        title,
        type: 'ISSUE_TYPE_SECURITY',
      },
      state_correlation_id: overrides.runId ?? 'run_scan_1',
      ...(overrides.status === undefined
        ? {}
        : {
            occurrence: {
              invocation: { method: 'GET', path: '/.env', statusCode: overrides.status },
            },
          }),
    },
  };
}
