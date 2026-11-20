// The families a text document's text is in (docs/specs/004-interface-design/fonts.md "Substitution"): its defaults',
// its styles' and its text's own. Those LiveDoc does not serve load from Google Fonts where it has them, as the
// document opens and once its text has settled after a change (anyone's edit may bring a family).
import { useEffect, type RefObject } from 'react';
import type { Node as PmNode } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';
import type * as Y from 'yjs';
import type { TextDocumentFormat } from '@livedoc/document';
import { TEXT_PROPERTY_MARK_OF } from '@livedoc/text-documents';
import { loadGoogleFamilies } from '@/lib/document-fonts/google-families';
import type { TextFormatting } from './text-document-formatting';
import { textFormattingReader } from './useTextDocumentFormatting';

/** How long the text rests after a change before its families are read again. */
export const FAMILIES_SETTLE_MS = 500;

export function documentFamiliesOf(doc: PmNode, { styles, defaults }: TextFormatting): string[] {
  const families = new Set<string>();
  const add = (font: unknown) => {
    if (typeof font === 'string' && font) families.add(font);
  };
  add(defaults.text.font);
  for (const style of styles) add(style.text.font);
  doc.descendants((node) => {
    for (const mark of node.marks)
      if (mark.type.name === TEXT_PROPERTY_MARK_OF.font)
        add((mark.attrs as { value: unknown }).value);
  });
  return [...families];
}

export function useGoogleDocumentFonts(
  view: EditorView | null,
  liveDoc: RefObject<Y.Doc | null>,
  format: TextDocumentFormat,
  subscribe: (listener: () => void) => () => void,
): void {
  useEffect(() => {
    if (!view) return;
    const read = textFormattingReader(view, liveDoc, format);
    const scan = () => void loadGoogleFamilies(documentFamiliesOf(view.state.doc, read()));
    let timer: ReturnType<typeof setTimeout> | undefined;
    scan();
    const unsubscribe = subscribe(() => {
      clearTimeout(timer);
      timer = setTimeout(scan, FAMILIES_SETTLE_MS);
    });
    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, [view, liveDoc, format, subscribe]);
}
