// Paragraph styles applied (docs/specs/034-text-documents/text-and-paragraphs.md "Paragraph styles"): Normal text,
// Title, Subtitle and Heading 1 to 6 set on every paragraph the selection touches, from the toolbar's Styles control,
// Format > Paragraph styles and ⌘⌥0 to ⌘⌥6. Normal text is no style of the paragraph's own; a style the document lacks
// is added from a new document's set first. Each application is one undo step, gives focus back and is counted.
import type { EditorState, Command } from 'prosemirror-state';
import type { Node as PmNode } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';
import type { TextDocumentFormat } from '@livedoc/document';
import { Styles, TextDocument, type Style, type StyleRole } from '@livedoc/text-documents';
import type {
  OfficeAction,
  OfficeActions,
  OfficeEntry,
  OfficeItem,
} from '@/lib/office/office-catalogue';
import type { OfficeChoices } from '@/components/office/OfficeChoiceMenu';
import { track } from '@/lib/telemetry';
import { readDomSelection } from './text-document-dom-selection';
import type { TextFormatting } from './text-document-formatting';

export type ParagraphStyleItem = {
  readonly role: StyleRole;
  readonly item: string;
  readonly label: string;
  // The heading's number in ⌘⌥1 to ⌘⌥6.
  readonly shortcutArg?: string;
};

const HEADINGS = [1, 2, 3, 4, 5, 6] as const;

export const PARAGRAPH_STYLE_ITEMS: readonly ParagraphStyleItem[] = [
  { role: 'normal', item: 'style-normal', label: 'Normal text' },
  { role: 'title', item: 'style-title', label: 'Title' },
  { role: 'subtitle', item: 'style-subtitle', label: 'Subtitle' },
  ...HEADINGS.map((n) => ({
    role: `heading${n}` as StyleRole,
    item: `style-heading-${n}`,
    label: `Heading ${n}`,
    shortcutArg: String(n),
  })),
];

const LABEL_OF_ROLE = new Map(PARAGRAPH_STYLE_ITEMS.map((s) => [s.role, s.label]));

// The Styles menu draws each style between these sizes, whatever its points (text-and-paragraphs.md, default).
const MENU_PX_MIN = 13;
const MENU_PX_MAX = 22;

/** The paragraphs the selection touches, each once, in order. */
function paragraphsOf(state: EditorState): { node: PmNode; pos: number }[] {
  const out: { node: PmNode; pos: number }[] = [];
  const seen = new Set<number>();
  for (const { $from, $to } of state.selection.ranges)
    state.doc.nodesBetween($from.pos, $to.pos, (node, pos) => {
      if (node.type.name !== 'paragraph') return true;
      if (!seen.has(pos)) out.push({ node, pos });
      seen.add(pos);
      return false;
    });
  if (out.length === 0) {
    const $from = state.selection.$from;
    if ($from.parent.type.name === 'paragraph')
      out.push({ node: $from.parent, pos: $from.before() });
  }
  return out;
}

// A paragraph's style as drawn: its own, or Normal text (undefined) for none or one the document lacks.
const drawnStyleOf = (node: PmNode, styles: readonly Style[]): Style | undefined => {
  const id = (node.attrs as { style: string | null }).style;
  const style = id ? Styles.byId(styles, id) : undefined;
  return style?.role === 'normal' ? undefined : style;
};

/** The style of the paragraphs the selection touches, as the Styles control names it; null when they differ. */
export function paragraphStyleNameOf(state: EditorState, styles: readonly Style[]): string | null {
  const names = new Set(
    paragraphsOf(state).map((p) => {
      const style = drawnStyleOf(p.node, styles);
      if (!style) return LABEL_OF_ROLE.get('normal')!;
      return (style.role && LABEL_OF_ROLE.get(style.role)) ?? style.name;
    }),
  );
  return names.size === 1 ? [...names][0]! : null;
}

/** One style on every paragraph the selection touches (null: Normal text), as one step. */
export function setParagraphStyle(id: string | null): Command {
  return (state, dispatch) => {
    const tr = state.tr;
    for (const { node, pos } of paragraphsOf(state))
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, style: id });
    dispatch?.(tr.scrollIntoView());
    return true;
  };
}

