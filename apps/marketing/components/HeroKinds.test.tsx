// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HeroKinds } from './HeroKinds';

// docs/specs/004-interface-design/brand-mark.md "Every kind".
describe('HeroKinds', () => {
  let observe: (entries: { isIntersecting: boolean }[]) => void = () => {};
  afterEach(() => vi.unstubAllGlobals());
  const stubObserver = () =>
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: (e: { isIntersecting: boolean }[]) => void) {
          observe = cb;
        }
        observe() {}
        disconnect() {}
      },
    );

  it('stacks the four kinds on the page, each with its name', () => {
    stubObserver();
    const { container } = render(<HeroKinds />);
    const kinds = [...container.querySelectorAll('[data-kind]')].map((k) =>
      k.getAttribute('data-kind'),
    );
    expect(kinds).toEqual(['page', 'sheet', 'board', 'form']);
    const names = [...container.querySelectorAll('[data-kind-name]')].map((n) => n.textContent);
    expect(names).toEqual(['Page', 'Sheet', 'Board', 'Form']);
  });

  it('names itself once for assistive tech, and hides the cycling caption', () => {
    stubObserver();
    const { container, getByRole } = render(<HeroKinds />);
    expect(getByRole('img', { name: 'Pages, sheets, boards and forms' })).toBeTruthy();
    expect(
      container.querySelector('[data-kind-name]')!.closest('[aria-hidden="true"]'),
    ).not.toBeNull();
  });

  it('pauses while off screen and runs while on it', () => {
    stubObserver();
    const { container } = render(<HeroKinds />);
    const root = container.firstElementChild!;
    act(() => observe([{ isIntersecting: false }]));
    expect(root.hasAttribute('data-paused')).toBe(true);
    act(() => observe([{ isIntersecting: true }]));
    expect(root.hasAttribute('data-paused')).toBe(false);
  });
});
