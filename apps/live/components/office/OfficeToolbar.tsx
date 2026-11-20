'use client';

// The office shell's toolbar (docs/specs/004-interface-design/office-shell.md "Toolbar"): the kind's groups in a
// rounded bar, one tab stop with arrow keys between controls, and the controls that do not fit moved, from the right,
// behind More, which opens them as a second row in the same order. On a phone it is one row that scrolls sideways,
// docked just above the on-screen keyboard while that is up (office-shell.md "Phone and tablet").
import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import {
  ChevronDownIcon,
  Glyph,
  HoverCard,
  Prims,
  useClickOutside,
  useEscape,
  useVisualViewportBand,
} from '@livedoc/ui';
import { lucideEllipsisVertical } from '@livedoc/icons/lucide';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import type { ShortcutText } from '@/lib/office/shortcut-notation';
import {
  controlsThatFit,
  type OfficeControl,
  type OfficeToolbarGroup,
} from '@/lib/office/office-toolbar';
import { OfficeZoomField, type OfficeZoom } from './OfficeZoomField';
import { OfficeFontSizeField, type OfficeFontSize } from './OfficeFontSizeField';
import { useOfficeControlStates } from './useOfficeControlStates';
import { OfficeFontMenu, type OfficeFontFamily } from './OfficeFontMenu';
import { OfficeColourControl, type OfficeColours } from './OfficeColourControl';
import { OfficeSplitToggle } from './OfficeSplitToggle';
import { OfficeChoiceMenu, type OfficeChoices } from './OfficeChoiceMenu';

/** The room a divider takes between groups: 1 px and 4 px either side. */
const DIVIDER_PX = 9;
/** More's width, and the bar's padding either side. */
const MORE_PX = 32;
const BAR_PADDING_PX = 16;

// A control's look but for its side padding: a split toggle's chevron is narrower.
const CONTROL_BODY =
  'relative flex h-7 shrink-0 items-center justify-center gap-0.5 rounded text-(--office-icon) outline-none touch-target-y hover:bg-(--office-hover) focus-visible:ring-2 focus-visible:ring-(--office-focus) aria-pressed:bg-(--office-pressed) aria-pressed:text-(--office-pressed-ink) aria-disabled:opacity-40 aria-disabled:hover:bg-transparent';
const CONTROL = `${CONTROL_BODY} px-1`;

type Placed = { control: OfficeControl; startsGroup: boolean; group: string };

