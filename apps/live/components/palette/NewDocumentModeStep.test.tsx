// @vitest-environment jsdom

// The New Document wizard's mode step (docs/specs/007-editor/new-document-route.md "Choosing a mode"): seven cards of
// one build (Sketch, Structured, Workshop, Plan, then Text document, Spreadsheet, PDF document), four then three, each
// printing its number key, with no template badges; 1 to 7 choose a card; PDF document also opens a file.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { tabOpeningLabel } from '@livedoc/document';
import { popularKindsFor, TEMPLATES } from '@livedoc/templates';
import {
  NEW_DOCUMENT_CHOICES,
  NEW_DOCUMENT_MODES,
  NewDocumentModeStep,
  modeCardSpan,
} from './NewDocumentModeStep';

afterEach(cleanup);

const cards = () => Array.from(document.querySelectorAll<HTMLButtonElement>('[data-new-mode]'));

describe('NewDocumentModeStep', () => {
  it('shows the seven choices in order, Pages no longer among them', () => {
    render(<NewDocumentModeStep selected={null} onChoose={vi.fn()} />);
    expect(cards().map((c) => c.dataset.newMode)).toEqual([...NEW_DOCUMENT_CHOICES]);
    expect(NEW_DOCUMENT_CHOICES).toEqual([
      'draw',
      'diagram',
      'workshop',
      'plan',
      'text-document',
      'spreadsheet',
      'pdf-document',
    ]);
    expect(screen.getByRole('button', { name: /^Text document:/ })).toBeTruthy();
  });

  it('offers Open a PDF file beside PDF document’s blank', () => {
    const onChoose = vi.fn();
    render(<NewDocumentModeStep selected={null} onChoose={onChoose} />);
    fireEvent.click(screen.getByRole('button', { name: /^PDF document:/ }));
    expect(onChoose).toHaveBeenLastCalledWith('pdf-document', 'blank');
    fireEvent.click(screen.getByRole('button', { name: 'Open a PDF file' }));
    expect(onChoose).toHaveBeenLastCalledWith('pdf-document', 'file');
  });

  it('prints each card’s number key, 1 to 7, and names it as a shortcut', () => {
    render(<NewDocumentModeStep selected={null} onChoose={vi.fn()} />);
    cards().forEach((card, i) => {
      const key = card.querySelector('[data-mode-key]')!;
      expect(key.textContent).toBe(String(i + 1));
      expect(key.getAttribute('aria-hidden')).toBe('true');
      expect(card.getAttribute('aria-keyshortcuts')).toBe(String(i + 1));
    });
  });

  it('carries no template badges', () => {
    render(<NewDocumentModeStep selected={null} onChoose={vi.fn()} />);
    for (const mode of NEW_DOCUMENT_MODES) {
      const card = document.querySelector(`[data-new-mode="${mode}"]`)!;
      const titles = popularKindsFor(mode).map((k) => TEMPLATES.find((t) => t.kind === k)?.title);
      // The visible text is the name, the number and the pitch: no template title rides along.
      const visible = Array.from(card.querySelectorAll('span'))
        .filter((el) => !el.closest('svg') && el.children.length === 0)
        .map((el) => el.textContent);
      for (const title of titles) if (title) expect(visible).not.toContain(title);
    }
  });

  it('builds every card alike: four then three at one height', () => {
    render(<NewDocumentModeStep selected={null} onChoose={vi.fn()} />);
    const [diagram, ...rest] = cards();
    for (const card of rest) expect(card.className).toContain('flex-col');
    expect(diagram!.className).toContain('flex-col');
    expect(diagram!.className).not.toMatch(/sm:flex-row/);
    const spans = cards().map(
      (c) => c.closest('[data-mode-card]')!.className.match(/sm:col-span-\d/)?.[0],
    );
    expect(spans).toEqual([...Array(4).fill('sm:col-span-3'), ...Array(3).fill('sm:col-span-4')]);
    expect([0, 1, 2, 3, 4, 5, 6].map(modeCardSpan)).toEqual(spans);
    const grid = diagram!.closest('[data-mode-card]')!.parentElement!;
    expect(grid.className).toMatch(/sm:grid-cols-12/);
    expect(grid.className).toMatch(/sm:auto-rows-fr/);
  });

  it.each(NEW_DOCUMENT_CHOICES.map((mode, i) => [String(i + 1), mode] as const))(
    'chooses with its number key: %s picks %s',
    (key, mode) => {
      const onChoose = vi.fn();
      render(<NewDocumentModeStep selected={null} onChoose={onChoose} />);
      fireEvent.keyDown(screen.getByRole('group', { name: 'What are you making?' }), { key });
      expect(onChoose).toHaveBeenCalledWith(mode, 'blank');
    },
  );

  it('ignores 0, 8 and letters', () => {
    const onChoose = vi.fn();
    render(<NewDocumentModeStep selected={null} onChoose={onChoose} />);
    for (const key of ['0', '8', 'a']) fireEvent.keyDown(document.body, { key });
    expect(onChoose).not.toHaveBeenCalled();
  });

  // After a click on the backdrop the focus is on the page, not a card: the keys still choose.
  it('chooses with a number key pressed anywhere on the page, once', () => {
    const onChoose = vi.fn();
    render(<NewDocumentModeStep selected={null} onChoose={onChoose} />);
    fireEvent.keyDown(document.body, { key: '2' });
    expect(onChoose).toHaveBeenCalledExactlyOnceWith('diagram', 'blank');
    fireEvent.keyDown(cards()[0]!, { key: '3' });
    expect(onChoose).toHaveBeenCalledTimes(2);
    expect(onChoose).toHaveBeenLastCalledWith('workshop', 'blank');
  });

  it('leaves a digit typed in a field, or in a chord, alone', () => {
    const onChoose = vi.fn();
    render(
      <>
        <input aria-label="Elsewhere" />
        <NewDocumentModeStep selected={null} onChoose={onChoose} />
      </>,
    );
    fireEvent.keyDown(screen.getByLabelText('Elsewhere'), { key: '2' });
    fireEvent.keyDown(document.body, { key: '2', metaKey: true });
    fireEvent.keyDown(document.body, { key: '2', ctrlKey: true });
    expect(onChoose).not.toHaveBeenCalled();
  });

  it('chooses on a click and moves focus with the arrows, wrapping', () => {
    const onChoose = vi.fn();
    render(<NewDocumentModeStep selected="draw" onChoose={onChoose} />);
    const [sketch] = cards();
    expect(sketch!.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(
      screen.getByRole('button', { name: new RegExp(`^${tabOpeningLabel('plan')}:`) }),
    );
    expect(onChoose).toHaveBeenCalledWith('plan', 'blank');
    sketch!.focus();
    const group = screen.getByRole('group', { name: 'What are you making?' });
    fireEvent.keyDown(group, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(cards()[6]);
    fireEvent.keyDown(group, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(sketch);
  });
});
