// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
import { memo, useState, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { createStoreContext } from './store-context';

// docs/specs/008-canvas/canvas-performance.md "A change above the board walks no board": a value handed down past
// the board reaches its readers through a store, so React never walks the board looking for them.

const Shared = createStoreContext<{ n: number } | null>(null);

// A subtree that never renders for its parent: only a reader in it can show a new value.
const Frozen = memo(function Frozen({ children }: { children: ReactNode }) {
  return <>{children}</>;
});

function Reader({ seen }: { seen: number[] }) {
  const value = Shared.useValue();
  seen.push(value?.n ?? -1);
  return <span data-n={value?.n ?? -1} />;
}

function Host({ reader }: { reader: ReactNode }) {
  const [n, setN] = useState(1);
  return (
    <Shared.Provider value={{ n }}>
      <button onClick={() => setN((v) => v + 1)} />
      <Frozen>{reader}</Frozen>
    </Shared.Provider>
  );
}

describe('createStoreContext', () => {
  it('hands its readers the value, and the fallback outside a provider', () => {
    const seen: number[] = [];
    const { container } = render(
      <>
        <Shared.Provider value={{ n: 7 }}>
          <Reader seen={seen} />
        </Shared.Provider>
        <Reader seen={seen} />
      </>,
    );
    expect(
      [...container.querySelectorAll('[data-n]')].map((e) => e.getAttribute('data-n')),
    ).toEqual(['7', '-1']);
  });

  it('renders a reader behind a memo boundary when the value changes, once', () => {
    const seen: number[] = [];
    const { container } = render(<Host reader={<Reader seen={seen} />} />);
    seen.length = 0;
    act(() => container.querySelector('button')!.click());
    expect(seen).toEqual([2]);
    expect(container.querySelector('[data-n]')!.getAttribute('data-n')).toBe('2');
  });

  it('hands a reader rendering in the same pass the new value, never the old one', () => {
    const seen: number[] = [];
    function Both() {
      const [n, setN] = useState(1);
      return (
        <Shared.Provider value={{ n }}>
          <button onClick={() => setN((v) => v + 1)} />
          <Reader key={n} seen={seen} />
        </Shared.Provider>
      );
    }
    const { container } = render(<Both />);
    seen.length = 0;
    act(() => container.querySelector('button')!.click());
    expect(seen).toEqual([2]);
  });

  it('renders no reader for a provider render that keeps the value', () => {
    const seen: number[] = [];
    const value = { n: 3 };
    function Same({ reader }: { reader: ReactNode }) {
      const [, bump] = useState(0);
      return (
        <Shared.Provider value={value}>
          <button onClick={() => bump((v) => v + 1)} />
          <Frozen>{reader}</Frozen>
        </Shared.Provider>
      );
    }
    const { container } = render(<Same reader={<Reader seen={seen} />} />);
    seen.length = 0;
    act(() => container.querySelector('button')!.click());
    expect(seen).toEqual([]);
  });
});
