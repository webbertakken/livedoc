'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { CheckIcon, CloseIcon } from '@livedoc/ui';
import {
  CONTEXT_DASH_PX,
  CONTEXT_NAME_MAX,
  CONTEXT_NAME_PX,
  CONTEXT_PLATE_H,
  CONTEXT_PLATE_PAD_X,
  CONTEXT_STROKE_PX,
  CONTEXT_WOBBLE_PX,
} from '@livedoc/document';
import type { DrawnContext } from '@/lib/context-outlines';
import { suggestionKeys } from '../suggestions/SuggestionPlaceholder';

// One candidate context on the canvas (docs/specs/021-event-storming/candidate-contexts.md): its dashed, hand-drawn
// outline beneath the notes and its name on a plate of the canvas's paper on the top edge. A suggested one is drawn at
// half strength, its name in italics and marked, with ✓ and ✕ by it. A kept one is selected by its outline or its
// name (the name takes focus: that IS its selection), renamed by a double-click or Enter, and deleted with Delete.

// The smallest hit target, in screen px, whatever the zoom (WCAG 2.2 2.5.8).
const MIN_HIT_PX = 24;
// How wide the invisible band along the line that takes a click is, in screen px.
const LINE_HIT_PX = 14;
// A suggested outline's strength, until it is previewed.
const SUGGESTED_OPACITY = 0.5;

export type ContextOutlineActs = {
  // A kept context's acts; absent for someone who may not change contexts.
  kept?: {
    onSelect: () => void;
    onRename: (name: string) => void;
    onDelete: () => void;
  };
  // A suggested context's acts.
  suggested?: {
    onApply: () => void;
    onDismiss: () => void;
    onPreview: () => void;
    onLeave: () => void;
  };
};

export function ContextOutline({
  drawn,
  zoom,
  previewed,
  acts,
}: {
  drawn: DrawnContext;
  zoom: number;
  // The panel is pointing at it: drawn at full strength.
  previewed: boolean;
  acts: ContextOutlineActs;
}) {
  const { context, outline, suggested, highlighted, notes } = drawn;
  const plateRef = useRef<HTMLButtonElement>(null);
  const [selected, setSelected] = useState(false);
  const [editing, setEditing] = useState(false);
  const name = context.label;
  const px = 1 / zoom;
  const pad = CONTEXT_WOBBLE_PX + LINE_HIT_PX * px;
  const b = outline.bounds;
  const box = { x: b.x - pad, y: b.y - pad, w: b.width + 2 * pad, h: b.height + 2 * pad };
  const interactive = (suggested ? acts.suggested : acts.kept) !== undefined;
  const ink = highlighted || selected ? 'var(--ctx-active)' : 'var(--ctx-line)';
  const strength = suggested && !previewed && !highlighted ? SUGGESTED_OPACITY : 1;
  const label = suggested
    ? `Suggested candidate context: ${name}, ${notes} note${notes === 1 ? '' : 's'}`
    : `Candidate context: ${name}`;

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (acts.suggested) {
      suggestionKeys(e, acts.suggested.onApply, acts.suggested.onDismiss);
      return;
    }
    if (!acts.kept) return;
    if (e.key === 'Enter' || e.key === 'F2') setEditing(true);
    else if (e.key === 'Delete' || e.key === 'Backspace') acts.kept.onDelete();
    else if (e.key === 'Escape') plateRef.current?.blur();
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div
      className="contents"
      data-candidate-context={context.id}
      data-suggested={suggested ? '' : undefined}
    >
      <svg
        aria-hidden
        className="pointer-events-none absolute overflow-visible"
        style={{ left: box.x, top: box.y, width: box.w, height: box.h, opacity: strength }}
        viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
      >
        <path
          d={outline.path}
          fill="none"
          stroke={ink}
          strokeWidth={highlighted || selected ? CONTEXT_STROKE_PX + 1 : CONTEXT_STROKE_PX}
          strokeDasharray={selected ? undefined : `${CONTEXT_DASH_PX} ${CONTEXT_DASH_PX}`}
          strokeLinecap="round"
          className="transition-[stroke] duration-150 motion-reduce:transition-none"
        />
        {interactive ? (
          <path
            data-context-line={context.id}
            d={outline.path}
            fill="none"
            stroke="transparent"
            strokeWidth={LINE_HIT_PX * px}
            className="cursor-pointer"
            style={{ pointerEvents: 'stroke' }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              plateRef.current?.focus();
            }}
          />
        ) : null}
      </svg>
      <ContextPlate
        name={name}
        suggested={suggested}
        left={outline.label.x - CONTEXT_PLATE_PAD_X}
        top={outline.label.y - CONTEXT_PLATE_H / 2}
        strength={strength}
        editing={editing}
        selected={selected}
        label={label}
        minHit={MIN_HIT_PX * px}
        plateRef={plateRef}
        acts={acts}
        onKeyDown={onKeyDown}
        onFocus={() => {
          setSelected(true);
          acts.kept?.onSelect();
          acts.suggested?.onPreview();
        }}
        onBlur={() => {
          setSelected(false);
          acts.suggested?.onLeave();
        }}
        onStartEditing={() => setEditing(true)}
        onEndEditing={(next) => {
          setEditing(false);
          if (next !== null) acts.kept?.onRename(next);
          plateRef.current?.focus();
        }}
      />
    </div>
  );
}

