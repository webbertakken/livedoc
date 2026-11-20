// Format > Align & indent and the toolbar's Align, Decrease indent and Increase indent bound to the writing
// (docs/specs/034-text-documents/text-and-paragraphs.md "Alignment and indents"). Each runs from the selection there
// is now, as one undo step, gives focus back to the writing and is counted.
import type { EditorView } from 'prosemirror-view';
import type { IconPrim } from '@livedoc/icons';
import {
  lucideAlignCenter,
  lucideAlignJustify,
  lucideAlignLeft,
  lucideAlignRight,
} from '@livedoc/icons/lucide';
import type { OfficeAction, OfficeActions, OfficeEntry } from '@/lib/office/office-catalogue';
import type { OfficeChoices } from '@/components/office/OfficeChoiceMenu';
import { track } from '@/lib/telemetry';
import { readDomSelection } from './text-document-dom-selection';
import type { TextFormatting } from './text-document-formatting';
import {
  alignmentOf,
  INDENT_STEP_PT,
  setAlignment,
  stepIndent,
  type Alignment,
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

const ICON_OF_LABEL = new Map(ALIGNMENTS.map((a) => [a.label, a.icon]));

export function textDocumentParagraphActions({
  view,
  readFormatting,
  canEdit,
  openIndentation,
}: {
  view: EditorView | null;
  readFormatting: () => TextFormatting;
  canEdit: boolean;
  // Opens the Indentation options dialog for the paragraphs the selection touches.
  openIndentation: () => void;
}): { actions: OfficeActions; choices: OfficeChoices | null } {
  if (!view || !canEdit) return { actions: {}, choices: null };
  const fromWriting = (change: () => void) => () => {
    if (view.isDestroyed) return;
    readDomSelection(view);
    change();
    view.focus();
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
    'indentation-options': {
      run: () => {
        if (view.isDestroyed) return;
        readDomSelection(view);
        openIndentation();
      },
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
