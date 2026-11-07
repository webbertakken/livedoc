// Who is creating a document from the New Document menu (docs/specs/013-workspace/new-document-menu.md
// "Steps of startNewDocument"): the Explorer shell binds the person it has already settled, so a start never waits on
// identity. Nobody bound (not on the Explorer, or a guest's signed id not resolved yet) sends the start to /new.
export type NewDocumentCreator = {
  // The account id, or the guest's signed id.
  ownerId: string;
  signedIn: boolean;
};

let creator: NewDocumentCreator | null = null;
const listeners = new Set<() => void>();
const notify = () => {
  for (const listener of listeners) listener();
};

// Binds the creator; the returned function unbinds it, and only it.
export function bindNewDocumentCreator(next: NewDocumentCreator): () => void {
  creator = next;
  notify();
  return () => {
    if (creator !== next) return;
    creator = null;
    notify();
  };
}

// Told when the creator is bound or unbound: the standby follows who is creating.
export function subscribeNewDocumentCreator(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function newDocumentCreator(): NewDocumentCreator | null {
  return creator;
}
