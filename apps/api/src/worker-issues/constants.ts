// The receiver's and the ledger's numbers (docs/specs/016-platform/worker-issues.md), each the spec's default.

// The largest delivery read (the spec's 1 MiB, default): an issue with its stack, logs and trail stays well under it.
// Safe range 64 KiB to 4 MiB.
export const WORKER_ISSUES_BODY_MAX_BYTES = 1_048_576;

// How long a throttled sender is asked to wait: the limiter's period.
export const WORKER_ISSUES_RETRY_AFTER_SECONDS = 60;

// How long the ledger keeps a delivery key (7 days, default): far past Cloudflare's three hand-offs of a run, and as
// long as an occurrence's details are kept. Safe range 1 to 30 days.
export const WORKER_ISSUES_KEY_TTL_MS = 7 * 86_400_000;

// How many cards the ledger holds while D1 is down (200, default). Safe range 20 to 1,000.
export const WORKER_ISSUES_HELD_MAX = 200;

// How many held cards one refile takes (20, default): the bug report refile's batch.
export const WORKER_ISSUES_HELD_BATCH = 20;

// How many emails an hour reach the operator (10, default); a storm still files every card. Safe range 1 to 60.
export const WORKER_ISSUES_EMAILS_PER_HOUR = 10;
export const WORKER_ISSUES_EMAIL_WINDOW_MS = 3_600_000;

// The ledger's one instance.
export const WORKER_ISSUES_LEDGER_NAME = 'worker-issues';
