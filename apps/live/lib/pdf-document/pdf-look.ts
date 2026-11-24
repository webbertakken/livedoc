'use client';

// How one person's pages are shown (docs/specs/035-pdf-documents/dark-pages.md): as the file says, or as Dark pages.
// Held by the surface for whatever LiveDoc draws over the pages itself: marks, selections and Find's tints.
import { createContext } from 'react';
import type { PageLook } from '@livedoc/pdf-documents';

export const PdfLookContext = createContext<PageLook>('paper');
