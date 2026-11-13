// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DetectedSticky } from '@livedoc/sticky-vision';
import type { PhotoReview, PhotoWall, ReviewedPhoto } from '@/hooks/canvas/usePhotoDraft';
import { PhotoWallReview } from './PhotoWallReview';

// One review for the whole wall (docs/specs/021-event-storming/event-storming.md Phase 11 "What a person does"): a
// strip of the photos, each kept as the author left it, the same paper marked on the later photo, one Add.

afterEach(cleanup);

// Boxes 20 px apart on a 100 px wide photo: a note is 10 px, so 0.2 of the width apart.
const box = (id: number, x: number): DetectedSticky => ({
  id,
  kind: 'domain-event',
  size: 'square',
  x,
  y: 10,
  w: 10,
  h: 10,
  row: 0,
  order: id,
  confidence: 0.9,
});

function photo(name: string, labels: string[]): PhotoReview {
  const stickies = labels.map((_, i) => box(i, 5 + i * 20));
  return {
    photoUrl: `blob:${name}`,
    photoName: name,
    detection: {
      stickies,
      crops: [],
      imageSize: { width: 100, height: 100 },
      photoUrl: 'data:image/jpeg;base64,xx',
      imageData: new Uint8ClampedArray(100 * 100 * 4),
      dropped: 0,
      detector: { path: 'classical', reason: 'no-worker' },
    },
    textById: new Map(labels.map((text, i) => [i, { text, legible: true }])),
    readError: null,
    readSoFar: labels.length,
  };
}

function draw(over: Partial<PhotoWall> = {}) {
  const onGo = vi.fn<(i: number) => void>();
  const onConfirmWall = vi.fn<(photos: ReviewedPhoto[]) => void>();
  const wall: PhotoWall = {
    reviews: [photo('1.jpg', ['A', 'B', 'C', 'D']), photo('2.jpg', ['C', 'D', 'E', 'F'])],
    current: 0,
    skipped: 1,
    leftOut: 0,
    ...over,
  };
  const view = render(
    <PhotoWallReview
      wall={wall}
      reading={false}
      onGo={onGo}
      onConfirmWall={onConfirmWall}
      onCancel={() => {}}
    />,
  );
  return { onGo, onConfirmWall, wall, view };
}

describe('PhotoWallReview', () => {
  it('shows a strip of the photos and the photo on screen', () => {
    draw();
    const strip = screen.getByRole('navigation', { name: 'Photos of the wall' });
    expect(strip.textContent).toContain('1 file left out');
    expect(
      screen.getByRole('button', { name: 'Photo 1 of 2: 1.jpg' }).getAttribute('aria-current'),
    ).toBe('step');
    expect(screen.getByAltText('The photographed wall').getAttribute('src')).toBe('blob:1.jpg');
  });

  it('counts the notes the whole wall lands, the overlap once', () => {
    draw();
    expect(screen.getByRole('button', { name: 'Add 6 notes from 2 photos' })).toBeTruthy();
  });

  it('marks the paper an earlier photo already shows', () => {
    draw({ current: 1 });
    const marks = [...document.querySelectorAll('[data-seen-on]')].map((m) => m.textContent);
    expect(marks).toEqual(['on photo 1', 'on photo 1']);
  });

  it('moves between photos and keeps each as the author left it', () => {
    const { onGo, view, wall } = draw();
    // Untick A on the first photo, then go to the second and back.
    fireEvent.click(screen.getAllByRole('checkbox')[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Photo 2 of 2: 2.jpg' }));
    expect(onGo).toHaveBeenCalledWith(1);
    view.rerender(
      <PhotoWallReview
        wall={{ ...wall, current: 1 }}
        reading={false}
        onGo={onGo}
        onConfirmWall={vi.fn()}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: 'Add 5 notes from 2 photos' })).toBeTruthy();
    view.rerender(
      <PhotoWallReview
        wall={{ ...wall, current: 0 }}
        reading={false}
        onGo={onGo}
        onConfirmWall={vi.fn()}
        onCancel={() => {}}
      />,
    );
    expect(screen.getAllByRole('checkbox')[0]!.getAttribute('aria-checked')).toBe('false');
  });

  it('adds every photo at once, each as it stands', () => {
    const { onConfirmWall } = draw();
    fireEvent.click(screen.getByRole('button', { name: 'Add 6 notes from 2 photos' }));
    const photos = onConfirmWall.mock.calls[0]![0];
    expect(photos.map((p) => p.kept.length)).toEqual([4, 4]);
    expect(photos[1]!.texts.get(3)).toEqual({ text: 'F', legible: true });
  });

  it('lands a photo that was never detected as nothing', () => {
    const blank = { ...photo('3.jpg', []), detection: null, readError: 'photo_unreadable' };
    const { onConfirmWall } = draw({
      reviews: [photo('1.jpg', ['A']), blank],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add 1 note from 2 photos' }));
    expect(onConfirmWall.mock.calls[0]![0][1]!.kept).toEqual([]);
  });
});
