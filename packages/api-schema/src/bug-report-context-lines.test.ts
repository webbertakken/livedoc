import { describe, expect, it } from 'vitest';
import type { BugReportContext } from './bug-report';
import {
  bugReportContextLines,
  describeUserAgent,
  redactErrorText,
} from './bug-report-context-lines';

// docs/specs/016-platform/bug-reports.md "Context" and "The Bug Tracker board".

const CHROME_WIN =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const EDGE_WIN = `${CHROME_WIN} Edg/141.0.3537.57`;
const FIREFOX_LINUX = 'Mozilla/5.0 (X11; Linux x86_64; rv:144.0) Gecko/20100101 Firefox/144.0';
const SAFARI_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Safari/605.1.15';
const SAFARI_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1';
const CHROME_ANDROID =
  'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36';
const IPAD_CHROME =
  'Mozilla/5.0 (iPad; CPU OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.0.0 Mobile/15E148 Safari/604.1';
const CHROMEOS =
  'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

describe('describeUserAgent', () => {
  it.each([
    [CHROME_WIN, 'Chrome 141 on Windows'],
    [EDGE_WIN, 'Edge 141 on Windows'],
    [FIREFOX_LINUX, 'Firefox 144 on Linux'],
    [SAFARI_MAC, 'Safari 18 on macOS'],
    [SAFARI_IPHONE, 'Safari 18 on iOS'],
    [CHROME_ANDROID, 'Chrome 141 on Android'],
    [IPAD_CHROME, 'Chrome 141 on iPadOS'],
    [CHROMEOS, 'Chrome 141 on ChromeOS'],
    ['curl/8.0', 'Unknown browser'],
    ['Firefox/144.0', 'Firefox 144'],
    ['', 'Unknown browser'],
  ])('describes %s', (ua, expected) => {
    expect(describeUserAgent(ua)).toBe(expected);
  });
});

describe('redactErrorText', () => {
  it('replaces emails, URLs, UUIDs, long tokens and long numbers', () => {
    expect(
      redactErrorText(
        'Failed for ann@example.com at https://docs.nu/document/abc?x=1 id 0f8fad5b-d9cb-469f-a165-70867728950e token AbCdEf0123456789xyz count 123456',
      ),
    ).toBe('Failed for [email] at [url] id [id] token [id] count [number]');
  });

  it('keeps short words and numbers as they are', () => {
    expect(redactErrorText('Http500.SaveTab after 3 tries')).toBe('Http500.SaveTab after 3 tries');
  });

  it('cuts to 200 characters', () => {
    expect(redactErrorText('word '.repeat(100))).toHaveLength(200);
  });
});

describe('bugReportContextLines', () => {
  const base: BugReportContext = {
    route: '/document',
    viewport: { width: 1280, height: 800, pixelRatio: 2 },
    online: true,
    recentErrors: [],
  };

  it('says the always-present lines in plain words', () => {
    expect(bugReportContextLines(base)).toEqual([
      { label: 'Page', value: '/document' },
      { label: 'Screen', value: '1280 × 800 at 2x' },
      { label: 'Online', value: 'Yes' },
      { label: 'Recent errors', value: 'None' },
    ]);
  });

  it('says every optional line and lists each recent error', () => {
    const lines = bugReportContextLines({
      ...base,
      from: '/help/contact',
      mode: 'draw',
      tabKind: 'event-storming',
      shareRole: 'participate',
      release: 'abc1234',
      userAgent: CHROME_WIN,
      online: false,
      embedded: true,
      recentErrors: [{ at: '2026-10-28T10:00:00.000Z', source: 'api', message: 'Http500.SaveTab' }],
    });
    expect(lines).toEqual([
      { label: 'Page', value: '/document' },
      { label: 'From', value: '/help/contact' },
      { label: 'Mode', value: 'Sketch' },
      { label: 'Tab kind', value: 'Event Storming' },
      { label: 'Share role', value: 'Participant' },
      { label: 'App version', value: 'abc1234' },
      { label: 'Browser', value: 'Chrome 141 on Windows' },
      { label: 'Screen', value: '1280 × 800 at 2x' },
      { label: 'Online', value: 'No' },
      { label: 'Embedded', value: 'Yes' },
      { label: 'Recent errors', value: '1' },
      { label: 'Error', value: '2026-10-28T10:00:00.000Z api: Http500.SaveTab' },
    ]);
  });

  it.each([
    ['owner', 'Owner'],
    ['edit', 'Editor'],
    ['view', 'Viewer'],
  ] as const)('names the %s share role %s', (shareRole, value) => {
    expect(bugReportContextLines({ ...base, shareRole })).toContainEqual({
      label: 'Share role',
      value,
    });
  });
});
