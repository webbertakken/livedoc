// Format > Align & indent and Format > Line & paragraph spacing, with the toolbar's Align, Line & paragraph spacing,
// Decrease indent and Increase indent, bound to the writing (docs/specs/034-text-documents/text-and-paragraphs.md
// "Alignment and indents", "Spacing and keep rules"). Each runs from the selection there is now, as one undo step,
// gives focus back to the writing and is counted.
import type { EditorView } from 'prosemirror-view';
import type { IconPrim } from '@livedoc/icons';
import {
  lucideAlignCenter,
  lucideAlignJustify,
  lucideAlignLeft,
  lucideAlignRight,
} from '@livedoc/icons/lucide';
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
import {
  alignmentOf,
  INDENT_STEP_PT,
  isKeepOn,
  KEEP_RULES,
  LINE_SPACINGS,
  lineSpacingOf,
  setAlignment,
  setLineSpacing,
  spaceOf,
  stepIndent,
  toggleKeep,
  toggleSpace,
  type Alignment,
  type SpaceSide,
} from './text-document-paragraph-formatting';

export type AlignmentItem = {
  readonly item: string;
  readonly label: string;
  readonly align: Alignment;
  readonly shortcut: string;
  readonly icon: readonly IconPrim[];
};

export const ALIGNMENTS: readonly AlignmentItem[] = [
  {
    item: 'align-left',
    label: 'Left',
    align: 'start',
    shortcut: 'left-align',
    icon: lucideAlignLeft,
  },
  {
    item: 'align-centre',
    label: 'Centre',
    align: 'center',
    shortcut: 'center-align',
    icon: lucideAlignCenter,
  },
  {
    item: 'align-right',
    label: 'Right',
    align: 'end',
    shortcut: 'right-align',
    icon: lucideAlignRight,
  },
  {
    item: 'align-justified',
    label: 'Justified',
    align: 'justify',
    shortcut: 'justify',
    icon: lucideAlignJustify,
  },
];

/** The items this binds besides the alignments, by id (Format > Align & indent and the toolbar). */
export const INDENT_ITEMS = ['indent-increase', 'indent-decrease', 'indentation-options'] as const;

/** Add or Remove space before and after a paragraph, and Custom spacing, by id. */
export const SPACE_ITEMS: readonly {
  readonly item: string;
  readonly side: SpaceSide;
  readonly words: string;
}[] = [
  { item: 'space-before', side: 'spaceBefore', words: 'space before paragraph' },
  { item: 'space-after', side: 'spaceAfter', words: 'space after paragraph' },
];
export const CUSTOM_SPACING_ITEM = 'custom-spacing';
/** Format > Paragraph styles > Borders and shading. */
export const BORDERS_ITEM = 'borders-and-shading';

const built = (
  id: string,
  label: string,
  extra: Pick<OfficeItem, 'checkable' | 'keywords'> = {},
): OfficeItem => ({ kind: 'item', id, label, level: 'edit', status: 'built', ...extra });

/** Format > Line & paragraph spacing, which the toolbar's control opens too, in Google's order. */
export const LINE_SPACING_ENTRIES: readonly OfficeEntry[] = [
  ...LINE_SPACINGS.map((s) => built(s.item, s.label, { checkable: 'radio' })),
  { kind: 'separator' },
  ...SPACE_ITEMS.map((s) => built(s.item, `Add ${s.words}`)),
  built(CUSTOM_SPACING_ITEM, 'Custom spacing'),
  { kind: 'separator' },
  built('keep-with-next', 'Keep with next', { checkable: 'checkbox' }),
  built('keep-lines-together', 'Keep lines together', { checkable: 'checkbox' }),
  built('prevent-single-lines', 'Prevent single lines', {
    checkable: 'checkbox',
    keywords: ['widow', 'orphan'],
  }),
];

const ICON_OF_LABEL = new Map(ALIGNMENTS.map((a) => [a.label, a.icon]));

