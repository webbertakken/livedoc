// @vitest-environment jsdom
// docs/specs/035-pdf-documents/accessibility.md "The accessible tree": headings at their level, lists, tables with
// their header cells, figures and formulas with their alternative text or their kind; a type not known reads as its
// content; an element's language is its own.
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { TagNode } from '@livedoc/pdf-documents';
import { PdfPageTags } from './PdfPageTags';

const node = (type: string, kids: TagNode['kids'], more: Partial<TagNode> = {}): TagNode => ({
  type,
  alt: '',
  lang: '',
  kids,
  ...more,
});

describe('PdfPageTags', () => {
  it('reads headings at their level, a heading with none at level 2, and paragraphs', () => {
    render(
      <PdfPageTags
        nodes={[
          node('Document', [
            node('H1', ['Annual report']),
            node('H', ['Plain']),
            node('P', ['Body']),
          ]),
        ]}
      />,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Annual report' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Plain' })).toBeTruthy();
    expect(screen.getByRole('paragraph').textContent).toBe('Body');
  });

  it('reads a list of items, a label and its body apart', () => {
    render(
      <PdfPageTags
        nodes={[node('L', [node('LI', [node('Lbl', ['1.']), node('LBody', ['Plant trees'])])])]}
      />,
    );

    const item = within(screen.getByRole('list')).getByRole('listitem');
    expect(item.textContent).toBe('1. Plant trees');
  });

  it('reads a table, a row of header cells heading columns and a header cell in a row heading the row', () => {
    render(
      <PdfPageTags
        nodes={[
          node('Table', [
            node('THead', [node('TR', [node('TH', ['Name']), node('TH', ['Score'])])]),
            node('TR', [node('TH', ['Ada']), node('TD', ['9'])]),
            node('TR', []),
          ]),
        ]}
      />,
    );

    const table = screen.getByRole('table');
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent),
    ).toEqual(['Name', 'Score']);
    expect(within(table).getByRole('rowheader').textContent).toBe('Ada');
    expect(within(table).getByRole('cell').textContent).toBe('9');
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    expect(within(table).getByRole('rowgroup')).toBeTruthy();
  });

  it('reads a figure by its alternative text, and one without as its kind alone', () => {
    render(
      <PdfPageTags
        nodes={[
          node('Figure', ['words in the picture'], { alt: 'A red square' }),
          node('Figure', []),
          node('Formula', []),
        ]}
      />,
    );

    expect(screen.getAllByRole('img').map((img) => img.getAttribute('aria-label'))).toEqual([
      'A red square',
      'Figure',
      'Formula',
    ]);
    expect(screen.queryByText('words in the picture')).toBeNull();
  });

  it('reads a type it does not know as its content, inline types inside their block, with their language', () => {
    const view = render(
      <PdfPageTags
        nodes={[node('Sect', [node('P', ['Say', node('Span', ['hallo'], { lang: 'nl' }), 'now'])])]}
      />,
    );

    expect(screen.getByRole('paragraph').textContent).toBe('Say hallo now');
    const span = view.container.querySelector('span[lang="nl"]')!;
    expect(span.textContent).toBe('hallo');
    expect(view.container.firstElementChild!.getAttribute('role')).toBeNull();
  });
});
