'use client';

// The tools that mark a PDF's text (docs/specs/035-pdf-documents/marks.md "Making a mark"; reading-surface.md "The
// toolbar"): the tool in hand, Select, one of the four text marks, the Drawing, a shape tool, Text or Callout, and
// what takes it; the Highlight control and the tools behind its chevron (the Shape and Text controls' are
// usePdfToolControl's, the Stamp control's usePdfStampTool's); the selection's mark items of the context menu and the selection bar; the tools' keys; and the
// making of a mark, one step of the person's undo. Marks are Reviewing's: while `marking` is off the tool in
// hand is Select and nothing marks.
import { useCallback, useMemo, useState, type KeyboardEvent } from 'react';
import type { IconPrim } from '@livedoc/icons';
import { lucideHighlighter, lucideStrikethrough, lucideUnderline } from '@livedoc/icons/lucide';
import {
  TEXT_MARK_KINDS,
  type MarkKind,
  type Stroke,
  type TextMarkKind,
  type TextSelection,
} from '@livedoc/pdf-documents';
import type { OfficeChoices } from '@/components/office/OfficeChoiceMenu';
import type { OfficeColours } from '@/components/office/OfficeColourControl';
import { debugLog } from '@/lib/debug-log';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import { track } from '@/lib/telemetry';
import {
  HIGHLIGHT_SELECTION,
  STRIKETHROUGH_SELECTION,
  UNDERLINE_SELECTION,
} from './pdf-context-menu';
import {
  TOOL_DRAWING,
  TOOL_HIGHLIGHT,
  TOOL_SELECT,
  TOOL_SQUIGGLY,
  TOOL_STRIKETHROUGH,
  TOOL_UNDERLINE,
} from './pdf-menus';
import { PDF_TOOL_KEYS } from './pdf-shortcuts';
import { TOO_MANY_MARKS_COPY } from './pdf-surface-copy';
import { addTextMark, TEXT_MARK_NAMES } from './pdf-text-mark';
import {
  HELD_TEXT_MARKS,
  isHeldTextMark,
  setTextMarkPick,
  useTextMarkPick,
  type HeldTextMark,
} from './pdf-text-mark-pick';
import { DRAWING_WIDTH_PT } from './pdf-drawing';
import { setMarkColour, useMarkLooks } from './pdf-mark-looks';
import { SHAPE_NAMES, SHAPE_WIDTH_PT } from './pdf-shape';
import { isShapeTool, setShapePick, SHAPE_CONTROL } from './pdf-shape-pick';
import { TYPED_NAMES } from './pdf-typed';
import { isTypedTool, setTypedPick, TYPED_CONTROL } from './pdf-typed-pick';
import { TEXT_MARK_TOOLS, TOOL_COLOUR } from './pdf-toolbar';
import type { PdfDocumentOpen } from './usePdfDocument';
import { usePdfDrawing } from './usePdfDrawing';
import type { PdfPageShaping } from './usePdfPageShape';
import { usePdfShapes } from './usePdfShapes';
import { usePdfStampTool } from './usePdfStampTool';
import { usePdfToolControl } from './usePdfToolControl';
import { usePdfTyping } from './usePdfTyping';
import type { PdfTextSelected } from './usePdfTextSelection';

/** What a page does with a press or a drag: select text, mark it with a kind, draw, or drag a line or shape. */
export type PdfPageTool = 'select' | MarkKind;

/** What a page draws a stroke with, while the Drawing tool is in hand. */
export type PdfPageInk = {
  readonly colour: string;
  readonly opacity: number;
  readonly width: number;
  // `begunAt`: when the stroke began, which decides whether it joins the Drawing before it.
  readonly onDraw: (index: number, stroke: Stroke, begunAt: number) => void;
};

type Ready = Pick<
  Extract<PdfDocumentOpen, { phase: 'ready' }>,
  'pages' | 'storedFile' | 'binding' | 'undo'
>;

/** Each text tool's menu item, by which the menus, the chevron's cells and the keys name it. */
const TOOL_ITEMS: Readonly<Record<TextMarkKind, string>> = {
  highlight: TOOL_HIGHLIGHT,
  underline: TOOL_UNDERLINE,
  strikeout: TOOL_STRIKETHROUGH,
  squiggly: TOOL_SQUIGGLY,
};

const ICONS: Readonly<Record<HeldTextMark, readonly IconPrim[]>> = {
  highlight: lucideHighlighter,
  underline: lucideUnderline,
  strikeout: lucideStrikethrough,
};

/** Each held tool's words, as the menus name it. */
const LABELS: Readonly<Record<HeldTextMark, string>> = {
  highlight: 'Highlight',
  underline: 'Underline',
  strikeout: 'Strikethrough',
};

/** The selection's mark items (the context menu, the selection bar), by kind. */
const SELECTION_ITEMS: Readonly<Record<HeldTextMark, string>> = {
  highlight: HIGHLIGHT_SELECTION,
  underline: UNDERLINE_SELECTION,
  strikeout: STRIKETHROUGH_SELECTION,
};

