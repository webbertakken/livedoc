// @vitest-environment jsdom
// docs/specs/035-pdf-documents/reading-surface.md "The page bar": a group named "Page and zoom" with the page in view,
// the moves to the page before and after, the zoom and its steps; a typed page that is none says so until the next key.
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PdfPageBar, noPageCopy, type PdfPageBarProps } from './PdfPageBar';

function bar(over: Partial<PdfPageBarProps> = {}) {
  const props: PdfPageBarProps = {
    page: 2,
    labels: Array.from({ length: 14 }, () => null),
    atFirst: false,
    atLast: false,
    zoom: 'fit-width',
    scale: 1.17,
    onPrevious: vi.fn(),
    onNext: vi.fn(),
    onGoTo: vi.fn(),
    onZoom: vi.fn(),
    ...over,
  };
  render(<PdfPageBar {...props} />);
  return props;
}

const pageField = () => screen.getByRole('textbox', { name: 'Page' });
const zoomField = () => screen.getByRole('combobox', { name: 'Zoom' });
const button = (name: string) => screen.getByRole('button', { name });

describe('the page bar', () => {
  it('is a group named Page and zoom, saying the page in view of how many', () => {
    bar();
    expect(screen.getByRole('group', { name: 'Page and zoom' })).toBeTruthy();
    expect((pageField() as HTMLInputElement).value).toBe('3');
    expect(screen.getByText('/ 14')).toBeTruthy();
    expect(screen.getByText('of 14')).toBeTruthy();
  });

  it('goes to the page before and after, each dimmed where there is none', () => {
    const props = bar();
    fireEvent.click(button('Previous page'));
    fireEvent.click(button('Next page'));
    expect(props.onPrevious).toHaveBeenCalledOnce();
    expect(props.onNext).toHaveBeenCalledOnce();
  });

  it('dims Previous page on the first page and Next page on the last', () => {
    bar({ atFirst: true, atLast: true });
    expect(button('Previous page')).toHaveProperty('disabled', true);
    expect(button('Next page')).toHaveProperty('disabled', true);
  });

  it('goes to a typed page on Enter', () => {
    const props = bar();
    fireEvent.change(pageField(), { target: { value: '9' } });
    fireEvent.keyDown(pageField(), { key: 'Enter' });
    expect(props.onGoTo).toHaveBeenCalledWith(8);
  });

  // reading-surface.md "Go to page": the field takes a page's label too, and a label is typed, not only digits.
  it('goes to the page a typed label names, and says a label that names none', () => {
    const props = bar({ labels: ['i', 'ii', 'iii', 'iv', '1', '2'] });
    expect(pageField().getAttribute('inputmode')).toBe('text');
    fireEvent.change(pageField(), { target: { value: 'iv' } });
    fireEvent.keyDown(pageField(), { key: 'Enter' });
    expect(props.onGoTo).toHaveBeenCalledWith(3);
    fireEvent.change(pageField(), { target: { value: 'ix' } });
    fireEvent.keyDown(pageField(), { key: 'Enter' });
    expect(screen.getByRole('status').textContent).toBe('There is no page ix.');
  });

  it('asks for digits where no page has a label', () => {
    bar();
    expect(pageField().getAttribute('inputmode')).toBe('numeric');
  });

  it('puts a typed page that is none back and says so until the next key', () => {
    const props = bar();
    fireEvent.change(pageField(), { target: { value: '99' } });
    fireEvent.keyDown(pageField(), { key: 'Enter' });
    expect(props.onGoTo).not.toHaveBeenCalled();
    expect((pageField() as HTMLInputElement).value).toBe('3');
    expect(screen.getByRole('status').textContent).toBe('There is no page 99.');
    fireEvent.keyDown(pageField(), { key: '1' });
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('clears what it said on the next press too', () => {
    bar();
    fireEvent.change(pageField(), { target: { value: '0' } });
    fireEvent.keyDown(pageField(), { key: 'Enter' });
    expect(screen.getByRole('status').textContent).toBe(noPageCopy('0'));
    fireEvent.pointerDown(button('Next page'));
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('puts the page back on Escape', () => {
    bar();
    fireEvent.change(pageField(), { target: { value: '7' } });
    fireEvent.keyDown(pageField(), { key: 'Escape' });
    expect((pageField() as HTMLInputElement).value).toBe('3');
  });
});

describe('the page bar’s zoom', () => {
  it('shows the zoom as a percentage, whichever zoom it is', () => {
    bar({ zoom: 'fit-width', scale: 1.17 });
    expect((zoomField() as HTMLInputElement).value).toBe('117%');
  });

  it('steps out and in from the zoom shown', () => {
    const props = bar({ scale: 1.17 });
    fireEvent.click(button('Zoom out'));
    fireEvent.click(button('Zoom in'));
    expect(vi.mocked(props.onZoom).mock.calls).toEqual([
      [1, 'Out'],
      [1.25, 'In'],
    ]);
  });

  it('dims Zoom out at 10% and Zoom in at 6400%', () => {
    bar({ scale: 0.1 });
    expect(button('Zoom out')).toHaveProperty('disabled', true);
    expect(button('Zoom in')).toHaveProperty('disabled', false);
  });

  it('takes a typed zoom from 10 to 6400, with or without a per cent sign', () => {
    const props = bar();
    fireEvent.change(zoomField(), { target: { value: '250' } });
    fireEvent.keyDown(zoomField(), { key: 'Enter' });
    expect(props.onZoom).toHaveBeenCalledWith(2.5, 'Custom');
  });

  it('lists Fit width, Fit page, Actual size and View > Zoom’s percentages, the zoom in force marked', () => {
    const props = bar({ zoom: 'fit-page', scale: 0.8 });
    fireEvent.keyDown(zoomField(), { key: 'ArrowDown' });
    const options = screen.getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual([
      'Fit width',
      'Fit page',
      'Actual size',
      '50%',
      '75%',
      '125%',
      '150%',
      '200%',
      '400%',
      '800%',
      '1600%',
      '2400%',
      '3200%',
      '6400%',
    ]);
    expect(options[1]!.getAttribute('aria-selected')).toBe('true');
    fireEvent.click(options[0]!);
    expect(props.onZoom).toHaveBeenCalledWith('fit-width', 'FitWidth');
  });
});
