// The outline's headings (docs/specs/034-text-documents/links-and-navigation.md "The outline"): the paragraphs with an
// outline level from 1 to 6, their own or their paragraph style's through its parents, in the order they are written.
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { Styles, type Style } from '@livedoc/text-documents';

export type TextDocumentHeading = {
  level: number;
  text: string;
  // Where its text starts, for the caret.
  pos: number;
};

export const OUTLINE_MAX_LEVEL = 6;
export const UNTITLED_HEADING = 'Untitled heading';

type ParagraphAttributes = { style: string | null; props: { outlineLevel?: unknown } | null };

function levelOf(attrs: ParagraphAttributes, styles: readonly Style[]): number | undefined {
  const own = attrs.props?.outlineLevel;
  if (typeof own === 'number') return own;
  return Styles.outlineLevel(styles, attrs.style ?? undefined);
}

/** A block's heading level, 1 to 6; none when it is no heading. */
export function headingLevel(block: ProseMirrorNode, styles: readonly Style[]): number | null {
  if (block.type.name !== 'paragraph') return null;
  const level = levelOf(block.attrs as ParagraphAttributes, styles);
  return level !== undefined && level >= 1 && level <= OUTLINE_MAX_LEVEL ? level : null;
}

export function textDocumentHeadings(
  doc: ProseMirrorNode,
  styles: readonly Style[],
): TextDocumentHeading[] {
  const headings: TextDocumentHeading[] = [];
  doc.forEach((block, offset) => {
    const level = headingLevel(block, styles);
    if (level === null) return;
    headings.push({ level, text: block.textContent.trim() || UNTITLED_HEADING, pos: offset + 1 });
  });
  return headings;
}
