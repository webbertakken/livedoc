// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Brand, BrandMark } from './Brand';
import { BRAND_SHEETS, sheetTransform } from './brand-mark-geometry';
import { PRISM_PALETTES, prismPalette } from './brand-prism';

const stops = (container: HTMLElement) =>
  [...container.querySelectorAll('stop')].map((s) => ({
    light: s.style.getPropertyValue('--ldm-l'),
    dark: s.style.getPropertyValue('--ldm-d'),
  }));

// The wordmark is a logotype (WCAG 1.4.3 sets logo text no contrast minimum); the contrast audits
// find it by its mark rather than by its classes.
describe('Brand', () => {
  it('marks its wordmark as a logotype', () => {
    const { container } = render(<Brand />);
    expect(container.querySelector('[data-logotype]')!.textContent).toBe('LiveDoc');
  });

  it('accents "Live", brand-700 in light and sky-400 in dark, with "Doc" in ink', () => {
    const { container } = render(<Brand />);
    const live = container.querySelector('[data-logotype] > span');
    expect(live?.textContent).toBe('Live');
    expect(live?.className).toBe('text-brand-700 dark:text-sky-400');
  });

  it('tints "Live" and the mark from a theme accent', () => {
    const { container } = render(<Brand accentColor="#db2777" />);
    const live = container.querySelector<HTMLElement>('[data-logotype] > span');
    expect(live?.style.color).toBe('rgb(219, 39, 119)');
    const vivid = prismPalette('light', '#db2777').vivid;
    expect(stops(container).map((s) => s.light)).toContain(vivid);
  });

  it('renders as a link when given an href', () => {
    const { container } = render(<Brand href="/" />);
    expect(container.querySelector('a')?.getAttribute('href')).toBe('/');
    // Named on the link, so it keeps a name where a caller hides the wordmark (the editor header on a phone).
    expect(container.querySelector('a')?.getAttribute('aria-label')).toBe('LiveDoc');
  });

  // The editor's Back (docs/specs/007-editor/toolbar-layout.md "The top line"): a caret before the mark alone, named
  // for where it goes.
  it('draws the mark alone, after what leads it, under the name it is given', () => {
    const { container } = render(
      <Brand
        href="/explorer"
        wordmark={false}
        label="Back to the Explorer"
        leading={<i data-caret="" />}
        markClassName="size-6"
      />,
    );
    const link = container.querySelector('a')!;
    expect(link.getAttribute('aria-label')).toBe('Back to the Explorer');
    expect(container.querySelector('[data-logotype]')).toBeNull();
    expect(link.firstElementChild?.hasAttribute('data-caret')).toBe(true);
    expect(link.querySelector('svg')?.getAttribute('class')).toContain('size-6');
  });
});

describe('BrandMark', () => {
  it('carries the brand light and dark palettes on every stop', () => {
    const { container } = render(<BrandMark />);
    const all = stops(container);
    expect(all.length).toBe(9);
    expect(container.querySelectorAll('linearGradient').length).toBe(4);
    expect(all.map((s) => s.light)).toContain(PRISM_PALETTES.light.vivid);
    expect(all.map((s) => s.dark)).toContain(PRISM_PALETTES.dark.vivid);
  });

  it('gives each instance its own gradient ids', () => {
    const { container } = render(
      <>
        <BrandMark />
        <BrandMark accentColor="#15803d" />
      </>,
    );
    const ids = [...container.querySelectorAll('linearGradient')].map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const path of container.querySelectorAll('[fill^="url"]')) {
      const ref = path.getAttribute('fill')!.slice(5, -1);
      expect(ids).toContain(ref);
    }
  });

  it('draws two bold lines in compact, and finer lines, grid cells and sheen in full', () => {
    const compact = render(<BrandMark />).container;
    expect(compact.querySelectorAll('[data-line]').length).toBe(2);
    expect(compact.querySelectorAll('rect').length).toBe(0);
    const full = render(<BrandMark variant="full" />).container;
    expect(full.querySelectorAll('[data-line]').length).toBe(4);
    expect(full.querySelectorAll('rect').length).toBe(3);
    expect(full.querySelector('[stroke*="-sheen)"]')).not.toBeNull();
  });

  it('draws one colour at per-sheet opacity in mono, for a solid tile', () => {
    const { container } = render(<BrandMark tone="mono" />);
    expect(container.querySelector('linearGradient')).toBeNull();
    const sheets = [...container.querySelectorAll('[data-sheet] > path:first-child')];
    expect(sheets.map((p) => p.getAttribute('opacity'))).toEqual(
      BRAND_SHEETS.map((s) => String(s.monoOpacity)),
    );
    for (const p of sheets) expect(p.getAttribute('fill')).toBe('currentColor');
    expect(container.querySelectorAll('mask').length).toBe(2);
  });

  it('rests on the stack: the sheet, the plain sheet and the page, each in its place', () => {
    const { container } = render(<BrandMark />);
    const groups = [...container.querySelectorAll('[data-sheet]')];
    expect(groups.map((g) => g.getAttribute('data-sheet'))).toEqual(['sheet', 'plain', 'page']);
    expect(groups.map((g) => g.getAttribute('transform'))).toEqual(
      BRAND_SHEETS.map((s) => sheetTransform(s.step)),
    );
  });

  it('is decorative', () => {
    expect(
      render(<BrandMark />)
        .container.querySelector('svg')
        ?.getAttribute('aria-hidden'),
    ).toBe('true');
  });
});

