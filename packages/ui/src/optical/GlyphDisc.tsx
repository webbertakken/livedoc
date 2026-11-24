'use client';

import { useRef, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react';
import { useInkCentring } from './ink-centring';

// A circle holding one glyph: a letter, initials, a numeral or an icon
// (docs/specs/004-interface-design/optical-alignment.md). A text glyph centres its cap band through
// `text-optical-centre`, not its line box, and initials and symbols centre by their ink, not their advance
// (useInkCentring); an icon renders as a block so no baseline gap offsets it. Colour, font size and ARIA are the
// caller's.
export type GlyphDiscProps = {
  // Diameter in px. Omit only for a disc that changes size at a breakpoint: its h-* / w-* classes size it.
  size?: number;
  children: ReactNode;
  as?: 'span' | 'div' | 'button';
} & HTMLAttributes<HTMLElement> &
  Pick<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'disabled'>;

// Text, or text and numbers side by side (`+{overflow}`), is one text glyph.
const isText = (children: ReactNode): boolean =>
  typeof children === 'string' ||
  typeof children === 'number' ||
  (Array.isArray(children) && children.length > 0 && children.every(isText));

const textOf = (children: ReactNode): string => {
  if (typeof children === 'string') return children;
  if (typeof children === 'number') return String(children);
  return Array.isArray(children) ? children.map(textOf).join('') : '';
};

// The text glyph, moved by its ink.
function TextGlyph({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const translate = useInkCentring(ref, text);
  return (
    <span ref={ref} className="text-optical-centre" style={translate ? { translate } : undefined}>
      {text}
    </span>
  );
}

export function GlyphDisc({
  size,
  children,
  as: Tag = 'span',
  className = '',
  style,
  ...rest
}: GlyphDiscProps) {
  return (
    <Tag
      data-optical="disc"
      className={`inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-full leading-none [&>svg]:block ${className}`}
      style={size === undefined ? style : { width: size, height: size, ...style }}
      {...rest}
    >
      {isText(children) ? <TextGlyph text={textOf(children)} /> : children}
    </Tag>
  );
}
