'use client';

import { useUiScale } from '@/components/providers/ui-scale';
import { uiScaleStyle } from '@/lib/ui-scale';
import { AuthControls } from '@/components/chrome/AuthControls';
import { ChromeControls } from '@/components/chrome/ChromeControls';
import { ToolbarGroup, ToolbarPart } from '@/components/chrome/ToolbarGroup';
import { WorkbenchOpenLink } from '@/components/chrome/WorkbenchChrome';
import { BAND_BLEND, BAND_TINT } from '@/components/chrome/toolbar-surface';
import { PHONE_TOOLBAR_ITEMS } from '@/components/chrome/phone-toolbar-items';
import { TourOfferButton } from '@/components/tour/TourOfferButton';
import { DocumentActions, type DocumentActionsProps } from './DocumentActions';

export type ActionsGroupProps = DocumentActionsProps & {
  onOpenSearch?: () => void;
  onOpenSettings?: () => void;
  // Button Labels (docs/specs/007-editor/user-preferences.md): Search, Settings and the appearance by name.
  labelled?: boolean;
  // The document's actions (Start Tour, Copy, Present, Share) and the chrome trio; false through the welcome flow,
  // which keeps the account control alone.
  documentActions: boolean;
  // In a workbench: Open in LiveDoc, the app's own address for what the frame shows. The appearance follows the
  // workbench there, so no toggle.
  workbenchOpenHref?: string;
  // The app's surroundings (docs/specs/013-workspace/workbench-embeds.md): the document actions and the
  // account. False in a workbench frame, which keeps the chrome and Open in LiveDoc alone.
  appSurroundings?: boolean;
  onOpenAccount?: () => void;
};

// The actions group, the top line's right (docs/specs/007-editor/toolbar-layout.md "The top line"): Search,
// Settings, the appearance toggle, then the document actions that apply, then the account control, each part after
// a divider. Each control keeps its own rule for who sees it (live-app.md). `data-toolbar-actions` is what the strip
// measures to keep clear of it (lib/top-line-clearance).
export function ActionsGroup({
  onOpenSearch,
  onOpenSettings,
  labelled = false,
  documentActions,
  workbenchOpenHref,
  appSurroundings = true,
  onOpenAccount,
  ...actions
}: ActionsGroupProps) {
  // Drawn at the UI scale (docs/specs/007-editor/ui-scale.md); the top line (TopLine) places it.
  const scale = useUiScale('toolbar');
  return (
    <ToolbarGroup
      label="Actions"
      data-toolbar-actions=""
      data-floating-panel=""
      // The Header region with the brand group (canvas-accessibility.md "F6 moves between regions"): F6 lands on the
      // brand group, Tab walks on into this group, which follows it in the page.
      data-region="header"
      style={scale === 1 ? undefined : uiScaleStyle(scale)}
      // On a narrow phone it gives way to the brand group and swipes sideways (STRIP_RAIL_SCROLL's idiom).
      className={`pointer-events-auto relative ml-auto min-w-0 phone:overflow-x-auto phone:[scrollbar-width:none] [&:not(:has([data-toolbar-part]:not(:empty)))]:hidden ${BAND_TINT} ${BAND_BLEND} ${PHONE_TOOLBAR_ITEMS}`}
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {documentActions ? (
        <>
          <ToolbarPart>
            <ChromeControls
              onOpenSearch={onOpenSearch}
              onOpenSettings={onOpenSettings}
              settingsLabel="Application settings"
              settingsDescription="Your editor preferences. They follow your account, not this document."
              labelled={labelled}
              github={false}
              appearance={!workbenchOpenHref}
              tourOffer={false}
            />
          </ToolbarPart>
          <ToolbarPart>
            <TourOfferButton labelled={labelled} />
            {appSurroundings ? <DocumentActions {...actions} labelled={labelled} /> : null}
            {workbenchOpenHref ? (
              <WorkbenchOpenLink href={workbenchOpenHref} labelled={labelled} />
            ) : null}
          </ToolbarPart>
        </>
      ) : null}
      {appSurroundings ? (
        <ToolbarPart>
          <AuthControls onOpenAccount={onOpenAccount} />
        </ToolbarPart>
      ) : null}
    </ToolbarGroup>
  );
}
