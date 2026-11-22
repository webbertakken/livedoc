// A value as text that reads the same whatever order its keys were set in: what two readers of one state compare
// (docs/specs/035-pdf-documents/live-editing-and-storage.md "Replacing the stored file", "The room's op kinds").

/** The value as JSON with every object's keys in order; nothing for a value that is absent. */
export const canonical = (value: unknown): string | undefined =>
  JSON.stringify(value, (_key, held: unknown) =>
    typeof held === 'object' && held !== null && !Array.isArray(held)
      ? Object.fromEntries(Object.entries(held).sort(([a], [b]) => (a < b ? -1 : 1)))
      : held,
  );
