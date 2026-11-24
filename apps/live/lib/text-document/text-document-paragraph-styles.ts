// Paragraph styles applied and updated (docs/specs/034-text-documents/text-and-paragraphs.md "Paragraph styles",
// "Update to match", "Default styles"): Normal text, Title, Subtitle and Heading 1 to 6 set on every paragraph the
// selection touches, from the toolbar's Styles control, Format > Paragraph styles and ⌘⌥0 to ⌘⌥6; a style updated to
// match the caret; the person's default styles saved, used or reset. Normal text is no style of the paragraph's own;
// a style the document lacks is added from a new document's set first. Each change is one undo step, gives focus
// back and is counted.
import type { EditorState, Command } from 'prosemirror-state';
import type { Node as PmNode } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';
import type { TextDocumentFormat } from '@livedoc/document';
import {
  DefaultStyles,
  StyleLooks,
  Styles,
  TextDocument,
  type Style,
  type StyleRole,
} from '@livedoc/text-documents';
import type {
  OfficeAction,
  OfficeActions,
  OfficeEntry,
  OfficeItem,
  OfficeSubmenu,
} from '@/lib/office/office-catalogue';
import type { OfficeChoices } from '@/components/office/OfficeChoiceMenu';
import { track } from '@/lib/telemetry';
import { readDomSelection } from './text-document-dom-selection';
import { selectedParagraphs } from './text-document-paragraphs';
import type { TextFormatting } from './text-document-formatting';
import { startUndoStep } from './text-document-undo';
import { conformParagraph, lookAtCaret } from './text-document-update-style';

export type ParagraphStyleItem = {
  readonly role: StyleRole;
  // Its Apply item, and its Update '<style>' to match item.
  readonly item: string;
  readonly update: string;
  readonly label: string;
  // The heading's number in ⌘⌥1 to ⌘⌥6.
  readonly shortcutArg?: string;
};

const HEADINGS = [1, 2, 3, 4, 5, 6] as const;

export const PARAGRAPH_STYLE_ITEMS: readonly ParagraphStyleItem[] = [
  { role: 'normal', item: 'style-normal', update: 'update-style-normal', label: 'Normal text' },
  { role: 'title', item: 'style-title', update: 'update-style-title', label: 'Title' },
  { role: 'subtitle', item: 'style-subtitle', update: 'update-style-subtitle', label: 'Subtitle' },
  ...HEADINGS.map((n) => ({
    role: `heading${n}` as StyleRole,
    item: `style-heading-${n}`,
    update: `update-style-heading-${n}`,
    label: `Heading ${n}`,
    shortcutArg: String(n),
  })),
];

const LABEL_OF_ROLE = new Map(PARAGRAPH_STYLE_ITEMS.map((s) => [s.role, s.label]));

// The Styles menu draws each style between these sizes, whatever its points (text-and-paragraphs.md, default).
const MENU_PX_MIN = 13;
const MENU_PX_MAX = 22;

// A paragraph's style as drawn: its own, or Normal text (undefined) for none or one the document lacks.
const drawnStyleOf = (node: PmNode, styles: readonly Style[]): Style | undefined => {
  const id = (node.attrs as { style: string | null }).style;
  const style = id ? Styles.byId(styles, id) : undefined;
  return style?.role === 'normal' ? undefined : style;
};

