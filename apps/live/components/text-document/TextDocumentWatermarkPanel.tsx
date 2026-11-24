'use client';

// The Watermark side panel's body (docs/specs/034-text-documents/page-layout.md "Watermark", "The panel"): Image (dimmed
// until pictures) and Text; Text's words, font, size, bold, italic, colour, transparency and layout, each choice applied
// at once; the words once typing pauses or the field is left; Remove watermark and Done.
import { useEffect, useId, useRef, useState } from 'react';
import { DocumentFonts } from '@livedoc/document';
import { Watermarks, type Watermark, type WatermarkLayout } from '@livedoc/text-documents';
import { OfficeDialogColourField } from '@/components/office/OfficeDialogColourField';
import { OFFICE_PANEL_START } from '@/components/office/OfficePanel';
import { OfficeDialogTabs, officeTabPanel } from '@/components/office/OfficeDialogTabs';
import { OfficeBoldIcon, OfficeItalicIcon } from '@/components/office/office-icons';
import { WATERMARK_SIZES } from '@/lib/text-document/text-document-watermark';

/** How long typing pauses before the words apply, in milliseconds (default). */
export const WATERMARK_TYPING_PAUSE_MS = 500;

const CONTROL =
  'h-prominent rounded-control border border-(--office-line) bg-transparent px-3 text-body text-(--office-ink) outline-none focus-visible:ring-2 focus-visible:ring-(--office-focus)';
const SELECT = `${CONTROL} w-full cursor-pointer [&>option]:bg-(--office-menu)`;
const LABEL = 'mb-1 text-body font-medium';
const PRESS =
  'flex size-9 items-center justify-center rounded-control text-(--office-icon) outline-none hover:bg-(--office-hover) focus-visible:ring-2 focus-visible:ring-(--office-focus) aria-pressed:bg-(--office-pressed) aria-pressed:text-(--office-pressed-ink)';
const BUTTON =
  'touch-target relative inline-flex h-prominent items-center rounded-full px-6 text-body font-medium outline-none focus-visible:ring-2 focus-visible:ring-(--office-focus)';

const LAYOUTS: readonly (readonly [WatermarkLayout, string])[] = [
  ['diagonal', 'Diagonal'],
  ['horizontal', 'Horizontal'],
];
const TABS = [
  ['image', 'Image'],
  ['text', 'Text'],
] as const;
const AUTO = 'auto';

