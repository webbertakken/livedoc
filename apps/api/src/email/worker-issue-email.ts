// The worker issue email (docs/specs/016-platform/worker-issues.md "The email"): one to the operator on first sight
// and on recurrence, naming the error, worker, route, count, first seen and the card. Never the stack, a header or an
// address. Transactional for the operator, so no unsubscribe: removing the automation or the secret stops it.
import { workerIssueContextLines, type WorkerIssue } from '@livedoc/api-schema';
import type { Env } from '../types';
import { appBaseUrl } from './client';
import { escapeHtml, escapeText, shell, type RenderedEmail } from './templates';

// Where the card is: filed with its number, or waiting for the refile.
export type WorkerIssueCardState = { kind: 'filed'; number: number } | { kind: 'waiting' };

const FOOTER =
  'You’re receiving this because you own this LiveDoc host’s Bug Tracker, and Cloudflare Workers Issues sent this ' +
  'error to it. Remove the Issues automation or the webhook secret to stop these.';

// The lines the email shows, taken from the card's own Context so the two always agree.
const SHOWN = new Set(['Route', 'Count', 'First seen']);

export function workerIssueEmail(
  env: Env,
  issue: WorkerIssue,
  card: WorkerIssueCardState,
  trackerDocumentId: string | null,
): RenderedEmail {
  const base = appBaseUrl(env);
  const back = issue.trigger === 'recurrence';
  const what = issue.error || issue.title || 'an unnamed error';
  const subject = issue.worker
    ? `${back ? 'Error back in' : 'New error in'} ${issue.worker}: ${what}`
    : `${back ? 'Worker error back' : 'New worker error'}: ${what}`;
  const heading = issue.worker
    ? `${back ? 'An error is back in' : 'A new error in'} ${issue.worker}`
    : back
      ? 'A worker error is back'
      : 'A new worker error';
  const happened = back
    ? 'is happening again after a quiet spell.'
    : 'appeared for the first time.';
  const cardLine =
    card.kind === 'filed'
      ? `#${card.number} on the Bug Tracker`
      : 'Waiting to be filed on the Bug Tracker';
  const lines = [
    ...workerIssueContextLines(issue).filter((l) => SHOWN.has(l.label)),
    { label: 'Card', value: cardLine },
  ];
  const trackerHref = trackerDocumentId
    ? `${base}/document/${encodeURIComponent(trackerDocumentId)}`
    : undefined;
  const text = [
    heading,
    '',
    `${what} ${happened}`,
    '',
    ...lines.map((l) => `${l.label}: ${l.value}`),
    '',
    ...(trackerHref ? [`Open the Bug Tracker: ${trackerHref}`] : []),
    ...(issue.link ? [`See it in Cloudflare: ${issue.link}`] : []),
  ].join('\n');
  return {
    kind: 'WorkerIssue',
    subject: escapeText(subject),
    html: shell(env, {
      heading: escapeHtml(heading),
      intro: `<strong>${escapeHtml(what)}</strong> ${happened}`,
      points: lines.map((l) => `${escapeHtml(l.label)}: ${escapeHtml(l.value)}`),
      ...(issue.link
        ? { outro: `<a href="${escapeHtml(issue.link)}">See it in Cloudflare</a>` }
        : {}),
      ...(trackerHref ? { ctaText: 'Open the Bug Tracker', ctaHref: trackerHref } : {}),
      footer: FOOTER,
    }),
    text: text.trimEnd(),
  };
}
