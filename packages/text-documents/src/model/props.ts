// Direct formatting (docs/specs/034-text-documents/standard-mapping.md "What the model holds" and "The model"): the
// text and paragraph properties both formats map onto, and the file's own formatting element kept beside them.
import type { KeptXml } from '@livedoc/office-packages';

/** A run's or a style's text formatting; `false` overrides a style's `true`, absent inherits. */
export type TextProps = {
  readonly font?: string;
  /** Points. */
  readonly size?: number;
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly underline?: boolean;
  readonly strike?: boolean;
  readonly vertical?: 'super' | 'sub' | 'baseline';
  /** `#rrggbb`. */
  readonly color?: string;
  readonly highlight?: string;
  readonly smallCaps?: boolean;
  readonly transform?: 'uppercase' | 'lowercase' | 'capitalize' | 'none';
};

export type LineHeight =
  | { readonly rule: 'multiple'; readonly value: number }
  | { readonly rule: 'exact' | 'atLeast'; readonly pt: number };

/** A paragraph's or a style's paragraph formatting; lengths in points. */
export type ParagraphProps = {
  readonly align?: 'start' | 'center' | 'end' | 'justify';
  readonly indentStart?: number;
  readonly indentEnd?: number;
  /** The first line's indent; negative is a hanging indent. */
  readonly indentFirst?: number;
  readonly spaceBefore?: number;
  readonly spaceAfter?: number;
  readonly lineHeight?: LineHeight;
  readonly keepWithNext?: boolean;
  readonly keepTogether?: boolean;
  /** Prevent single lines: widows and orphans of two. */
  readonly widowControl?: boolean;
  readonly pageBreakBefore?: boolean;
  /** A heading's outline level, 1 to 10 (Heading 1 is 1). */
  readonly outlineLevel?: number;
};

/**
 * The file's own formatting element for a paragraph, run, style, list or section: written back as it was while the
 * model's values read from it (`read`, canonical JSON) are unchanged, else rebuilt from the model with `residue`, its
 * unmapped children. `name` is the ODF automatic style's name, where the element is one.
 */
export type KeptProperties = {
  readonly xml: KeptXml;
  readonly read: string;
  readonly residue: readonly KeptXml[];
  readonly name?: string;
  /** ODF: the page layout a section's master page names. */
  readonly layout?: string;
};

/** JSON with keys sorted and undefined left out, so equal values give equal text. */
export function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>)
            .filter(([, x]) => x !== undefined)
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
        )
      : v,
  );
}

/** Whether a kept element still stands for these values. */
export const keptStillHolds = (kept: KeptProperties | undefined, values: unknown): boolean =>
  kept !== undefined && kept.read === canonical(values);

/** The object without its undefined fields. */
export function compact<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

export const isEmpty = (value: object): boolean => Object.keys(compact(value)).length === 0;
