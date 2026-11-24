// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Tab } from '@livedoc/document';
import { createShape } from '@livedoc/document';
import { renderTabToCanvas } from './export-tab';

// docs/specs/034-text-documents/objects.md "Its picture": a drawing's PNG is drawn on a transparent ground, the whole
// tab's paper and pattern left unpainted; any other export paints them as before.

let fills: { style: unknown; args: unknown[] }[] = [];

beforeEach(() => {
  fills = [];
  const ctx: Record<string, unknown> = {};
  const proxy = new Proxy(ctx, {
    get: (target, key) => {
      if (key === 'measureText') return (text: string) => ({ width: text.length * 7 });
      if (key === 'fillRect')
        return (...args: unknown[]) => fills.push({ style: target.fillStyle, args });
      return key in target ? target[key as string] : () => undefined;
    },
    set: (target, key, value) => {
      target[key as string] = value;
      return true;
    },
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(proxy as never);
  class FakeImage {
    onload: (() => void) | null = null;
    set src(_: string) {
      queueMicrotask(() => this.onload?.());
    }
  }
  vi.stubGlobal('Image', FakeImage);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const tab = {
  id: 't',
  name: 'T',
  backgroundColor: '#123456',
  elements: [{ ...createShape('square', 0, 0), id: 's' }],
} as unknown as Tab;

describe('renderTabToCanvas paper', () => {
  it('paints the tab’s paper across the picture', async () => {
    await renderTabToCanvas(tab, { fontCss: '' });
    expect(fills.some((f) => f.style === '#123456')).toBe(true);
  });

  it('leaves the paper unpainted on a transparent ground', async () => {
    await renderTabToCanvas(tab, { fontCss: '', transparentPaper: true });
    expect(fills.some((f) => f.style === '#123456')).toBe(false);
  });
});
