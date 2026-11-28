// Positions in the writing as Yjs relative positions (base64), so a position stays by its character whatever others
// type before it: collaborators' carets (text-document-peers.ts) and where a drawing goes
// (docs/specs/034-text-documents/objects.md "Where it goes"). Each reads the binding of the body the editor shows.
import type { EditorState } from 'prosemirror-state';
import {
  absolutePositionToRelativePosition,
  relativePositionToAbsolutePosition,
  ySyncPluginKey,
} from 'y-prosemirror';
import * as Y from 'yjs';
import { base64OfBytes, bytesOfBase64 } from '@livedoc/office-packages';

export type Binding = {
  doc: Y.Doc;
  type: Y.XmlFragment;
  binding: { mapping: Map<Y.AbstractType<unknown>, unknown> } | null;
};

export function bindingOf(state: EditorState): Binding | null {
  const y = ySyncPluginKey.getState(state) as Binding | undefined;
  return y?.binding ? y : null;
}

export function encode(pos: number, y: Binding): string {
  // y-prosemirror types its answer as any; it is a Yjs relative position.
  const relative = absolutePositionToRelativePosition(
    pos,
    y.type,
    y.binding!.mapping as never,
  ) as unknown as Y.RelativePosition;
  return base64OfBytes(Y.encodeRelativePosition(relative));
}

export function resolve(position: string, y: Binding, size: number): number | null {
  const bytes = bytesOfBase64(position);
  return bytes ? resolveBytes(bytes, y, size) : null;
}

/** Where an encoded relative position is now in the body the binding shows, or null where it does not resolve there. */
export function resolveBytes(bytes: Uint8Array, y: Binding, size: number): number | null {
  if (bytes.byteLength === 0) return null;
  try {
    const at = relativePositionToAbsolutePosition(
      y.doc,
      y.type,
      Y.decodeRelativePosition(bytes),
      y.binding!.mapping as never,
    );
    return at === null ? null : Math.min(at, size);
  } catch {
    return null;
  }
}

/** Where `pos` is, as a relative position, or null before the binding has mapped the document. */
export function anchorOf(state: EditorState, pos: number): string | null {
  const y = bindingOf(state);
  return y && y.binding!.mapping.size > 0 ? encode(pos, y) : null;
}

/** Where a relative position is now in the body the editor shows, or null when it does not resolve there. */
export function positionOf(state: EditorState, anchor: string): number | null {
  const y = bindingOf(state);
  return y ? resolve(anchor, y, state.doc.content.size) : null;
}
