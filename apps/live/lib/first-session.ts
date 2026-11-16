// The first session this page load settled, told outside React (docs/specs/016-platform/web-performance.md "The
// open path asks in parallel"). AuthBridge publishes it the moment its read answers. A state update that reaches
// the root waits for every part of the tree still hydrating, and at a document's address that is the editor, whose
// code is the last to arrive: what must act on the session before then (the early reads) listens here instead.

export type FirstSession = {
  // The account the session names, or null: signed out, a guest-only host, or a read that could not be made.
  accountId: string | null;
  // The session token getter, as AuthBridge hands it to the api client; resolves null when signed out.
  getToken: (opts?: { skipCache?: boolean }) => Promise<string | null>;
};

let first: FirstSession | null = null;
const waiting: ((session: FirstSession) => void)[] = [];

// Only the first settled session is told: a later read (another tab's sign-in) is AuthBridge's to publish in React.
export function publishFirstSession(session: FirstSession): void {
  if (first) return;
  first = session;
  for (const resolve of waiting.splice(0)) resolve(session);
}

export function whenFirstSessionSettled(): Promise<FirstSession> {
  if (first) return Promise.resolve(first);
  return new Promise((resolve) => waiting.push(resolve));
}

export function resetFirstSessionForTests(): void {
  first = null;
  waiting.length = 0;
}
