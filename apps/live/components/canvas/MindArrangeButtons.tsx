'use client';

// A mind map's arrangement on the selection toolbars (docs/specs/009-elements/mind-node.md "Numbered nodes",
// "Groups", "A tidy map stays tidy"): Number, Group or Ungroup, and Auto Position for a node placed by hand. Shown for
// a selection holding a mind node below its root, on the single and the multi-selection toolbars alike.
import { Glyph } from '@livedoc/ui';
import { isMindGroupFrame, isMindNode, type Element } from '@livedoc/document';
import type { MindArrangeActions } from '@/hooks/canvas/useMindMapSetters';
import { PopoverButton } from './SelectionPopoverButton';

export type MindArrangeState = { numbered: boolean; grouped: boolean; placed: boolean };

/** What the selected nodes are now (a group's frame standing for its members), or null when the selection holds no
 *  mind node below a root and no group. */
export function mindArrangeState(
  selected: readonly Element[],
  elements: readonly Element[],
): MindArrangeState | null {
  const frames = new Set(selected.filter(isMindGroupFrame).map((f) => f.id));
  const nodes = [
    ...selected.filter(isMindNode).filter((n) => !!n.mindParentId),
    ...(frames.size > 0
      ? elements.filter(isMindNode).filter((n) => !!n.mindGroup && frames.has(n.mindGroup))
      : []),
  ];
  if (nodes.length === 0) return null;
  const first = nodes[0]!;
  return {
    numbered: nodes.every((n) => n.mindNumbered === true),
    grouped:
      !!first.mindGroup &&
      nodes.every((n) => n.mindGroup === first.mindGroup && n.mindParentId === first.mindParentId),
    placed: nodes.some((n) => n.mindPlaced === true),
  };
}

export function MindArrangeButtons({
  state,
  actions,
}: {
  state: MindArrangeState;
  actions: MindArrangeActions;
}) {
  return (
    <>
      <PopoverButton
        label="Number"
        description="Number these nodes, like a numbered list. The numbers follow their order."
        active={state.numbered}
        onClick={() => actions.number(!state.numbered)}
      >
        <NumberedIcon />
      </PopoverButton>
      {state.grouped ? (
        <PopoverButton
          label="Ungroup"
          description="Take these nodes out of their group."
          onClick={actions.ungroup}
        >
          <UngroupIcon />
        </PopoverButton>
      ) : (
        <PopoverButton
          label="Group"
          description="Put these nodes and their branches together in a tinted box."
          onClick={actions.group}
        >
          <GroupIcon />
        </PopoverButton>
      )}
      {state.placed ? (
        <PopoverButton
          label="Auto Position"
          description="Put a node you placed by hand back into the map's layout."
          onClick={actions.autoPosition}
        >
          <AutoPositionIcon />
        </PopoverButton>
      ) : null}
    </>
  );
}

// "1." and "2." beside two lines: a numbered list.
function NumberedIcon() {
  return (
    <Glyph size={16} units={16}>
      <path d="M2.5 2.5h1v4M2 6.5h2.5" />
      <path d="M2 9.5c0-.8.6-1 1.2-1s1.3.4 1 1.2L2 13.5h2.6" />
      <path d="M7 4.5h7M7 11h7" />
    </Glyph>
  );
}

// Two nodes inside a dashed rounded box.
function GroupIcon() {
  return (
    <Glyph size={16} units={16}>
      <rect x="1" y="1.5" width="14" height="13" rx="2.5" strokeDasharray="2 1.6" />
      <rect x="4" y="4" width="8" height="3" rx="1" />
      <rect x="4" y="9" width="8" height="3" rx="1" />
    </Glyph>
  );
}

// The same two nodes, the box opened.
function UngroupIcon() {
  return (
    <Glyph size={16} units={16}>
      <path d="M1 5V3.5A2 2 0 0 1 3 1.5h2M11 1.5h2a2 2 0 0 1 2 2V5M15 11v1.5a2 2 0 0 1-2 2h-2M5 14.5H3a2 2 0 0 1-2-2V11" />
      <rect x="4" y="4" width="8" height="3" rx="1" />
      <rect x="4" y="9" width="8" height="3" rx="1" />
    </Glyph>
  );
}

// A node with an arrow sliding back into its slot.
function AutoPositionIcon() {
  return (
    <Glyph size={16} units={16}>
      <rect x="8" y="5.5" width="7" height="5" rx="1" strokeDasharray="2 1.4" />
      <path d="M1.5 3.5c2.5 0 4 1.5 4.5 4.5M4.5 6.5 6 8l1.5-1.6" />
      <rect x="1" y="10" width="5" height="4" rx="1" />
    </Glyph>
  );
}
