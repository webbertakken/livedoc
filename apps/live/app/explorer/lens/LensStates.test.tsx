// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LENS_SETTLE_MS, parseLens } from '@livedoc/explorer-lens';
import {
  FILTERED_EMPTY_TITLE,
  FilteredEmpty,
  LOAD_FAILED_TITLE,
  LensAnnouncer,
  LoadFailed,
} from './LensStates';

afterEach(cleanup);

describe('LensAnnouncer', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('says nothing for the lens a view arrives with', () => {
    render(<LensAnnouncer input="plan" shown={2} total={9} />);
    act(() => {
      vi.advanceTimersByTime(LENS_SETTLE_MS);
    });
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('says the count once the lens has settled after a change', () => {
    const { rerender } = render(<LensAnnouncer input="" shown={9} total={9} />);
    rerender(<LensAnnouncer input="p" shown={4} total={9} />);
    rerender(<LensAnnouncer input="pl" shown={2} total={9} />);
    act(() => {
      vi.advanceTimersByTime(LENS_SETTLE_MS - 1);
    });
    expect(screen.getByRole('status').textContent).toBe('');
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByRole('status').textContent).toBe('2 of 9 documents');
  });

  // The view may catch up with its lens after the lens settles (a slow navigation, a list still loading): the region
  // follows the count, never keeping one from before (the race behind main's red explorer-filters smoke, #309).
  it('follows a count that changes after the lens settled', () => {
    const { rerender } = render(<LensAnnouncer input="" shown={3} total={3} />);
    rerender(<LensAnnouncer input="made-by:ai" shown={3} total={3} />);
    act(() => {
      vi.advanceTimersByTime(LENS_SETTLE_MS);
    });
    expect(screen.getByRole('status').textContent).toBe('3 documents');
    rerender(<LensAnnouncer input="made-by:ai" shown={2} total={5} />);
    expect(screen.getByRole('status').textContent).toBe('2 of 5 documents');
  });

  it('goes quiet while a new lens is being typed, and when muted', () => {
    const { rerender } = render(<LensAnnouncer input="" shown={9} total={9} />);
    rerender(<LensAnnouncer input="p" shown={4} total={9} />);
    act(() => {
      vi.advanceTimersByTime(LENS_SETTLE_MS);
    });
    rerender(<LensAnnouncer input="pl" shown={2} total={9} />);
    expect(screen.getByRole('status').textContent).toBe('');
    rerender(<LensAnnouncer input="p" shown={4} total={9} muted />);
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('says when nothing matches', () => {
    const { rerender } = render(<LensAnnouncer input="" shown={9} total={9} />);
    rerender(<LensAnnouncer input="zzz" shown={0} total={9} />);
    act(() => {
      vi.advanceTimersByTime(LENS_SETTLE_MS);
    });
    expect(screen.getByRole('status').textContent).toBe('No documents match');
  });
});

describe('FilteredEmpty', () => {
  it('names every reported word and clears the filters', () => {
    const onClear = vi.fn();
    const { issues } = parseLens('colour:red', { view: 'aggregate', teams: [] });
    render(<FilteredEmpty issues={issues} onClear={onClear} />);
    expect(screen.getByText(FILTERED_EMPTY_TITLE)).toBeTruthy();
    expect(screen.getByText('“colour:red” isn’t a filter, so it’s searched as text.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear Filters' }));
    expect(onClear).toHaveBeenCalledOnce();
  });
});

describe('LoadFailed', () => {
  it('says the documents could not load and offers another try', () => {
    const onRetry = vi.fn();
    render(<LoadFailed onRetry={onRetry} />);
    expect(screen.getByText(LOAD_FAILED_TITLE)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
