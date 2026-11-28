import { describe, expect, it } from 'vitest';
import { DARK_PAPER, LIGHT_PAPER } from '../paper';
import { APPROXIMATE_LABEL } from '../previews/preview-svg';
import { TEXT_DOCUMENT_TEMPLATES, type TextDocumentTemplate } from './catalogue';
import { templatePreview } from './template-previews';

// docs/specs/034-text-documents/starting-and-finding.md "The template gallery's text documents".

/** A preview's most bytes (safe range 10 to 100 KB): fifteen of them, twice, load with the gallery. */
const PREVIEW_BYTES_MAX = 30_000;

describe.each(TEXT_DOCUMENT_TEMPLATES.map((t) => [t.name, t] as const))(
  'the %s preview',
  (_, template) => {
    it('is its first page, unlabelled, on white paper', () => {
      const svg = templatePreview(template, 'light');
      expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="816" height="1056"/);
      expect(svg).toContain(`fill="${LIGHT_PAPER}"`);
      expect(svg).not.toContain(APPROXIMATE_LABEL);
      expect(new TextEncoder().encode(svg).length).toBeLessThan(PREVIEW_BYTES_MAX);
    });

    it('is drawn on dark paper for the dark scheme', () => {
      expect(templatePreview(template, 'dark')).toContain(`fill="${DARK_PAPER}"`);
    });
  },
);

describe('templatePreview', () => {
  it('draws a template once and keeps it', () => {
    let builds = 0;
    const counted: TextDocumentTemplate = {
      ...TEXT_DOCUMENT_TEMPLATES[0]!,
      id: 'text-notes',
      build: () => {
        builds += 1;
        return TEXT_DOCUMENT_TEMPLATES[0]!.build();
      },
    };
    const first = templatePreview({ ...counted, id: 'text-essay' }, 'dark');
    expect(templatePreview({ ...counted, id: 'text-essay' }, 'dark')).toBe(first);
    // The essay's dark preview was drawn above: asking again builds nothing.
    expect(builds).toBe(0);
  });

  it('shows each template’s own writing', () => {
    const svg = templatePreview(
      TEXT_DOCUMENT_TEMPLATES.find((t) => t.id === 'text-project-brief')!,
      'light',
    );
    expect(svg).toContain('>Project brief<');
  });
});
