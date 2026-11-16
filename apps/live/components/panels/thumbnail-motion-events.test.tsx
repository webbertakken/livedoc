// @vitest-environment jsdom

// A thumbnail's motion stays its own (docs/specs/016-platform/web-performance.md "Long lists"): the loader's
// animations and the picture's crossfade start, repeat and end without an event reaching React.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DocumentThumbnail } from './DocumentThumbnail';

vi.mock('@/lib/api-client', () => ({
  apiFetchDocumentThumbnailUrl: () => new Promise(() => {}),
}));

beforeAll(() => {
  globalThis.IntersectionObserver = class {
    observe() {}
    disconnect() {}
    unobserve() {}
    takeRecords() {
      return [];
    }
  } as unknown as typeof IntersectionObserver;
});
afterEach(cleanup);

const MOTION_EVENTS = [
  'animationstart',
  'animationiteration',
  'animationend',
  'animationcancel',
  'transitionrun',
  'transitionstart',
  'transitionend',
  'transitioncancel',
];

// React listens on its root container; a listener on the body hears what React's would.
function listenAtTheRoot() {
  const heard: string[] = [];
  const hear = (e: Event) => heard.push(e.type);
  for (const type of MOTION_EVENTS) document.body.addEventListener(type, hear);
  return heard;
}

function Row() {
  return (
    <div>
      <DocumentThumbnail ownerId="me" documentId="d1" version={1} />
      <span>Title</span>
    </div>
  );
}

describe('a thumbnail motion event', () => {
  it('never reaches React from inside a thumbnail', () => {
    render(<Row />);
    const heard = listenAtTheRoot();
    const part = screen.getByTestId('thumbnail-loader').querySelector('rect')!;
    for (const type of MOTION_EVENTS) fireEvent(part, new Event(type, { bubbles: true }));
    expect(heard).toEqual([]);
  });

  it('still reaches React from outside one', () => {
    render(<Row />);
    const heard = listenAtTheRoot();
    for (const type of MOTION_EVENTS)
      fireEvent(screen.getByText('Title'), new Event(type, { bubbles: true }));
    expect(heard).toEqual(MOTION_EVENTS);
  });
});
