'use client';

// A spreadsheet's protections as its grid meets them (docs/specs/029-sheets/data-tools.md "Protected ranges"): the
// store learns who this person is to them (the owner, an Editor), so it refuses at once what the room would, and asks
// through Show a Warning's dialog before a change under a warning one.
import { useEffect, useState, type ReactNode } from 'react';
import type { SheetStore } from '@/components/sheets/sheet-store-client';
import type { SheetsBridge } from '@/hooks/sheets/useSheetsBridge';
import { ProtectionWarningDialog } from './ProtectionWarningDialog';

export function useProtectionWarnings(store: SheetStore, bridge: SheetsBridge): ReactNode {
  // The change waiting on the person's answer: OK writes it.
  const [waiting, setWaiting] = useState<(() => void) | null>(null);
  const owner = bridge.isOwner ?? false;
  const editor = bridge.canEdit && bridge.canShape;
  useEffect(() => {
    store.setProtection({ owner, editor }, (_protections, proceed) => setWaiting(() => proceed));
    return () => store.setProtection(null, null);
  }, [store, owner, editor]);
  if (!waiting) return null;
  return (
    <ProtectionWarningDialog
      onOk={() => {
        setWaiting(null);
        waiting();
      }}
      onCancel={() => setWaiting(null)}
    />
  );
}
