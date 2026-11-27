// Dates in a chart's categories (docs/specs/009-elements/pie-chart.md "Timeline", D372): a Timeline places each point
// by its category read as an ISO date (or date and time) in UTC; a sheet's dated label column reaches the chart as ISO
// text written from the cells' serial numbers. Light and pure: chart-source imports it.

// A spreadsheet's day zero (serial 0) is 1899-12-30; serial 25569 is 1970-01-01.
const UNIX_SERIAL = 25569;
const DAY_MS = 86_400_000;
const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/;

const pad = (n: number) => String(n).padStart(2, '0');

/** UTC milliseconds of a date and time, years 0 to 99 as written (Date.UTC reads them as 1900 to 1999). */
export function utcTime(y: number, month: number, day = 1, h = 0, mi = 0, s = 0): number {
  const d = new Date(0);
  d.setUTCFullYear(y, month, day);
  d.setUTCHours(h, mi, s, 0);
  return d.getTime();
}

/** A date serial as ISO text: `YYYY-MM-DD` for a whole day, else with its time to the minute (and second). */
export function serialDateText(serial: number): string {
  const d = new Date(Math.round((serial - UNIX_SERIAL) * DAY_MS));
  const day = d.toISOString().slice(0, 10);
  const [h, m, s] = [d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()];
  if (h === 0 && m === 0 && s === 0) return day;
  return `${day}T${pad(h)}:${pad(m)}${s ? `:${pad(s)}` : ''}`;
}

/** An ISO date (or date and time) as UTC milliseconds; null for anything else, or a day or time that does not exist. */
export function isoDateTime(text: string): number | null {
  const m = ISO.exec(text.trim());
  if (!m) return null;
  const [y, mo, d, h = 0, mi = 0, s = 0] = m.slice(1).map((v) => (v === undefined ? 0 : Number(v)));
  const ms = utcTime(y!, mo! - 1, d, h, mi, s);
  const back = new Date(ms);
  const exists =
    back.getUTCFullYear() === y &&
    back.getUTCMonth() === mo! - 1 &&
    back.getUTCDate() === d &&
    back.getUTCHours() === h &&
    back.getUTCMinutes() === mi;
  return exists ? ms : null;
}