describe('the hover fan', () => {
  it('fans the stack open while pointed at, and closes it after', async () => {
    const { act, fireEvent } = await import('@testing-library/react');
    const frames: FrameRequestCallback[] = [];
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      frames.push(cb);
      return frames.length;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as never;
    const { container } = render(<Brand href="/" />);
    const page = () => container.querySelector('[data-sheet="page"]')!.getAttribute('transform');
    const rest = page();
    const step = (ms: number) =>
      act(() => frames.splice(0).forEach((cb) => cb(performance.now() + ms)));

    fireEvent.pointerEnter(container.querySelector('a')!, { pointerType: 'mouse' });

    fireEvent.pointerMove(container.querySelector('a')!, { pointerType: 'mouse' });
    step(1000);
    expect(page()).not.toBe(rest);

    fireEvent.pointerLeave(container.querySelector('a')!);
    step(0);
    step(5000);
    expect(page()).toBe(rest);
    raf.mockRestore();
  });

  it('holds still under reduced motion', () => {
    const raf = vi.spyOn(window, 'requestAnimationFrame');
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as never;
    const { container } = render(<Brand href="/" />);
    container
      .querySelector('a')!
      .dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }));
    expect(raf).not.toHaveBeenCalled();
    raf.mockRestore();
  });
});

describe('the wordmark', () => {
  it('holds still when the logo is pointed at: only the mark moves', async () => {
    const { fireEvent } = await import('@testing-library/react');
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as never;
    const { container } = render(<Brand href="/" />);
    const wordmark = container.querySelector<HTMLElement>('[data-logotype]')!;
    const before = wordmark.outerHTML;
    fireEvent.pointerEnter(container.querySelector('a')!, { pointerType: 'mouse' });
    fireEvent.pointerMove(container.querySelector('a')!, { pointerType: 'mouse' });
    expect(wordmark.querySelector('[aria-hidden="true"]')).toBeNull();
    expect(wordmark.outerHTML).toBe(before);
  });
});

describe('a logo link to the page already open', () => {
  it('scrolls to the top instead of reloading', async () => {
    const { fireEvent } = await import('@testing-library/react');
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as never;
    const scrollTo = vi.fn();
    window.scrollTo = scrollTo as never;
    const { container } = render(<Brand href={window.location.pathname} />);
    const event = fireEvent.click(container.querySelector('a')!);
    expect(event).toBe(false);
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });

  it('jumps without smoothing under reduced motion', async () => {
    const { fireEvent } = await import('@testing-library/react');
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as never;
    const scrollTo = vi.fn();
    window.scrollTo = scrollTo as never;
    const { container } = render(<Brand href={window.location.pathname} />);
    fireEvent.click(container.querySelector('a')!);
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'auto' });
  });

  it('navigates normally to another page, or on a modified click', async () => {
    const { fireEvent } = await import('@testing-library/react');
    const scrollTo = vi.fn();
    window.scrollTo = scrollTo as never;
    const other = render(<Brand href="/somewhere-else/" />);
    expect(fireEvent.click(other.container.querySelector('a')!)).toBe(true);
    const here = render(<Brand href={window.location.pathname} />);
    expect(fireEvent.click(here.container.querySelector('a')!, { metaKey: true })).toBe(true);
    expect(scrollTo).not.toHaveBeenCalled();
  });
});

describe('sizes', () => {
  it('sets the large logo a size up for the footer, with a wider gap', () => {
    const { container } = render(<Brand size="lg" />);
    expect(container.firstElementChild!.className).toContain('gap-3 text-2xl');
    expect(container.querySelector('svg')!.getAttribute('class')).toContain('size-10');
  });
});

