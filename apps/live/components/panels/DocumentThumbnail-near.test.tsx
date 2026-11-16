// @vitest-environment jsdom

// A thumbnail's loader moves only near the view (docs/specs/016-platform/web-performance.md "Long lists"): a list
// draws rows past the view's edge, and each one's loader ran a dozen animations nobody could see, every frame, for
// as long as the row stayed drawn.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetThumbnailCache } from '@/lib/thumbnail-cache';
import { DocumentThumbnail } from './DocumentThumbnail';

const pending: ((r: { url: string; backgroundColor: null } | null) => void)[] = [];
vi.mock('@/lib/api-client', () => ({
  apiFetchDocumentThumbnailUrl: () => new Promise((resolve) => pending.push(resolve)),
}));

// The observers made, so a test can say what each one sees.
let observers: { cb: IntersectionObserverCallback; disconnected: boolean }[] = [];
beforeAll(() => {
  globalThis.IntersectionObserver = class {
    private readonly entry: { cb: IntersectionObserverCallback; disconnected: boolean };
    constructor(cb: IntersectionObserverCallback) {
      this.entry = { cb, disconnected: false };
      observers.push(this.entry);
    }
    observe() {}
    disconnect() {
      this.entry.disconnected = true;
    }
    unobserve() {}
    takeRecords() {
      return [];
    }
  } as unknown as typeof IntersectionObserver;
  URL.revokeObjectURL = vi.fn();
});
beforeEach(() => {
  observers = [];
  pending.length = 0;
  resetThumbnailCache();
});
afterEach(cleanup);

const box = () => screen.getByTestId('thumbnail-loader').closest('[data-document-thumbnail]')!;
const see = (isIntersecting: boolean) =>
  act(() => {
    const live = observers.filter((o) => !o.disconnected);
    for (const o of live) o.cb([{ isIntersecting } as IntersectionObserverEntry], {} as never);
  });

describe('a thumbnail loader', () => {
  it('holds still until its box is near the view', () => {
    render(<DocumentThumbnail ownerId="me" documentId="d1" version={1} />);
    expect(box().hasAttribute('data-near')).toBe(false);
    see(true);
    expect(box().hasAttribute('data-near')).toBe(true);
  });

  it('holds still again once its box leaves, and moves on when it is back', () => {
    render(<DocumentThumbnail ownerId="me" documentId="d1" version={1} />);
    see(true);
    see(false);
    expect(box().hasAttribute('data-near')).toBe(false);
    see(true);
    expect(box().hasAttribute('data-near')).toBe(true);
  });

  it('asks for its picture once, the first time it is near', () => {
    render(<DocumentThumbnail ownerId="me" documentId="d1" version={1} />);
    see(false);
    expect(pending).toHaveLength(0);
    see(true);
    see(false);
    see(true);
    expect(pending).toHaveLength(1);
  });

  it('stops watching once its picture has an answer', async () => {
    render(<DocumentThumbnail ownerId="me" documentId="d1" version={1} />);
    see(true);
    await act(async () => pending[0]?.(null));
    expect(observers.every((o) => o.disconnected)).toBe(true);
  });

  it('is paused by its stylesheet while its box is not near', () => {
    const css = readFileSync(join(__dirname, '../../app/thumbnail-loader.css'), 'utf8');
    expect(css).toMatch(
      /\[data-document-thumbnail\]:not\(\[data-near\]\) \.lvd-thumb-loader \*\s*\{\s*animation-play-state: paused;/,
    );
  });
});

// An element animating opacity or a transform becomes a composited layer of its own (web-performance.md "Long
// lists"): the strokes fade in by stroke-opacity, and the spinner's arc turns by its dash offset.
describe('a thumbnail loader stroke', () => {
  const css = readFileSync(join(__dirname, '../../app/thumbnail-loader.css'), 'utf8');
  const keyframes = (name: string) => {
    const start = css.indexOf(`@keyframes ${name} {`);
    let depth = 0;
    for (let i = start; i < css.length; i++) {
      if (css[i] === '{') depth++;
      if (css[i] === '}' && --depth === 0) return css.slice(start, i + 1);
    }
    return '';
  };

  it.each(['lvd-thumb-draw-a', 'lvd-thumb-draw-link', 'lvd-thumb-draw-b', 'lvd-thumb-draw-c'])(
    '%s fades in by stroke-opacity, never opacity',
    (name) => {
      expect(keyframes(name)).toMatch(/stroke-opacity: 0;/);
      expect(keyframes(name)).not.toMatch(/[\s{]opacity:/);
    },
  );

  it('turns the spinner by its dash offset, never a transform', () => {
    expect(keyframes('lvd-thumb-spin')).toMatch(/stroke-dashoffset: -1;/);
    expect(keyframes('lvd-thumb-spin')).not.toMatch(/transform/);
  });
});
