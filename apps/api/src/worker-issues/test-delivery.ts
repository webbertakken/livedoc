// A Workers Issues delivery for the receiver's tests (docs/specs/016-platform/worker-issues.md "Reading the
// payload"): the Notifications envelope Cloudflare documents, with `data` shaped as the Issues API models an issue,
// its latest occurrence and the automation run. That shape is assumed until a real delivery is seen. Not a `.test.ts`
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
