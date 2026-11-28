'use client';

// The template gallery's previews (docs/specs/034-text-documents/starting-and-finding.md "The template gallery's text
// documents"): each template's first page on light and dark paper, drawn in the browser the first time the gallery
// shows, as data URLs for an image each. The templates load with it, never with the page.
import { useEffect, useState } from 'react';
import type { TextDocumentTemplateId } from '@livedoc/text-documents/templates/gallery';
import { debugLog } from '@/lib/debug-log';

export type TextTemplatePicture = { readonly light: string; readonly dark: string };
export type TextTemplatePictures = ReadonlyMap<TextDocumentTemplateId, TextTemplatePicture>;

const dataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

let drawn: Promise<TextTemplatePictures> | null = null;

/** Every template's pictures, drawn once a page; a template that fails to draw is left out, logged. */
export function drawTextTemplatePictures(): Promise<TextTemplatePictures> {
  drawn ??= import('@livedoc/text-documents/templates').then(
    ({ TEXT_DOCUMENT_TEMPLATES, templatePreview }) => {
      const started = performance.now();
      const pictures = new Map<TextDocumentTemplateId, TextTemplatePicture>();
      for (const template of TEXT_DOCUMENT_TEMPLATES) {
        try {
          pictures.set(template.id, {
            light: dataUrl(templatePreview(template, 'light')),
            dark: dataUrl(templatePreview(template, 'dark')),
          });
        } catch (error) {
          console.warn(`[text-template] preview failed id=${template.id}`, error);
        }
      }
      debugLog(
        `[text-template] previews ms=${Math.round(performance.now() - started)} drawn=${pictures.size}`,
      );
      return pictures;
    },
  );
  return drawn;
}

/** The pictures once drawn; null while they are being drawn. */
export function useTextTemplatePictures(): TextTemplatePictures | null {
  const [pictures, setPictures] = useState<TextTemplatePictures | null>(null);
  useEffect(() => {
    let live = true;
    drawTextTemplatePictures().then(
      (drawnPictures) => {
        if (live) setPictures(drawnPictures);
      },
      (error: unknown) => {
        // The templates' code could not load (a deploy, the network): the cards stay blank pages; the next show tries again.
        drawn = null;
        console.warn('[text-template] previews not drawn', error);
      },
    );
    return () => {
      live = false;
    };
  }, []);
  return pictures;
}

export function resetTextTemplatePicturesForTests(): void {
  drawn = null;
}
