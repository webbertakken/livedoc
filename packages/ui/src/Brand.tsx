'use client';

import { useId, useMemo, useRef, useState } from 'react';
import {
  BRAND_DETAIL,
  BRAND_GRADIENTS,
  BRAND_MARK_VIEWBOX,
  BRAND_SHEETS,
  PAGE_FOLD,
  PAGE_OUTLINE,
  SHEET,
  SHEET_EDGE,
  SHEET_OUTLINE,
  lineD,
  sheetTransform,
  type BrandMarkVariant,
} from './brand-mark-geometry';
import { prismPalette } from './brand-prism';
import { useBrandAssembled } from './useBrandAssembled';
import { useBrandFan, type BrandFanTargets } from './useBrandFan';
import { useBrandPress } from './useBrandPress';

type BrandSize = 'sm' | 'md' | 'lg';

type BrandProps = {
  href?: string;
  size?: BrandSize;
  className?: string;
  // Override colour for the "Live" half of the wordmark and the logo mark.
  // Used by the editor header to tint the logo with the active tab's theme
  // accent; when unset, the brand palette and brand-600 / sky-400 show.
  accentColor?: string;
  // Extra classes for the wordmark span ("Live" + "Doc"). The editor
  // passes `hidden sm:inline` here so the wordmark drops off the mobile
  // header (the logo mark stays for orientation). Marketing surfaces leave
  // this unset so the wordmark always shows.
  wordmarkClassName?: string;
  // The site and editor headers' logo builds itself as the page loads, once per load
  // (docs/specs/004-interface-design/brand-mark.md "Size and motion"; brand-motion.css).
  assemble?: boolean;
  // The editor's Back (docs/specs/007-editor/toolbar-layout.md "The top line"): the mark without the wordmark, a
  // caret leading it, the link named for where it goes, the mark at the group's 24px.
  wordmark?: boolean;
  leading?: React.ReactNode;
  label?: string;
  markClassName?: string;
  // The link opens in a new tab (the editor's Back in a workbench frame with document scope).
  newTab?: boolean;
  // Called on a press of the link, before it navigates (the editor counts its Back). Without an href the logo is a
  // button that does this alone (a workspace frame's Back), the whole of it the logo, as the link is.
  onClick?: (e: React.MouseEvent<HTMLElement>) => void;
};

// Type size, and the gap between the mark and the wordmark at that size.
const sizeClasses: Record<BrandSize, string> = {
  sm: 'gap-2 text-base font-semibold tracking-tight',
  md: 'gap-2.5 text-lg font-semibold tracking-tight',
  lg: 'gap-3 text-2xl font-semibold tracking-tight',
};

// The stack is a solid, so it reads smaller than a line icon at the same box;
// it sits a size up from the text so it holds its own beside the wordmark.
const markClasses: Record<BrandSize, string> = {
  sm: 'size-5',
  md: 'size-7',
  lg: 'size-10',
};

// A logo link to the page already open scrolls back to its top instead of
// reloading (the footer's on the homepage, the header's anywhere). Modified
// clicks (new tab, new window) keep the browser's own behaviour.
function scrollTopIfHere(e: React.MouseEvent<HTMLAnchorElement>) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
    return;
  const target = new URL(e.currentTarget.href, window.location.href);
  if (target.origin !== window.location.origin || target.pathname !== window.location.pathname)
    return;
  e.preventDefault();
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
}

const COLOUR_TRANSITION = 'color var(--transition-duration-micro) ease-out';

