// @vitest-environment jsdom
// docs/specs/035-pdf-documents/reading-surface.md "Find": the field, its count as a polite live region, Previous and
// Next, the four options, All results and Close; Enter and Shift+Enter step, Escape closes; the results listed by
// page with the bookmarks first, each going to its result.
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PageName } from '@livedoc/pdf-documents';
import type { PdfFindResult } from '@/lib/pdf-document/pdf-find';
import { PDF_FIND_OPTIONS_OFF, type PdfFind } from '@/lib/pdf-document/usePdfFind';
import { PdfFindBar } from './PdfFindBar';
import { findGroups, PdfFindResults } from './PdfFindResults';

const snippet = { before: 'the ', match: 'fox', after: ' ran' };
const RESULTS: PdfFindResult[] = [
  { kind: 'bookmark', item: 0, target: null, snippet },
  { kind: 'text', page: 0, span: [4, 7], quads: [], snippet },
  { kind: 'text', page: 2, span: [4, 7], quads: [], snippet },
];

function fakeFind(over: Partial<PdfFind> = {}): PdfFind {
  return {
    open: true,
    focusNonce: 1,
    query: 'fox',
    options: PDF_FIND_OPTIONS_OFF,
    progress: { results: RESULTS, total: 3, searched: 3 },
    current: 1,
    listOpen: false,
    tints: new Map(),
    count: '2 of 3',
    actions: {},
    ask: vi.fn(),
    setOption: vi.fn(),
    step: vi.fn(),
    choose: vi.fn(),
    close: vi.fn(),
    setListOpen: vi.fn(),
    ...over,
  };
}

describe('the find field', () => {
  it('takes the query, steps by its keys and buttons, and says the count politely', () => {
    const find = fakeFind();
    render(<PdfFindBar find={find} onClosed={vi.fn()} />);
    const field = screen.getByRole('searchbox', { name: 'Find' });
    expect(document.activeElement).toBe(field);
    fireEvent.change(field, { target: { value: 'dog' } });
    expect(find.ask).toHaveBeenCalledWith('dog');
    fireEvent.keyDown(field, { key: 'Enter' });
    fireEvent.keyDown(field, { key: 'Enter', shiftKey: true });
    fireEvent.keyDown(field, { key: 'a' });
    fireEvent.click(screen.getByRole('button', { name: 'Next result' }));
    fireEvent.click(screen.getByRole('button', { name: 'Previous result' }));
    expect(vi.mocked(find.step).mock.calls).toEqual([[1], [-1], [1], [-1]]);
    const count = screen.getByRole('status');
    expect(count.textContent).toBe('2 of 3');
    expect(count.getAttribute('aria-live')).toBe('polite');
  });

  it('shows the four options and sets one, and opens All results', () => {
    const find = fakeFind();
    render(<PdfFindBar find={find} onClosed={vi.fn()} />);
    const options = screen.getByRole('button', { name: 'Options' });
    expect(options.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(options);
    expect(options.getAttribute('aria-expanded')).toBe('true');
    const group = screen.getByRole('group', { name: 'Options' });
    expect(
      within(group)
        .getAllByRole('checkbox')
        .map((box) => box.parentElement!.textContent),
    ).toEqual([
      'Match case',
      'Whole words',
      'Include comments and marks’ text',
      'Include bookmarks',
    ]);
    fireEvent.click(within(group).getByRole('checkbox', { name: 'Whole words' }));
    expect(find.setOption).toHaveBeenCalledWith('wholeWords', true);
    fireEvent.click(screen.getByRole('button', { name: 'All results' }));
    expect(find.setListOpen).toHaveBeenCalledWith(true);
  });

  it('closes on Close and on Escape, handing the keys back', () => {
    const find = fakeFind({ progress: null, count: '' });
    const onClosed = vi.fn();
    render(<PdfFindBar find={find} onClosed={onClosed} />);
    expect(screen.getByRole('button', { name: 'Next result' })).toHaveProperty('disabled', true);
    fireEvent.keyDown(screen.getByRole('searchbox', { name: 'Find' }), { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Close find' }));
    expect(find.close).toHaveBeenCalledTimes(2);
    expect(onClosed).toHaveBeenCalledTimes(2);
  });
});

describe('All results', () => {
  const pages = [
    { name: PageName.ofObject(3), width: 1, height: 1, rotation: 0 as const, label: null },
    { name: PageName.ofObject(4), width: 1, height: 1, rotation: 0 as const, label: null },
    { name: PageName.ofObject(5), width: 1, height: 1, rotation: 0 as const, label: 'iii' },
  ];

  it('groups the bookmarks first, then each page by its label or number', () => {
    expect(findGroups(RESULTS, pages).map((group) => group.heading)).toEqual([
      'Bookmarks',
      'Page 1',
      'Page iii',
    ]);
    expect(findGroups([{ ...RESULTS[1]!, page: 9 } as PdfFindResult], pages)[0]!.heading).toBe(
      'Page 10',
    );
  });

  it('lists each result in its line, the current one marked, a press going to it', () => {
    const find = fakeFind({ listOpen: true });
    render(<PdfFindResults find={find} pages={pages} focusNonce={0} />);
    const page = screen.getByRole('region', { name: 'Page iii' });
    const result = within(page).getByRole('button', { name: 'the fox ran' });
    fireEvent.click(result);
    expect(find.choose).toHaveBeenCalledWith(2);
    const current = within(screen.getByRole('region', { name: 'Page 1' })).getByRole('button');
    expect(current.getAttribute('aria-current')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Close Find results' }));
    expect(find.setListOpen).toHaveBeenCalledWith(false);
  });

  it('says the count with no results', () => {
    render(
      <PdfFindResults
        find={fakeFind({ progress: null, count: 'No results' })}
        pages={pages}
        focusNonce={0}
      />,
    );
    expect(screen.getByText('No results')).toBeTruthy();
  });
});
