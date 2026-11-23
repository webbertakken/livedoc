'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { Button } from '@livedoc/ui';
import { SettingsRowShell } from './SettingsRowShell';
import { SettingsSignInLink } from './SettingsSignInLink';
import { useDeferredAuth } from '@/components/providers/deferred-auth';
import type { SettingsDeleteAccountRowSpec } from './settings-catalogue';

// The Delete Account row (the profile card is SettingsProfileCard.tsx), moved here from the Explorer's /explorer/profile page
// (docs/specs/014-identity/profile-and-email-notifications.md) when that page was retired: everything it held now lives in
// Settings, so a second account home was a second place to look.
//
// Lazy: the confirmation modal pulls in the re-verification code step and
// almost nobody deletes, so it only loads on first click.
const DeleteAccountDialog = dynamic(
  () => import('@/components/dialogs/DeleteAccountDialog').then((m) => m.DeleteAccountDialog),
  { ssr: false },
);

// Delete account. Signed-in only, and not because of the UI: the api's
// DELETE /api/account is account-only by design (docs/specs/014-identity/profile-and-email-notifications.md), since the whole
// point is wiping data bound to a VERIFIED identity. A guest's owner id is an
// unverified header, so honouring it would let anyone wipe anyone's documents.
// The row still renders for guests, saying why, rather than vanishing, so the
// answer to "can I delete my data?" is in the panel either way.
export const DELETE_ACCOUNT_SIGNED_IN =
  'Permanently removes your documents (the Trash included), folders and account, everywhere. There is no undo: you type your email to confirm.';
export const DELETE_ACCOUNT_GUEST =
  'Available once you sign in: a guest browser has no verified account to delete.';

export function SettingsDeleteAccountRow({ row }: { row: SettingsDeleteAccountRowSpec }) {
  const { authLoaded, isSignedIn, user } = useDeferredAuth();
  const signedIn = Boolean(authLoaded && isSignedIn && user);
  const [open, setOpen] = useState(false);

  // One row, the button beside the label and what it does under it.
  const described = {
    ...row,
    description: signedIn ? DELETE_ACCOUNT_SIGNED_IN : DELETE_ACCOUNT_GUEST,
  };

  return (
    <SettingsRowShell
      row={described}
      control={
        signedIn ? (
          <Button variant="secondary" size="sm" onClick={() => setOpen(true)} className="shrink-0">
            Delete Account
          </Button>
        ) : (
          // A guest is offered the way in, beside the label.
          <span className="shrink-0 text-supporting text-slate-500 dark:text-slate-400">
            <SettingsSignInLink />
          </span>
        )
      }
    >
      {open ? (
        <DeleteAccountDialog
          open={open}
          onClose={() => setOpen(false)}
          onDeleted={() => {
            // The account and its session are gone and this browser has forgotten them (AuthBridge's
            // deleteAccount): back to the front door, which lands on Explorer Home, with a fresh load.
            window.location.assign('/');
          }}
        />
      ) : null}
    </SettingsRowShell>
  );
}
