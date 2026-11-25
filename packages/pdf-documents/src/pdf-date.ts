// A date as a PDF file holds one (ISO 32000-2 7.9.4): `D:YYYYMMDDHHmmSSOHH'mm`, every part after the year optional.
// A mark's `M` and `CreationDate` are written so, always in UTC, and read so from any file (marks.md "In the file",
// "Changing a mark": a file's mark as LiveDoc reads it). Pure.

const two = (n: number): string => String(n).padStart(2, '0');

// The year, then month, day, hour, minute and second, each optional in turn, then the offset from UTC.
const DATE =
  /^(?:D:)?(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?(?:([Zz+-])(?:(\d{2})'?(?:(\d{2})'?)?)?)?$/;

export const PdfDate = {
  /** A time as the file writes a date: `D:YYYYMMDDHHmmSSZ`, always in UTC. */
  write: (ms: number): string => {
    const d = new Date(ms);
    return `D:${d.getUTCFullYear()}${two(d.getUTCMonth() + 1)}${two(d.getUTCDate())}${two(d.getUTCHours())}${two(d.getUTCMinutes())}${two(d.getUTCSeconds())}Z`;
  },

  /** A date as the file writes one, in milliseconds since the epoch; null where it is no date. */
  read: (text: string): number | null => {
    const parts = DATE.exec(text.trim());
    if (!parts) return null;
    const [, year, month = '01', day = '01', hour = '00', minute = '00', second = '00', sign] =
      parts;
    const numbers = [month, day, hour, minute, second].map(Number) as [
      number,
      number,
      number,
      number,
      number,
    ];
    const [m, d, h, min, s] = numbers;
    if (m < 1 || m > 12 || d < 1 || d > 31 || h > 23 || min > 59 || s > 59) return null;
    const offset =
      sign === '+' || sign === '-' ? Number(parts[8] ?? 0) * 60 + Number(parts[9] ?? 0) : 0;
    const local = Date.UTC(Number(year), m - 1, d, h, min, s);
    return local - (sign === '-' ? -offset : offset) * 60_000;
  },
} as const;
