'use client';

// The chrome of the editor in a workbench (docs/specs/013-workspace/workbench-embeds.md
// "Presentation and UX", WB34, WB59): an **Open in LiveDoc** link in the actions group, beside Search and
// Settings, where no docked panel can cover it, that opens the document (or, in a workspace frame's Explorer, the
// view) in a full tab; and, once the session has ended unrenewed or revoked, the line at the top centre that says how
// to edit again. A workspace frame's **Back** is the brand group's (lines/BrandBack).
import type { WorkbenchEndReason } from '@livedoc/api-schema';
import { HoverCard } from '@livedoc/ui';
import { ChromeLabel, useChromeButtonClass } from './chrome-button';
import { OpenExternalIcon } from './EmbedChrome';

function reconnectLine(workbenchName: string): string {
  return `Reconnect in ${workbenchName} to keep editing.`;
}

// `href`: the app's own address for what the frame shows (`/document/<id>`, or an Explorer view's).
export function WorkbenchOpenLink({
  href,
  labelled,
  description = 'Opens this document in a full tab.',
}: {
  href: string;
  labelled: boolean;
  description?: string;
}) {
  const buttonClass = useChromeButtonClass(labelled);
  return (
    <HoverCard title="Open in LiveDoc" description={description}>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Open in LiveDoc (opens in a new tab)"
        className={buttonClass}
      >
        <OpenExternalIcon />
        <ChromeLabel show={labelled}>Open in LiveDoc</ChromeLabel>
      </a>
    </HoverCard>
  );
}

export function WorkbenchReconnectLine({
  workbenchName,
  ended,
}: {
  workbenchName: string;
  ended: Exclude<WorkbenchEndReason, 'refused'> | null;
}) {
  const reconnect = ended === 'expired' || ended === 'revoked';
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed top-3 left-1/2 z-[var(--z-chrome)] -translate-x-1/2"
    >
      {reconnect ? (
        <p className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-900 shadow-sm dark:bg-amber-950 dark:text-amber-100">
          {reconnectLine(workbenchName)}
        </p>
      ) : null}
    </div>
  );
}
