// The root fragments holding the document tabs' bodies (docs/specs/034-text-documents/live-editing-and-storage.md
// "The live model", "The layout"): the tab `t.0`'s is `body`, any other's `tab:<id>`.
import type * as Y from 'yjs';
import { FIRST_DOCUMENT_TAB_ID } from '../model/document-tabs';

export const BODY_FRAGMENT = 'body';
/** A root fragment holding a document tab's body, other than `t.0`'s, is named this, then the tab's id. */
export const TAB_FRAGMENT_PREFIX = 'tab:';

/** The name of the root fragment holding the document tab's body. */
export const tabFragmentName = (id: string): string =>
  id === FIRST_DOCUMENT_TAB_ID ? BODY_FRAGMENT : `${TAB_FRAGMENT_PREFIX}${id}`;

/** The root fragment holding the document tab's body. */
export const tabFragment = (doc: Y.Doc, id: string): Y.XmlFragment =>
  doc.getXmlFragment(tabFragmentName(id));
