// Update '<style>' to match (docs/specs/034-text-documents/text-and-paragraphs.md "Update to match"): the look the
// text at the caret and its paragraph give, and the paragraph conformed to its style afterwards: the style set on it,
// and its own formatting of the look's properties dropped, so it draws wholly in the style.
import type { Command, EditorState } from 'prosemirror-state';
import {
  LOOK_PARAGRAPH_KEYS,
  LOOK_TEXT_KEYS,
  PLAIN_LOOK,
  StyleLooks,
  Styles,
  TEXT_PROPERTY_MARK_OF,
  type ParagraphProps,
  type StyleLook,
  type TextProps,
} from '@livedoc/text-documents';
import { textPropsAtCaret, type TextFormatting } from './text-document-formatting';

const lookKeysDropped = <T extends object>(props: T | null, keys: readonly string[]): T | null => {
  if (!props) return null;
  const kept = Object.entries(props).filter(([k, v]) => v !== undefined && !keys.includes(k));
  return kept.length > 0 ? (Object.fromEntries(kept) as T) : null;
};

/** The look the text at the caret (where the selection starts) and its paragraph give a style. */
export function lookAtCaret(state: EditorState, formatting: TextFormatting): StyleLook {
  const { styles, defaults } = formatting;
  const paragraph = state.selection.$from.parent;
  const attrs = paragraph.attrs as { style: string | null; props: ParagraphProps | null };
  const styleLook = StyleLooks.of(
    styles,
    defaults,
    attrs.style ?? Styles.idOfRole(styles, 'normal'),
  );
  const text = textPropsAtCaret(state, formatting);
  const own = attrs.props ?? {};
  const textLook = Object.fromEntries(
    LOOK_TEXT_KEYS.map((key) => [key, text[key] ?? PLAIN_LOOK.text[key]]),
  ) as StyleLook['text'];
  return {
    text: { ...textLook, color: textLook.color.toLowerCase() },
    paragraph: Object.fromEntries(
      LOOK_PARAGRAPH_KEYS.map((key) => [key, own[key] ?? styleLook.paragraph[key]]),
    ) as StyleLook['paragraph'],
  };
}

/**
 * The paragraph at the caret takes the style (null: Normal text) and draws wholly in it: its own formatting of the
 * look's properties, its paragraph's and its text's, is dropped.
 */
export function conformParagraph(id: string | null): Command {
  return (state, dispatch) => {
    const { $from } = state.selection;
    const node = $from.parent;
    if (node.type.name !== 'paragraph') return false;
    const pos = $from.before();
    const attrs = node.attrs as { props: ParagraphProps | null; text: TextProps | null };
    const tr = state.tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      style: id,
      props: lookKeysDropped(attrs.props, LOOK_PARAGRAPH_KEYS),
      text: lookKeysDropped(attrs.text, LOOK_TEXT_KEYS),
    });
    for (const key of LOOK_TEXT_KEYS)
      tr.removeMark(
        pos + 1,
        pos + 1 + node.content.size,
        state.schema.marks[TEXT_PROPERTY_MARK_OF[key]],
      );
    dispatch?.(tr.scrollIntoView());
    return true;
  };
}
