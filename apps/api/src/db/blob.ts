// Bytes in and out of a room's BLOB column: bound as an ArrayBuffer of their own, read back as the Durable Object's
// SQLite answers them (an ArrayBuffer) or as node:sqlite does in tests (a Uint8Array).

/** The bytes to bind to a BLOB column. */
export const toBlob = (bytes: Uint8Array): ArrayBuffer => bytes.slice().buffer;

/** The bytes a BLOB column answered. */
export const fromBlob = (value: unknown): Uint8Array =>
  value instanceof ArrayBuffer ? new Uint8Array(value) : new Uint8Array(value as ArrayLike<number>);
