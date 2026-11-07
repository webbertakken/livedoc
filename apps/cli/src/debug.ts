// The CLI's debug lines (docs/specs/015-api/cli.md): `[cli] …` fingerprints on
// stderr, only under LIVEDOC_DEBUG=1 (CLI44), so stdout stays data and a quiet run stays quiet. A repository
// link's modules print under their own scope, `[sync] …` and `[link] …` (RL33).

import type { CliIo } from './io';

export type DebugLog = (line: string) => void;

export function debugLog(io: CliIo, scope = 'cli'): DebugLog {
  return io.env.LIVEDOC_DEBUG === '1' ? (line) => io.stderr(`[${scope}] ${line}\n`) : () => {};
}
