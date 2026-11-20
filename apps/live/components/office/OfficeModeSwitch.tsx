'use client';

// The editing mode switch in the office title row (docs/specs/034-text-documents/editing-surface.md "The title row";
// review.md "Editing modes"): a pill naming this person's mode, whose menu lists the modes their level allows with
// what each does. A mode not yet built is listed dimmed.
import { useId, useRef } from 'react';
import {
  ChevronDownIcon,
  Glyph,
  Prims,
  useClickOutside,
  useMenu,
  useMenuButton,
} from '@livedoc/ui';
import { lucideEye, lucidePencil, lucidePencilLine } from '@livedoc/icons/lucide';
import type { IconPrim } from '@livedoc/icons';
import type { OfficeMode, OfficeModeInfo } from '@/lib/office/office-mode';

const GLYPHS: Record<OfficeMode, readonly IconPrim[]> = {
  editing: lucidePencil,
  suggesting: lucidePencilLine,
  viewing: lucideEye,
};

function ModeGlyph({ mode }: { mode: OfficeMode }) {
  return (
    <Glyph size={18} units={24}>
      <Prims prims={GLYPHS[mode]} />
    </Glyph>
  );
}

export type OfficeModeChoice = {
  mode: OfficeMode;
  modes: readonly OfficeModeInfo[];
  onChange: (mode: OfficeMode) => void;
};

export function OfficeModeSwitch({ mode, modes, onChange }: OfficeModeChoice) {
  const { open, close, toggle, trigger, setTrigger, onTriggerKeyDown } = useMenuButton();
  const box = useRef<HTMLDivElement>(null);
  useClickOutside(box, close, open);
  const current = modes.find((m) => m.mode === mode);
  return (
    <div ref={box} className="relative">
      <button
        ref={setTrigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Mode: ${current?.label ?? mode}`}
        onClick={toggle}
        onKeyDown={onTriggerKeyDown}
        data-office-mode={mode}
        className="relative flex h-10 shrink-0 items-center gap-1.5 rounded-full pr-2 pl-3 text-sm font-medium text-(--office-ink) outline-none touch-target hover:bg-(--office-hover) focus-visible:ring-2 focus-visible:ring-(--office-focus)"
      >
        <ModeGlyph mode={mode} />
        <span className="text-optical-centre phone:sr-only">{current?.label}</span>
        <span className="phone:hidden">
          <ChevronDownIcon size={14} />
        </span>
      </button>
      {open ? (
        <ModeMenu
          trigger={trigger}
          onClose={close}
          mode={mode}
          modes={modes}
          onChoose={(next) => {
            close();
            if (next !== mode) onChange(next);
          }}
        />
      ) : null}
    </div>
  );
}

function ModeMenu({
  trigger,
  onClose,
  mode,
  modes,
  onChoose,
}: {
  trigger: HTMLElement | null;
  onClose: () => void;
  mode: OfficeMode;
  modes: readonly OfficeModeInfo[];
  onChoose: (mode: OfficeMode) => void;
}) {
  const { attach, surfaceProps } = useMenu({ onClose, trigger, label: 'Mode' });
  const descriptionId = useId();
  return (
    <div
      ref={attach}
      {...surfaceProps}
      className="absolute top-full right-0 z-30 mt-1 w-72 rounded-md bg-(--office-menu) py-2 text-(--office-ink) shadow-lg outline-none"
    >
      {modes.map((m) => {
        const soon = m.status === 'comingSoon';
        return (
          <button
            key={m.mode}
            type="button"
            role="menuitemradio"
            aria-checked={m.mode === mode}
            aria-disabled={soon || undefined}
            aria-describedby={`${descriptionId}-${m.mode}`}
            tabIndex={-1}
            onClick={() => {
              if (!soon) onChoose(m.mode);
            }}
            className={`flex w-full items-start gap-3 px-4 py-2 text-left outline-none hover:bg-(--office-menu-hover) focus-visible:bg-(--office-menu-hover) ${soon ? 'opacity-50' : ''} ${m.mode === mode ? 'bg-(--office-pressed) text-(--office-pressed-ink)' : ''}`}
          >
            <span className="mt-0.5">
              <ModeGlyph mode={m.mode} />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium">{m.label}</span>
              <span
                id={`${descriptionId}-${m.mode}`}
                className="block text-xs text-(--office-muted)"
              >
                {soon ? 'Coming soon' : m.description}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
