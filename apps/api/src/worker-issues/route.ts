// /api/worker-issues (docs/specs/016-platform/worker-issues.md "The receiver"): the Workers Issues webhook. Any deeper
// path is an unknown route, as the whole route is on a host without the secret.
import { notFound } from '../responses';
import type { RouteContext } from '../routes/context';
import { receiveWorkerIssue } from './receive';

export async function handleWorkerIssues(ctx: RouteContext): Promise<Response> {
  return ctx.segments.length === 2 ? receiveWorkerIssue(ctx) : notFound();
}
