// A template's preview (docs/specs/034-text-documents/starting-and-finding.md "The template gallery's text
// documents"): its first page drawn by the page previews engine, without the "Approximate preview" label, in the
// editor's faces, on light or dark paper. Each is drawn once and kept: a template's writing never changes.
import { pagePreviews } from '../previews/page-previews';
import type { PreviewPaper } from '../previews/preview-svg';
import type { TextDocumentTemplate } from './catalogue';

const drawn = new Map<string, string>();

/** The template's first page as SVG, on the paper asked. */
export function templatePreview(template: TextDocumentTemplate, paper: PreviewPaper): string {
  const key = `${template.id}:${paper}`;
  const kept = drawn.get(key);
  if (kept !== undefined) return kept;
  const doc = template.build();
  const read = pagePreviews(
    doc,
    doc.body,
    { from: 1, to: 1 },
    { label: false, paper, faces: true },
  );
  // A template always has a first page; a body past the preview's limit would be a template's bug.
  if (!read.ok) throw new Error(`template ${template.id} has no preview: ${read.message}`);
  const svg = read.pages[0]!.svg;
  drawn.set(key, svg);
  return svg;
}
