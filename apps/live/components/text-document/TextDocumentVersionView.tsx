'use client';

// A text document drawn at a version (docs/specs/034-text-documents/review.md "Version history"): the document tab
// being read, read only, on a page of its first section's width, what the version changed in each editor's colour.
// Bound to a copy of the room's state that nothing sends (blueprint "12g2 research").
import { useEffect, useRef, useState } from 'react';
import { CONTENTS, EQUATION, PICTURE, TextDocumentState } from '@livedoc/text-documents';
import type { TextDocumentFormat } from '@livedoc/document';
import { documentTextStyle } from '@/lib/document-fonts/document-text-style';
import { contentsView } from '@/lib/text-document/text-document-contents';
import { equationView } from '@/lib/text-document/text-document-equations';
import { FIELD_NODE_VIEWS } from '@/lib/text-document/text-document-fields';
import { galleryPicturesOf } from '@/lib/text-document/text-document-gallery-pictures';
import { pageBox } from '@/lib/text-document/text-document-page';
import { pictureView } from '@/lib/text-document/text-document-pictures';
import { tableView } from '@/lib/text-document/text-document-table-dom';
import {
  openVersionView,
  tabHeldAt,
  type VersionDrawing,
  type VersionView,
} from '@/lib/text-document/text-document-version-view';
import { withYChangeViews } from '@/lib/text-document/text-document-ychange';
import type { PageSetup } from '@livedoc/text-documents';

/** Said where the document tab being read was made after the version (default copy). */
export const VERSION_TAB_MISSING = 'This tab didn’t exist yet.';

export function TextDocumentVersionView({
  state,
  tab,
  drawing,
  format,
  where,
}: {
  /** The room's state: every item any version names. */
  state: Uint8Array;
  tab: string;
  drawing: VersionDrawing;
  format: TextDocumentFormat;
  where: { ownerId: string; documentId: string; shareCode: string | null };
}) {
  const mount = useRef<HTMLDivElement>(null);
  const version = useRef<VersionView | null>(null);
  const [setup, setSetup] = useState<PageSetup | null>(null);
  const [held, setHeld] = useState(true);
  const { ownerId, documentId, shareCode } = where;

  useEffect(() => {
    const host = mount.current;
    if (!host) return;
    const gallery = galleryPicturesOf({ ownerId, documentId, shareCode });
    const opened = openVersionView(host, {
      state,
      tab,
      nodeViews: (doc) =>
        withYChangeViews({
          ...FIELD_NODE_VIEWS,
          table: tableView,
          [CONTENTS]: contentsView,
          [EQUATION]: equationView,
          [PICTURE]: pictureView({
            media: (key) => TextDocumentState.media(doc, key),
            ...gallery,
          }),
        }),
      attributes: (doc) => ({
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': 'Document body at this version',
        tabindex: '0',
        class: 'text-document-body whitespace-pre-wrap break-words outline-none',
        style: documentTextStyle(TextDocumentState.defaults(doc, format).text),
      }),
    });
    version.current = opened;
    setSetup(TextDocumentState.section(opened.doc, format).setup);
    return () => {
      version.current = null;
      opened.destroy();
    };
  }, [state, tab, format, ownerId, documentId, shareCode]);

  useEffect(() => {
    const opened = version.current;
    if (!opened) return;
    setHeld(tabHeldAt(opened.doc, tab, drawing.snapshot));
    opened.show(drawing);
  }, [drawing, state, tab, format]);

  return (
    <div
      style={setup ? pageBox(setup) : undefined}
      className="text-document-version mx-auto my-6 min-h-(--page-height) w-(--page-width) max-w-full text-document-page px-6 py-10 text-[11pt] leading-[1.15]"
      data-version-drawn=""
    >
      {held ? null : <p className="text-body text-(--office-muted)">{VERSION_TAB_MISSING}</p>}
      <div ref={mount} className={held ? '' : 'hidden'} />
    </div>
  );
}