export function Brand({
  href,
  size = 'md',
  className = '',
  accentColor,
  wordmarkClassName = '',
  assemble = false,
  wordmark = true,
  leading,
  label = 'LiveDoc',
  markClassName,
  newTab = false,
  onClick,
}: BrandProps) {
  // Pointing at the logo (or reaching it by keyboard) fans the stack open; the wordmark holds still.
  const [fanning, setFanning] = useState(false);
  useBrandAssembled(assemble);
  const pressHandlers = useBrandPress();
  const start = () => setFanning(true);
  const fanHandlers = {
    onPointerEnter: (e: React.PointerEvent) => e.pointerType !== 'touch' && start(),
    onPointerLeave: (e: React.PointerEvent<HTMLElement>) => {
      setFanning(false);
      pressHandlers.onPointerLeave(e);
    },
    onFocus: (e: React.FocusEvent<HTMLElement>) =>
      e.currentTarget.matches(':focus-visible') && start(),
    onBlur: (e: React.FocusEvent<HTMLElement>) => {
      setFanning(false);
      pressHandlers.onBlur(e);
    },
    onPointerDown: pressHandlers.onPointerDown,
    onPointerUp: pressHandlers.onPointerUp,
    onPointerCancel: pressHandlers.onPointerCancel,
    onKeyDown: pressHandlers.onKeyDown,
    onKeyUp: pressHandlers.onKeyUp,
    'data-assemble': assemble ? '' : undefined,
  };
  // The mark alone takes its whole look from its caller (the editor's Back draws it in a toolbar button).
  const classes = wordmark
    ? `inline-flex items-center ${sizeClasses[size]} text-slate-900 dark:text-slate-100 ${className}`.trim()
    : className;
  const content = (
    <>
      {leading}
      <BrandMark
        className={`${markClassName ?? markClasses[size]} shrink-0`}
        accentColor={accentColor}
        fanning={fanning}
      />
      {/* A logotype: WCAG 1.4.3 sets text that is part of a logo no contrast minimum, and the
          contrast audits skip it by this mark. */}
      {wordmark ? (
        <span className={wordmarkClassName || undefined} data-logotype="">
          <span
            className={accentColor ? '' : 'text-brand-700 dark:text-sky-400'}
            style={
              accentColor
                ? { color: accentColor, transition: COLOUR_TRANSITION }
                : { transition: COLOUR_TRANSITION }
            }
          >
            Live
          </span>
          <span>Doc</span>
        </span>
      ) : null}
    </>
  );

  if (href) {
    return (
      // Named on the link itself: a caller may hide the wordmark (the editor header on a phone), and the
      // mark alone has no text. The name is the wordmark's own text, so a visible one still matches it.
      <a
        href={href}
        aria-label={label}
        className={classes}
        {...(newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        onClick={(e) => {
          onClick?.(e);
          if (!newTab) scrollTopIfHere(e);
        }}
        {...fanHandlers}
      >
        {content}
      </a>
    );
  }
  if (onClick) {
    return (
      <button
        type="button"
        aria-label={label}
        className={classes}
        onClick={onClick}
        {...fanHandlers}
      >
        {content}
      </button>
    );
  }
  return (
    <span className={classes} {...fanHandlers}>
      {content}
    </span>
  );
}

// Each stop carries its light and dark colour as custom properties and picks
// one by the page's `.dark` class; a theme change crossfades the stop colours.
const STOP_CLASS =
  '[stop-color:var(--ldm-l)] dark:[stop-color:var(--ldm-d)] transition-[stop-color] duration-micro ease-out motion-reduce:transition-none';
// The highlight ink (text lines, grid cells, back edges) picks its scheme the same way.
const INK_CLASS = '[--ldm-n:var(--ldm-nl)] dark:[--ldm-n:var(--ldm-nd)]';
const INK_STYLE: React.CSSProperties = { stroke: 'var(--ldm-n)' };

// The Page Stack (docs/specs/004-interface-design/brand-mark.md): three glass
// sheets over the brand palette, or tinted from `accentColor`, following the
// page's light / dark scheme. `full` adds finer lines, the grid cells and the
// sheen for 48px and up. `tone="mono"` draws it in currentColor for a solid
// tile, the lines cut out. While `fanning`, the stack fans open (useBrandFan).
export function BrandMark({
  className,
  style,
  accentColor,
  variant = 'compact',
  tone = 'colour',
  fanning = false,
  pageContent,
}: {
  className?: string;
  style?: React.CSSProperties;
  accentColor?: string;
  variant?: BrandMarkVariant;
  tone?: 'colour' | 'mono';
  fanning?: boolean;
  // Drawn on the page in place of its text lines: the homepage's every-kind cycle.
  pageContent?: React.ReactNode;
}) {
  // Ids are document-global, so each instance prefixes its own.
  const uid = `ldm${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const light = useMemo(() => prismPalette('light', accentColor), [accentColor]);
  const dark = useMemo(() => prismPalette('dark', accentColor), [accentColor]);
  const targets = useRef<BrandFanTargets>([]);
  useBrandFan(fanning, targets);

  const mono = tone === 'mono';
  const full = variant === 'full';
  const detail = full ? BRAND_DETAIL.full : BRAND_DETAIL.compact;
  const lines = (stroke?: string) =>
    detail.lines.map((l) => (
      <path
        key={l.v}
        data-line=""
        d={lineD(l)}
        strokeWidth={l.width}
        strokeLinecap="round"
        fill="none"
        stroke={stroke}
        style={stroke ? undefined : INK_STYLE}
      />
    ));
  const cells = (stroke?: string) =>
    full
      ? BRAND_DETAIL.full.cells.map((c) => (
          <rect
            key={c.y}
            x={c.x}
            y={c.y}
            width={c.size}
            height={c.size}
            rx={c.radius}
            data-cell=""
            strokeWidth={2}
            fill="none"
            stroke={stroke}
            style={stroke ? undefined : INK_STYLE}
          />
        ))
      : null;
  const mask = (key: string, outline: string, cut: React.ReactNode) => (
    <mask
      id={`${uid}-${key}`}
      maskUnits="userSpaceOnUse"
      x={-10}
      y={-10}
      width={SHEET.width + 20}
      height={SHEET.height + 20}
    >
      <path d={outline} fill="#ffffff" />
      {cut}
    </mask>
  );

  return (
    <svg
      viewBox={BRAND_MARK_VIEWBOX}
      className={`isolate overflow-visible ${className ?? ''}`.trim()}
      style={style}
      aria-hidden="true"
    >
      <defs>
        {mono ? (
          <>
            {mask('page-cut', PAGE_OUTLINE, lines('#000000'))}
            {mask('sheet-cut', SHEET_OUTLINE, cells('#000000'))}
          </>
        ) : (
          <>
            {BRAND_GRADIENTS.map(({ key, vector: v, stops }) => (
              <linearGradient
                key={key}
                id={`${uid}-${key}`}
                x1={`${v.x1}%`}
                y1={`${v.y1}%`}
                x2={`${v.x2}%`}
                y2={`${v.y2}%`}
              >
                {stops.map(([stop, offset, opacity]) => (
                  <stop
                    key={offset}
                    offset={`${offset}%`}
                    stopOpacity={opacity}
                    className={STOP_CLASS}
                    style={{ '--ldm-l': light[stop], '--ldm-d': dark[stop] } as React.CSSProperties}
                  />
                ))}
              </linearGradient>
            ))}
            {full && (
              <linearGradient id={`${uid}-sheen`} x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#ffffff" stopOpacity={0.45} />
                <stop offset="100%" stopColor="#ffffff" stopOpacity={0.05} />
              </linearGradient>
            )}
          </>
        )}
      </defs>
      <g
        data-mark-art=""
        className={mono ? undefined : INK_CLASS}
        style={{
          transformBox: 'fill-box',
          transformOrigin: 'center',
          ...(mono ? {} : { '--ldm-nl': light.highlight, '--ldm-nd': dark.highlight }),
        }}
      >
        {BRAND_SHEETS.map(({ key, step, gradient, monoOpacity }, i) => {
          const page = key === 'page';
          return (
            <g key={key} data-sheet-motion={key}>
              <g
                data-sheet={key}
                ref={(el) => {
                  targets.current[i] = el;
                }}
                transform={sheetTransform(step)}
              >
                {mono ? (
                  <path
                    d={page ? PAGE_OUTLINE : SHEET_OUTLINE}
                    fill="currentColor"
                    opacity={monoOpacity}
                    mask={
                      key === 'plain'
                        ? undefined
                        : `url(#${uid}-${page ? 'page-cut' : 'sheet-cut'})`
                    }
                  />
                ) : (
                  <path d={page ? PAGE_OUTLINE : SHEET_OUTLINE} fill={`url(#${uid}-${gradient})`} />
                )}
                {!mono && !page && (
                  <path
                    d={SHEET_EDGE}
                    strokeOpacity={detail.edge.opacity}
                    strokeWidth={detail.edge.width}
                    fill="none"
                    style={INK_STYLE}
                  />
                )}
                {!mono && key === 'sheet' && full && (
                  <g opacity={BRAND_DETAIL.full.cellOpacity}>{cells()}</g>
                )}
                {!mono && page && (pageContent ?? <g opacity={detail.lineOpacity}>{lines()}</g>)}
                {page && (
                  <path
                    data-fold=""
                    d={PAGE_FOLD}
                    fill={mono ? 'currentColor' : `url(#${uid}-fold)`}
                    opacity={mono ? 0.5 : undefined}
                  />
                )}
                {!mono &&
                  page &&
                  full &&
                  BRAND_DETAIL.full.sheen.map((sh) => (
                    <path
                      key={sh.d}
                      d={sh.d}
                      stroke={`url(#${uid}-sheen)`}
                      strokeWidth={sh.width}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill="none"
                    />
                  ))}
              </g>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
