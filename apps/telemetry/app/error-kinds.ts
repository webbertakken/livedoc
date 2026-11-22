// How the dashboard reads error events (docs/specs/017-telemetry/telemetry.md), shared by the Exceptions
// tab and the Exceptions stack on the Dashboard so both split failures the same
// way.
//
// Types took their `<Kind>.<Where>` shape in #112; rows stored before that are
// the bare kind (`Http500`, `Internal`, `Uncaught`). The predicates below read
// the kind as the first dot-part, so both shapes land in the same card.

export const kindOf = (type: string | null) => (type ?? '').split('.')[0] ?? '';

// Error·Client types that are not exceptions. RealtimeResync is the editor
// recovering on its own: the realtime room told it it had missed updates and
// it refetched (useRoomResync). Worth watching, since a lot of them means the
// room is dropping ops, but it is a recovery, not a crash, so it gets its own
// card instead of inflating Client Exceptions. StaleChunkReload is a tab from an earlier build
// loading the page in full when a code chunk the last deploy removed failed to load
// (docs/specs/016-platform/stale-builds.md); the failure itself stays a Client Exception.
export const RECOVERY_TYPES: readonly string[] = ['RealtimeResync', 'StaleChunkReload'];
export const isRecovery = (type: string | null) => RECOVERY_TYPES.includes(kindOf(type));

// Where a request a caller saw fail (`Error·Api`) is counted: exactly one card each, so the cards partition the
// category and none counts a row twice (docs/specs/017-telemetry/telemetry.md, Health › Exceptions).
//
//   - ServerFault: the caller saw the server fail. Every `Http5xx` (editor, CLI, MCP, email sends) and an email
//     provider's own error code (`<Code>.SendEmail`).
//   - Refusal: the api said no, correctly: every other `Http<status>`, and the editor refusing a request before
//     sending it (`Auth.NoSessionToken`, `Confined.<Method>.<Route>`).
//   - DroppedConnection: the request never got an answer. `Network.*`, and the CLI's and MCP worker's
//     `Internal.<Verb|Tool>`, whose second part is a verb or a tool rather than an HTTP method.
//   - ServerCrash: the api worker's own `Internal.<Method>.<Route>`. A bare `Internal` predates #112 and is counted
//     here, the api worker having been its main source.
//   - ClientException: the editor's own throw on a request path, never answered by the server
//     (`SaveFailed.<Kind>`, `LoadFailed.<Surface>.<Kind>`).
//
// A kind this does not know lands in ServerFault, where someone looks; a test walks every kind the code emits.
export type ApiFailureCard =
  'ServerFault' | 'Refusal' | 'DroppedConnection' | 'ServerCrash' | 'ClientException';

const HTTP_METHODS = new Set(['Get', 'Post', 'Put', 'Patch', 'Delete', 'Head', 'Options']);
const HTTP_STATUS = /^Http(\d{3})$/;
const REFUSED_BEFORE_SENDING = new Set(['Auth', 'Confined']);
const CLIENT_THROWS = new Set(['SaveFailed', 'LoadFailed']);

export function apiFailureCard(type: string | null): ApiFailureCard {
  const [kind = '', second] = (type ?? '').split('.');
  const status = HTTP_STATUS.exec(kind);
  if (status) return Number(status[1]) >= 500 ? 'ServerFault' : 'Refusal';
  if (kind === 'Internal') {
    return second === undefined || HTTP_METHODS.has(second) ? 'ServerCrash' : 'DroppedConnection';
  }
  if (kind === 'Network') return 'DroppedConnection';
  if (REFUSED_BEFORE_SENDING.has(kind)) return 'Refusal';
  if (CLIENT_THROWS.has(kind)) return 'ClientException';
  return 'ServerFault';
}

export const isServerFault = (type: string | null) => apiFailureCard(type) === 'ServerFault';
export const isRefusal = (type: string | null) => apiFailureCard(type) === 'Refusal';
export const isDroppedConnection = (type: string | null) =>
  apiFailureCard(type) === 'DroppedConnection';
export const isServerCrash = (type: string | null) => apiFailureCard(type) === 'ServerCrash';
export const isApiClientException = (type: string | null) =>
  apiFailureCard(type) === 'ClientException';
