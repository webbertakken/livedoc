// The editor's two lines (docs/specs/007-editor/toolbar-layout.md "The two lines"), drawn once for every help scene
// that shows the editor's chrome: the brand group, the actions group, the tools group, the document group and the
// tab list. Drawn from apps/live/components/chrome/lines (BrandGroup, ActionsGroup, DocumentGroup, TabList) and the
// tools group CanvasChrome lays out. Composed from the shared primitives; light ramp only (help-art.css darkens it).

import type { ReactNode } from 'react';
import { Avatar, Label } from './primitives';
import { ModeMark, type Mode } from './mode-mark';

/** Every group is one row this tall. */
export const GROUP_H = 32;

const INK = {
  className: 'stroke-slate-500',
  strokeWidth: 1.5,
  fill: 'none',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

// A rough width for a run of text at `size`, so groups fit their words.
export function textW(text: string, size = 10): number {
  return Math.round(text.length * size * 0.6);
}

/** A toolbar group's card: white, a slate edge, the line's height. */
export function GroupCard({ x, y, w }: { x: number; y: number; w: number }) {
  return (
    <rect
      x={x}
      y={y}
      width={w}
      height={GROUP_H}
      rx={9}
      className="fill-white stroke-slate-200"
      strokeWidth={1.5}
    />
  );
}

/** The thin divider between a group's parts. */
export function GroupDivider({ x, y }: { x: number; y: number }) {
  return (
    <line x1={x} y1={y + 8} x2={x} y2={y + 24} className="stroke-slate-200" strokeWidth={1.2} />
  );
}

// --- Glyphs, each centred on (x, y) ----------------------------------------------

export function SearchGlyph({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle cx={-1} cy={-1} r={4.5} {...INK} />
      <path d="M2.4 2.4 L5.5 5.5" {...INK} />
    </g>
  );
}

/** Report a Bug: a bug's body, its head and three legs a side. */
export function BugGlyph({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x={-3.5} y={-3} width={7} height={9} rx={3.5} {...INK} />
      <path d="M-2 -3 a2 2 0 0 1 4 0" {...INK} />
      <path
        d="M-3.5 0 h-2.5 M3.5 0 h2.5 M-3.5 3.5 l-2.5 1.5 M3.5 3.5 l2.5 1.5 M-3 -3 l-2 -2 M3 -3 l2 -2"
        {...INK}
      />
    </g>
  );
}

// Settings is sliders in the editor (lucide sliders-horizontal), never a cog: a cog's spokes read as the sun.
export function SettingsGlyph({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path
        d="M-6 -4 h3 M0 -4 h6 M-6 0 h7 M4 0 h2 M-6 4 h2 M2 4 h4 M-1.5 -6 v4 M2.5 -2 v4 M-2 2 v4"
        {...INK}
      />
    </g>
  );
}

export function SunGlyph({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r={3} {...INK} />
      <path
        d="M0 -7 v1.8 M0 7 v-1.8 M-7 0 h1.8 M7 0 h-1.8 M-5 -5 l1.3 1.3 M5 5 l-1.3 -1.3 M5 -5 l-1.3 1.3 M-5 5 l1.3 -1.3"
        {...INK}
      />
    </g>
  );
}

export function MenuGlyph({ x, y }: { x: number; y: number }) {
  return <path d={`M${x - 6} ${y - 5}h12M${x - 6} ${y}h12M${x - 6} ${y + 5}h12`} {...INK} />;
}

export function DotsGlyph({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <circle cx={x - 4} cy={y} r={1.3} className="fill-slate-400" />
      <circle cx={x} cy={y} r={1.3} className="fill-slate-400" />
      <circle cx={x + 4} cy={y} r={1.3} className="fill-slate-400" />
    </g>
  );
}

export function UndoGlyph({ x, y }: { x: number; y: number }) {
  return (
    <path
      d={`M${x + 4} ${y - 2} h-8 l3 -3 M${x - 4} ${y - 2} l3 3 M${x - 4} ${y - 2} h5 a3.5 3.5 0 0 1 0 7 h-2`}
      {...INK}
    />
  );
}

export function RedoGlyph({ x, y }: { x: number; y: number }) {
  return (
    <path
      d={`M${x - 4} ${y - 2} h8 l-3 -3 M${x + 4} ${y - 2} l-3 3 M${x + 4} ${y - 2} h-5 a3.5 3.5 0 0 0 0 7 h2`}
      {...INK}
    />
  );
}

export function LayersGlyph({ x, y }: { x: number; y: number }) {
  return (
    <path
      d={`M${x - 6} ${y - 2} l6 -3.5 l6 3.5 l-6 3.5 Z M${x - 6} ${y + 2} l6 3.5 l6 -3.5`}
      {...INK}
    />
  );
}

/** The Theme & Canvas brush. */
export function BrushGlyph({ x, y }: { x: number; y: number }) {
  return (
    <path
      d={`M${x + 1} ${y - 6} l2.5 2.5 l-5 5 l-2.5 -2.5 Z M${x - 4} ${y + 1.5} c-2.5 0 -3 1.5 -3 4 c2.5 0 3.5 -1 3.5 -3.5`}
      {...INK}
      className="stroke-brand-500"
    />
  );
}

/** The tab stack's glyph: three sheets, stacked. */
export function TabStackGlyph({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect
        x={x - 3}
        y={y - 6}
        width={9}
        height={8}
        rx={1.5}
        {...INK}
        className="stroke-slate-400"
      />
      <rect
        x={x - 6}
        y={y - 3}
        width={9}
        height={8}
        rx={1.5}
        {...INK}
        className="fill-white stroke-slate-500"
      />
    </g>
  );
}

/** A locked tab's padlock. */
export function PadlockGlyph({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect x={x - 4} y={y - 1} width={8} height={6} rx={1.3} className="fill-brand-600" />
      <path
        d={`M${x - 2.5} ${y - 1} v-2 a2.5 2.5 0 0 1 5 0 v2`}
        fill="none"
        className="stroke-brand-600"
        strokeWidth={1.4}
      />
    </g>
  );
}

export function FolderGlyph({ x, y }: { x: number; y: number }) {
  return <path d={`M${x - 5} ${y - 4} h4 l1.5 2 h4.5 v6 h-10 Z`} {...INK} strokeWidth={1.2} />;
}

const STATE = {
  fill: 'none',
  strokeWidth: 1.3,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

function StateGlyph({
  x,
  y,
  cls,
  children,
}: {
  x: number;
  y: number;
  cls: string;
  children: ReactNode;
}) {
  return (
    <g transform={`translate(${x} ${y})`} className={cls} {...STATE}>
      {children}
    </g>
  );
}

/** Private: a lock. */
export function LockGlyph({ x, y, cls }: { x: number; y: number; cls: string }) {
  return (
    <StateGlyph x={x} y={y} cls={cls}>
      <rect x={-4} y={-1} width={8} height={6} rx={1.2} />
      <path d="M-2.5 -1 v-2 a2.5 2.5 0 0 1 5 0 v2" />
    </StateGlyph>
  );
}

/** Shared: a link. */
export function LinkGlyph({ x, y, cls }: { x: number; y: number; cls: string }) {
  return (
    <StateGlyph x={x} y={y} cls={cls}>
      <path d="M-1 2.5 l-1.5 1.5 a2.2 2.2 0 0 1 -3 -3 l1.5 -1.5" />
      <path d="M1 -2.5 l1.5 -1.5 a2.2 2.2 0 0 1 3 3 l-1.5 1.5" />
      <path d="M-2 2 l4 -4" />
    </StateGlyph>
  );
}

/** Team: people. */
export function TeamGlyph({ x, y, cls }: { x: number; y: number; cls: string }) {
  return (
    <StateGlyph x={x} y={y} cls={cls}>
      <circle cx={-1.5} cy={-2} r={2} />
      <path d="M-5 4.5 a3.5 3.5 0 0 1 7 0" />
      <path d="M2.5 -3.8 a2 2 0 0 1 0 3.6 M3.5 1.5 a3.5 3.5 0 0 1 1.5 3" />
    </StateGlyph>
  );
}

/** This Browser: an app window. */
export function BrowserGlyph({ x, y, cls }: { x: number; y: number; cls: string }) {
  return (
    <StateGlyph x={x} y={y} cls={cls}>
      <rect x={-4.5} y={-3.8} width={9} height={7.6} rx={1.3} />
      <path d="M-4.5 -1.2 h9" />
    </StateGlyph>
  );
}

/** Share, white on the button's solid fill. */
export function ShareGlyph({
  x,
  y,
  cls = 'stroke-white help-art-as-drawn',
}: {
  x: number;
  y: number;
  cls?: string;
}) {
  return (
    <StateGlyph x={x} y={y} cls={cls}>
      <circle cx={-3.5} cy={0} r={1.5} />
      <circle cx={3.5} cy={-4} r={1.5} />
      <circle cx={3.5} cy={4} r={1.5} />
      <path d="M-2.2 -0.7 l4.4 -2.6 M-2.2 0.7 l4.4 2.6" />
    </StateGlyph>
  );
}

/** The document's share-state icon, Shared: the 28 px round badge in the state's tone. */
export function ShareStateIcon({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g>
      <circle
        cx={cx}
        cy={cy}
        r={9}
        className="fill-emerald-50 stroke-emerald-300"
        strokeWidth={1}
      />
      <LinkGlyph x={cx} y={cy} cls="stroke-emerald-700 dark:stroke-emerald-300" />
    </g>
  );
}

/** The role pill, Editing. */
export function RolePill({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect
        x={x}
        y={y + 8}
        width={50}
        height={16}
        rx={8}
        className="fill-emerald-50 stroke-emerald-200"
        strokeWidth={1}
      />
      <Label
        x={x + 25}
        y={y + 17}
        size={8}
        weight={700}
        anchor="middle"
        className="fill-emerald-800 dark:fill-emerald-300"
      >
        EDITING
      </Label>
    </g>
  );
}

// --- The brand group, top left -----------------------------------------------------

/** The brand group's width: icon-only mode switch (a phone, or a figure short of room), or named. */
export const BRAND_W = 66;
export const BRAND_NAMED_W = 110;

/** The brand mark alone: three sheets stacked, climbing to the right. */
function StackMark({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect x={x - 1} y={y - 6.5} width={6} height={8} rx={1.2} className="fill-brand-300" />
      <rect x={x - 3} y={y - 4.5} width={6} height={8} rx={1.2} className="fill-brand-400" />
      <rect x={x - 5} y={y - 2.5} width={6} height={8} rx={1.2} className="fill-brand-500" />
      <path
        d={`M${x - 3.8} ${y + 1} h3.6 M${x - 3.8} ${y + 3.2} h2.4`}
        className="stroke-white help-art-as-drawn"
        strokeWidth={1}
        strokeLinecap="round"
      />
    </g>
  );
}

/** The brand group, its top-left corner at (x, y): Back (a back caret and the mark), a divider, the menu button and
 *  the mode switch (its icon and chevron; with `named`, its name too). `menu={false}` leaves the menu button out (a
 *  phone held sideways, a workbench frame). */
export function BrandGroup({
  x,
  y,
  mode = 'Structured',
  named = false,
  menu = true,
}: {
  x: number;
  y: number;
  mode?: Mode;
  named?: boolean;
  menu?: boolean;
}) {
  const shift = menu ? 0 : -14;
  const modeX = x + 50 + shift;
  const w = (named ? BRAND_NAMED_W : BRAND_W) + shift;
  const chevronX = named ? modeX + 10 + textW(mode, 10) + 2 : modeX + 8;
  return (
    <g>
      <GroupCard x={x} y={y} w={w} />
      <path d={`M${x + 8} ${y + 11.5} l-3 4.5 l3 4.5`} {...INK} />
      <StackMark x={x + 17} y={y + 16} />
      <GroupDivider x={x + 26} y={y} />
      {menu && <MenuGlyph x={x + 35} y={y + 16} />}
      <g transform={`translate(${modeX} ${y + 16})`}>
        <ModeMark mode={mode} scale={0.46} />
      </g>
      {named && (
        <Label x={modeX + 9} y={y + 17} size={10} tone="strong">
          {mode}
        </Label>
      )}
      <path d={`M${chevronX} ${y + 15} l2.5 2.5 l2.5 -2.5`} {...INK} strokeWidth={1.3} />
    </g>
  );
}

// --- The actions group, top right ----------------------------------------------------

type DocAction = 'share' | 'shared' | 'copy' | 'none';

const QUICK_W = 4 * 22;
const docActionW = (a: DocAction) => (a === 'none' ? 0 : a === 'copy' ? 50 : 58);
const PRESENT_W = 64;

/** The actions group's width for the same props. */
export function actionsGroupWidth({
  doc = 'shared',
  present = false,
  account = 'avatar',
}: {
  doc?: DocAction;
  present?: boolean;
  account?: 'avatar' | 'signin' | 'none';
}): number {
  const docW = docActionW(doc) + (present ? PRESENT_W + 4 : 0);
  const accW = account === 'none' ? 0 : account === 'avatar' ? 28 : 54;
  return 6 + QUICK_W + (docW ? 10 + docW : 0) + (accW ? 10 + accW : 0) + 4;
}

/** The actions group, its right edge at `right`: Search, Report a Bug, Settings and the appearance (the quick
 *  controls, icons alone as Button Labels leaves them), then Present and Share (solid once shared) or Copy, then
 *  the account. */
export function ActionsGroup({
  right,
  y,
  doc = 'shared',
  present = false,
  account = 'avatar',
  ring = false,
}: {
  right: number;
  y: number;
  doc?: DocAction;
  present?: boolean;
  account?: 'avatar' | 'signin' | 'none';
  /** A dashed ring round the quick controls, for the figure that is about them. */
  ring?: boolean;
}) {
  const w = actionsGroupWidth({ doc, present, account });
  const x = right - w;
  let at = x + 6;
  const quick = at;
  at += QUICK_W;
  const parts: ReactNode[] = [];
  if (doc !== 'none') {
    parts.push(<GroupDivider key="d1" x={at + 5} y={y} />);
    at += 10;
    if (present) {
      parts.push(
        <g key="present">
          <rect x={at} y={y + 4} width={PRESENT_W} height={24} rx={6} className="fill-slate-100" />
          <path d={`M${at + 10} ${y + 11} v10 l8 -5 Z`} {...INK} />
          <Label x={at + 23} y={y + 17} size={10} weight={600} tone="body">
            Present
          </Label>
        </g>,
      );
      at += PRESENT_W + 4;
    }
    const dw = docActionW(doc);
    parts.push(
      doc === 'shared' ? (
        <g key="share">
          <rect x={at} y={y + 4} width={dw} height={24} rx={6} className="fill-brand-500" />
          <ShareGlyph x={at + 13} y={y + 16} />
          <Label x={at + 23} y={y + 17} size={10} weight={600} tone="onAccent">
            Share
          </Label>
        </g>
      ) : (
        <g key="share">
          <rect x={at} y={y + 4} width={dw} height={24} rx={6} className="fill-slate-100" />
          {doc === 'share' ? (
            <ShareGlyph x={at + 13} y={y + 16} cls="stroke-slate-500" />
          ) : (
            <g>
              <rect
                x={at + 8}
                y={y + 10}
                width={8}
                height={9}
                rx={1.5}
                {...INK}
                strokeWidth={1.2}
              />
              <rect
                x={at + 11}
                y={y + 13}
                width={8}
                height={9}
                rx={1.5}
                {...INK}
                strokeWidth={1.2}
              />
            </g>
          )}
          <Label x={at + 23} y={y + 17} size={10} weight={600} tone="body">
            {doc === 'copy' ? 'Copy' : 'Share'}
          </Label>
        </g>
      ),
    );
    at += dw;
  }
  if (account !== 'none') {
    parts.push(<GroupDivider key="d2" x={at + 5} y={y} />);
    at += 10;
    parts.push(
      account === 'avatar' ? (
        <Avatar key="acc" cx={at + 14} cy={y + 16} r={10} initial="S" />
      ) : (
        <Label
          key="acc"
          x={at + 27}
          y={y + 17}
          size={10}
          weight={600}
          tone="accent"
          anchor="middle"
        >
          Sign in
        </Label>
      ),
    );
  }
  return (
    <g>
      <GroupCard x={x} y={y} w={w} />
      <SearchGlyph x={quick + 11} y={y + 16} />
      <BugGlyph x={quick + 33} y={y + 15} />
      <SettingsGlyph x={quick + 55} y={y + 16} />
      <SunGlyph x={quick + 77} y={y + 16} />
      {ring && (
        <rect
          x={quick - 3}
          y={y - 3}
          width={QUICK_W + 6}
          height={GROUP_H + 6}
          rx={10}
          fill="none"
          className="stroke-brand-400"
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />
      )}
      {parts}
    </g>
  );
}

// --- The tools group, bottom left ----------------------------------------------------

/** The tools group's width for the same props. */
export function toolsGroupWidth({
  session = false,
  zoomOnly = false,
}: {
  session?: boolean;
  zoomOnly?: boolean;
}) {
  if (zoomOnly) return 78;
  return 4 + 44 + (session ? 8 + 66 : 0) + 8 + 44 + 8 + 70 + 4;
}

/** The tools group, its top-left corner at (x, y): Undo and Redo, the Session strip (with `session`), Layers and the
 *  Theme & Canvas brush, then the zoom (−, the level, +). `zoomOnly` draws the zoom alone, as zen and an embed do. */
export function ToolsGroup({
  x,
  y,
  level = '100%',
  session = false,
  zoomOnly = false,
}: {
  x: number;
  y: number;
  level?: string;
  session?: boolean;
  zoomOnly?: boolean;
}) {
  const w = toolsGroupWidth({ session, zoomOnly });
  let at = x + 4;
  const parts: ReactNode[] = [];
  if (!zoomOnly) {
    parts.push(
      <UndoGlyph key="u" x={at + 11} y={y + 15} />,
      <RedoGlyph key="r" x={at + 33} y={y + 15} />,
    );
    at += 44;
    if (session) {
      parts.push(<GroupDivider key="ds" x={at + 4} y={y} />);
      at += 8;
      parts.push(
        <g key="session">
          <circle cx={at + 11} cy={y + 16} r={5.5} {...INK} />
          <path d={`M${at + 11} ${y + 13} v3 l2 1.5`} {...INK} />
          <circle cx={at + 30} cy={y + 13} r={2} className="fill-slate-500" />
          <circle cx={at + 35} cy={y + 19} r={2} className="fill-slate-500" />
          <circle cx={at + 28} cy={y + 20} r={2} className="fill-slate-500" />
          <path
            d={`M${at + 50} ${y + 21} v-4 M${at + 54} ${y + 21} v-9 M${at + 58} ${y + 21} v-6`}
            {...INK}
          />
        </g>,
      );
      at += 66;
    }
    parts.push(<GroupDivider key="d1" x={at + 4} y={y} />);
    at += 8;
    parts.push(
      <LayersGlyph key="l" x={at + 11} y={y + 16} />,
      <BrushGlyph key="b" x={at + 33} y={y + 16} />,
    );
    at += 44;
    parts.push(<GroupDivider key="d2" x={at + 4} y={y} />);
    at += 8;
  }
  return (
    <g>
      <GroupCard x={x} y={y} w={w} />
      {parts}
      <Label x={at + 10} y={y + 16} size={13} weight={700} tone="muted" anchor="middle">
        −
      </Label>
      <Label x={at + 35} y={y + 17} size={10} weight={600} tone="body" anchor="middle">
        {level}
      </Label>
      <Label x={at + 60} y={y + 16} size={13} weight={700} tone="muted" anchor="middle">
        +
      </Label>
    </g>
  );
}

// --- The document group, bottom right ------------------------------------------------

export type Person = { initial: string; colour: 'brand' | 'emerald' | 'violet' | 'amber' | 'rose' };

const PEOPLE: Person[] = [
  { initial: 'A', colour: 'violet' },
  { initial: 'J', colour: 'amber' },
  { initial: 'M', colour: 'rose' },
];

type DocumentGroupProps = {
  name?: string | null;
  role?: boolean;
  tab?: string;
  mode?: Mode;
  count?: number;
  people?: Person[];
  more?: number;
  stackOpen?: boolean;
  /** The active tab's name open for renaming: a ringed field with a caret, no ⋯. */
  renaming?: boolean;
  /** The active tab is locked: a padlock before its name. */
  locked?: boolean;
};

function documentParts({
  name = 'Roadmap',
  role = true,
  tab = 'Overview',
  people = PEOPLE,
  more = 0,
  locked = false,
}: DocumentGroupProps) {
  const docW = 26 + (name ? textW(name, 10.5) + 8 : 0) + (role ? 54 : 0);
  const stackW = 36;
  const tabW = 26 + (locked ? 12 : 0) + textW(tab, 10.5) + 4 + stackW + 22;
  const peopleW = people.length ? 10 + people.length * 14 + (more ? 22 : 0) : 0;
  return { docW, tabW, stackW, peopleW, plusW: 26 };
}

/** The document group's width for the same props. */
export function documentGroupWidth(props: DocumentGroupProps = {}): number {
  const p = documentParts(props);
  return 4 + p.docW + 8 + p.tabW + (p.peopleW ? 8 + p.peopleW : 0) + 8 + p.plusW + 4;
}

/** The document group, its right edge at `right`: the share-state icon, the document's name (none on a phone) and
 *  the role pill; the active tab tinted: its kind glyph (Rename <kind> tab), the tab stack (its name, glyph and
 *  count, one button) and ⋯; the people here (up to three, then +N); and +. Returns the group with the tab stack's
 *  centre, where the tab list's arrow points. */
export function DocumentGroup({
  right,
  y,
  ...props
}: DocumentGroupProps & { right: number; y: number }) {
  const {
    name = 'Roadmap',
    role = true,
    tab = 'Overview',
    mode = 'Structured',
    count = 6,
    people = PEOPLE,
    more = 0,
  } = props;
  const p = documentParts(props);
  const w = documentGroupWidth(props);
  const x = right - w;
  let at = x + 4;
  const docX = at;
  at += p.docW;
  const tabX = at + 8;
  at = tabX + p.tabW;
  // The tab stack is one button with the name, inside the active tab, before its ⋯.
  const stackX = tabX + p.tabW - 22 - p.stackW;
  const peopleX = p.peopleW ? at + 8 : at;
  at = peopleX + p.peopleW;
  const plusX = at + 8;
  return (
    <g>
      <GroupCard x={x} y={y} w={w} />
      <ShareStateIcon cx={docX + 13} cy={y + 16} />
      {name && (
        <Label x={docX + 27} y={y + 17} size={10.5} tone="strong">
          {name}
        </Label>
      )}
      {role && <RolePill x={docX + 26 + (name ? textW(name, 10.5) + 8 : 0)} y={y} />}
      <GroupDivider x={tabX - 4} y={y} />
      {props.renaming ? (
        <rect
          x={tabX}
          y={y + 3}
          width={p.tabW}
          height={26}
          rx={6}
          className="fill-white stroke-brand-400"
          strokeWidth={2}
        />
      ) : (
        <rect x={tabX} y={y + 4} width={p.tabW} height={24} rx={6} className="fill-brand-50" />
      )}
      {!props.renaming && (
        <g transform={`translate(${tabX + 12} ${y + 16})`}>
          <ModeMark mode={mode} scale={0.42} className="stroke-brand-600" />
        </g>
      )}
      {props.locked && <PadlockGlyph x={tabX + 26} y={y + 16} />}
      <Label x={tabX + 22 + (props.locked ? 12 : 0)} y={y + 17} size={10.5} tone="strong">
        {tab}
      </Label>
      {props.renaming ? (
        <rect
          x={tabX + 24 + textW(tab, 10.5)}
          y={y + 9}
          width={1.5}
          height={14}
          className="fill-brand-500"
        />
      ) : (
        <DotsGlyph x={tabX + p.tabW - 11} y={y + 16} />
      )}
      {props.stackOpen && (
        <rect x={stackX} y={y + 6} width={p.stackW} height={20} rx={5} className="fill-brand-100" />
      )}
      {!props.renaming && (
        <g>
          <TabStackGlyph x={stackX + 9} y={y + 16} />
          <rect x={stackX + 18} y={y + 9} width={16} height={14} rx={7} className="fill-white" />
          <Label x={stackX + 26} y={y + 17} size={9} weight={600} tone="body" anchor="middle">
            {count}
          </Label>
        </g>
      )}
      {p.peopleW > 0 && (
        <g>
          <GroupDivider x={peopleX - 4} y={y} />
          {people.map((person, i) => (
            <Avatar
              key={i}
              cx={peopleX + 12 + i * 14}
              cy={y + 16}
              r={8}
              initial={person.initial}
              colour={person.colour}
            />
          ))}
          {more > 0 && (
            <g>
              <rect
                x={peopleX + 8 + people.length * 14}
                y={y + 9}
                width={20}
                height={14}
                rx={7}
                className="fill-slate-100"
              />
              <Label
                x={peopleX + 18 + people.length * 14}
                y={y + 17}
                size={8.5}
                weight={600}
                tone="body"
                anchor="middle"
              >
                +{more}
              </Label>
            </g>
          )}
        </g>
      )}
      <GroupDivider x={plusX - 4} y={y} />
      <Label x={plusX + 13} y={y + 16} size={15} weight={500} tone="muted" anchor="middle">
        +
      </Label>
    </g>
  );
}

/** Where the document group's tab stack sits, for the same props: its centre x. */
export function tabStackCentre(right: number, props: DocumentGroupProps = {}): number {
  const p = documentParts(props);
  const x = right - documentGroupWidth(props);
  return x + 4 + p.docW + 8 + p.tabW - 22 - p.stackW / 2;
}

// --- The tab list ----------------------------------------------------------------------

export type TabListRow =
  | { kind: 'folder'; name: string; count: number }
  | {
      kind: 'tab';
      name: string;
      mode?: Mode;
      people?: Person[];
      active?: boolean;
      indent?: boolean;
      /** Outside a one-tab link's scope: no name, no switch. */
      notShared?: boolean;
    };

const ROW_H = 22;

/** The tab list's height for the same rows. */
export function tabListHeight(rows: TabListRow[], find = false): number {
  return 30 + (find ? 28 : 0) + rows.length * ROW_H + 8 + 30;
}

/** The tab list, a popover with its top-left corner at (x, y) and its arrow pointing down at `arrowX`: "Tabs" and the
 *  count, how many people are here; Find a tab (with `find`); every tab in order under its folder heading, each with
 *  its mode glyph, its name and who is on it, the active one tinted with its ⋯; and New Tab. */
export function TabList({
  x,
  y,
  w = 220,
  rows,
  count,
  peopleHere = 0,
  find = false,
  arrowX,
}: {
  x: number;
  y: number;
  w?: number;
  rows: TabListRow[];
  count: number;
  peopleHere?: number;
  find?: boolean;
  arrowX?: number;
}) {
  const h = tabListHeight(rows, find);
  let at = y + 30;
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={10}
        className="fill-white stroke-slate-200"
        strokeWidth={1.5}
      />
      {arrowX !== undefined && (
        <path
          d={`M${arrowX - 7} ${y + h - 0.75} l7 7 l7 -7`}
          className="fill-white stroke-slate-200"
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
      )}
      <Label x={x + 12} y={y + 16} size={11} weight={700} tone="strong">
        Tabs
      </Label>
      <Label x={x + 44} y={y + 16} size={10} tone="muted">
        {count}
      </Label>
      {peopleHere > 0 && (
        <Label x={x + w - 12} y={y + 16} size={9.5} tone="muted" anchor="end">
          {`${peopleHere} people here`}
        </Label>
      )}
      {find && (
        <g>
          <rect
            x={x + 8}
            y={at}
            width={w - 16}
            height={22}
            rx={6}
            className="fill-slate-50 stroke-slate-200"
            strokeWidth={1}
          />
          <SearchGlyph x={x + 20} y={at + 11} />
          <Label x={x + 32} y={at + 12} size={9.5} tone="muted">
            Find a tab
          </Label>
        </g>
      )}
      {(() => {
        if (find) at += 28;
        return rows.map((row, i) => {
          const ry = at + i * ROW_H;
          if (row.kind === 'folder') {
            return (
              <g key={i}>
                <FolderGlyph x={x + 18} y={ry + 11} />
                <Label x={x + 28} y={ry + 12} size={9.5} weight={700} tone="body">
                  {row.name}
                </Label>
                <Label x={x + w - 14} y={ry + 12} size={9} tone="muted" anchor="end">
                  {row.count}
                </Label>
              </g>
            );
          }
          const left = x + (row.indent ? 22 : 8);
          return (
            <g key={i}>
              {row.active && (
                <rect
                  x={left}
                  y={ry + 1}
                  width={x + w - 8 - left}
                  height={ROW_H - 2}
                  rx={6}
                  className="fill-brand-50"
                />
              )}
              {row.notShared ? (
                <circle
                  cx={left + 11}
                  cy={ry + 11}
                  r={4.5}
                  fill="none"
                  className="stroke-slate-400"
                  strokeWidth={1.2}
                  strokeDasharray="2 2"
                />
              ) : (
                <g transform={`translate(${left + 11} ${ry + 11})`}>
                  <ModeMark
                    mode={row.mode ?? 'Structured'}
                    scale={0.4}
                    className={row.active ? 'stroke-brand-600' : 'stroke-slate-500'}
                  />
                </g>
              )}
              <Label
                x={left + 22}
                y={ry + 12}
                size={10}
                weight={row.active ? 600 : 400}
                tone={row.notShared ? 'muted' : 'strong'}
              >
                {row.notShared ? 'Not shared' : row.name}
              </Label>
              {(row.people ?? []).map((person, pi) => (
                <Avatar
                  key={pi}
                  cx={x + w - (row.active ? 38 : 20) - pi * 10}
                  cy={ry + 11}
                  r={6}
                  initial={person.initial}
                  colour={person.colour}
                />
              ))}
              {row.active && <DotsGlyph x={x + w - 20} y={ry + 11} />}
            </g>
          );
        });
      })()}
      <line
        x1={x + 8}
        y1={y + h - 32}
        x2={x + w - 8}
        y2={y + h - 32}
        className="stroke-slate-200"
        strokeWidth={1}
      />
      <Label x={x + 14} y={y + h - 15} size={10.5} weight={600} tone="accent">
        + New Tab
      </Label>
    </g>
  );
}

export const SAMPLE_PEOPLE = PEOPLE;

// --- The Palette strip, short ------------------------------------------------------------

const TILE_GLYPHS: ((x: number, y: number) => ReactNode)[] = [
  (x, y) => <rect x={x - 5} y={y - 5} width={10} height={10} rx={1.5} {...INK} />,
  (x, y) => <circle cx={x} cy={y} r={5.5} {...INK} />,
  (x, y) => <path d={`M${x} ${y - 6} L${x + 6} ${y} L${x} ${y + 6} L${x - 6} ${y} Z`} {...INK} />,
  (x, y) => <path d={`M${x - 5} ${y - 5} H${x + 5} M${x} ${y - 5} V${y + 6}`} {...INK} />,
  (x, y) => (
    <path
      d={`M${x - 6} ${y} H${x + 5} M${x + 2} ${y - 3} L${x + 5} ${y} L${x + 2} ${y + 3}`}
      {...INK}
    />
  ),
  (x, y) => <path d={`M${x - 3} ${y - 5} H${x + 6} L${x + 3} ${y + 5} H${x - 6} Z`} {...INK} />,
];

/** The Palette strip at a figure's width, its top-left corner at (x, y): the selection mode and the category picker,
 *  as many tiles as fit, and Search at its end. */
export function MiniStrip({ x, y, w }: { x: number; y: number; w: number }) {
  const tiles = Math.max(0, Math.floor((w - 96) / 26));
  return (
    <g>
      <GroupCard x={x} y={y} w={w} />
      <rect
        x={x + 4}
        y={y + 4}
        width={30}
        height={24}
        rx={6}
        className="fill-brand-50 stroke-brand-100"
        strokeWidth={1}
      />
      <path d={`M${x + 12} ${y + 10} l7 4 l-3 1 l-1 3 Z`} {...INK} className="stroke-brand-600" />
      <path
        d={`M${x + 24} ${y + 15} l2.5 2.5 l2.5 -2.5`}
        {...INK}
        className="stroke-brand-600"
        strokeWidth={1.2}
      />
      <rect
        x={x + 38}
        y={y + 4}
        width={30}
        height={24}
        rx={6}
        className="fill-brand-50 stroke-brand-100"
        strokeWidth={1}
      />
      <rect
        x={x + 44}
        y={y + 11}
        width={9}
        height={9}
        rx={2}
        {...INK}
        className="stroke-brand-600"
      />
      <path
        d={`M${x + 58} ${y + 15} l2.5 2.5 l2.5 -2.5`}
        {...INK}
        className="stroke-brand-600"
        strokeWidth={1.2}
      />
      {Array.from({ length: tiles }, (_, i) => (
        <g key={i}>{TILE_GLYPHS[i % TILE_GLYPHS.length]!(x + 84 + i * 26, y + 16)}</g>
      ))}
      <SearchGlyph x={x + w - 15} y={y + 16} />
    </g>
  );
}
