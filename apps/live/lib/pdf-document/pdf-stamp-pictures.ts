// Where the page reads a custom stamp's picture from (docs/specs/035-pdf-documents/custom-stamps.md "Placing one"):
// the open document, by its key (blob-store.md "Getting bytes out"), as the surface reads its stored file. Null
// outside a surface: the stamp is drawn as its outlined box.
import { createContext } from 'react';
import type { BlobKey } from '@livedoc/document';

export type PdfStampPictureRead = (key: BlobKey) => Promise<Uint8Array<ArrayBuffer>>;

export const PdfStampPicturesContext = createContext<PdfStampPictureRead | null>(null);
