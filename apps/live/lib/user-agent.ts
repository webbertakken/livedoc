// A session's browser and system, named from its user agent for Settings > Account > Sessions
// (docs/specs/014-identity/auth-and-guest-access.md). Order matters: Edge and Opera
// also say Chrome, and Chrome also says Safari.
const BROWSERS: [RegExp, string][] = [
  [/Edg\//, 'Edge'],
  [/OPR\/|Opera/, 'Opera'],
  [/Firefox\//, 'Firefox'],
  [/Chrome\/|CriOS\//, 'Chrome'],
  [/Safari\//, 'Safari'],
];

const SYSTEMS: [RegExp, string][] = [
  [/iPhone|iPad|iPod/, 'iOS'],
  [/Android/, 'Android'],
  [/Windows/, 'Windows'],
  [/Mac OS X|Macintosh/, 'macOS'],
  [/CrOS/, 'ChromeOS'],
  [/Linux/, 'Linux'],
];

const first = (ua: string, list: [RegExp, string][]) =>
  list.find(([test]) => test.test(ua))?.[1] ?? null;

export function describeUserAgent(ua: string | null | undefined): string {
  if (!ua) return 'Unknown browser';
  const browser = first(ua, BROWSERS);
  const system = first(ua, SYSTEMS);
  if (browser && system) return `${browser} on ${system}`;
  return browser ?? system ?? 'Unknown browser';
}
