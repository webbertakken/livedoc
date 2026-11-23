// @vitest-environment jsdom
// docs/specs/035-pdf-documents/reading-surface.md "The pages": Links. A control over each link's rectangle, placed
// through the page's matrix, named for where it leads; a press follows it and starts
// no selection on the page under it.
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PageLink, PageMatrix } from '@livedoc/pdf-documents';
import { linkBox, PdfPageLinks } from './PdfPageLinks';

const UPRIGHT: PageMatrix = [1, 0, 0, -1, 0, 792];
// A quarter turn clockwise: page space's (x, y) shows at (792 - y, x).
const TURNED: PageMatrix = [0, 1, -1, 0, 792, 0];
const ADDRESS: PageLink = {
  rect: [72, 692, 272, 712],
  target: { kind: 'address', address: 'https://example.com/a' },
};

describe('a link’s place on its page', () => {
  it('lies over its rectangle as the page shows, upright or turned', () => {
    const upright = linkBox(UPRIGHT, [61.2, 396, 306, 712.8], 612, 792);
    expect(Object.values(upright).map((value) => Math.round(value * 1e6) / 1e6)).toEqual([
      10, 10, 40, 40,
    ]);
    const turned = linkBox(TURNED, [0, 0, 306, 396], 792, 612);
    expect(turned).toEqual({ left: 50, top: 0, width: 50, height: 50 });
  });
});

describe('the links of a page', () => {
  it('names each link for where it leads, its tooltip the target, and follows it on a press', () => {
    const onFollow = vi.fn();
    const onPointerDown = vi.fn();
    render(
      <div onPointerDown={onPointerDown}>
        <PdfPageLinks
          matrix={UPRIGHT}
          width={612}
          height={792}
          links={[ADDRESS]}
          nameOf={(target) => `Link to ${target.kind}`}
          onFollow={onFollow}
        />
      </div>,
    );
    const link = screen.getByRole('button', { name: 'Link to address' });
    fireEvent.pointerDown(link);
    fireEvent.click(link);
    expect(onFollow).toHaveBeenCalledWith(ADDRESS.target);
    expect(onPointerDown).not.toHaveBeenCalled();
  });
});
