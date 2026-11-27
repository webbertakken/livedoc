// What a version changed, drawn (docs/specs/034-text-documents/review.md "Version history", Show changes): y-prosemirror
// draws a version as a `ychange` mark on text and a `ychange` attribute on every other node, `{ user, type, color }`,
// type `added` or `removed`. The version view's schema is the editor's with both added; the editor's own never has
// them, since only the version view draws a snapshot. Without them y-prosemirror's drawing would throw on the mark and
// delete the Yjs item it could not draw (sync-plugin.js, createTextNodesFromYText's catch).
import {
  Schema,
  type DOMOutputSpec,
  type MarkSpec,
  type Node as PmNode,
  type NodeSpec,
} from 'prosemirror-model';
import type { NodeView, NodeViewConstructor } from 'prosemirror-view';
import { TEXT_DOCUMENT_MARK_SPECS, TEXT_DOCUMENT_NODE_SPECS } from './text-document-schema';

/** The mark and the attribute's name, y-prosemirror's. */
export const YCHANGE = 'ychange';

export type YChange = { type: 'added' | 'removed'; colour: string | null };

const COLOUR = /^#[0-9a-f]{6}$/i;

/** A `ychange` value read safely: its kind, and its editor's colour where it is one. */
export function yChangeOf(value: unknown): YChange | null {
  if (typeof value !== 'object' || value === null) return null;
  const { type, color } = value as { type?: unknown; color?: unknown };
  if (type !== 'added' && type !== 'removed') return null;
  const light =
    typeof color === 'object' && color !== null ? (color as { light?: unknown }).light : undefined;
  return { type, colour: typeof light === 'string' && COLOUR.test(light) ? light : null };
}

/** The DOM attributes a change is drawn by: its kind, and its colour as a CSS variable. */
export function yChangeAttributes(change: YChange): Record<string, string> {
  return {
    'data-ychange': change.type,
    ...(change.colour ? { style: `--ychange-colour: ${change.colour}` } : {}),
  };
}

const isAttributes = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && !('nodeType' in value);

const joinStyle = (a: unknown, b: string | undefined) =>
  [typeof a === 'string' ? a : '', b ?? ''].filter(Boolean).join('; ');

function stampElement(dom: Node | null | undefined, change: YChange | null) {
  if (!dom || !('setAttribute' in dom)) return;
  const element = dom as HTMLElement;
  if (!change) {
    element.removeAttribute('data-ychange');
    element.style.removeProperty('--ychange-colour');
    return;
  }
  element.setAttribute('data-ychange', change.type);
  if (change.colour) element.style.setProperty('--ychange-colour', change.colour);
}

/** A node's drawing with its change stamped on its outer element. */
export function stampYChange(spec: DOMOutputSpec, change: YChange | null): DOMOutputSpec {
  if (!change) return spec;
  if (Array.isArray(spec)) {
    const [tag, second, ...rest] = spec as unknown[];
    const stamp = yChangeAttributes(change);
    if (isAttributes(second)) {
      return [
        tag,
        { ...second, ...stamp, style: joinStyle(second.style, stamp.style) || undefined },
        ...rest,
      ] as unknown as DOMOutputSpec;
    }
    const tail = spec.length > 1 ? [second, ...rest] : [];
    return [tag, stamp, ...tail] as unknown as DOMOutputSpec;
  }
  if (typeof spec === 'object' && spec !== null && 'dom' in spec) {
    stampElement(spec.dom, change);
    return spec;
  }
  if (typeof spec === 'object' && spec !== null) stampElement(spec as Node, change);
  return spec;
}

/** Every node spec given the `ychange` attribute, drawn on its outer element. */
export function withYChange(nodes: Readonly<Record<string, NodeSpec>>): Record<string, NodeSpec> {
  return Object.fromEntries(
    Object.entries(nodes).map(([name, spec]) => {
      if (name === 'doc' || name === 'text') return [name, spec];
      const toDOM = spec.toDOM;
      return [
        name,
        {
          ...spec,
          attrs: { ...spec.attrs, [YCHANGE]: { default: null } },
          ...(toDOM
            ? {
                toDOM: (node: PmNode) => stampYChange(toDOM(node), yChangeOf(node.attrs[YCHANGE])),
              }
            : {}),
        },
      ];
    }),
  );
}

/** The `ychange` mark: what a version added or removed, in its editor's colour. */
export const YCHANGE_MARK_SPEC: MarkSpec = {
  attrs: { user: { default: null }, type: { default: null }, color: { default: null } },
  inclusive: false,
  excludes: '',
  toDOM: (mark) => {
    const change = yChangeOf(mark.attrs);
    return ['span', change ? yChangeAttributes(change) : {}, 0];
  },
};

/** The version view's schema: the editor's, with a version's changes drawn. */
export const textDocumentVersionSchema = new Schema({
  nodes: withYChange(TEXT_DOCUMENT_NODE_SPECS),
  marks: { ...TEXT_DOCUMENT_MARK_SPECS, [YCHANGE]: YCHANGE_MARK_SPEC },
});

/** Node views whose outer element carries their node's change, as the schema's own drawing does. */
export function withYChangeViews(
  views: Readonly<Record<string, NodeViewConstructor>>,
): Record<string, NodeViewConstructor> {
  return Object.fromEntries(
    Object.entries(views).map(([name, make]): [string, NodeViewConstructor] => [
      name,
      (node, view, getPos, decorations, inner): NodeView => {
        const made = make(node, view, getPos, decorations, inner);
        stampElement(made.dom, yChangeOf(node.attrs[YCHANGE]));
        const update = made.update?.bind(made);
        if (!update) return made;
        made.update = (next, decorations, inner) => {
          const kept = update(next, decorations, inner);
          if (kept) stampElement(made.dom, yChangeOf(next.attrs[YCHANGE]));
          return kept;
        };
        return made;
      },
    ]),
  );
}
