'use client';

// A comment's reactions (docs/specs/034-text-documents/review.md "Reactions"): its chips under the text, each its
// emoji and count, one's own pressed; a press adds or takes back one's own. Add emoji reaction opens the quick six
// and More emoji (the Insert emoji dialog, closed on a pick). Without `onReact` (a session that may not comment) the
// chips are text and nothing is offered.
import { useState } from 'react';
import { lucideSmilePlus } from '@livedoc/icons/lucide';
import { Tooltip, lucideGlyph } from '@livedoc/ui';
import { OfficeEmojiDialog } from '@/components/office/OfficeEmojiDialog';
import { QUICK_REACTIONS, type ReactionChip } from '@/lib/office/review/comment-reactions';

const AddReactionGlyph = lucideGlyph(lucideSmilePlus, 14);

const CHIP =
  'inline-flex h-chip items-center gap-1 rounded-full border px-2 text-supporting tabular-nums';
const CHIP_MINE =
  'border-brand-400 bg-brand-50 text-brand-800 dark:border-brand-400/60 dark:bg-brand-500/15 dark:text-brand-200';
const CHIP_OTHER =
  'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200';
const PRESSABLE =
  'relative touch-target cursor-pointer outline-none hover:brightness-95 focus-visible:ring-2 focus-visible:ring-brand-400';

export function CommentReactions({
  chips,
  onReact,
}: {
  chips: readonly ReactionChip[];
  /** Adds (`on`) or takes back one's own reaction; absent for a session that may not comment. */
  onReact?: (emoji: string, on: boolean) => void;
}) {
  const [offering, setOffering] = useState(false);
  const [more, setMore] = useState(false);
  const mine = new Set(chips.filter((c) => c.mine).map((c) => c.emoji));
  const take = (emoji: string) => {
    setOffering(false);
    setMore(false);
    onReact?.(emoji, !mine.has(emoji));
  };
  if (chips.length === 0 && !onReact) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {chips.map((chip) =>
        onReact ? (
          <Tooltip key={chip.emoji} label={chip.label}>
            <button
              type="button"
              aria-label={chip.label}
              aria-pressed={chip.mine}
              onClick={() => onReact(chip.emoji, !chip.mine)}
              className={`${CHIP} ${PRESSABLE} ${chip.mine ? CHIP_MINE : CHIP_OTHER}`}
            >
              <span aria-hidden>{chip.emoji}</span>
              <span aria-hidden>{chip.count}</span>
            </button>
          </Tooltip>
        ) : (
          <span
            key={chip.emoji}
            role="img"
            aria-label={chip.label}
            className={`${CHIP} ${chip.mine ? CHIP_MINE : CHIP_OTHER}`}
          >
            <span aria-hidden>{chip.emoji}</span>
            <span aria-hidden>{chip.count}</span>
          </span>
        ),
      )}
      {onReact ? (
        <Tooltip label="Add emoji reaction">
          <button
            type="button"
            aria-label="Add emoji reaction"
            aria-expanded={offering}
            onClick={() => setOffering((was) => !was)}
            className={`${CHIP} ${PRESSABLE} ${CHIP_OTHER} text-slate-500 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100 motion-reduce:transition-none dark:text-slate-400 [@media(hover:none)]:opacity-100`}
          >
            <AddReactionGlyph />
          </button>
        </Tooltip>
      ) : null}
      {offering ? (
        <div
          role="group"
          aria-label="Reactions"
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            event.stopPropagation();
            setOffering(false);
          }}
          className="flex basis-full flex-wrap items-center gap-1"
        >
          {QUICK_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              aria-label={`React with ${emoji}`}
              aria-pressed={mine.has(emoji)}
              onClick={() => take(emoji)}
              className={`${CHIP} ${PRESSABLE} ${mine.has(emoji) ? CHIP_MINE : CHIP_OTHER}`}
            >
              <span aria-hidden>{emoji}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => setMore(true)}
            className={`${CHIP} ${PRESSABLE} ${CHIP_OTHER}`}
          >
            More emoji
          </button>
        </div>
      ) : null}
      {more ? <OfficeEmojiDialog onPick={take} onClose={() => setMore(false)} /> : null}
    </div>
  );
}
