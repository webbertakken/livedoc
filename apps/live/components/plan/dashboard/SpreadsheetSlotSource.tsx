'use client';

// Choose a Spreadsheet (docs/specs/029-sheets/plan-links.md "The Spreadsheet slot"): the person's own spreadsheets as a
// figure's picker lists them (SpreadsheetPickList, D505), anchored where it was asked for. Picking one closes it.
import { AnchoredPopover } from '@/components/primitives/AnchoredPopover';
import { SpreadsheetPickList } from '@/components/spreadsheet/SpreadsheetPickList';
import { useSheetsBridgeContext } from '@/hooks/sheets/useSheetsBridge';

export function SpreadsheetSlotSource({
  anchor,
  onPick,
  onClose,
}: {
  anchor: HTMLElement;
  onPick: (documentId: string) => void;
  onClose: () => void;
}) {
  const scope = useSheetsBridgeContext()?.scope;
  if (!scope) return null;
  return (
    <AnchoredPopover anchor={anchor} name="Choose a Spreadsheet" width={320} onClose={onClose}>
      <div className="flex max-h-[min(70vh,32rem)] flex-col gap-3 overflow-y-auto rounded-menu border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <h3 className="text-panel-title text-slate-900 dark:text-slate-100">
          Choose a Spreadsheet
        </h3>
        <SpreadsheetPickList
          ownerId={scope.ownerId}
          currentId={scope.documentId}
          what="dashboard spreadsheet slot"
          onPick={(picked) => {
            onPick(picked.documentId);
            onClose();
          }}
        />
      </div>
    </AnchoredPopover>
  );
}
