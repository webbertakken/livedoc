'use client';

// A kind's left panels on a rail (docs/specs/004-interface-design/office-shell.md "Side panels"): a vertical toolbar
// of glyph toggles at the far left, one a panel, each named and with its name as tooltip, pressed while its panel is
// open. Its buttons run the panels' own menu items, so the rail and the menu are one binding. One tab stop: Up and
// Down move between the buttons, wrapping; Home and End go to the ends. Not drawn on a phone, where View opens them.
import { useState, type KeyboardEvent } from 'react';
import { Glyph, HoverCard, Prims } from '@livedoc/ui';
import type { IconPrim } from '@livedoc/icons';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import type { OfficePanelSpec } from '@/lib/office/office-panels';

export type OfficeRailPanel = { spec: OfficePanelSpec; icon: readonly IconPrim[] };

const BUTTON =
  'relative flex size-8 shrink-0 items-center justify-center rounded-control text-(--office-icon) outline-none touch-target hover:bg-(--office-hover) focus-visible:ring-2 focus-visible:ring-(--office-focus) aria-pressed:bg-(--office-pressed) aria-pressed:text-(--office-pressed-ink)';

export function OfficePanelRail({
  panels,
  actions,
}: {
  panels: readonly OfficeRailPanel[];
  // The panels' menu items as bound: a panel whose item nothing runs has no button.
  actions: OfficeActions;
}) {
  const [stop, setStop] = useState(0);
  const shown = panels.filter((panel) => actions[panel.spec.item]);
  if (shown.length === 0) return null;
  const current = Math.min(stop, shown.length - 1);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, number> = {
      ArrowDown: (current + 1) % shown.length,
      ArrowUp: (current - 1 + shown.length) % shown.length,
      Home: 0,
      End: shown.length - 1,
    };
    const next = moves[event.key];
    if (next === undefined) return;
    event.preventDefault();
    setStop(next);
    event.currentTarget.querySelectorAll<HTMLElement>('button')[next]?.focus();
  };

  return (
    <div
      role="toolbar"
      aria-label="Panels"
      aria-orientation="vertical"
      data-region="rail"
      onKeyDown={onKeyDown}
      className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-(--office-line) bg-(--office-chrome) py-2 phone:hidden"
    >
      {shown.map(({ spec, icon }, at) => {
        const action = actions[spec.item]!;
        return (
          <HoverCard key={spec.id} title={spec.title}>
            <button
              type="button"
              aria-label={spec.title}
              aria-pressed={action.checked === true}
              tabIndex={at === current ? 0 : -1}
              data-panel-rail={spec.id}
              onFocus={() => setStop(at)}
              onClick={() => action.run()}
              className={BUTTON}
            >
              <Glyph size={20} units={24}>
                <Prims prims={icon} />
              </Glyph>
            </button>
          </HoverCard>
        );
      })}
    </div>
  );
}
