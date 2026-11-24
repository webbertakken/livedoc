'use client';

// The shape tools (docs/specs/035-pdf-documents/marks.md "Making a mark": The shape tools; reading-surface.md "The
// toolbar"): Insert > Shape's Line, Arrow, Rectangle and Ellipse, the toolbar's Shape control holding them behind its
// chevron, and ⇧D stepping through them. The tool in hand is usePdfMarkTools'; this names what takes a shape tool.
import { useMemo } from 'react';
import type { IconPrim } from '@livedoc/icons';
import {
  lucideArrowUpRight,
  lucideCircle,
  lucideRectangleHorizontal,
  lucideSlash,
} from '@livedoc/icons/lucide';
import type { OfficeChoices } from '@/components/office/OfficeChoiceMenu';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import { TOOL_ARROW, TOOL_ELLIPSE, TOOL_LINE, TOOL_RECTANGLE } from './pdf-menus';
import { isShapeTool, SHAPE_TOOL_KINDS, useShapePick, type ShapeToolKind } from './pdf-shape-pick';
import { SHAPE_TOOLS } from './pdf-toolbar';
import type { PdfPageTool } from './usePdfMarkTools';

/** Each shape tool's menu item, by which the menus and the chevron's cells name it. */
const ITEMS: Readonly<Record<ShapeToolKind, string>> = {
  line: TOOL_LINE,
  arrow: TOOL_ARROW,
  rectangle: TOOL_RECTANGLE,
  ellipse: TOOL_ELLIPSE,
};

const ICONS: Readonly<Record<ShapeToolKind, readonly IconPrim[]>> = {
  line: lucideSlash,
  arrow: lucideArrowUpRight,
  rectangle: lucideRectangleHorizontal,
  ellipse: lucideCircle,
};

/** Each shape tool's words, as the menus name it. */
const LABELS: Readonly<Record<ShapeToolKind, string>> = {
  line: 'Line',
  arrow: 'Arrow',
  rectangle: 'Rectangle',
  ellipse: 'Ellipse',
};

const kindOf = (item: string | null): ShapeToolKind | null =>
  SHAPE_TOOL_KINDS.find((kind) => ITEMS[kind] === item) ?? null;

export function usePdfShapeTools({
  offered,
  inHand,
  pickTool,
}: {
  // Whether the shape tools may be taken now: an open PDF, in Reviewing, for a session that reviews.
  offered: boolean;
  inHand: PdfPageTool;
  pickTool: (tool: PdfPageTool) => void;
}) {
  const pick = useShapePick();

  const actions = useMemo<OfficeActions>(() => {
    if (!offered) return {};
    const tools = Object.fromEntries(
      SHAPE_TOOL_KINDS.map((kind) => [
        ITEMS[kind],
        { run: () => pickTool(kind), checked: inHand === kind },
      ]),
    );
    return {
      ...tools,
      // The toolbar's Shape: the shape tool last taken; pressed again, back to Select.
      [SHAPE_TOOLS]: {
        run: () => pickTool(inHand === pick ? 'select' : pick),
        checked: isShapeTool(inHand),
        label: LABELS[pick],
      },
    };
  }, [offered, inHand, pick, pickTool]);

  const choices = useMemo<OfficeChoices>(
    (): OfficeChoices =>
      offered
        ? {
            [SHAPE_TOOLS]: {
              read: () => ITEMS[pick],
              entries: [],
              actions,
              iconOf: (item) => ICONS[kindOf(item) ?? pick],
              grid: {
                columns: SHAPE_TOOL_KINDS.length,
                cells: SHAPE_TOOL_KINDS.map((kind) => ({
                  id: ITEMS[kind],
                  label: LABELS[kind],
                  icon: ICONS[kind],
                })),
              },
            },
          }
        : {},
    [offered, pick, actions],
  );

  /** ⇧D: the shape tool after the one in hand; from any other tool, the one the Shape control shows. */
  const cycle = () =>
    pickTool(
      isShapeTool(inHand)
        ? SHAPE_TOOL_KINDS[(SHAPE_TOOL_KINDS.indexOf(inHand) + 1) % SHAPE_TOOL_KINDS.length]!
        : pick,
    );

  return { actions, choices, cycle };
}
