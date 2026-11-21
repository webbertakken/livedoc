// @vitest-environment jsdom
// docs/specs/034-text-documents/page-layout.md "Line numbers" (Drawn): each page draws its lines' numbers in its left
// margin, each ending where the layout put it and as high as its line; hidden from assistive technology.
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { TextDocumentSheets, sheetsFrame } from './TextDocumentSheets';

describe('TextDocumentSheets', () => {
  it("draws each page's line numbers in its margin, ending 0.25 in before the text", () => {
    const pages = [
      {
        width: 816,
        height: 1056,
        lines: [
          { top: 96, height: 20, right: 72, number: 1 },
          { top: 116, height: 20, right: 72, number: 2 },
        ],
      },
      { width: 816, height: 1056 },
    ];
    const { container } = render(<TextDocumentSheets pages={pages} shadow />);
    const numbers = [...container.querySelectorAll<HTMLElement>('[data-line-number]')];
    expect(numbers.map((n) => n.textContent)).toEqual(['1', '2']);
    expect(numbers[1]!.style.top).toBe('116px');
    expect(numbers[1]!.style.height).toBe('20px');
    expect(numbers[1]!.style.right).toBe(`${816 - 72}px`);
    expect(numbers[0]!.closest('[data-page-sheet]')?.getAttribute('data-page-sheet')).toBe('1');
    expect(numbers[0]!.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(sheetsFrame(pages)).toEqual({ width: 816, height: 2 * 1056 + 12 });
  });
});

// docs/specs/034-text-documents/page-layout.md "Watermark" (drawn): centred on every page, behind the writing, hidden.
describe('TextDocumentSheets watermark', () => {
  it('draws the watermark on every page, turned, at its transparency, Auto stretched across its box', () => {
    const look = {
      text: 'DRAFT',
      width: 560,
      height: 180,
      fontSize: 180,
      fit: true,
      family: 'Arial, sans-serif',
      bold: true,
      italic: false,
      colour: '#c0c0c0',
      opacity: 0.5,
      rotate: -45,
    };
    const pages = [
      { width: 816, height: 1056 },
      { width: 816, height: 1056 },
    ];
    const { container } = render(<TextDocumentSheets pages={pages} shadow watermark={look} />);
    const marks = [...container.querySelectorAll<SVGElement>('[data-watermark]')];
    expect(marks).toHaveLength(2);
    expect(marks[0]!.style.transform).toBe('translate(-50%, -50%) rotate(-45deg)');
    expect(marks[0]!.style.opacity).toBe('0.5');
    const text = marks[0]!.querySelector('text')!;
    expect(text.textContent).toBe('DRAFT');
    expect(text.getAttribute('textLength')).toBe('560');
    expect(text.getAttribute('font-weight')).toBe('bold');
    expect(marks[0]!.closest('[aria-hidden="true"]')).not.toBeNull();
  });
});
