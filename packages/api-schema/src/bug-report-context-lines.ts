// A bug report's context in plain words (docs/specs/016-platform/bug-reports.md "Context"): the lines the form shows
// under What's Attached and the card's Context field holds, the browser and system a user agent names, and the
// redaction every recent error message passes before it leaves the browser.
import { editorModeLabel, type TabKind } from '@livedoc/document';
import { BUG_REPORT_LIMITS, type BugReportContext, type BugReportShareRole } from './bug-report';

export type BugReportContextLine = { label: string; value: string };

const TAB_KIND_LABEL: Readonly<Record<TabKind, string>> = {
  diagram: 'Diagram',
  'event-storming': 'Event Storming',
  board: 'Board',
  sheet: 'Sheet',
  dashboard: 'Dashboard',
  form: 'Form',
};

const SHARE_ROLE_LABEL: Readonly<Record<BugReportShareRole, string>> = {
  owner: 'Owner',
  edit: 'Editor',
  participate: 'Participant',
  view: 'Viewer',
};

// The browser, first match wins: the brands built on Chrome name themselves after it.
const BROWSERS: readonly [RegExp, string][] = [
  [/Edg(?:e|A|iOS)?\/(\d+)/, 'Edge'],
  [/OPR\/(\d+)/, 'Opera'],
  [/SamsungBrowser\/(\d+)/, 'Samsung Internet'],
  [/(?:Firefox|FxiOS)\/(\d+)/, 'Firefox'],
  [/(?:Chrome|CriOS)\/(\d+)/, 'Chrome'],
  [/Version\/(\d+)[.\d]* (?:Mobile\/\S+ )?Safari\//, 'Safari'],
];

const SYSTEMS: readonly [RegExp, string][] = [
  [/iPad/, 'iPadOS'],
  [/iPhone|iPod/, 'iOS'],
  [/Android/, 'Android'],
  [/CrOS/, 'ChromeOS'],
  [/Windows/, 'Windows'],
  [/Mac OS X|Macintosh/, 'macOS'],
  [/Linux/, 'Linux'],
];

// "Chrome 141 on Windows", or "Unknown browser" for anything that names no browser it knows.
export function describeUserAgent(userAgent: string): string {
  const browser = BROWSERS.map(([re, name]) => {
    const m = re.exec(userAgent);
    return m ? `${name} ${m[1]}` : null;
  }).find((b) => b !== null);
  if (!browser) return 'Unknown browser';
  const system = SYSTEMS.find(([re]) => re.test(userAgent))?.[1];
  return system ? `${browser} on ${system}` : browser;
}

// What could name a person or a thing in an error message, each with what stands in for it. Order matters: an email
// or URL is replaced whole before its parts could match the shorter patterns.
const REDACTIONS: readonly [RegExp, string][] = [
  [/[^\s@]+@[^\s@]+\.[^\s@]+/g, '[email]'],
  [/\b(?:https?|wss?):\/\/\S+/g, '[url]'],
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '[id]'],
  [/\b(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]{16,}\b/g, '[id]'],
  [/\b\d{5,}\b/g, '[number]'],
];

// An error message with emails, URLs, ids, long tokens and long numbers replaced, cut to the message bound.
export function redactErrorText(text: string): string {
  const redacted = REDACTIONS.reduce((t, [re, stand]) => t.replace(re, stand), text);
  return redacted.slice(0, BUG_REPORT_LIMITS.errorMessage);
}

// One line per context entry, in the order the form and the card show them; each recent error a line of its own.
export function bugReportContextLines(context: BugReportContext): BugReportContextLine[] {
  const lines: BugReportContextLine[] = [{ label: 'Page', value: context.route }];
  if (context.from) lines.push({ label: 'From', value: context.from });
  if (context.mode) lines.push({ label: 'Mode', value: editorModeLabel(context.mode) });
  if (context.tabKind) lines.push({ label: 'Tab kind', value: TAB_KIND_LABEL[context.tabKind] });
  if (context.shareRole)
    lines.push({ label: 'Share role', value: SHARE_ROLE_LABEL[context.shareRole] });
  if (context.release) lines.push({ label: 'App version', value: context.release });
  if (context.userAgent)
    lines.push({ label: 'Browser', value: describeUserAgent(context.userAgent) });
  const { width, height, pixelRatio } = context.viewport;
  lines.push({ label: 'Screen', value: `${width} × ${height} at ${pixelRatio}x` });
  lines.push({ label: 'Online', value: context.online ? 'Yes' : 'No' });
  if (context.embedded) lines.push({ label: 'Embedded', value: 'Yes' });
  const errors = context.recentErrors;
  lines.push({ label: 'Recent errors', value: errors.length ? String(errors.length) : 'None' });
  for (const e of errors)
    lines.push({ label: 'Error', value: `${e.at} ${e.source}: ${e.message}` });
  return lines;
}
