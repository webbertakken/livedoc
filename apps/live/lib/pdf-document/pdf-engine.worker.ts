// The engine's worker thread (docs/specs/035-pdf-documents/security.md "The boundary"): the only place a PDF's bytes
// are parsed in a browser. Its code and the reader's binary load with a PDF document's surface, never before.
import { startPdfEngine } from '@livedoc/pdf-documents/engine/browser';
import type { PdfEnginePort } from './pdf-engine-protocol';
import { servePdfEngine } from './pdf-engine-server';

servePdfEngine(self as unknown as PdfEnginePort, startPdfEngine);
