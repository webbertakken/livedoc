'use client';

import { documentPath } from '@livedoc/api-schema';
import type { Tab } from '@livedoc/document';
import type { AskActions } from '@/hooks/canvas/useAskActions';
import { useIsOfflineDocument } from '@/hooks/persistence/useIsOfflineDocument';
import { useAskView } from '@/lib/ask-view';
import { AskPopover } from './AskPopover';

// Where the Ask popover is drawn from (docs/specs/021-event-storming/asks.md "Where an ask starts"): beside the
// canvas, which knows the tab, the document and the deployment, hanging from the corner the canvas draws. Mounted
// for an Editor on an event-storming board alone; nothing shows until an ask is opened.
export function AskHost({
  tab,
  documentId,
  documentName,
  aiEnabled,
  acts,
}: {
  tab: Tab;
  documentId: string;
  documentName: string;
  aiEnabled: boolean;
  acts: AskActions & { arrange: () => void };
}) {
  const view = useAskView(tab.id);
  const thisBrowser = useIsOfflineDocument(documentId);
  if (!view.open || !view.anchor) return null;
  return (
    <AskPopover
      tab={tab}
      scope={view.scope}
      anchor={view.anchor}
      asking={view.asking}
      failure={view.failure}
      aiEnabled={aiEnabled}
      thisBrowser={thisBrowser}
      board={{
        document: documentName,
        documentId,
        link: `${window.location.origin}${documentPath(documentId)}#t=${encodeURIComponent(tab.id)}`,
      }}
      acts={acts}
    />
  );
}
