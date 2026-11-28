import { describe, expect, it } from 'vitest';
import { Paragraph, type Block } from '../model/blocks';
import { TextDocument } from '../model/text-document';
import { DARK_INK, DARK_PAPER, fillOnDarkPaper, inkOnDarkPaper } from '../paper';
import { pagePreviews } from './page-previews';
import { APPROXIMATE_LABEL, type PreviewOptions } from './preview-svg';

// docs/specs/034-text-documents/starting-and-finding.md "The template gallery's text documents": the gallery draws a
// template's first page without the label, in the editor's faces, on light or dark paper; agents' previews draw
// shading, borders and highlights too (agents-and-sync.md "Page previews").

const BORDER = { width: 2, dash: 'solid', color: '#00796b', space: 1 } as const;

const svgOf = (body: Block[], options?: PreviewOptions, pageColor?: string) => {
  const blank = TextDocument.blank({ title: 'T' });
  const doc: TextDocument = {
    ...blank,
    body,
    section: {
      ...blank.section,
      setup: { ...blank.section.setup, ...(pageColor ? { pageColor } : {}) },
    },
  };
  const read = pagePreviews(doc, doc.body, { from: 1, to: 1 }, options);
  if (!read.ok) throw new Error(read.message);
  return read.pages[0]!.svg;
};

const styled = (
  text: string,
  props: Paragraph['props'],
  color?: string,
  highlight?: string,
): Paragraph => ({
  type: 'paragraph',
  style: 'Standard',
  props,
  inlines: [
    {
      type: 'run',
      text,
      props: { ...(color ? { color } : {}), ...(highlight ? { highlight } : {}) },
    },
  ],
});

describe('a page preview’s paper', () => {
  it('says it is approximate unless asked not to', () => {
    expect(svgOf([Paragraph.of('Hello', 'Standard')])).toContain(APPROXIMATE_LABEL);
    expect(svgOf([Paragraph.of('Hello', 'Standard')], { label: false })).not.toContain(
      APPROXIMATE_LABEL,
    );
  });

  it('draws on dark paper with the editor’s ink, a coloured ink mirrored', () => {
    const svg = svgOf([styled('Plain', {}), styled('Navy', {}, '#1f3864')], { paper: 'dark' });
    expect(svg).toContain(`fill="${DARK_PAPER}"`);
    expect(svg).toContain(`fill="${DARK_INK}"`);
    expect(svg).toContain(`fill="${inkOnDarkPaper('#1f3864')}"`);
    expect(svg).not.toContain('fill="#000000"');
  });

  it('draws a page colour as the dark paper draws a fill', () => {
    expect(svgOf([Paragraph.of('x', 'Standard')], { paper: 'dark' }, '#fff8e1')).toContain(
      `fill="${fillOnDarkPaper('#fff8e1')}"`,
    );
    expect(svgOf([Paragraph.of('x', 'Standard')], {}, '#fff8e1')).toContain('fill="#fff8e1"');
  });

  it('draws the runs in Inter, or in the editor’s font stack when asked', () => {
    expect(svgOf([Paragraph.of('Hello', 'Standard')])).toContain('font-family="Inter"');
    const faces = svgOf([Paragraph.of('Hello', 'Standard')], { faces: true });
    expect(faces).not.toContain('font-family="Inter" font-size="14');
    expect(faces).toMatch(/font-family="[^"]*sans-serif"/);
  });
});

describe('a page preview’s paragraph decoration', () => {
  it('draws a paragraph’s shading behind its lines, mirrored on dark paper', () => {
    const body = [styled('Open every day', { shading: '#e8f5e9' })];
    expect(svgOf(body)).toMatch(
      /<rect x="96" y="[\d.]+" width="624" height="[\d.]+" fill="#e8f5e9"\/>/,
    );
    expect(svgOf(body, { paper: 'dark' })).toContain(`fill="${fillOnDarkPaper('#e8f5e9')}"`);
  });

  it('draws a rule: an empty paragraph’s bottom border across the line', () => {
    const svg = svgOf([styled('', { borders: { bottom: BORDER } })]);
    expect(svg).toMatch(
      /<line x1="96" y1="[\d.]+" x2="720" y2="[\d.]+" stroke="#00796b" stroke-width="2.67"\/>/,
    );
  });

  it('draws a top border above the writing', () => {
    const svg = svgOf([styled('Heading', { borders: { top: BORDER } })]);
    const [line] = [...svg.matchAll(/<line x1="96" y1="([\d.]+)"/g)].map((m) => Number(m[1]));
    const [text] = [...svg.matchAll(/<text x="[\d.]+" y="([\d.]+)"/g)].map((m) => Number(m[1]));
    expect(line).toBeLessThan(text!);
  });

  it('draws nothing for a border of no width', () => {
    expect(svgOf([styled('x', { borders: { bottom: { ...BORDER, width: 0 } } })])).not.toContain(
      '<line',
    );
  });

  it('draws a run’s highlight behind it', () => {
    const svg = svgOf([styled('Note', {}, undefined, '#ffff00')]);
    expect(svg).toMatch(
      /<rect x="[\d.]+" y="[\d.]+" width="[\d.]+" height="[\d.]+" fill="#ffff00"\/><text/,
    );
  });
});
