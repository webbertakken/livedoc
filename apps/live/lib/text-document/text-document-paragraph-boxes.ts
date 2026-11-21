// Paragraph boxes joined (docs/specs/034-text-documents/text-and-paragraphs.md "Borders and shading"): adjacent
// paragraphs with the same borders, padding and background share one box, as both formats draw them. The upper one
// loses its bottom border (Between's line in its place, where set) and the lower one its top border; the space between
// them lies inside the box. Worked out again only when the writing changes.
import type { Node as PmNode } from 'prosemirror-model';
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { canonical, Styles, type ParagraphProps } from '@livedoc/text-documents';
import type { TextFormatting } from './text-document-formatting';
import { borderCss } from './text-document-style-sheet';
import { changesTextOnly } from './text-document-text-edits';

type Box = { key: string; props: ParagraphProps };

const ownOf = (node: PmNode): ParagraphProps =>
  (node.attrs as { props: ParagraphProps | null }).props ?? {};

/** The box a paragraph draws in, by its style and its own formatting; null when it draws none. */
function boxReader(formatting: TextFormatting) {
  const { styles, defaults } = formatting;
  const normal = Styles.idOfRole(styles, 'normal');
  const byStyle = new Map<string | undefined, ParagraphProps>();
  return (node: PmNode): Box | null => {
    const style = (node.attrs as { style: string | null }).style ?? normal;
    let inherited = byStyle.get(style);
    if (!inherited) {
      inherited = Styles.paragraphPropsOf(styles, defaults, style);
      byStyle.set(style, inherited);
    }
    const props = { ...inherited, ...ownOf(node) };
    if (!props.borders && !props.shading) return null;
    return { key: canonical({ borders: props.borders, shading: props.shading }), props };
  };
}

const pt = (value: number | undefined) => `${value ?? 0}pt`;

/** The decorations that join each run of adjacent paragraphs drawing the same box. */
export function paragraphBoxJoins(doc: PmNode, formatting: TextFormatting): DecorationSet {
  const boxOf = boxReader(formatting);
  const decorations: Decoration[] = [];
  let previous: { box: Box | null; pos: number; node: PmNode } | null = null;
  doc.forEach((node, pos) => {
    const box = node.type.name === 'paragraph' ? boxOf(node) : null;
    if (box && previous?.box && previous.box.key === box.key) {
      const { props } = previous.box;
      decorations.push(
        Decoration.node(previous.pos, previous.pos + previous.node.nodeSize, {
          class: 'text-document-box-joined-below',
          style: `border-bottom: ${borderCss(props.borders?.between)}; padding-bottom: ${pt(props.spaceAfter)}; margin-bottom: 0`,
        }),
        Decoration.node(pos, pos + node.nodeSize, {
          class: 'text-document-box-joined-above',
          style: `border-top: none; padding-top: ${pt(box.props.spaceBefore)}; margin-top: 0`,
        }),
      );
    }
    previous = { box, pos, node };
  });
  return decorations.length > 0 ? DecorationSet.create(doc, decorations) : DecorationSet.empty;
}

const key = new PluginKey<DecorationSet>('textDocumentParagraphBoxes');

export function paragraphBoxesPlugin(readFormatting: () => TextFormatting): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key,
    state: {
      init: (_config, state) => paragraphBoxJoins(state.doc, readFormatting()),
      // An edit of text keeps every paragraph's box (performance.md "A keystroke's frame").
      apply: (tr, joins) =>
        !tr.docChanged
          ? joins
          : changesTextOnly(tr)
            ? joins.map(tr.mapping, tr.doc)
            : paragraphBoxJoins(tr.doc, readFormatting()),
    },
    props: { decorations: (state) => key.getState(state) },
  });
}
