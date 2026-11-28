'use client';

import { useCallback, useState } from 'react';

/**
 * A thread an Inbox row asked the text document or spreadsheet sheet on `tabId` to go to (inbox.md §1.8); `n` tells one
 * ask from the next.
 */
export type ThreadArrival = {
  readonly tabId: string;
  readonly threadId: string;
  readonly n: number;
};

// The editor's half of landing on a text document's or a spreadsheet's thread: the deep link hands the thread over
// here, and the surface goes to it once its writing or its threads are there.
export function useThreadArrival() {
  const [threadArrival, setArrival] = useState<ThreadArrival | null>(null);
  const openThread = useCallback(
    (tabId: string, threadId: string) =>
      setArrival((was) => ({ tabId, threadId, n: (was?.n ?? 0) + 1 })),
    [],
  );
  return { threadArrival, openThread };
}
