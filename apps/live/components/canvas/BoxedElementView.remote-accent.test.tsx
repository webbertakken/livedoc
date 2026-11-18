// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { loadEveryKindFamily } from '@/lib/element-kinds/load-every-family';
import { createShape, type BoxedElement } from '@livedoc/document';
import { BoxedElementView } from '@/components/canvas/BoxedElementView';
import type { RemoteSelector } from '@/lib/presence-rows';

// Every element kind family in, as the editor has them once the board is open (lib/element-kinds).
beforeAll(loadEveryKindFamily);

// A collaborator's selection shows as the element's outline in their colour (docs/specs/007-editor/live-app.md "Concurrent-selection lock");
// it never recolours a face whose accent paints its content. A card being dragged by someone else turned its header
// band, media and tags into the selector's colour.

const PURPLE = 'rgb(124, 58, 237)';
const OWN = 'rgb(2, 132, 199)';
const selector: RemoteSelector = { id: 'peer', name: 'Peer', color: PURPLE, holds: true };

function draw(element: BoxedElement, remoteSelectors: RemoteSelector[]) {
  return render(
    <BoxedElementView
      element={element}
      isSelected={false}
      isEditing={false}
      isPaintMode={false}
      showHandles={false}
      showAnchors={false}
      onBeginDrag={vi.fn()}
      onBeginEdit={vi.fn()}
      onCommitLabel={vi.fn()}
      onCommitTable={vi.fn()}
      onCancelEdit={vi.fn()}
      onFollowLink={vi.fn()}
      onOpenComments={vi.fn()}
      onOpenAction={vi.fn()}
      onOpenNote={vi.fn()}
      isoDepth={0}
      onSetPageHeading={vi.fn()}
      onContextSelect={vi.fn()}
      tabLocked={false}
      tabSummaries={[]}
      readOnly={false}
      remoteSelectors={remoteSelectors}
    />,
  );
}

const painted = (container: HTMLElement, colour: string) =>
  [...container.querySelectorAll<HTMLElement>('*')].some((n) => n.style.backgroundColor === colour);

describe('a remote selection and a face accent', () => {
  it("keeps a card's header band in its own accent while a collaborator has it selected", () => {
    const card = {
      ...createShape('card', 0, 0),
      width: 280,
      height: 150,
      cardHeader: true,
      strokeColor: '#0284c7',
    } as BoxedElement;
    const { container } = draw(card, [selector]);
    expect(painted(container, OWN)).toBe(true);
    expect(painted(container, PURPLE)).toBe(false);
  });

  it("keeps a boundary's tab in its own accent while a collaborator has it selected", () => {
    const boundary = {
      ...createShape('boundary', 0, 0),
      width: 300,
      height: 200,
      label: 'Region',
      strokeColor: '#0284c7',
    } as BoxedElement;
    const { container } = draw(boundary, [selector]);
    expect(painted(container, OWN)).toBe(true);
    expect(painted(container, PURPLE)).toBe(false);
  });
});
