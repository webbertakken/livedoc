// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Element, Layer } from '@livedoc/document';

const svgBoxed = vi.hoisted(() => ({ calls: 0 }));
vi.mock('@livedoc/document', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@livedoc/document')>();
  return {
    ...actual,
    svgBoxed: (...args: Parameters<typeof actual.svgBoxed>) => {
      svgBoxed.calls += 1;
      return actual.svgBoxed(...args);
    },
  };
});

import { stubResizeObserver } from '@/components/sheets/sheet-ui-test-utils';
import { LayersPanel } from './LayersPanel';

beforeAll(stubResizeObserver);

// docs/specs/016-platform/web-performance.md "Work only when it can change what shows": the Layers panel stays
// mounted once opened, so its row previews (a whole-board render) are drawn only while it is open.

const LAYERS: Layer[] = [{ id: 'a', name: 'A' }];
const box = (id: string, x: number): Element =>
  ({ id, type: 'shape', shape: 'square', x, y: 0, width: 100, height: 60, label: id }) as Element;

function panel(elements: Element[], popoverOpen: boolean) {
  return (
    <LayersPanel
      layers={LAYERS}
      activeLayerId="a"
      counts={new Map()}
      elements={elements}
      popoverOpen={popoverOpen}
      popoverAnchor={{ left: 0, top: 0, bottom: 0, arrowOffset: 0 }}
      onPopoverClose={() => {}}
      onSelectLayer={() => {}}
      onAddLayer={() => {}}
      onRemoveLayer={() => {}}
      onRenameLayer={() => {}}
      onToggleVisibility={() => {}}
      onToggleLock={() => {}}
      onReorderLayer={() => {}}
      onMergeLayer={() => {}}
      onSetLayerOpacity={() => {}}
      onClearLayer={() => {}}
      onHideOtherLayers={() => {}}
      onPreviewLayer={() => {}}
      hoverPreviewEnabled={false}
      showPreview
      showCount
    />
  );
}

describe('LayersPanel while closed', () => {
  it('draws no layer previews as the board changes', () => {
    const view = render(panel([box('p', 0), box('q', 200)], false));
    view.rerender(panel([box('p', 10), box('q', 200)], false));
    view.rerender(panel([box('p', 20), box('q', 200), box('r', 400)], false));
    expect(svgBoxed.calls).toBe(0);
  });

  it('draws them as soon as it opens', () => {
    svgBoxed.calls = 0;
    const view = render(panel([box('p', 0), box('q', 200)], false));
    view.rerender(panel([box('p', 0), box('q', 200)], true));
    expect(svgBoxed.calls).toBe(2);
    expect(view.container.ownerDocument.querySelectorAll('svg').length).toBeGreaterThan(0);
  });
});