function ContextPlate({
  name,
  suggested,
  left,
  top,
  strength,
  editing,
  selected,
  label,
  minHit,
  plateRef,
  acts,
  onKeyDown,
  onFocus,
  onBlur,
  onStartEditing,
  onEndEditing,
}: {
  name: string;
  suggested: boolean;
  left: number;
  top: number;
  strength: number;
  editing: boolean;
  selected: boolean;
  label: string;
  minHit: number;
  plateRef: React.RefObject<HTMLButtonElement | null>;
  acts: ContextOutlineActs;
  onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void;
  onFocus: () => void;
  onBlur: () => void;
  onStartEditing: () => void;
  // The new name, or null when the edit was abandoned.
  onEndEditing: (name: string | null) => void;
}) {
  const style = {
    left,
    top,
    height: CONTEXT_PLATE_H,
    fontSize: CONTEXT_NAME_PX,
    paddingInline: CONTEXT_PLATE_PAD_X,
  };
  const plateClass =
    'absolute flex items-center gap-1 whitespace-nowrap rounded-[4px] bg-[var(--lvd-canvas-paper,#ffffff)] font-semibold leading-none text-[color:var(--ctx-name)]';
  const words = (
    <>
      <span className={suggested ? 'italic' : undefined}>{name}</span>
      {suggested ? <span className="font-normal opacity-80"> · suggested</span> : null}
    </>
  );
  if (editing)
    return (
      <div className={`${plateClass} pointer-events-auto`} style={style}>
        <RenameField name={name} onEnd={onEndEditing} />
      </div>
    );
  const interactive = suggested ? acts.suggested : acts.kept;
  if (!interactive)
    return (
      <div className={`${plateClass} pointer-events-none`} style={{ ...style, opacity: strength }}>
        {words}
      </div>
    );
  return (
    <div
      className={`${plateClass} pointer-events-auto`}
      style={{ ...style, opacity: strength }}
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
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => {
          e.stopPropagation();
          if (!suggested) onStartEditing();
        }}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        onBlur={onBlur}
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
            minHit={minHit}
            onClick={acts.suggested.onApply}
            className="text-emerald-700 hover:bg-emerald-50 in-[[data-dark-canvas]]:text-emerald-400 in-[[data-dark-canvas]]:hover:bg-emerald-950"
          />
          <PlateAction
            label={`Dismiss suggested candidate context: ${name}`}
            act="dismiss"
            minHit={minHit}
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
  minHit,
  onClick,
  className,
  act,
}: {
  act: 'apply' | 'dismiss';
  label: string;
  minHit: number;
  onClick: () => void;
  className: string;
}) {
  const size = Math.max(CONTEXT_PLATE_H - 4, minHit);
  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`-my-2 flex shrink-0 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-brand-600 ${className}`}
      style={{ width: size, height: size }}
    >
      {act === 'apply' ? <CheckIcon size={12} /> : <CloseIcon size={12} />}
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
      className="w-[16ch] min-w-0 bg-transparent font-semibold text-inherit outline-none ring-2 ring-brand-500 [font-size:inherit]"
    />
  );
}
