// Where a golden file lives (docs/specs/024-agents/document-views.md, VW52).
export function golden(name: string): string {
  return new URL(`./golden/${name}`, import.meta.url).pathname;
}