export function TextDocumentWatermarkPanel({
  watermark,
  onApply,
  onDone,
}: {
  watermark: Watermark | undefined;
  onApply: (next: Watermark | undefined) => void;
  onDone: () => void;
}) {
  const id = useId();
  const ids = {
    text: useId(),
    font: useId(),
    size: useId(),
    transparency: useId(),
    layout: useId(),
  };
  // The words being typed, until they apply; otherwise the watermark's.
  const [typed, setTyped] = useState<string | null>(null);
  // The transparency being slid, until it is let go.
  const [sliding, setSliding] = useState<number | null>(null);
  const pause = useRef<ReturnType<typeof setTimeout> | null>(null);
  const current = watermark ?? Watermarks.text('');
  const text = typed ?? current.text;
  const fonts = DocumentFonts.menu().includes(current.font)
    ? DocumentFonts.menu()
    : [current.font, ...DocumentFonts.menu()];
  const transparency = sliding ?? Math.round(current.transparency * 100);

  useEffect(
    () => () => {
      if (pause.current) clearTimeout(pause.current);
    },
    [],
  );

  const choose = (change: Partial<Watermark>) => onApply({ ...current, text, ...change });
  const commitWords = (words: string) => {
    if (pause.current) clearTimeout(pause.current);
    pause.current = null;
    setTyped(null);
    if (words !== current.text) onApply({ ...current, text: words });
  };
  const commitSlide = () => {
    if (sliding === null) return;
    setSliding(null);
    choose({ transparency: sliding / 100 });
  };

  return (
    <div className="flex flex-col px-2 pt-1">
      <OfficeDialogTabs
        id={id}
        label="Watermark"
        tabs={TABS}
        value="text"
        onChange={() => {}}
        disabled={['image']}
      />
      <div {...officeTabPanel(id, 'text')} className="flex flex-col gap-6">
        <div className="flex flex-col">
          <label htmlFor={ids.text} className={LABEL}>
            Text
          </label>
          <input
            id={ids.text}
            // Opened, the panel starts at the words, past the tabs.
            {...{ [OFFICE_PANEL_START]: '' }}
            type="text"
            value={text}
            placeholder="Watermark text"
            onChange={(e) => {
              const words = e.target.value;
              setTyped(words);
              if (pause.current) clearTimeout(pause.current);
              pause.current = setTimeout(() => commitWords(words), WATERMARK_TYPING_PAUSE_MS);
            }}
            onBlur={() => {
              if (typed !== null) commitWords(typed);
            }}
            className={CONTROL}
          />
        </div>
        <div className="flex gap-2">
          <div className="flex min-w-0 flex-1 flex-col">
            <label htmlFor={ids.font} className={LABEL}>
              Font
            </label>
            <select
              id={ids.font}
              value={current.font}
              onChange={(e) => choose({ font: e.target.value })}
              className={SELECT}
            >
              {fonts.map((font) => (
                <option key={font} value={font}>
                  {font}
                </option>
              ))}
            </select>
          </div>
          <div className="flex w-24 flex-col">
            <label htmlFor={ids.size} className={LABEL}>
              Size
            </label>
            <select
              id={ids.size}
              value={current.size === undefined ? AUTO : String(current.size)}
              onChange={(e) => {
                const { size: _, ...rest } = { ...current, text };
                onApply(e.target.value === AUTO ? rest : { ...rest, size: Number(e.target.value) });
              }}
              className={SELECT}
            >
              <option value={AUTO}>Auto</option>
              {[
                ...new Set([
                  ...WATERMARK_SIZES,
                  ...(current.size === undefined ? [] : [current.size]),
                ]),
              ]
                .sort((a, b) => a - b)
                .map((size) => (
                  <option key={size} value={String(size)}>
                    {size}
                  </option>
                ))}
            </select>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Bold"
            aria-pressed={current.bold === true}
            onClick={() => {
              const { bold: _, ...rest } = { ...current, text };
              onApply(current.bold ? rest : { ...rest, bold: true });
            }}
            className={PRESS}
          >
            <OfficeBoldIcon />
          </button>
          <button
            type="button"
            aria-label="Italic"
            aria-pressed={current.italic === true}
            onClick={() => {
              const { italic: _, ...rest } = { ...current, text };
              onApply(current.italic ? rest : { ...rest, italic: true });
            }}
            className={PRESS}
          >
            <OfficeItalicIcon />
          </button>
          <span className="ml-2">
            <OfficeDialogColourField
              label="Colour"
              value={current.colour}
              className={CONTROL}
              onPick={(colour) => {
                if (/^#[0-9a-f]{6}$/i.test(colour)) choose({ colour: colour.toLowerCase() });
              }}
            />
          </span>
        </div>
        <div className="flex flex-col">
          <label htmlFor={ids.transparency} className={LABEL}>
            Transparency
          </label>
          <div className="flex items-center gap-3">
            <input
              id={ids.transparency}
              type="range"
              min={0}
              max={100}
              step={1}
              value={transparency}
              aria-valuetext={`${transparency}%`}
              onChange={(e) => setSliding(Number(e.target.value))}
              onPointerUp={commitSlide}
              onKeyUp={commitSlide}
              onBlur={commitSlide}
              className="min-w-0 flex-1 accent-(--office-primary)"
            />
            <span className="w-10 text-right text-body tabular-nums">{transparency}%</span>
          </div>
        </div>
        <fieldset>
          <legend className={LABEL}>Layout</legend>
          <div className="flex gap-6">
            {LAYOUTS.map(([layout, name]) => (
              <label key={layout} className="flex cursor-pointer items-center gap-2 text-body">
                <input
                  type="radio"
                  name={ids.layout}
                  className="size-4 accent-(--office-primary)"
                  checked={current.layout === layout}
                  onChange={() => choose({ layout })}
                />
                {name}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex items-center justify-between gap-2 pt-2">
          <button
            type="button"
            disabled={watermark === undefined}
            onClick={() => {
              if (pause.current) clearTimeout(pause.current);
              setTyped(null);
              onApply(undefined);
            }}
            className={`${BUTTON} text-(--office-primary) hover:bg-(--office-hover) disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent`}
          >
            Remove watermark
          </button>
          <button
            type="button"
            onClick={() => {
              if (typed !== null) commitWords(typed);
              onDone();
            }}
            className={`${BUTTON} bg-(--office-primary) text-(--office-primary-ink) hover:opacity-90`}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
