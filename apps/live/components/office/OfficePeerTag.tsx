'use client';

// A collaborator's name tag over what they hold (a Sheet's selection, a PDF's held mark): shown when it moves, hidden
// once it has been still for `freshMs`, shown again while the pointer is over it. With no time it stays.
import { useEffect, useState } from 'react';
import { IDENTITY_FILL, identityVars } from '@livedoc/ui';

export function OfficePeerTag({
  text,
  color,
  freshMs,
  at,
  hover,
}: {
  text: string;
  color: string;
  freshMs: number;
  // When what they hold last moved (Date.now()); none keeps the tag showing.
  at?: number;
  hover?: boolean;
}) {
  const [quiet, setQuiet] = useState<number | null>(null);
  useEffect(() => {
    if (at === undefined) return;
    const left = at + freshMs - Date.now();
    const t = setTimeout(() => setQuiet(at), Math.max(0, left));
    return () => clearTimeout(t);
  }, [at, freshMs]);
  if (at !== undefined && quiet === at && !hover) return null;
  return (
    <span
      className={`absolute -top-4 right-0 whitespace-nowrap rounded-sm px-1 text-[10px] font-medium leading-4 text-white ${IDENTITY_FILL}`}
      style={identityVars(color)}
    >
      {text}
    </span>
  );
}
