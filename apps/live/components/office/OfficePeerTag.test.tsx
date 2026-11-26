// @vitest-environment jsdom
// A collaborator's name tag (docs/specs/029-sheets/sheet.md "Collaboration", docs/specs/035-pdf-documents/
// live-editing-and-storage.md "Presence"): shown when what they hold moves, hidden after a while still, shown on hover.
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OfficePeerTag } from './OfficePeerTag';

afterEach(() => {
  vi.useRealTimers();
});

describe('OfficePeerTag', () => {
  it('shows the name in the person\u2019s colour, hides it once still for freshMs, and shows it on hover', () => {
    vi.useFakeTimers();
    const at = Date.now();
    const { rerender } = render(<OfficePeerTag text="Ada" color="#e11d48" freshMs={500} at={at} />);
    expect(screen.getByText('Ada').getAttribute('style')).toContain('#e11d48');
    act(() => {
      vi.advanceTimersByTime(499);
    });
    expect(screen.getByText('Ada')).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByText('Ada')).toBeNull();
    rerender(<OfficePeerTag text="Ada" color="#e11d48" freshMs={500} at={at} hover />);
    expect(screen.getByText('Ada')).toBeTruthy();
  });

  it('shows the name again at once when what they hold moves', () => {
    vi.useFakeTimers();
    const { rerender } = render(
      <OfficePeerTag text="Ada" color="#e11d48" freshMs={500} at={Date.now()} />,
    );
    act(() => {
      vi.advanceTimersByTime(600);
    });
    rerender(<OfficePeerTag text="Ada" color="#e11d48" freshMs={500} at={Date.now()} />);
    expect(screen.getByText('Ada')).toBeTruthy();
  });

  it('keeps a tag with no time showing', () => {
    vi.useFakeTimers();
    render(<OfficePeerTag text="Bo" color="#2563eb" freshMs={500} />);
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(screen.getByText('Bo')).toBeTruthy();
  });
});
