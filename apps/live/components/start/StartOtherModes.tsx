'use client';

// Found in other modes (docs/specs/007-editor/start-diagramming.md "Found in other modes"): under a start's own search
// results, the templates of every other mode that matched, one block a mode (its icon, name and count), each card
// saying where it leads ("Opens in Workshop"). At most OTHER_MODE_CARDS_MAX a mode, then Show All. Choosing one lands
// it on the tab, which switches to the template's mode. The host keys it on the search, so a new search starts folded.
import { useState, type CSSProperties } from 'react';
import { CountBadge, TAB_OPENING_ICONS } from '@livedoc/ui';
import { tabOpeningLabel, type TabOpening } from '@livedoc/document';
import type { PlanPalette } from '@/components/plan/plan-palette';
import { StartCardGrid, startTint, type StartPanelCard } from './StartCard';
import { OTHER_MODE_CARDS_MAX } from './other-mode-matches';

export type StartPanelElsewhere = { mode: TabOpening; cards: readonly StartPanelCard[] };

function OpensIn({ mode, palette }: { mode: TabOpening; palette: PlanPalette }) {
  const Icon = TAB_OPENING_ICONS[mode];
  return (
    <span
      aria-hidden
      className="mt-1 inline-flex items-center gap-1 rounded-full px-2 py-px text-supporting"
      style={{ backgroundColor: startTint(palette, 10), color: palette.focus }}
    >
      <Icon size={11} />
      Opens in {tabOpeningLabel(mode)}
    </span>
  );
}

export function StartOtherModes({
  groups,
  palette,
  divided,
  cascade,
  onChoose,
}: {
  groups: readonly StartPanelElsewhere[];
  palette: PlanPalette;
  // Below the mode's own results: a hairline above it. Alone (nothing of this mode matched), none.
  divided: boolean;
  cascade: boolean;
  onChoose: (mode: TabOpening, cardId: string) => void;
}) {
  const [open, setOpen] = useState<ReadonlySet<TabOpening>>(() => new Set());
  return (
    <section
      aria-labelledby="start-other-modes"
      className={divided ? 'mt-8 border-t pt-6 max-sm:mt-6 max-sm:pt-5' : ''}
      style={{ borderColor: palette.border }}
    >
      <h3 id="start-other-modes" className="text-panel-title">
        Elsewhere
      </h3>
      <p className="mb-4 mt-0.5 text-body max-sm:mb-3" style={{ color: palette.muted }}>
        Choosing one changes this tab to match.
      </p>
      {groups.map(({ mode, cards }) => {
        const Icon = TAB_OPENING_ICONS[mode];
        const label = tabOpeningLabel(mode);
        const all = open.has(mode);
        const shown = all ? cards : cards.slice(0, OTHER_MODE_CARDS_MAX);
        return (
          <section key={mode} aria-label={label} data-other-mode={mode} className="mb-6 last:mb-0">
            <div className="mb-3 flex items-center gap-2">
              <span
                aria-hidden
                className="flex size-row shrink-0 items-center justify-center rounded-control"
                style={{ backgroundColor: startTint(palette, 14), color: palette.focus }}
              >
                <Icon size={16} />
              </span>
              <h4 className="text-body">{label}</h4>
              <CountBadge count={cards.length} background={palette.column} color={palette.muted} />
            </div>
            <StartCardGrid
              cards={shown.map((card) => ({
                ...card,
                ariaKind: `in ${label}`,
                note: <OpensIn mode={mode} palette={palette} />,
              }))}
              palette={palette}
              cascade={cascade}
              onChoose={(id) => onChoose(mode, id)}
            />
            {cards.length > shown.length ? (
              <button
                type="button"
                onClick={() => setOpen((s) => new Set(s).add(mode))}
                className="mt-3 min-h-row cursor-pointer rounded-control border px-3 text-body transition hover:border-[var(--start-accent)] hover:bg-[var(--start-hover)]"
                style={
                  {
                    borderColor: palette.border,
                    color: palette.text,
                    '--start-hover': startTint(palette, 7),
                  } as CSSProperties
                }
              >
                Show All {cards.length}
              </button>
            ) : null}
          </section>
        );
      })}
    </section>
  );
}
