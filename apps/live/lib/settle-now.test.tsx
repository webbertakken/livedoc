// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { useLayoutEffect, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { settleNow } from './settle-now';

// docs/specs/007-editor/toolbar-layout.md "Motion": what an observer reports is applied before the frame is drawn,
// except during a View Transition, which a synchronous update in the middle of would leave unanimated.

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(document, 'activeViewTransition');
});

let set: (n: number) => void = () => {};
function Shown() {
  const [n, setN] = useState(0);
  useLayoutEffect(() => {
    set = setN;
  }, []);
  return <output data-testid="n">{n}</output>;
}

describe('settleNow', () => {
  it('applies the update at once, outside React', () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', false);
    const view = render(<Shown />);
    settleNow(() => set(1));
    expect(view.getByTestId('n').textContent).toBe('1');
  });

  it('leaves the update to React during a View Transition', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', false);
    const view = render(<Shown />);
    Object.defineProperty(document, 'activeViewTransition', { configurable: true, value: {} });
    settleNow(() => set(2));
    expect(view.getByTestId('n').textContent).toBe('0');
    await vi.waitFor(() => expect(view.getByTestId('n').textContent).toBe('2'));
  });
});
