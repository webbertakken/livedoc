'use client';

import { useCallback, useState } from 'react';

/** A thread an Inbox row asked the text document on `tabId` to go to (inbox.md §1.8); `n` tells one ask from the next. */
export type TextThreadArrival = {
  readonly tabId: string;
  readonly threadId: string;
  readonly n: number;
};

// The editor's half of landing on a text document's thread: the deep link hands the thread over here, and the text
// document's surface goes to it once its writing is there.
export function useTextThreadArrival() {
  const [textThreadArrival, setArrival] = useState<TextThreadArrival | null>(null);
  const openTextThread = useCallback(
    (tabId: string, threadId: string) =>
      setArrival((was) => ({ tabId, threadId, n: (was?.n ?? 0) + 1 })),
    [],
  );
  return { textThreadArrival, openTextThread };
}
