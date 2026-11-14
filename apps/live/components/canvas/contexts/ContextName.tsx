'use client';

import { useEffect, useMemo, useRef, type KeyboardEvent } from 'react';
import { CheckIcon, CloseIcon } from '@livedoc/ui';
import {
  CONTEXT_FONT,
  CONTEXT_NAME_MAX,
  CONTEXT_NAME_PX,
  CONTEXT_PLATE_H,
  CONTEXT_PLATE_PAD_X,
  contextNamePlacement,
  labelMeasure,
} from '@livedoc/document';
import type { DrawnContext } from '@/lib/context-outlines';
import { suggestionKeys } from '../suggestions/SuggestionPlaceholder';
import type { ContextOutlineActs } from './ContextOutline';

// A candidate context's name on the canvas (docs/specs/021-event-storming/candidate-contexts.md "The name"): in the
// middle of the shape, over the notes, on a plate of the canvas's paper; its screen size kept as the board zooms out,
// and shrunk to keep clear of the line in a small shape. A suggested one reads in italics, marked, with ✓ and ✕.
// For an Editor, a click selects the context, a Shift-click adds it to the selection or takes it out, a double-click
// opens the name, and Enter and Delete act on it. Selection and the open name are lib/context-selection.ts's.

// The smallest hit target, in screen px, whatever the zoom (WCAG 2.2 2.5.8).
const MIN_HIT_PX = 24;
// The ✓ and ✕ icons at CONTEXT_NAME_PX; they scale with the type.
const ACTION_ICON_PX = 14;
const SUGGESTED_MARK = ' · suggested';

// A ✓ or ✕ button's side, canvas px: the plate's height less a little, never under the least hit target on screen.
const actionSizeAt = (scale: number, zoom: number) =>
  Math.max((CONTEXT_PLATE_H - 4) * scale, MIN_HIT_PX / zoom);

