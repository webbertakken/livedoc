'use client';

// The left panel's layers (docs/specs/035-pdf-documents/reading-surface.md "Layers"): the file's PDF layers by name,
// in its order, each a toggle with an eye, pressed while the layer shows for this person. A press shows or hides it
// for them alone; a layer the file locks says so and takes no press. What the file sets is what everyone else sees.
import { useEffect, useState } from 'react';
import { lucideEye, lucideEyeOff, lucideLock } from '@livedoc/icons/lucide';
import { Glyph, Prims } from '@livedoc/ui';
import type { PdfEngine, PdfLayer } from '@livedoc/pdf-documents';
import { debugLog } from '@/lib/debug-log';

export const LAYERS_COPY = {
  reading: 'Reading layers…',
  none: 'This PDF has no layers.',
  failed: 'The layers couldn’t be read.',
  cut: 'This PDF has more layers than LiveDoc lists (1,000).',
  cannot: 'These layers can’t be shown or hidden here.',
  locked: 'Locked',
} as const;

type Read =
  { phase: 'reading' } | { phase: 'failed' } | { phase: 'ready'; layers: readonly PdfLayer[] };

const TOGGLE =
  'flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm outline-none hover:bg-(--office-hover) focus-visible:ring-2 focus-visible:ring-(--office-focus) aria-disabled:cursor-default aria-disabled:hover:bg-transparent';

export function PdfLayersPanel({
  engine,
  hidden,
  onSet,
  most,
}: {
  engine: Pick<PdfEngine, 'layers'>;
  /** The layers this person hides; null while they are as the file sets them. */
  hidden: readonly string[] | null;
  /** Shows or hides one layer, the others as `hidden` says; answers false where it could not. */
  onSet: (id: string, shown: boolean, hidden: readonly string[]) => Promise<boolean>;
  /** How many layers the engine lists at most (PDF_MAX_LAYERS): a list that long may be cut. */
  most: number;
}) {
  const [read, setRead] = useState<Read>({ phase: 'reading' });
  const [cannot, setCannot] = useState(false);

  useEffect(() => {
    let gone = false;
    engine.layers().then(
      (layers) => {
        if (!gone) setRead({ phase: 'ready', layers });
      },
      (error: unknown) => {
        debugLog('[pdf] layers-failed', String(error));
        if (!gone) setRead({ phase: 'failed' });
      },
    );
    return () => {
      gone = true;
    };
  }, [engine]);

  if (read.phase === 'reading')
    return (
      <p role="status" className="px-2 py-2 text-sm text-(--office-muted)">
        {LAYERS_COPY.reading}
      </p>
    );
  if (read.phase === 'failed')
    return (
      <p role="alert" className="px-2 py-2 text-sm">
        {LAYERS_COPY.failed}
      </p>
    );
  const { layers } = read;
  if (layers.length === 0)
    return <p className="px-2 py-2 text-sm text-(--office-muted)">{LAYERS_COPY.none}</p>;

  // The layers hidden now: this person's, or the file's own until they change one.
  const hiddenNow = hidden ?? layers.filter((layer) => !layer.visible).map((layer) => layer.id);
  const press = async (layer: PdfLayer, shown: boolean) => {
    setCannot(!(await onSet(layer.id, !shown, hiddenNow)));
  };

  return (
    <>
      <ul aria-label="Layers" className="flex flex-col gap-0.5 py-1">
        {layers.map((layer) => {
          const shown = !hiddenNow.includes(layer.id);
          return (
            <li key={layer.id}>
              <button
                type="button"
                aria-pressed={shown}
                aria-disabled={layer.locked || undefined}
                aria-label={layer.locked ? `${layer.name}, ${LAYERS_COPY.locked}` : layer.name}
                data-pdf-layer={layer.id}
                onClick={() => {
                  if (!layer.locked) void press(layer, shown);
                }}
                className={TOGGLE}
              >
                <span
                  aria-hidden="true"
                  className="flex size-6 shrink-0 items-center justify-center text-(--office-icon)"
                >
                  <Glyph size={18} units={24}>
                    <Prims prims={shown ? lucideEye : lucideEyeOff} />
                  </Glyph>
                </span>
                <span className={`min-w-0 flex-1 truncate ${shown ? '' : 'text-(--office-muted)'}`}>
                  {layer.name}
                </span>
                {layer.locked ? (
                  <span
                    aria-hidden="true"
                    className="flex shrink-0 items-center gap-1 text-xs text-(--office-muted)"
                  >
                    <Glyph size={14} units={24}>
                      <Prims prims={lucideLock} />
                    </Glyph>
                    {LAYERS_COPY.locked}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
      {layers.length >= most ? (
        <p className="px-2 py-2 text-xs text-(--office-muted)">{LAYERS_COPY.cut}</p>
      ) : null}
      {cannot ? (
        <p role="status" className="px-2 py-2 text-xs">
          {LAYERS_COPY.cannot}
        </p>
      ) : null}
    </>
  );
}
