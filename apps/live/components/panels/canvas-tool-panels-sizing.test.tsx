// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { CanvasSurfaceProvider } from '@/components/canvas/CanvasSurfaceContext';
import { ImageDropZone } from '@/components/canvas/ImageDropZone';
import { stubResizeObserver } from '@/components/sheets/sheet-ui-test-utils';
import { DEFAULT_AVATAR_CONFIG } from '@/lib/avatar-config';
import { DEFAULT_LASER_CONFIG } from '@/lib/laser-config';
import { AvatarPanel } from './AvatarPanel';
import { PickStatus, SearchingStatus } from './ImageSearchLoader';
import { LaserColourRow } from './LaserColourRow';
import { SettingsToggleRow } from './SettingsToggleRow';

beforeAll(stubResizeObserver);
afterEach(cleanup);

const TRACKED_OR_HEAVY = /\buppercase\b|tracking-|font-semibold|font-bold/;

// docs/specs/004-interface-design/sizing.md: everything read or pressed is 14 px, a hint is 12 px, a key hint is the
// glyph step, a row is 28 px, and nothing is set semibold or in tracked capitals.
describe('canvas tool panels on the sizing scale', () => {
  it('names a settings toggle at the reading size over a 12 px hint', () => {
    render(<SettingsToggleRow label="Minimap" hint="A small map" checked onToggle={() => {}} />);

    expect(screen.getByText('Minimap').className).toContain('text-body');
    expect(screen.getByText('Minimap').className).not.toContain('font-medium');
    expect(screen.getByText('A small map').className).toContain('text-supporting');
  });

  it('titles the laser colour row as the tool option rows are titled', () => {
    render(
      <CanvasSurfaceProvider surface="dark">
        <LaserColourRow
          config={{ ...DEFAULT_LASER_CONFIG, colour: 'red' }}
          selfColour="#0ea5e9"
          onPick={() => {}}
          onOpen={() => {}}
        />
      </CanvasSurfaceProvider>,
    );

    expect(screen.getByText('Colour').className).toContain('text-body');
    expect(screen.getByText('Red').closest('span')!.className).toContain('text-body');
    expect(document.body.innerHTML).not.toMatch(TRACKED_OR_HEAVY);
  });

  it('draws the avatar choices as 28 px rows with key hints at the glyph step', () => {
    render(
      <AvatarPanel
        config={DEFAULT_AVATAR_CONFIG}
        onChange={() => {}}
        onRandomise={() => {}}
        onReaction={() => {}}
        onSendMessage={() => true}
        position={null}
        onMoveTo={() => {}}
      />,
    );

    for (const kbd of document.querySelectorAll('kbd'))
      expect(kbd.className).toContain('text-glyph');
    expect(screen.getByRole('button', { name: 'Randomise avatar' }).className).toContain(
      'size-chip',
    );
    expect(document.body.innerHTML).not.toMatch(TRACKED_OR_HEAVY);
  });

  it('reads the image search status lines at the reading size', () => {
    render(
      <>
        <SearchingStatus query="otters" />
        <PickStatus stage="downloading" />
      </>,
    );

    expect(screen.getByRole('status').querySelector('p')!.className).toContain('text-body');
    expect(document.body.innerHTML).not.toMatch(TRACKED_OR_HEAVY);
  });

  it('prompts the image drop zone at 14 px over a 12 px hint', () => {
    render(
      <ImageDropZone
        onSelectFile={() => {}}
        uploading={false}
        error={null}
        prompt="Drop an image"
      />,
    );

    expect(screen.getByText('Drop an image').className).toContain('text-body');
    expect(screen.getByText('Drop an image').className).not.toContain('font-medium');
    expect(screen.getByText(/PNG, JPEG/).className).toContain('text-supporting');
  });
});
