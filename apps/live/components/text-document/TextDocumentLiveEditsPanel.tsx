'use client';

// The Live edits side panel's body (docs/specs/034-text-documents/tools.md "Accessibility settings", Show live edits):
// the words others add or remove as they write, newest first, each with its author; the newest read politely once
// it settles. The look and the empty words are (default) until a capture of Google's panel.
import { LiveEdits, type LiveEdit } from '@/lib/text-document/text-document-live-edits';

export const LIVE_EDITS_EMPTY = 'What others write shows here as they write it.';

export function TextDocumentLiveEditsPanel({
  entries,
  said,
}: {
  entries: readonly LiveEdit[];
  /** The entry read last, said once more when it changes. */
  said: string;
}) {
  return (
    <div>
      {entries.length === 0 ? (
        <p className="text-body text-(--office-muted)">{LIVE_EDITS_EMPTY}</p>
      ) : (
        <ul className="flex flex-col gap-2" aria-label="Live edits">
          {entries.map((entry) => (
            <li
              key={`${entry.from}:${entry.at}`}
              className="border-b border-(--office-line) pb-2 text-body break-words last:border-b-0"
            >
              {LiveEdits.say(entry)}
            </li>
          ))}
        </ul>
      )}
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {said}
      </p>
    </div>
  );
}
