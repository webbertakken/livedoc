// The body as plain values (docs/specs/034-text-documents/text-document.md "Domain language"): the paragraphs of a
// text document's main flow, in order.

/** One paragraph of the body: its characters, with tabs as `\t` and line breaks as `\n`. */
export type Paragraph = { readonly text: string };

export type Body = readonly Paragraph[];

export const Body = {
  of: (...texts: string[]): Body => texts.map((text) => ({ text })),
  /** The body's plain text, one line per paragraph. */
  plainText: (body: Body): string => body.map((p) => p.text).join('\n'),
  characters: (body: Body): number => body.reduce((n, p) => n + p.text.length, 0),
} as const;
