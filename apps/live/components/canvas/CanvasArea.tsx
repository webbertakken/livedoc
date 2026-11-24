'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { Button } from '@livedoc/ui';
import {
  canvasCodeFailed,
  loadCanvasCode,
  loadedCanvasCode,
  retryCanvasCode,
  subscribeCanvasCode,
} from '@/lib/canvas-code/canvas-code';
import type { CanvasChromePart } from './EditorCanvasChrome';

// Where the canvas meets the editor (docs/specs/006-document/kinds-outside-the-canvas.md "The canvas's code"): the
// canvas's code is its own chunk, read synchronously once in, so a board opened at the open (whose seed waited for
// it) draws in its first frame; a canvas tab chosen before it is in holds its paper until it lands.

const neverFailed = () => false;
const notLoaded = () => null;

function useCanvasCodeModule() {
  return useSyncExternalStore(subscribeCanvasCode, loadedCanvasCode, notLoaded);
}

export function CanvasArea({ paper }: { paper: string }) {
  const module = useCanvasCodeModule();
  const failed = useSyncExternalStore(subscribeCanvasCode, canvasCodeFailed, neverFailed);
  const [retrying, setRetrying] = useState(false);
  useEffect(() => {
    if (!module && !failed) void loadCanvasCode('tab');
  }, [module, failed]);
  // The connection coming back tries again by itself.
  useEffect(() => {
    if (!failed) return;
    const onOnline = () => void retryCanvasCode();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [failed]);
  if (module) return <module.EditorCanvasHost />;
  if (failed)
    return (
      <div
        role="alert"
        className="flex flex-1 flex-wrap items-center justify-center gap-3 p-4 text-body text-slate-600 dark:text-slate-300"
        style={{ backgroundColor: paper }}
      >
        <span>This tab couldn’t load.</span>
        <Button
          variant="secondary"
          size="xs"
          disabled={retrying}
          onClick={() => {
            setRetrying(true);
            void retryCanvasCode().finally(() => setRetrying(false));
          }}
        >
          Try Again
        </Button>
      </div>
    );
  return (
    <div
      data-testid="canvas-placeholder"
      aria-busy="true"
      className="relative flex-1"
      style={{ backgroundColor: paper }}
    />
  );
}

// The chrome only a canvas uses (EditorCanvasChrome), once the canvas's code is in; nothing before.
export function CanvasChromeSlot({
  part,
  splitShowing,
}: {
  part: CanvasChromePart;
  splitShowing: boolean;
}) {
  const module = useCanvasCodeModule();
  return module ? <module.EditorCanvasChrome part={part} splitShowing={splitShowing} /> : null;
}
