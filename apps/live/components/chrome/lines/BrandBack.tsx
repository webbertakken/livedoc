'use client';

import { Brand, Glyph, HoverCard } from '@livedoc/ui';
import { EXPLORER_LANDING_PATH } from '@/lib/explorer-landing';
import { track } from '@/lib/telemetry';
import { useWorkbenchSession } from '@/components/providers/workbench-session-context';

// Where Back goes (docs/specs/007-editor/toolbar-layout.md "The top line"): the Explorer in the app; in a workspace
// frame, where the document was opened from; in a frame with document scope, which holds no Explorer, the Explorer in
// a new tab.
export type BackTarget =
  { kind: 'explorer'; newTab?: true } | { kind: 'frame'; back: () => void; backTitle: string };

// Where Back goes for this page: the workbench session says whether the editor is in a workspace frame (its own
// Back) or a frame with document scope (the Explorer beside it); otherwise the Explorer.
export function useBackTarget(): BackTarget {
  const session = useWorkbenchSession();
  if (!session) return { kind: 'explorer' };
  return session.frame
    ? { kind: 'frame', back: session.frame.back, backTitle: session.frame.backTitle }
    : { kind: 'explorer', newTab: true };
}

// The back caret: a chevron 8 x 14, a 1.75px round stroke, in the chrome's muted ink (currentColor). Drawn on the
// Glyph's square 14-unit box, the chevron centred in it (x + 3), and the box trimmed to its 8px by -3px either side,
// so the 8px gap to the mark is measured from the caret's own box.
export const BACK_CARET_PATH = 'M9.5 1.5 4.5 7l5 5.5';
function BackCaret() {
  return (
    <Glyph data-back-caret="" size={14} units={14} weight={1.75} className="-mx-[3px] shrink-0">
      <path d={BACK_CARET_PATH} />
    </Glyph>
  );
}

// Caret and mark are one 36px tall hit area with the group's hover fill; the caret sits 8px before the 24px mark.
const HIT_AREA =
  'relative flex h-9 items-center gap-2 rounded-md pl-2 pr-1.5 text-slate-500 outline-none transition touch-target-y hover:bg-slate-100 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-brand-400 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200';
const MARK = 'size-6';

// The editor's logo, a back button: caret and the brand mark, without the wordmark, tinted by the tab's theme. Every
// target draws the one Brand over the one hit area, so the caret, the hover, focus and press, and the logo's
// assembly and fan are the same wherever the editor runs (workbench-embeds.md I10).
export function BrandBack({ target, accent }: { target: BackTarget; accent?: string }) {
  const logo = {
    wordmark: false,
    leading: <BackCaret />,
    markClassName: MARK,
    accentColor: accent,
    className: HIT_AREA,
    assemble: true,
  } as const;
  if (target.kind === 'frame') {
    return (
      <HoverCard title="Back" description={`Back to ${target.backTitle}.`}>
        <Brand {...logo} label="Back" onClick={target.back} />
      </HoverCard>
    );
  }
  return (
    <HoverCard
      title="Back to the Explorer"
      description={
        target.newTab
          ? 'Your documents, folders and teams, in a new tab.'
          : 'Your documents, folders and teams.'
      }
    >
      <Brand
        {...logo}
        href={EXPLORER_LANDING_PATH}
        newTab={target.newTab}
        label={target.newTab ? 'Back to the Explorer (opens in a new tab)' : 'Back to the Explorer'}
        onClick={() => track('UI', 'Opened', 'BrandBack')}
      />
    </HoverCard>
  );
}
