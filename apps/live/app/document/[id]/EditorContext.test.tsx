// @vitest-environment jsdom
import { memo } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  EditorStateProvider,
  useEditorContext,
  useEditorStateStore,
  useOptionalEditorContext,
  type EditorStateStore,
} from './EditorContext';

type State = Parameters<typeof EditorStateProvider>[0]['state'];
const stateOf = (documentName: string) => ({ documentName }) as unknown as State;

afterEach(cleanup);

const ignore = () => {};
let renders = 0;
const count = () => {
  renders += 1;
};

function Reader() {
  return <p>{useEditorContext().documentName}</p>;
}

// A boundary nothing above it re-renders, as the canvas's memoised views are.
const Still = memo(function Still({ onRender }: { onRender: () => void }) {
  onRender();
  return <Reader />;
});

describe('EditorStateProvider', () => {
  it('hands a reader below a still boundary each new state', () => {
    function Page({ name }: { name: string }) {
      return (
        <EditorStateProvider state={stateOf(name)}>
          <Still onRender={ignore} />
        </EditorStateProvider>
      );
    }
    const view = render(<Page name="One" />);
    expect(screen.getByText('One')).toBeTruthy();
    view.rerender(<Page name="Two" />);
    expect(screen.getByText('Two')).toBeTruthy();
  });

  it('keeps the context value the same store across states', () => {
    const seen: (EditorStateStore | null)[] = [];
    const Probe = memo(function Probe() {
      seen.push(useEditorStateStore());
      return null;
    });
    function Page({ name }: { name: string }) {
      return (
        <EditorStateProvider state={stateOf(name)}>
          <Probe />
        </EditorStateProvider>
      );
    }
    const view = render(<Page name="One" />);
    view.rerender(<Page name="Two" />);
    view.rerender(<Page name="Three" />);
    // A changed context value would have re-rendered the probe; the store never changes.
    expect(seen).toHaveLength(1);
    expect(seen[0]).not.toBeNull();
  });

  it('re-renders a boundary that reads no state for none of the changes', () => {
    renders = 0;
    function Page({ name }: { name: string }) {
      return (
        <EditorStateProvider state={stateOf(name)}>
          <Still onRender={count} />
        </EditorStateProvider>
      );
    }
    const view = render(<Page name="One" />);
    view.rerender(<Page name="Two" />);
    expect(renders).toBe(1);
  });

  it('reads nothing outside an editor', () => {
    function Outside() {
      return <p>{useOptionalEditorContext() === null ? 'none' : 'some'}</p>;
    }
    render(<Outside />);
    expect(screen.getByText('none')).toBeTruthy();
    expect(() => render(<Reader />)).toThrow(/EditorStateProvider/);
  });
});
