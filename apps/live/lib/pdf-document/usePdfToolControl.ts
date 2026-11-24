'use client';

// A split toolbar control and the tools it holds (docs/specs/035-pdf-documents/reading-surface.md "The toolbar";
// marks.md "Making a mark"): each tool's menu item, the control holding them behind its chevron as the last one taken,
// and a key stepping through them. Shape holds Line, Arrow, Rectangle and Ellipse; Text holds Text and Callout. The
// tool in hand is usePdfMarkTools'; this names what takes one of the control's tools.
import { useMemo } from 'react';
import type { IconPrim } from '@livedoc/icons';
import type { OfficeChoices } from '@/components/office/OfficeChoiceMenu';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import type { ToolPick } from './pdf-tool-pick';
import type { PdfPageTool } from './usePdfMarkTools';

/** A split control's tools: its id, its tools in its order, and each tool's menu item, words and glyph. */
export type PdfToolControl<T extends PdfPageTool> = {
  readonly control: string;
  readonly tools: readonly [T, ...T[]];
  readonly items: Readonly<Record<T, string>>;
  readonly labels: Readonly<Record<T, string>>;
  readonly icons: Readonly<Record<T, readonly IconPrim[]>>;
  readonly pick: ToolPick<T>;
  /** The pick as a hook: the tool the control shows now. */
  readonly usePick: () => T;
};

export function usePdfToolControl<T extends PdfPageTool>(
  { control, tools, items, labels, icons, pick: picked, usePick }: PdfToolControl<T>,
  {
    offered,
    inHand,
    pickTool,
  }: {
    // Whether the control's tools may be taken now: an open PDF, in Reviewing, for a session that reviews.
    offered: boolean;
    inHand: PdfPageTool;
    pickTool: (tool: PdfPageTool) => void;
  },
) {
  const pick = usePick();

  const actions = useMemo<OfficeActions>(() => {
    if (!offered) return {};
    const each = Object.fromEntries(
      tools.map((tool) => [items[tool], { run: () => pickTool(tool), checked: inHand === tool }]),
    );
    return {
      ...each,
      // The control: the tool of it last taken; pressed again, back to Select.
      [control]: {
        run: () => pickTool(inHand === pick ? 'select' : pick),
        checked: picked.holds(inHand),
        label: labels[pick],
      },
    };
  }, [offered, inHand, pick, pickTool, tools, items, labels, control, picked]);

  const choices = useMemo<OfficeChoices>((): OfficeChoices => {
    if (!offered) return {};
    const toolOf = (item: string | null): T => tools.find((tool) => items[tool] === item) ?? pick;
    return {
      [control]: {
        read: () => items[pick],
        entries: [],
        actions,
        iconOf: (item) => icons[toolOf(item)],
        grid: {
          columns: tools.length,
          cells: tools.map((tool) => ({ id: items[tool], label: labels[tool], icon: icons[tool] })),
        },
      },
    };
  }, [offered, pick, actions, control, tools, items, labels, icons]);

  /** The control's key with ⇧: the tool after the one in hand; from any other tool, the one the control shows. */
  const cycle = () =>
    pickTool(picked.holds(inHand) ? tools[(tools.indexOf(inHand) + 1) % tools.length]! : pick);

  return { actions, choices, cycle, pick };
}
