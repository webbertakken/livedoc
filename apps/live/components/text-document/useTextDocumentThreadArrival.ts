'use client';

// An Inbox row's thread, handed to the text document by the editor (docs/specs/013-workspace/inbox.md §1.8): gone to
// once the surface is ready, once per ask, so the same row opened again goes again.
import { useEffect, useRef } from 'react';

/** The thread the surface is asked to go to; `n` tells one ask from the next. */
export type TextDocumentThreadArrival = { readonly threadId: string; readonly n: number };

export function useTextDocumentThreadArrival({
  arrival,
  ready,
  arrive,
}: {
  arrival: TextDocumentThreadArrival | null;
  ready: boolean;
  arrive: (threadId: string) => void;
}): void {
  const done = useRef(0);
  useEffect(() => {
    if (!arrival || !ready || arrival.n === done.current) return;
    done.current = arrival.n;
    arrive(arrival.threadId);
  }, [arrival, ready, arrive]);
}
