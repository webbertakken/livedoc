'use client';

// The article's formatting row as the Toolbar strip docks it (docs/specs/007-editor/article-pages.md "The page
// toolbar"; docs/specs/007-editor/toolbar-layout.md "Motion"): what it holds, in order, and the sizes its controls
// take. The page toolbar draws its controls at these sizes, and the strip's slot holds a reserve of the same row,
// invisible, from the first frame until the controls arrive with the article's editor (a chunk of their own): the
// strip is drawn at its final width at once, instead of growing, and taking a row of its own, a moment later.
// Light on purpose: the strip loads it with the editor, so it imports no glyph data and no command.
import { ChevronDownIcon } from '@livedoc/ui';
import { TOOLBAR_DIVIDER } from '@/components/chrome/toolbar-surface';
import { useIsMobileViewport } from '@/hooks/ui/useIsMobileViewport';

/** A place in the row: the text style picker, a plain button, a button opening a menu, or a divider. */
export type ArticleDockItem = 'style' | 'button' | 'menu' | 'divider';

// Style | Bold Italic Underline Colour Link | Lists Alignment More | Insert | Comment Assign Action.
export const ARTICLE_DOCK_ROW: readonly ArticleDockItem[] = [
  'style',
  'divider',
  'button',
  'button',
  'button',
  'menu',
  'button',
  'divider',
  'menu',
  'menu',
  'menu',
  'divider',
  'menu',
  'divider',
  'button',
  'button',
];

/** The docked row itself. */
export const ARTICLE_DOCK_ROW_CLASS = 'flex min-w-0 items-center gap-0.5';

/** The size of every glyph in a button, and of the style picker's own. */
export const ARTICLE_DOCK_GLYPH_PX = 16;
export const ARTICLE_DOCK_STYLE_GLYPH_PX = 14;

/** The style picker's box: as wide as its longest usual name on a computer, its name's width on a phone. */
export function articleDockStyleBox(phone: boolean): string {
  return `flex h-field ${phone ? '' : 'min-w-[124px]'} shrink-0 items-center gap-1 rounded-control px-2 text-body`;
}

/** A button's box: square, or padded round its glyph and chevron where it opens a menu. */
export function articleDockButtonBox(menu: boolean): string {
  return `flex h-field shrink-0 items-center justify-center gap-1 rounded-control ${menu ? 'px-2' : 'w-field'}`;
}

function GlyphPlace({ px }: { px: number }) {
  return <span className="shrink-0" style={{ width: px, height: px }} />;
}

/** The row's place, held invisible and inert until the page toolbar docks its controls. */
export function ArticleDockReserve() {
  const phone = useIsMobileViewport();
  return (
    <div
      aria-hidden
      inert
      data-article-dock-reserve=""
      className={`${ARTICLE_DOCK_ROW_CLASS} invisible`}
    >
      {ARTICLE_DOCK_ROW.map((item, i) => {
        if (item === 'divider') return <span key={i} className={TOOLBAR_DIVIDER} />;
        if (item === 'style')
          return (
            <span key={i} data-reserve={item} className={articleDockStyleBox(phone)}>
              <GlyphPlace px={ARTICLE_DOCK_STYLE_GLYPH_PX} />
              <span className="flex-1" />
              <ChevronDownIcon className="shrink-0" />
            </span>
          );
        const menu = item === 'menu';
        return (
          <span key={i} data-reserve={item} className={articleDockButtonBox(menu)}>
            <GlyphPlace px={ARTICLE_DOCK_GLYPH_PX} />
            {menu ? <ChevronDownIcon className="shrink-0" /> : null}
          </span>
        );
      })}
    </div>
  );
}
