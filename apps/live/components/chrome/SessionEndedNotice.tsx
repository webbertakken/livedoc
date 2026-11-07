'use client';

// Says so when a session this page held ends somewhere else (signed out in another browser or tab, expired, revoked;
// docs/specs/014-identity/auth-and-guest-access.md), rather than turning the page
// into a guest's without a word. Once per ending; this page's own sign-out says nothing.

import { useEffect } from 'react';
import { useDeferredAuth } from '@/components/providers/deferred-auth';
import { useToast } from '@/hooks/ui/useToast';

export const SESSION_ENDED_MESSAGE =
  "You've been signed out. Sign in again to keep working in your account.";

export function SessionEndedNotice() {
  const { sessionEnded } = useDeferredAuth();
  const toast = useToast();
  useEffect(() => {
    if (sessionEnded) toast.warning(SESSION_ENDED_MESSAGE);
  }, [sessionEnded, toast]);
  return null;
}
