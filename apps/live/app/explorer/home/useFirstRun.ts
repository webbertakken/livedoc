'use client';

import { useSignInAvailable } from '@/lib/auth-config';
import { useOptionalExplorer } from '../ExplorerContext';
import { isFirstRun } from './first-run';

// Whether Home is a first run (docs/specs/013-workspace/explorer-home.md "First run"), read from the Explorer's own
// lists, so it needs no read of its own, and whether to offer the way back to a signed-out person. Until the lists
// land it is never a first run: Home shows its ordinary skeletons and never guesses, and `decided` is false. Outside
// the Explorer (a test rendering Home alone) it is never a first run either.
export function useFirstRun(): { firstRun: boolean; offerSignIn: boolean; decided: boolean } {
  const explorer = useOptionalExplorer();
  const signInAvailable = useSignInAvailable();
  if (!explorer) return { firstRun: false, offerSignIn: false, decided: true };
  const firstRun = isFirstRun({
    loading: explorer.loading,
    failed: Boolean(explorer.failedReads.documents || explorer.failedReads.shared),
    documents: explorer.documents.length,
    shared: explorer.shared.length,
    teamDocuments: explorer.teamDocuments.length,
    offlineDocuments: explorer.offlineDocuments.length,
  });
  // A guest on a deployment with sign-in may simply have been signed out.
  const offerSignIn = signInAvailable && !explorer.accountId;
  return { firstRun, offerSignIn, decided: !explorer.loading };
}