const isTextTool = (tool: PdfPageTool): tool is TextMarkKind =>
  (TEXT_MARK_KINDS as readonly string[]).includes(tool);

const heldOf = (item: string | null): HeldTextMark | null =>
  HELD_TEXT_MARKS.find((kind) => TOOL_ITEMS[kind] === item) ?? null;

/** A tool's name in telemetry (marks.md "Telemetry and observability": `Tool.<Name>`). */
const toolName = (tool: PdfPageTool): string => {
  if (tool === 'select') return 'Select';
  if (tool === 'drawing') return 'Drawing';
  if (tool === 'stamp') return 'Stamp';
  if (isShapeTool(tool)) return SHAPE_NAMES[tool];
  if (isTypedTool(tool)) return TYPED_NAMES[tool];
  return TEXT_MARK_NAMES[tool];
};

/** ⇧U's next tool: the one after the held tool in hand, Highlight after Strikethrough or any other tool. */
const nextHeld = (inHand: PdfPageTool): HeldTextMark =>
  isHeldTextMark(inHand)
    ? HELD_TEXT_MARKS[(HELD_TEXT_MARKS.indexOf(inHand) + 1) % HELD_TEXT_MARKS.length]!
    : 'highlight';

export function usePdfMarkTools({
  ready,
  marking,
  author,
  selected,
  clearSelection,
  focusPages,
  onProblem,
}: {
  // The open PDF; null before it is.
  ready: Ready | null;
  // Whether a mark may be made now: Reviewing, for a session that reviews.
  marking: boolean;
  // The display name a mark made here carries.
  author: string;
  // The text selected on the pages, which a text tool chosen now marks.
  selected: PdfTextSelected | null;
  clearSelection: () => void;
  // Gives the pages the keys again, once a colour is picked.
  focusPages: () => void;
  // What the title row says went wrong; null once a mark is made.
  onProblem: (problem: string | null) => void;
}) {
  const [tool, setTool] = useState<PdfPageTool>('select');
  const inHand: PdfPageTool = marking ? tool : 'select';
  const pick = useTextMarkPick();
  const looks = useMarkLooks();
  const typed = usePdfTyping({
    ready,
    author,
    looks,
    inHand: isTypedTool(inHand) ? inHand : null,
    onProblem,
  });
  const { letGo } = typed;

  /** One mark of a kind over a page's text: one step of the person's undo, made on that page. */
  const mark = useCallback(
    (kind: TextMarkKind, index: number, selection: TextSelection) => {
      const page = ready?.pages[index];
      if (!ready || !page) return;
      const made = ready.undo.step({ page: page.name }, () =>
        addTextMark(
          ready.binding.doc,
          kind,
          { page: page.name, stored: { blob: ready.storedFile, pages: ready.pages.length } },
          selection,
          { author, now: Date.now(), id: crypto.randomUUID() },
          looks[kind],
        ),
      );
      if (made.ok) {
        debugLog(`[pdf] mark-added kind=${kind}`);
        track('Pdf', 'Added', `Mark.${TEXT_MARK_NAMES[kind]}`);
        onProblem(null);
      } else if (made.reason === 'pdf_too_many_marks') {
        debugLog('[pdf] limit-refused name=pdf_too_many_marks');
        onProblem(TOO_MANY_MARKS_COPY);
      }
    },
    [ready, author, looks, onProblem],
  );

  const pickTool = useCallback(
    (next: PdfPageTool) => {
      setTool(next);
      letGo();
      track('Pdf', 'Selected', `Tool.${toolName(next)}`);
      if (isShapeTool(next)) setShapePick(next);
      else if (isTypedTool(next)) setTypedPick(next);
      else if (isHeldTextMark(next)) setTextMarkPick(next);
    },
    [letGo],
  );

  /** A text tool chosen: the selection marked at once, the tool in hand left as it was; else the tool taken. */
  const take = useCallback(
    (kind: TextMarkKind) => {
      if (!selected) return pickTool(kind);
      if (isHeldTextMark(kind)) setTextMarkPick(kind);
      mark(kind, selected.page, { text: selected.text, quads: selected.quads });
      clearSelection();
    },
    [selected, pickTool, mark, clearSelection],
  );

  const draw = usePdfDrawing({ ready, author, look: looks.drawing, onProblem });
  const ink = useMemo<PdfPageInk | null>(
    () =>
      inHand === 'drawing' ? { ...looks.drawing, width: DRAWING_WIDTH_PT, onDraw: draw } : null,
    [inHand, looks, draw],
  );

  const onShape = usePdfShapes({ ready, author, looks, onProblem });
  const shaping = useMemo<PdfPageShaping | null>(
    () =>
      isShapeTool(inHand)
        ? { kind: inHand, ...looks[inHand], width: SHAPE_WIDTH_PT, onShape }
        : null,
    [inHand, looks, onShape],
  );
  const offered = { offered: ready !== null && marking, inHand, pickTool };
  const shapeTools = usePdfToolControl(SHAPE_CONTROL, offered);
  const typedTools = usePdfToolControl(TYPED_CONTROL, offered);
  const stampTool = usePdfStampTool({ ready, author, ...offered, onProblem });

  /** What a drag across a page's text makes with the text tool in hand. */
  const make = useCallback(
    (index: number, selection: TextSelection) => {
      if (isTextTool(inHand)) mark(inHand, index, selection);
    },
    [inHand, mark],
  );

  const actions = useMemo<OfficeActions>(() => {
    if (!ready) return {};
    const select = {
      [TOOL_SELECT]: { run: () => pickTool('select'), checked: inHand === 'select' },
    };
    if (!marking) return select;
    const tools = Object.fromEntries(
      (Object.keys(TOOL_ITEMS) as TextMarkKind[]).map((kind) => [
        TOOL_ITEMS[kind],
        { run: () => take(kind), checked: inHand === kind },
      ]),
    );
    const onSelection = selected
      ? Object.fromEntries(
          HELD_TEXT_MARKS.map((kind) => [SELECTION_ITEMS[kind], { run: () => take(kind) }]),
        )
      : {};
    return {
      ...select,
      ...tools,
      ...onSelection,
      ...shapeTools.actions,
      ...typedTools.actions,
      ...stampTool.actions,
      [TOOL_DRAWING]: { run: () => pickTool('drawing'), checked: inHand === 'drawing' },
      // The toolbar's Highlight: the held tool last used; pressed again, back to Select.
      [TEXT_MARK_TOOLS]: {
        run: () => (inHand === pick && !selected ? pickTool('select') : take(pick)),
        checked: isHeldTextMark(inHand),
        label: LABELS[pick],
      },
    };
  }, [
    ready,
    marking,
    inHand,
    pick,
    selected,
    pickTool,
    take,
    shapeTools.actions,
    typedTools.actions,
    stampTool.actions,
  ]);

  const choices = useMemo<OfficeChoices>(
    (): OfficeChoices =>
      ready && marking
        ? {
            [TEXT_MARK_TOOLS]: {
              read: () => TOOL_ITEMS[pick],
              entries: [],
              actions,
              iconOf: (item) => ICONS[heldOf(item) ?? pick],
              grid: {
                columns: HELD_TEXT_MARKS.length,
                cells: HELD_TEXT_MARKS.map((kind) => ({
                  id: TOOL_ITEMS[kind],
                  label: LABELS[kind],
                  icon: ICONS[kind],
                })),
              },
            },
            ...shapeTools.choices,
            ...typedTools.choices,
            ...stampTool.choices,
          }
        : {},
    [ready, marking, pick, actions, shapeTools.choices, typedTools.choices, stampTool.choices],
  );

  // "A tool's colour": the one colour picker, for the mark tool in hand; with Select in hand there is none, nor with
  // the Stamp tool: a stamp's colour is its own (marks.md "Stamps").
  const colours = useMemo<OfficeColours>(
    (): OfficeColours =>
      inHand === 'select' || inHand === 'stamp'
        ? {}
        : {
            [TOOL_COLOUR]: {
              read: () => looks[inHand].colour,
              set: (colour) => {
                track('Pdf', 'Changed', 'ToolColour');
                setMarkColour(inHand, colour);
                focusPages();
              },
              leading: 'Reset',
            },
          },
    [inHand, looks, focusPages],
  );

  /** The tools' own keys, outside a field: U, ⇧U, D, ⇧D, X, ⇧X, K, V and Escape; true where one was taken. */
  const onKey = (event: KeyboardEvent<HTMLElement>): boolean => {
    if (event.ctrlKey || event.metaKey || event.altKey) return false;
    const key = event.key.toLowerCase();
    if (key === PDF_TOOL_KEYS.highlight && marking)
      take(event.shiftKey ? nextHeld(inHand) : 'highlight');
    else if (key === PDF_TOOL_KEYS.drawing && marking) {
      if (event.shiftKey) shapeTools.cycle();
      else pickTool('drawing');
    } else if (key === PDF_TOOL_KEYS.text && marking) {
      if (event.shiftKey) typedTools.cycle();
      else pickTool(typedTools.pick);
    } else if (key === PDF_TOOL_KEYS.stamp && marking && !event.shiftKey) pickTool('stamp');
    else if ((key === PDF_TOOL_KEYS.select || key === 'escape') && inHand !== 'select')
      pickTool('select');
    else return false;
    event.preventDefault();
    return true;
  };

  return {
    inHand,
    make,
    ink,
    shaping,
    typing: typed.typing,
    stamping: stampTool.stamping,
    actions,
    choices,
    colours,
    onKey,
  };
}
