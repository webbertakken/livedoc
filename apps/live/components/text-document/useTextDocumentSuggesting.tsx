// A text document's suggesting (docs/specs/034-text-documents/review.md "Suggesting", "While suggesting"): who
// suggests while the person is in Suggesting, the line a refused change says, and a new suggestion's telemetry. The
// editor's dispatch reads it through a ref, so a change of mode never rebinds the editor.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TextDocumentCommenter } from '@/lib/text-document/text-document-commenter';
import type { SuggestingDispatch } from '@/lib/text-document/text-document-suggesting-dispatch';
import type { SuggestingRefusal } from '@/lib/text-document/text-document-suggesting';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';

/** What a refused change says (review.md "While suggesting", (default)). */
export const SUGGESTING_REFUSALS: Record<SuggestingRefusal, string> = {
  structure: 'This can’t be suggested yet.',
  'others-format': 'Someone else has suggested a change to this formatting.',
};

/** How long a refusal stays said (ms, (default)). */
export const SUGGESTING_NOTICE_MS = 5000;

export function useTextDocumentSuggesting({
  suggests,
  commenter,
}: {
  /** Whether the person is in Suggesting with a key to suggest with. */
  suggests: boolean;
  commenter: TextDocumentCommenter | null;
}) {
  const [said, setSaid] = useState<string | null>(null);
  const current = useRef({ suggests, commenter });
  useEffect(() => {
    current.current = { suggests, commenter };
  }, [suggests, commenter]);
  useEffect(() => {
    if (said === null) return undefined;
    const timer = window.setTimeout(() => setSaid(null), SUGGESTING_NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [said]);

  const suggester = useCallback(() => {
    const { suggests: on, commenter: who } = current.current;
    if (!on || !who) return null;
    return {
      key: who.key,
      name: who.name,
      colour: who.colour,
      now: Date.now(),
      newId: () => crypto.randomUUID(),
    };
  }, []);

  const dispatch: SuggestingDispatch = useMemo(
    () => ({
      suggester,
      onRefused: (reason) => {
        debugLog('[text-document] suggestion refused', { reason });
        setSaid(SUGGESTING_REFUSALS[reason]);
      },
      onMade: (ids) => {
        debugLog('[text-document] suggestion made', { count: ids.length });
        for (const _ of ids) track('Element', 'Added', 'TextDocumentSuggestion');
      },
    }),
    [suggester],
  );

  const notice =
    said === null ? null : (
      <p
        role="status"
        className="border-b border-(--office-line) bg-(--office-chrome) px-4 py-2 text-center text-body text-(--office-ink)"
      >
        {said}
      </p>
    );
  return { dispatch, notice };
}