export function OfficeToolbar({
  groups,
  actions,
  shortcutOf,
  zoom,
  fontSize = null,
  fontFamily = null,
  colours = null,
  choices = null,
  refresh,
  phone = false,
}: {
  groups: readonly OfficeToolbarGroup[];
  actions: OfficeActions;
  shortcutOf: (id: string) => ShortcutText | null;
  zoom: OfficeZoom | null;
  fontSize?: OfficeFontSize | null;
  fontFamily?: OfficeFontFamily | null;
  colours?: OfficeColours | null;
  choices?: OfficeChoices | null;
  // Told when what the controls show may have changed (the selection, the formatting at the caret): pressed states
  // and the font size are read again.
  refresh?: (listener: () => void) => () => void;
  // A phone: every control in one row that scrolls, none behind More.
  phone?: boolean;
}) {
  const placed = useMemo<Placed[]>(
    () =>
      groups.flatMap((group) =>
        group.controls.map((control, i) => ({ control, startsGroup: i === 0, group: group.id })),
      ),
    [groups],
  );
  const controls = useMemo(() => placed.map((p) => p.control), [placed]);
  const states = useOfficeControlStates(
    controls,
    actions,
    { fontSize, fontFamily, colours, choices },
    refresh,
  );
  const bar = useRef<HTMLDivElement>(null);
  const widths = useRef(new Map<string, number>());
  const [measuredFit, setFit] = useState(placed.length);
  const fit = phone ? placed.length : measuredFit;
  // The part of the window not under the on-screen keyboard; null while there is none.
  const band = useVisualViewportBand();
  const docked = phone && band !== null;
  const [moreOpen, setMoreOpen] = useState(false);
  const [focusIndex, setFocusIndex] = useState(0);
  const moreBox = useRef<HTMLDivElement>(null);
  useClickOutside(moreBox, () => setMoreOpen(false), moreOpen);
  useEscape(() => setMoreOpen(false), { enabled: moreOpen });

  // Each control's width is measured while it is in the bar, and kept: one moved behind More keeps its last width.
  useLayoutEffect(() => {
    const element = bar.current;
    if (!element || phone) return;
    const measure = () => {
      // Not laid out (hidden, or no layout at all): nothing to measure, so nothing moves.
      if (element.clientWidth === 0) return;
      for (const node of element.querySelectorAll<HTMLElement>('[data-control-slot]'))
        if (!node.hidden) widths.current.set(node.dataset.controlSlot!, node.offsetWidth);
      const room = element.clientWidth - BAR_PADDING_PX;
      const next = controlsThatFit(
        placed.map((p) => ({
          width: widths.current.get(p.control.id) ?? 0,
          startsGroup: p.startsGroup,
        })),
        room,
        DIVIDER_PX,
        MORE_PX,
      );
      setFit(next);
      if (next === placed.length) setMoreOpen(false);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [placed, phone]);

  const control = (p: Placed, index: number, row: 'bar' | 'more') => (
    <ControlView
      control={p.control}
      action={actions[p.control.id]}
      shortcut={p.control.shortcut ? shortcutOf(p.control.shortcut) : null}
      zoom={zoom}
      fontSize={fontSize}
      fontFamily={fontFamily}
      family={states.fontFamily}
      colours={colours}
      colourValues={states.colours}
      choices={choices}
      choiceValues={states.choices}
      pressed={states.pressed.has(p.control.id)}
      disabled={states.disabled.has(p.control.id)}
      size={states.fontSize}
      tabIndex={row === 'bar' && index === Math.min(focusIndex, fit - 1) ? 0 : -1}
    />
  );

  // One tab stop: Left and Right move between the bar's controls, wrapping; Home and End go to the ends. In the zoom
  // field Left and Right move in the text, and on past its first or last character, so every control stays in reach.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
    if (!keys.includes(e.key)) return;
    if (e.target instanceof HTMLInputElement && !leavesField(e.target, e.key)) return;
    const stops = [
      ...e.currentTarget.querySelectorAll<HTMLElement>('[data-office-control]'),
    ].filter((el) => !el.closest('[hidden]'));
    const at = stops.indexOf(document.activeElement as HTMLElement);
    if (stops.length === 0) return;
    e.preventDefault();
    const next =
      e.key === 'Home'
        ? 0
        : e.key === 'End'
          ? stops.length - 1
          : (at + (e.key === 'ArrowRight' ? 1 : -1) + stops.length) % stops.length;
    stops[next]!.focus();
  };

  const moved = placed.slice(fit);
  return (
    <div
      data-office-toolbar-docked={docked || undefined}
      style={
        docked ? { top: band.top + band.height, left: band.left, width: band.width } : undefined
      }
      className={
        docked
          ? 'fixed z-30 -translate-y-full bg-(--office-chrome) px-2 py-1.5'
          : 'px-4 pt-1.5 pb-2 phone:px-2'
      }
    >
      <div
        ref={bar}
        role="toolbar"
        aria-label="Toolbar"
        data-region="toolbar"
        onKeyDown={onKeyDown}
        onFocus={(e) => {
          const slot = (e.target as HTMLElement).closest<HTMLElement>('[data-control-slot]');
          const index = placed.findIndex((p) => p.control.id === slot?.dataset.controlSlot);
          if (index >= 0 && index < fit) setFocusIndex(index);
        }}
        className={`flex h-10 items-center rounded-3xl bg-(--office-toolbar) px-2 ${
          phone ? 'overflow-x-auto [scrollbar-width:none]' : 'overflow-hidden'
        }`}
      >
        {placed.map((p, index) => (
          <Slot key={p.control.id} id={p.control.id} hidden={index >= fit}>
            {p.startsGroup && index > 0 ? <Divider /> : null}
            {control(p, index, 'bar')}
          </Slot>
        ))}
        {moved.length > 0 ? (
          <div ref={moreBox} className="ml-auto flex shrink-0 items-center">
            <HoverCard title="More">
              <button
                type="button"
                aria-label="More"
                aria-expanded={moreOpen}
                data-office-control="more"
                tabIndex={-1}
                onClick={() => setMoreOpen((open) => !open)}
                className={CONTROL}
              >
                <Glyph size={18} units={24}>
                  <Prims prims={lucideEllipsisVertical} />
                </Glyph>
              </button>
            </HoverCard>
          </div>
        ) : null}
      </div>
      {moreOpen && moved.length > 0 ? (
        <div
          role="toolbar"
          aria-label="More tools"
          onKeyDown={onKeyDown}
          className="mt-1 ml-auto flex w-fit max-w-full flex-wrap items-center rounded-3xl bg-(--office-toolbar) px-2 py-1.5"
        >
          {moved.map((p, i) => (
            <span key={p.control.id} className="flex items-center">
              {p.startsGroup && i > 0 ? <Divider /> : null}
              {control(p, fit + i, 'more')}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// Whether a key in a text field moves on to the next control: Left at its start, Right at its end, nothing selected.
function leavesField(field: HTMLInputElement, key: string): boolean {
  if (key === 'Home' || key === 'End') return false;
  const { selectionStart: start, selectionEnd: end, value } = field;
  if (start === null || start !== end) return false;
  return key === 'ArrowLeft' ? start === 0 : end === value.length;
}

function Slot({ id, hidden, children }: { id: string; hidden: boolean; children: ReactNode }) {
  return (
    <span data-control-slot={id} hidden={hidden} className="flex shrink-0 items-center">
      {children}
    </span>
  );
}

function Divider() {
  return <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-(--office-line)" />;
}

function ControlView({
  control,
  action,
  shortcut,
  zoom,
  fontSize,
  fontFamily,
  family,
  colours,
  colourValues,
  choices,
  choiceValues,
  pressed: on,
  disabled,
  size,
  tabIndex,
}: {
  control: OfficeControl;
  action: OfficeActions[string];
  shortcut: ShortcutText | null;
  zoom: OfficeZoom | null;
  fontSize: OfficeFontSize | null;
  fontFamily: OfficeFontFamily | null;
  family: string | null;
  colours: OfficeColours | null;
  // What each colour control shows now (useOfficeControlStates).
  colourValues: Readonly<Record<string, string | null | undefined>>;
  choices: OfficeChoices | null;
  // What each choice control shows now.
  choiceValues: Readonly<Record<string, string | null>>;
  // What the binding says now (useOfficeControlStates): pressed, dimmed, and the font size.
  pressed: boolean;
  disabled: boolean;
  size: number | null;
  tabIndex: number;
}) {
  const { look } = control;
  if (look.kind === 'zoom')
    return zoom ? <OfficeZoomField zoom={zoom} tabIndex={tabIndex} /> : null;
  if (look.kind === 'fontSize')
    return fontSize ? (
      <OfficeFontSizeField size={fontSize} value={size} tabIndex={tabIndex} />
    ) : null;
  if (look.kind === 'font')
    return fontFamily ? (
      <OfficeFontMenu
        font={fontFamily}
        value={family}
        tabIndex={tabIndex}
        className={`${CONTROL} justify-between text-sm text-(--office-ink)`}
      />
    ) : null;
  if (look.kind === 'choice') {
    const choice = choices?.[control.id];
    return choice ? (
      <OfficeChoiceMenu
        id={control.id}
        label={control.label}
        value={choiceValues[control.id] ?? null}
        entries={choice.entries}
        actions={choice.actions}
        width={look.width}
        tabIndex={tabIndex}
        className={`${CONTROL} justify-between text-sm text-(--office-ink)`}
      />
    ) : null;
  }
  if (look.kind === 'colour') {
    const colour = colours?.[control.id];
    return colour ? (
      <OfficeColourControl
        id={control.id}
        label={control.label}
        icon={look.icon}
        colour={colour}
        value={colourValues[control.id]}
        tabIndex={tabIndex}
        className={`${CONTROL} min-w-7`}
      />
    ) : null;
  }
  if (look.kind === 'icon' && look.split) {
    const soon = control.status === 'comingSoon' || !action;
    return (
      <OfficeSplitToggle
        id={control.id}
        label={control.label}
        icon={look.icon}
        action={action}
        pressed={on}
        inert={soon || disabled}
        description={soon ? 'Coming soon' : shortcut?.shown}
        shortcut={shortcut}
        choice={choices?.[control.id]}
        tabIndex={tabIndex}
        className={CONTROL}
        chevronClassName={CONTROL_BODY}
      />
    );
  }
  // An icon control with a menu the kind binds as a choice (the Align control).
  const iconChoice = look.kind === 'icon' && look.menu ? choices?.[control.id] : undefined;
  if (look.kind === 'icon' && iconChoice) {
    const value = choiceValues[control.id] ?? null;
    return (
      <OfficeChoiceMenu
        id={control.id}
        label={control.label}
        value={value}
        icon={iconChoice.iconOf?.(value) ?? look.icon}
        entries={iconChoice.entries}
        actions={iconChoice.actions}
        width={0}
        tabIndex={tabIndex}
        className={`${CONTROL} min-w-7`}
      />
    );
  }
  const soon = control.status === 'comingSoon' || !action;
  const inert = soon || disabled;
  const pressed = look.kind === 'icon' && look.toggle ? on : undefined;
  const description = soon ? 'Coming soon' : shortcut?.shown;
  return (
    <HoverCard title={control.label} description={description}>
      <button
        type="button"
        aria-label={control.label}
        aria-disabled={inert || undefined}
        aria-pressed={pressed}
        aria-keyshortcuts={soon ? undefined : shortcut?.aria}
        aria-haspopup={
          (look.kind === 'icon' && look.menu) || (look.kind === 'text' && look.list)
            ? 'menu'
            : undefined
        }
        data-office-control={control.id}
        tabIndex={tabIndex}
        onClick={(event) => {
          if (inert) return;
          // A double press (office-shell.md "Toolbar"): the second press of a double-click runs the binding's double.
          if (event.detail === 2 && action?.double) action.double();
          else action?.run();
        }}
        style={look.kind === 'text' ? { width: look.width } : undefined}
        className={`${CONTROL} ${look.kind !== 'text' ? 'min-w-7' : look.list ? 'justify-between text-sm text-(--office-ink)' : 'justify-center rounded-sm border border-(--office-line) text-sm text-(--office-ink)'}`}
      >
        {look.kind === 'icon' ? (
          <Glyph size={18} units={24}>
            <Prims prims={look.icon} />
          </Glyph>
        ) : (
          <span className={look.list ? 'truncate pl-1' : ''}>{look.text}</span>
        )}
        {(look.kind === 'icon' && look.menu) || (look.kind === 'text' && look.list) ? (
          <ChevronDownIcon size={12} />
        ) : null}
      </button>
    </HoverCard>
  );
}