/** A style's row in the shortcut registry: ⌘⌥0 for Normal text, ⌘⌥1 to ⌘⌥6 for the headings by their number. */
export function paragraphStyleShortcut({
  role,
  shortcutArg,
}: Pick<ParagraphStyleItem, 'role' | 'shortcutArg'>): Pick<OfficeItem, 'shortcut' | 'shortcutArg'> {
  if (role === 'normal') return { shortcut: 'apply-normal-text-style' };
  return shortcutArg ? { shortcut: 'apply-heading-style-n', shortcutArg } : {};
}

function menuItem(
  { item, label, role, shortcutArg }: ParagraphStyleItem,
  formatting: TextFormatting,
): OfficeItem {
  const id = Styles.idOfRole(formatting.styles, role);
  const text = Styles.textPropsOf(formatting.styles, formatting.defaults, id);
  const px = Math.min(MENU_PX_MAX, Math.max(MENU_PX_MIN, ((text.size ?? 11) * 4) / 3));
  return {
    kind: 'item',
    id: item,
    label,
    level: 'edit',
    status: 'built',
    checkable: 'radio',
    ...paragraphStyleShortcut({ role, shortcutArg }),
    faceStyle: {
      fontSize: `${Math.round(px * 10) / 10}px`,
      ...(text.bold ? { fontWeight: 700 } : {}),
      ...(text.italic ? { fontStyle: 'italic' as const } : {}),
    },
  };
}

// Styles > Options, as Format > Paragraph styles > Options lists them (built with update to match).
const OPTIONS: OfficeEntry = {
  kind: 'submenu',
  id: 'styles-options',
  label: 'Options',
  entries: [
    {
      kind: 'item',
      id: 'save-default-styles',
      label: 'Save as my default styles',
      level: 'edit',
      status: 'comingSoon',
    },
    {
      kind: 'item',
      id: 'use-default-styles',
      label: 'Use my default styles',
      level: 'edit',
      status: 'comingSoon',
    },
    {
      kind: 'item',
      id: 'reset-styles',
      label: 'Reset styles',
      level: 'edit',
      status: 'comingSoon',
    },
  ],
};

/** Format > Paragraph styles' items and the toolbar's Styles control, for a session that writes. */
export function textDocumentParagraphStyleActions(
  view: EditorView | null,
  readFormatting: () => TextFormatting,
  addStyle: (style: Style) => void,
  format: TextDocumentFormat,
  { canEdit }: { canEdit: boolean },
): { actions: OfficeActions; choices: OfficeChoices | null } {
  if (!view || !canEdit) return { actions: {}, choices: null };
  const builtIn = TextDocument.blank({ format }).styles;
  const apply = (role: StyleRole) => {
    if (view.isDestroyed) return;
    readDomSelection(view);
    let id: string | null = null;
    if (role !== 'normal') {
      const { styles } = readFormatting();
      const held = Styles.idOfRole(styles, role);
      const added = held ? undefined : builtIn.find((s) => s.role === role);
      if (added) addStyle(added);
      id = held ?? added?.id ?? null;
    }
    setParagraphStyle(id)(view.state, view.dispatch);
    track('Element', 'Changed', 'TextDocumentParagraphStyle');
    view.focus();
  };
  const nameAtCaret = () =>
    view.isDestroyed ? null : paragraphStyleNameOf(view.state, readFormatting().styles);
  const actions: Record<string, OfficeAction> = {};
  for (const style of PARAGRAPH_STYLE_ITEMS)
    actions[style.item] = {
      run: () => apply(style.role),
      get checked() {
        return nameAtCaret() === style.label;
      },
    };
  const formatting = readFormatting();
  const entries: OfficeEntry[] = [
    ...PARAGRAPH_STYLE_ITEMS.map((style) => menuItem(style, formatting)),
    { kind: 'separator' },
    OPTIONS,
  ];
  return { actions, choices: { styles: { read: nameAtCaret, entries, actions } } };
}
