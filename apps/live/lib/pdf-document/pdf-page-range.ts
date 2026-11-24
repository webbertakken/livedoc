// A range of pages as a person types it (docs/specs/035-pdf-documents/files-print-and-sync.md "Printing": Pages):
// numbers from 1 and runs "1-3", joined by commas, in any order; each page once, in the file's order. Pure.

const PART = /^(\d+)(?:\s*[-\u2013]\s*(\d+))?$/u;

/** The pages' indexes (from 0), ascending and each once; null where the text is no range of pages 1 to `count`. */
export function parsePageRange(text: string, count: number): number[] | null {
  const parts = text.split(',').map((part) => part.trim());
  if (parts.every((part) => part === '')) return null;
  const pages = new Set<number>();
  for (const part of parts) {
    if (part === '') continue;
    const found = PART.exec(part);
    if (!found) return null;
    const from = Number(found[1]);
    const to = found[2] === undefined ? from : Number(found[2]);
    if (from < 1 || to < from || to > count) return null;
    for (let page = from; page <= to; page += 1) pages.add(page - 1);
  }
  return [...pages].sort((a, b) => a - b);
}

/** Said under the field for a range that is none (files-print-and-sync.md "Printing"). */
export const pageRangeProblem = (count: number): string => `Pages like 1-3, 8, from 1 to ${count}.`;
