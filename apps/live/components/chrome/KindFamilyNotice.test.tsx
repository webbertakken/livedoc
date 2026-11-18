// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// docs/specs/016-platform/web-performance.md "When a family cannot load".
let attempt: { resolve: (m: unknown) => void; reject: (e: unknown) => void } | null = null;
vi.mock('@/lib/element-kinds/families', () => ({
  KIND_FAMILY_LOADERS: {
    embeds: () => new Promise((resolve, reject) => (attempt = { resolve, reject })),
  },
  KIND_FAMILY_IDS: ['embeds'],
}));

const { KindFamilyNotice } = await import('./KindFamilyNotice');
const { loadKindFamily, resetKindFamiliesForTests } = await import('@/lib/element-kinds/store');

async function failEmbeds() {
  await act(async () => {
    const run = loadKindFamily('embeds', 'element');
    attempt!.reject(new Error('offline'));
    await run;
  });
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  resetKindFamiliesForTests();
  vi.restoreAllMocks();
});

describe('KindFamilyNotice', () => {
  it('shows nothing while every needed family is in', () => {
    const { container } = render(<KindFamilyNotice />);
    expect(container.textContent).toBe('');
  });

  it('says part of the board could not load, and Retry brings it in', async () => {
    render(<KindFamilyNotice />);
    await failEmbeds();
    expect(screen.getByRole('status').textContent).toBe('Part of this board couldn’t load.');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    const retrying = screen.getByRole<HTMLButtonElement>('button', { name: 'Retrying…' });
    expect(retrying.disabled).toBe(true);
    await act(async () => attempt!.resolve({}));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('keeps showing when a retry fails too', async () => {
    render(<KindFamilyNotice />);
    await failEmbeds();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await act(async () => attempt!.reject(new Error('still offline')));
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  });

  it('retries by itself once the connection is back', async () => {
    const { unmount } = render(<KindFamilyNotice />);
    await failEmbeds();
    attempt = null;
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(attempt).not.toBeNull();
    await act(async () => attempt!.resolve({}));
    expect(screen.queryByRole('status')).toBeNull();
    unmount();
  });
});