export function textDocumentParagraphActions({
  view,
  readFormatting,
  canEdit,
  openIndentation,
  openSpacing,
  openBorders,
}: {
  view: EditorView | null;
  readFormatting: () => TextFormatting;
  canEdit: boolean;
  // Opens the Indentation options dialog for the paragraphs the selection touches.
  openIndentation: () => void;
  // Opens the Custom spacing dialog for them.
  openSpacing: () => void;
  // Opens the Borders and shading dialog for them.
  openBorders: () => void;
}): { actions: OfficeActions; choices: OfficeChoices | null } {
  if (!view || !canEdit) return { actions: {}, choices: null };
  const fromWriting = (change: () => void) => () => {
    if (view.isDestroyed) return;
    readDomSelection(view);
    change();
    view.focus();
  };
  // A dialog opens on the selection there is now; the writing keeps it while the dialog is open.
  const opening = (open: () => void) => () => {
    if (view.isDestroyed) return;
    readDomSelection(view);
    open();
  };
  const alignedAs = () => (view.isDestroyed ? null : alignmentOf(view.state, readFormatting()));
  const actions: Record<string, OfficeAction> = {
    'indent-increase': {
      run: fromWriting(() => {
        stepIndent(readFormatting(), INDENT_STEP_PT)(view.state, view.dispatch);
        track('Element', 'Changed', 'TextDocumentIndent');
      }),
    },
    'indent-decrease': {
      run: fromWriting(() => {
        stepIndent(readFormatting(), -INDENT_STEP_PT)(view.state, view.dispatch);
        track('Element', 'Changed', 'TextDocumentIndent');
      }),
    },
    'indentation-options': { run: opening(openIndentation) },
    [CUSTOM_SPACING_ITEM]: { run: opening(openSpacing) },
    [BORDERS_ITEM]: { run: opening(openBorders) },
  };
  for (const spacing of LINE_SPACINGS)
    actions[spacing.item] = {
      run: fromWriting(() => {
        setLineSpacing(readFormatting(), spacing.value)(view.state, view.dispatch);
        track('Element', 'Changed', 'TextDocumentLineSpacing');
      }),
      get checked() {
        return !view.isDestroyed && lineSpacingOf(view.state, readFormatting()) === spacing.value;
      },
    };
  for (const space of SPACE_ITEMS)
    actions[space.item] = {
      run: fromWriting(() => {
        toggleSpace(readFormatting(), space.side)(view.state, view.dispatch);
        track('Element', 'Changed', 'TextDocumentParagraphSpace');
      }),
      // Add where the paragraphs have none, Remove where they have some, as Google's.
      get label() {
        const none = view.isDestroyed || spaceOf(view.state, readFormatting(), space.side) === 0;
        return `${none ? 'Add' : 'Remove'} ${space.words}`;
      },
    };
  for (const rule of KEEP_RULES)
    actions[rule.item] = {
      run: fromWriting(() => {
        toggleKeep(readFormatting(), rule.key)(view.state, view.dispatch);
        track('Element', 'Changed', 'TextDocumentKeepRule');
      }),
      get checked() {
        return !view.isDestroyed && isKeepOn(view.state, readFormatting(), rule.key);
      },
    };
  for (const alignment of ALIGNMENTS)
    actions[alignment.item] = {
      run: fromWriting(() => {
        setAlignment(readFormatting(), alignment.align)(view.state, view.dispatch);
        track('Element', 'Changed', 'TextDocumentAlign');
      }),
      get checked() {
        return alignedAs() === alignment.align;
      },
    };
  const entries: OfficeEntry[] = ALIGNMENTS.map((a) => ({
    kind: 'item',
    id: a.item,
    label: a.label,
    level: 'edit',
    status: 'built',
    checkable: 'radio',
    shortcut: a.shortcut,
  }));
  return {
    actions,
    choices: {
      // The toolbar's Line & paragraph spacing: the Format menu's submenu, from its catalogue.
      'line-spacing': { read: () => null, entries: LINE_SPACING_ENTRIES, actions },
      align: {
        // The alignment there is; none when the paragraphs differ, drawn as Left.
        read: () => ALIGNMENTS.find((a) => a.align === alignedAs())?.label ?? null,
        entries,
        actions,
        iconOf: (value) => ICON_OF_LABEL.get(value ?? 'Left') ?? lucideAlignLeft,
      },
    },
  };
}
