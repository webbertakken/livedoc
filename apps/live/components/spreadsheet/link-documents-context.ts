'use client';

// The person's LiveDoc documents, which a spreadsheet's link editor offers and its link card names
// (docs/specs/029-sheets/inserted-objects.md "Insert Link"); none outside an editor.
import { createContext, useContext } from 'react';
import type { LinkDocument } from '@/lib/text-document/text-document-links';

const NONE: readonly LinkDocument[] = [];

export const LinkDocumentsContext = createContext<readonly LinkDocument[]>(NONE);

export const useLinkDocuments = (): readonly LinkDocument[] => useContext(LinkDocumentsContext);
