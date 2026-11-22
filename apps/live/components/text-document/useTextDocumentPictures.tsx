'use client';

// Insert > Image, the toolbar's Insert image, and pictures pasted or dropped as files
// (docs/specs/034-text-documents/objects.md "Inserting"): Upload from computer opens the computer's file chooser, Search
// the web and LiveDoc gallery the shared image picker on that tab; each picture is placed at the caret, its media in the
// gallery or its bytes in the state; a refusal is said in a note under the toolbar. An Editor's alone.
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { EditorView } from 'prosemirror-view';
import type * as Y from 'yjs';
import { bytesOfBase64 } from '@livedoc/text-documents/base64';
import type { ImagePickerTab } from '@/components/panels/ImagePicker';
import type { OfficeChoices } from '@/components/office/OfficeChoiceMenu';
import { apiFetchImageBytes } from '@/lib/api/images';
import { debugLog } from '@/lib/debug-log';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import { track } from '@/lib/telemetry';
import { IMAGE_ENTRIES } from '@/lib/text-document/text-document-menus';
import {
  placePictureFile,
  INSERT_PICTURE,
  placeStoredPicture,
  storeOrKeep,
  type PicturePlacing,
  type PutPicture,
} from '@/lib/text-document/text-document-picture-place';
import type { TakePictureFiles } from '@/lib/text-document/text-document-picture-paste';
import { addImageFileForDocument, UPLOAD_ACCEPT_ATTR, type PickedImage } from '@/lib/upload-image';

const ImagePicker = dynamic(
  () => import('@/components/panels/ImagePicker').then((m) => m.ImagePicker),
  { ssr: false },
);

/** How long the note that a picture was not placed stays (default). */
export const PICTURE_NOTICE_MS = 10_000;
/** The toolbar's Insert image control, whose list is Insert > Image's. */
export const INSERT_IMAGE_CONTROL = 'insert-image';

export type Source = 'Upload' | 'Gallery' | 'Search' | 'Paste' | 'Drop';

/** How a picture brought goes in, and what is counted once it has: inserted at the caret, or in a picture's place. */
export type Bringing = {
  readonly put: PutPicture;
  readonly placed: (source: Source) => void;
  // The most files one choice brings (Replace image takes one).
  readonly most?: number;
};

const INSERTING: Bringing = {
  put: INSERT_PICTURE,
  placed: (source) => track('Element', 'Added', `TextDocumentImage${source}`),
};

const SOURCE_OF_PICK: Record<NonNullable<PickedImage['source']>, Source> = {
  upload: 'Upload',
  gallery: 'Gallery',
  search: 'Search',
};

/** A picture picked: its bytes, from the data URI This Browser embeds, else read once from the gallery. */
async function pickedBytes(
  picked: PickedImage,
  where: { ownerId: string; documentId: string },
): Promise<Uint8Array | undefined> {
  if (picked.id.startsWith('data:'))
    return bytesOfBase64(picked.id.slice(picked.id.indexOf(',') + 1)) ?? undefined;
  return apiFetchImageBytes(where.ownerId, picked.id, { documentId: where.documentId });
}

export function useTextDocumentPictures({
  view,
  liveDoc,
  ownerId,
  documentId,
  canEdit,
  room,
}: {
  view: EditorView | null;
  liveDoc: { readonly current: Y.Doc | null };
  ownerId: string;
  documentId: string;
  // Whether pictures may be placed: an Editor, in the body.
  canEdit: boolean;
  // The text's room at the caret in points: its column's width and the page's text height.
  room: { width: number; height: number };
}) {
  const [picker, setPicker] = useState<{ tab: ImagePickerTab; bringing: Bringing } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (notice === null) return;
    const timer = window.setTimeout(() => setNotice(null), PICTURE_NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);

  // What a placing reads when it lands, after its upload: the newest view, writing and room.
  const latest = useRef({ view, room });
  useLayoutEffect(() => {
    latest.current = { view, room };
  });
  const placing = useMemo<PicturePlacing>(
    () => ({
      view: () => latest.current.view,
      doc: () => liveDoc.current,
      room: () => latest.current.room,
      onRefused: setNotice,
    }),
    [liveDoc],
  );
  const store = useMemo(
    () => storeOrKeep((file) => addImageFileForDocument(ownerId, documentId, file)),
    [ownerId, documentId],
  );

  const placeFiles = useCallback(
    async (files: readonly File[], source: Source, bringing: Bringing = INSERTING) => {
      setNotice(null);
      // One after another, each at the caret the last one left.
      for (const file of files)
        if (await placePictureFile(placing, file, store, bringing.put)) bringing.placed(source);
    },
    [placing, store],
  );

  const take = useCallback<TakePictureFiles>(
    (files, source) => {
      if (!canEdit) return false;
      void placeFiles(files, source);
      return true;
    },
    [canEdit, placeFiles],
  );

  const chooseFile = useCallback(
    (bringing: Bringing = INSERTING) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = UPLOAD_ACCEPT_ATTR;
      input.addEventListener(
        'change',
        () => void placeFiles([...(input.files ?? [])].slice(0, bringing.most), 'Upload', bringing),
        { once: true },
      );
      input.click();
    },
    [placeFiles],
  );

  const onPicked = useCallback(
    async (picked: PickedImage, bringing: Bringing) => {
      setPicker(null);
      setNotice(null);
      const bytes = await pickedBytes(picked, { ownerId, documentId }).catch(() => undefined);
      if (!bytes) {
        setNotice('The picture could not be read. Try again.');
        debugLog('[text-document] picked picture unread', { id: picked.id.slice(0, 40) });
        return;
      }
      const stored = picked.id.startsWith('data:') ? null : picked.id;
      if (await placeStoredPicture(placing, bytes, stored, bringing.put))
        bringing.placed(SOURCE_OF_PICK[picked.source ?? 'upload']);
    },
    [ownerId, documentId, placing],
  );

  const actions = useMemo((): OfficeActions => {
    if (!canEdit || !view) return {};
    return {
      'image-upload': { run: () => chooseFile() },
      'image-search': { run: () => setPicker({ tab: 'search', bringing: INSERTING }) },
      'image-gallery': { run: () => setPicker({ tab: 'gallery', bringing: INSERTING }) },
    };
  }, [canEdit, view, chooseFile]);

  const choices = useMemo(
    (): OfficeChoices => ({
      [INSERT_IMAGE_CONTROL]: { read: () => null, entries: IMAGE_ENTRIES, actions },
    }),
    [actions],
  );

  const dialog =
    picker !== null ? (
      <ImagePicker
        ownerId={ownerId}
        documentId={documentId}
        forElementId={null}
        initialTab={picker.tab}
        onSelect={(picked) => void onPicked(picked, picker.bringing)}
        onClose={() => {
          setPicker(null);
          view?.focus();
        }}
      />
    ) : null;

  const noticeBar =
    notice !== null ? (
      <p
        role="status"
        className="border-b border-(--office-line) bg-(--office-chrome) px-4 py-2 text-center text-sm text-(--office-ink)"
      >
        {notice}
      </p>
    ) : null;

  // What Replace image brings a picture with: the file chooser or the picker, in a picture's place.
  const bring = useMemo(
    () => ({
      chooseFile,
      openPicker: (tab: ImagePickerTab, bringing: Bringing) => setPicker({ tab, bringing }),
    }),
    [chooseFile],
  );

  return { actions, choices, dialog, notice: noticeBar, take, bring };
}
