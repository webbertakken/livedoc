'use client';

// The equation toolbar (docs/specs/034-text-documents/objects.md "Equations in the editor"): a row under the toolbar
// with New equation and five menus, each a grid of symbols (Math operators' drawn as their structures); a press writes
// one at the caret, in the equation being written or a new one. The writing keeps its focus.
import { useEffect, useRef, useState } from 'react';
import { ChevronDownIcon, useClickOutside, useEscape } from '@livedoc/ui';
import {
  EQUATION_MENU_LABELS,
  EQUATION_MENUS,
  EQUATION_STRUCTURE_MENU,
  EQUATION_SYMBOLS,
  Equations,
  type EquationMenu,
  type MathNode,
} from '@livedoc/text-documents';
import { OFFICE_POPUP, OfficePopup } from '@/components/office/OfficePopup';
import { OfficeGlyphGrid } from '@/components/office/OfficeGlyphGrid';
import { EQUATION_CLASS, mathElement } from '@/lib/text-document/text-document-equations';

/** A cell of a menu: its name, as `\name` types it, and the node it writes. */
export type EquationCell = { readonly name: string; readonly node: MathNode };

/** Each menu's cells, in its order (default, until a capture). */
export const EQUATION_MENU_CELLS: Readonly<Record<EquationMenu, readonly EquationCell[]>> = {
  greek: EQUATION_SYMBOLS.greek.map((s) => ({ name: s.name, node: Equations.token(s.symbol) })),
  operations: EQUATION_SYMBOLS.operations.map((s) => ({
    name: s.name,
    node: Equations.token(s.symbol),
  })),
  relations: EQUATION_SYMBOLS.relations.map((s) => ({
    name: s.name,
    node: Equations.token(s.symbol),
  })),
  operators: EQUATION_STRUCTURE_MENU.map((s) => ({ name: s.name, node: s.build() })),
  arrows: EQUATION_SYMBOLS.arrows.map((s) => ({ name: s.name, node: Equations.token(s.symbol) })),
};

/** A cell's glyph: its node drawn as MathML, empty rows dotted, as the equation shows it. */
function MathGlyph({ node }: { node: MathNode }) {
  const host = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    host.current?.replaceChildren(mathElement([node], document, true));
  }, [node]);
  return <span ref={host} aria-hidden="true" className={EQUATION_CLASS} />;
}

const BUTTON =
  'flex h-row items-center gap-1 rounded-control px-2 text-body text-(--office-ink) outline-none hover:bg-(--office-hover) focus-visible:outline-2 focus-visible:outline-(--office-focus) aria-expanded:bg-(--office-hover)';

function EquationMenuButton({
  menu,
  onPick,
}: {
  menu: EquationMenu;
  onPick: (node: MathNode) => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  useClickOutside(box, () => setOpen(false), open, OFFICE_POPUP);
  useEscape(() => setOpen(false), { enabled: open });
  const label = EQUATION_MENU_LABELS[menu];
  return (
    <div ref={box}>
      <button
        ref={setAnchor}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        data-equation-menu={menu}
        onClick={() => setOpen((o) => !o)}
        className={BUTTON}
      >
        {label}
        <ChevronDownIcon className="size-icon-chevron text-(--office-icon)" />
      </button>
      {open ? (
        <OfficePopup anchor={anchor}>
          <div className="flex max-h-72 w-80 flex-col rounded-menu border border-(--office-line) bg-(--office-menu) p-2 shadow-lg">
            <OfficeGlyphGrid
              label={label}
              items={EQUATION_MENU_CELLS[menu]}
              keyOf={(cell) => cell.name}
              nameOf={(cell) => cell.name}
              draw={(cell) => <MathGlyph node={cell.node} />}
              onShow={() => {}}
              onPick={(cell) => {
                setOpen(false);
                onPick(cell.node);
              }}
            />
          </div>
        </OfficePopup>
      ) : null}
    </div>
  );
}

export function TextDocumentEquationToolbar({
  onNew,
  onPick,
}: {
  onNew: () => void;
  onPick: (node: MathNode) => void;
}) {
  return (
    <div
      role="toolbar"
      aria-label="Equation toolbar"
      className="flex flex-wrap items-center gap-1 border-b border-(--office-line) bg-(--office-toolbar) px-3 py-1"
    >
      <button type="button" onClick={onNew} className={BUTTON}>
        New equation
      </button>
      {EQUATION_MENUS.map((menu) => (
        <EquationMenuButton key={menu} menu={menu} onPick={onPick} />
      ))}
    </div>
  );
}