/** The style of the paragraphs the selection touches, as the Styles control names it; null when they differ. */
export function paragraphStyleNameOf(state: EditorState, styles: readonly Style[]): string | null {
  const names = new Set(
    selectedParagraphs(state).map((p) => {
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
    for (const { node, pos } of selectedParagraphs(state))
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

/** A style's look in a menu: its weight and slant at its size, held between MENU_PX_MIN and MENU_PX_MAX. */
function faceOf(role: StyleRole, formatting: TextFormatting): OfficeItem['faceStyle'] {
  const id = Styles.idOfRole(formatting.styles, role);
  const text = Styles.textPropsOf(formatting.styles, formatting.defaults, id);
  const px = Math.min(MENU_PX_MAX, Math.max(MENU_PX_MIN, ((text.size ?? 11) * 4) / 3));
  return {
    fontSize: `${Math.round(px * 10) / 10}px`,
    ...(text.bold ? { fontWeight: 700 } : {}),
    ...(text.italic ? { fontStyle: 'italic' as const } : {}),
  };
}

/** A style's submenu: Apply '<style>' with its shortcut, and Update '<style>' to match, as Google's. */
export function paragraphStyleEntries(style: ParagraphStyleItem): OfficeEntry[] {
  return [
    {
      kind: 'item',
      id: style.item,
      label: `Apply '${style.label}'`,
      level: 'edit',
      status: 'built',
      keywords: [style.label],
      ...paragraphStyleShortcut(style),
    },
    {
      kind: 'item',
      id: style.update,
      label: `Update '${style.label}' to match`,
      level: 'edit',
      status: 'built',
      keywords: [style.label],
    },
  ];
}

// Styles > Options and Format > Paragraph styles > Options (text-and-paragraphs.md "Default styles").
export const STYLE_OPTIONS: OfficeSubmenu = {
  kind: 'submenu',
  id: 'style-options',
  label: 'Options',
  entries: [
    {
      kind: 'item',
      id: 'save-default-styles',
      label: 'Save as my default styles',
      level: 'edit',
      status: 'built',
    },
    {
      kind: 'item',
      id: 'use-default-styles',
      label: 'Use my default styles',
      level: 'edit',
      status: 'built',
    },
    { kind: 'item', id: 'reset-styles', label: 'Reset styles', level: 'edit', status: 'built' },
  ],
};

/**
 * The id of the document's style of `role`, a new document's added first when the document lacks it; null for Normal
 * text, which is no style of the paragraph's own.
 */
export function ensureRoleStyle(
  role: StyleRole,
  {
    styles,
    format,
    add,
  }: { styles: readonly Style[]; format: TextDocumentFormat; add: (style: Style) => void },
): string | null {
  if (role === 'normal') return null;
  const held = Styles.idOfRole(styles, role);
  if (held) return held;
  const added = TextDocument.blank({ format }).styles.find((s) => s.role === role);
  if (added) add(added);
  return added?.id ?? null;
}

/** How the styles bound here reach the document's live state and the person's preferences. */
export type ParagraphStyleDeps = {
  view: EditorView | null;
  readFormatting: () => TextFormatting;
  // A style the document lacks, added; styles set as one undo step with the change that follows.
  styles: { add: (style: Style) => void; set: (styles: readonly Style[]) => void };
  // The person's default styles.
  defaultStyles: { read: () => DefaultStyles; save: (saved: DefaultStyles) => void };
  format: TextDocumentFormat;
  canEdit: boolean;
};

/** Format > Paragraph styles' items and the toolbar's Styles control, for a session that writes. */
export function textDocumentParagraphStyleActions({
  view,
  readFormatting,
  styles: writer,
  defaultStyles,
  format,
  canEdit,
}: ParagraphStyleDeps): { actions: OfficeActions; choices: OfficeChoices | null } {
  if (!view || !canEdit) return { actions: {}, choices: null };
  // Runs a change from the writing's selection there is now, then gives the writing focus back.
  const fromWriting = (change: () => void) => () => {
    if (view.isDestroyed) return;
    readDomSelection(view);
    change();
    view.focus();
  };
  const apply = (role: StyleRole) => {
    const id = ensureRoleStyle(role, {
      styles: readFormatting().styles,
      format,
      add: writer.add,
    });
    setParagraphStyle(id)(view.state, view.dispatch);
    track('Element', 'Changed', 'TextDocumentParagraphStyle');
  };
  // The roles' looks set, every other style keeping its own, as one undo step.
  const restyle = (looks: Parameters<typeof StyleLooks.restyle>[3]) => {
    const { styles, defaults } = readFormatting();
    const changed = StyleLooks.restyle(styles, defaults, format, looks);
    startUndoStep(view);
    writer.set(changed);
    return [...styles.filter((s) => !changed.some((c) => c.id === s.id)), ...changed];
  };
  const update = (role: StyleRole) => {
    const after = restyle({ [role]: lookAtCaret(view.state, readFormatting()) });
    const id = role === 'normal' ? null : (Styles.idOfRole(after, role) ?? null);
    conformParagraph(id)(view.state, view.dispatch);
    track('Element', 'Changed', 'TextDocumentStyleUpdated');
  };
  const nameAtCaret = () =>
    view.isDestroyed ? null : paragraphStyleNameOf(view.state, readFormatting().styles);
  const actions: Record<string, OfficeAction> = {
    'save-default-styles': {
      run: fromWriting(() => {
        const { styles, defaults } = readFormatting();
        defaultStyles.save(DefaultStyles.of(styles, defaults));
        track('UI', 'Changed', 'TextDocumentDefaultStyles');
      }),
    },
    'use-default-styles': {
      run: fromWriting(() => {
        restyle(DefaultStyles.looks(defaultStyles.read()));
        track('Element', 'Changed', 'TextDocumentStylesUsed');
      }),
    },
    'reset-styles': {
      run: fromWriting(() => {
        restyle(DefaultStyles.looks({}));
        track('Element', 'Changed', 'TextDocumentStylesReset');
      }),
    },
  };
  for (const style of PARAGRAPH_STYLE_ITEMS) {
    actions[style.item] = {
      run: fromWriting(() => apply(style.role)),
      get checked() {
        return nameAtCaret() === style.label;
      },
    };
    actions[style.update] = { run: fromWriting(() => update(style.role)) };
  }
  const formatting = readFormatting();
  // Each style a row drawn in its look: a press applies it, its submenu holds Apply and Update to match.
  const entries: OfficeEntry[] = [
    ...PARAGRAPH_STYLE_ITEMS.map((style): OfficeSubmenu => ({
      kind: 'submenu',
      id: `${style.item}-menu`,
      label: style.label,
      run: style.item,
      checkable: 'radio',
      faceStyle: faceOf(style.role, formatting),
      entries: paragraphStyleEntries(style),
    })),
    { kind: 'separator' },
    STYLE_OPTIONS,
  ];
  return { actions, choices: { styles: { read: nameAtCaret, entries, actions } } };
}
