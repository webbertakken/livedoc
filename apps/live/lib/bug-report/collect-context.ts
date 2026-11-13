// The context a bug report attaches by itself (docs/specs/016-platform/bug-reports.md "Context"): the page as its
// template, where it came from, the editor's place, the build, the browser, the screen and the recent errors. Pure
// over its inputs; `browserBugReportInputs` reads them from the page.
import {
  BUG_REPORT_LIMITS,
  pageViewPath,
  type BugReportContext,
  type BugReportRecentError,
} from '@livedoc/api-schema';
import { EDITOR_BUILD_ID } from '@/lib/server-release';
import { currentBugReportPlace, type BugReportPlace } from './place';
import { recentClientErrors } from './recent-errors';

export type BugReportInputs = {
  pathname: string;
  search: string;
  userAgent: string;
  viewport: { width: number; height: number; pixelRatio: number };
  online: boolean;
  // The page runs inside another page's frame (an embed).
  framed: boolean;
  release: string | null;
  place: BugReportPlace;
  recentErrors: BugReportRecentError[];
};

const RELEASE = /^[A-Za-z0-9._-]{1,64}$/;

export function collectBugReportContext(inputs: BugReportInputs): BugReportContext {
  const from = new URLSearchParams(inputs.search).get('from');
  const fromPath = from && from.startsWith('/') ? pageViewPath(from) : null;
  const context: BugReportContext = {
    route: pageViewPath(inputs.pathname) ?? '/',
    ...(fromPath ? { from: fromPath } : {}),
    ...inputs.place,
    viewport: {
      width: Math.round(inputs.viewport.width),
      height: Math.round(inputs.viewport.height),
      pixelRatio: inputs.viewport.pixelRatio,
    },
    online: inputs.online,
    ...(inputs.framed ? { embedded: true as const } : {}),
    recentErrors: inputs.recentErrors.slice(-BUG_REPORT_LIMITS.recentErrors),
  };
  if (inputs.release && RELEASE.test(inputs.release)) context.release = inputs.release;
  if (inputs.userAgent) context.userAgent = inputs.userAgent.slice(0, BUG_REPORT_LIMITS.userAgent);
  return context;
}

export function browserBugReportInputs(): BugReportInputs {
  return {
    pathname: window.location.pathname,
    search: window.location.search,
    userAgent: navigator.userAgent,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      pixelRatio: window.devicePixelRatio || 1,
    },
    online: navigator.onLine,
    framed: window.self !== window.top,
    release: EDITOR_BUILD_ID || null,
    place: currentBugReportPlace(),
    recentErrors: recentClientErrors(),
  };
}
