// The import report (docs/specs/034-text-documents/files-and-print.md "Import report"): what a read dropped and what
// it kept untouched, each by name and count. Nothing a read leaves out is ever silent.

export type DroppedReason =
  | 'macro'
  | 'signature'
  | 'thumbnail'
  | 'ole-object'
  | 'active-content'
  | 'field'
  | 'link'
  | 'external'
  | 'kept-limit'
  | 'layout-hint'
  | 'tab-stop'
  | 'column-width';

export type ReportItem = { readonly name: string; readonly count: number };

export type ImportReport = {
  readonly dropped: readonly (ReportItem & { readonly reason: DroppedReason })[];
  readonly kept: readonly ReportItem[];
};

/** Collects a read's drops and keeps, counted by name. */
export class ReportBuilder {
  readonly #dropped = new Map<string, { reason: DroppedReason; name: string; count: number }>();
  readonly #kept = new Map<string, number>();

  drop(reason: DroppedReason, name: string, count = 1): void {
    const key = `${reason}\u0000${name}`;
    const item = this.#dropped.get(key);
    if (item) item.count += count;
    else this.#dropped.set(key, { reason, name, count });
  }

  keep(name: string): void {
    this.#kept.set(name, (this.#kept.get(name) ?? 0) + 1);
  }

  build(): ImportReport {
    return {
      dropped: [...this.#dropped.values()],
      kept: [...this.#kept].map(([name, count]) => ({ name, count })),
    };
  }
}

const SAFE_LINK = /^(https?:|mailto:|#)/i;

/** Whether a link may stay: `http`, `https`, `mailto` or a place in the document. */
export const isSafeLink = (href: string): boolean => SAFE_LINK.test(href.trim());