// docs/specs/004-interface-design/brand-mark.md: each sheet is a screen-space motion group
// around the isometric sheet group, so the assembly, the press and the fan never write the same property.
describe('the motion structure', () => {
  it('wraps each sheet in a motion group, inside one art group', () => {
    const { container } = render(<BrandMark />);
    const art = container.querySelector('[data-mark-art]')!;
    const groups = [...art.querySelectorAll('[data-sheet-motion]')];
    expect(groups.map((g) => g.getAttribute('data-sheet-motion'))).toEqual([
      'sheet',
      'plain',
      'page',
    ]);
    for (const g of groups) {
      expect(g.getAttribute('transform')).toBeNull();
      expect(g.firstElementChild!.getAttribute('data-sheet')).toBe(
        g.getAttribute('data-sheet-motion'),
      );
    }
  });

  it('marks the fold, the lines and the cells for the assembly', () => {
    const { container } = render(<BrandMark variant="full" />);
    expect(container.querySelectorAll('[data-fold]').length).toBe(1);
    expect(container.querySelectorAll('[data-line]').length).toBe(4);
    expect(container.querySelectorAll('[data-cell]').length).toBe(3);
  });

  it('draws the given page content instead of the text lines', () => {
    const { container } = render(<BrandMark variant="full" pageContent={<circle data-x="" />} />);
    expect(container.querySelector('[data-sheet="page"] [data-x]')).not.toBeNull();
    expect(container.querySelectorAll('[data-line]').length).toBe(0);
  });
});

// docs/specs/004-interface-design/brand-mark.md "Size and motion": assemble, as a page loads.
describe('the assembly', () => {
  it('marks a header logo to assemble, and leaves others alone', () => {
    expect(render(<Brand assemble />).container.querySelector('[data-assemble]')).not.toBeNull();
    expect(render(<Brand />).container.querySelector('[data-assemble]')).toBeNull();
  });

  it('wraps Doc in its own span so it can arrive after Live', () => {
    const { container } = render(<Brand />);
    const parts = [...container.querySelectorAll('[data-logotype] > span:not([aria-hidden])')];
    expect(parts.map((p) => p.textContent)).toEqual(['Live', 'Doc']);
  });
});

// docs/specs/004-interface-design/brand-mark.md "Size and motion": press, on clicking.
describe('the press', () => {
  const animated = () => {
    const calls: { el: Element; frames: Keyframe[]; options: KeyframeAnimationOptions }[] = [];
    const animate = vi.fn(function (
      this: Element,
      frames: Keyframe[],
      options: KeyframeAnimationOptions,
    ) {
      calls.push({ el: this, frames, options });
      return { cancel: () => {}, finished: Promise.resolve() } as unknown as Animation;
    });
    Object.assign(Element.prototype, { animate, getAnimations: () => [] });
    return calls;
  };

  it('draws the sheets toward the page and the art a touch smaller, then eases back', async () => {
    const { fireEvent } = await import('@testing-library/react');
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as never;
    const calls = animated();
    const { container } = render(<Brand href="/somewhere-else/" />);
    const link = container.querySelector('a')!;
    fireEvent.pointerDown(link, { pointerType: 'mouse', button: 0 });
    const pressed = calls.map(
      (c) =>
        c.el.getAttribute('data-sheet-motion') ??
        (c.el.hasAttribute('data-mark-art') ? 'art' : '?'),
    );
    expect(pressed.sort()).toEqual(['art', 'plain', 'sheet']);
    expect(calls.every((c) => c.options.duration === 90)).toBe(true);
    fireEvent.pointerUp(link);
    const released = calls.slice(3);
    expect(released).toHaveLength(3);
    expect(released.every((c) => c.options.duration === 160)).toBe(true);
    // No overshoot: every release ends where the mark rests.
    for (const c of released) expect(c.frames.at(-1)).toMatchObject({ transform: 'none' });
  });

  it('only dims under reduced motion', async () => {
    const { fireEvent } = await import('@testing-library/react');
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as never;
    const calls = animated();
    const { container } = render(<Brand href="/somewhere-else/" />);
    fireEvent.pointerDown(container.querySelector('a')!, { pointerType: 'mouse', button: 0 });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.frames.at(-1)).toMatchObject({ opacity: 0.85 });
  });

  it('presses from the keyboard with Enter or Space', async () => {
    const { fireEvent } = await import('@testing-library/react');
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as never;
    const calls = animated();
    const { container } = render(<Brand href="/somewhere-else/" />);
    fireEvent.keyDown(container.querySelector('a')!, { key: 'Enter' });
    expect(calls).toHaveLength(3);
  });
});