export function ContextName({
  drawn,
  zoom,
  selected,
  editing,
  acts,
}: {
  drawn: DrawnContext;
  zoom: number;
  selected: boolean;
  // Its name is open for typing.
  editing: boolean;
  acts: ContextOutlineActs;
}) {
  const { context, outline, suggested, notes } = drawn;
  const name = context.label;
  const plateRef = useRef<HTMLButtonElement>(null);
  // A press on the name focuses it before its click: the click decides the selection, not the focus.
  const pressing = useRef(false);
  // Back to the name once a rename ends: the name is drawn again only after the field goes.
  const refocus = useRef(false);
  useEffect(() => {
    if (editing || !refocus.current) return;
    refocus.current = false;
    plateRef.current?.focus();
  }, [editing]);

  const withActions = suggested && acts.suggested !== undefined;
  const place = useMemo(
    () =>
      contextNamePlacement(
        outline.polygon,
        (fontPx) => {
          const bold = labelMeasure(fontPx, true, suggested, CONTEXT_FONT)(name);
          const mark = suggested
            ? labelMeasure(fontPx, false, false, CONTEXT_FONT)(SUGGESTED_MARK)
            : 0;
          return bold + mark + (withActions ? 2 * actionSizeAt(fontPx / CONTEXT_NAME_PX, zoom) : 0);
        },
        zoom,
      ),
    [outline.polygon, name, suggested, withActions, zoom],
  );
  const scale = place.fontPx / CONTEXT_NAME_PX;
  const style = {
    left: place.x - place.width / 2,
    top: place.y - place.height / 2,
    height: place.height,
    fontSize: place.fontPx,
    paddingInline: CONTEXT_PLATE_PAD_X * scale,
    borderRadius: 4 * scale,
  };
  const plateClass =
    'absolute flex items-center justify-center gap-[0.25em] whitespace-nowrap bg-[color-mix(in_srgb,var(--lvd-canvas-paper,#ffffff)_85%,transparent)] font-semibold leading-none text-[color:var(--ctx-name)]';
  const label = suggested
    ? `Suggested candidate context: ${name}, ${notes} note${notes === 1 ? '' : 's'}`
    : `Candidate context: ${name}`;
  const words = (
    <>
      <span className={suggested ? 'italic' : undefined}>{name}</span>
      {suggested ? <span className="font-normal opacity-80">{SUGGESTED_MARK}</span> : null}
    </>
  );

  if (editing)
    return (
      <div
        className={`${plateClass} pointer-events-auto`}
        style={style}
        data-candidate-context={context.id}
      >
        <RenameField
          name={name}
          onEnd={(next) => {
            refocus.current = true;
            acts.select?.onEditing(false);
            if (next !== null) acts.select?.onRename(next);
          }}
        />
      </div>
    );
  const interactive = suggested ? acts.suggested : acts.kept;
  if (!interactive)
    return (
      <div className={`${plateClass} pointer-events-none`} style={style}>
        {words}
      </div>
    );

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (acts.suggested) {
      suggestionKeys(e, acts.suggested.onApply, acts.suggested.onDismiss);
      return;
    }
    if (e.key === 'Enter' || e.key === 'F2') acts.select?.onEditing(true);
    else if (e.key === 'Delete' || e.key === 'Backspace') acts.kept?.onDelete();
    else if (e.key === 'Escape') plateRef.current?.blur();
    else return;
    e.preventDefault();
    e.stopPropagation();
  };
  return (
    <div
      className={`${plateClass} pointer-events-auto`}
      style={style}
      data-candidate-context={context.id}
      onPointerEnter={acts.suggested?.onPreview}
      onPointerLeave={acts.suggested?.onLeave}
    >
      <button
        ref={plateRef}
        type="button"
        aria-label={label}
        aria-description={
          suggested
            ? 'Enter applies it, Delete dismisses it'
            : 'Enter renames it, Delete deletes it'
        }
        data-context-name={name}
        data-context-name-for={context.id}
        onPointerDown={(e) => {
          e.stopPropagation();
          pressing.current = true;
        }}
        onClick={(e) => {
          e.stopPropagation();
          pressing.current = false;
          acts.select?.onSelect(e.shiftKey);
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          acts.select?.onEditing(true);
        }}
        onKeyDown={onKeyDown}
        onFocus={() => {
          if (!pressing.current && !selected) acts.select?.onSelect(false);
          acts.suggested?.onPreview();
        }}
        onBlur={() => acts.suggested?.onLeave()}
        className={`flex h-full cursor-pointer items-center rounded-[3px] outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
          selected ? 'ring-2 ring-[color:var(--ctx-active)]' : ''
        }`}
      >
        {words}
      </button>
      {acts.suggested ? (
        <>
          <PlateAction
            label={`Apply suggested candidate context: ${name}`}
            act="apply"
            size={actionSizeAt(scale, zoom)}
            iconPx={ACTION_ICON_PX * scale}
            onClick={acts.suggested.onApply}
            className="text-emerald-700 hover:bg-emerald-50 in-[[data-dark-canvas]]:text-emerald-400 in-[[data-dark-canvas]]:hover:bg-emerald-950"
          />
          <PlateAction
            label={`Dismiss suggested candidate context: ${name}`}
            act="dismiss"
            size={actionSizeAt(scale, zoom)}
            iconPx={ACTION_ICON_PX * scale}
            onClick={acts.suggested.onDismiss}
            className="text-slate-600 hover:bg-slate-100 in-[[data-dark-canvas]]:text-slate-300 in-[[data-dark-canvas]]:hover:bg-slate-800"
          />
        </>
      ) : null}
    </div>
  );
}

function PlateAction({
  label,
  size,
  iconPx,
  onClick,
  className,
  act,
}: {
  act: 'apply' | 'dismiss';
  label: string;
  size: number;
  iconPx: number;
  onClick: () => void;
  className: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`flex shrink-0 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-brand-600 ${className}`}
      style={{ width: size, height: size }}
    >
      {act === 'apply' ? <CheckIcon size={iconPx} /> : <CloseIcon size={iconPx} />}
    </button>
  );
}

function RenameField({ name, onEnd }: { name: string; onEnd: (name: string | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const end = (next: string | null) => {
    if (done.current) return;
    done.current = true;
    onEnd(next);
  };
  return (
    <input
      ref={ref}
      aria-label="Candidate context name"
      defaultValue={name}
      maxLength={CONTEXT_NAME_MAX}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') end(e.currentTarget.value);
        else if (e.key === 'Escape') end(null);
      }}
      onBlur={(e) => end(e.currentTarget.value)}
      className="w-[16ch] min-w-0 bg-transparent text-center font-semibold text-inherit outline-none ring-2 ring-brand-500 [font-size:inherit]"
    />
  );
}
