'use client';

// A page read from the file's tags (docs/specs/035-pdf-documents/accessibility.md "The accessible tree"): headings at
// their level, lists, tables with their header cells, figures with their alternative text. Every element is a `div` or
// a `span` with its role, so a file's malformed tree (a row outside a table) never breaks the page's own markup.
import { Fragment, type ReactNode } from 'react';
import type { TagNode } from '@livedoc/pdf-documents';

type Role = { role?: string; level?: number; inline?: boolean };

const HEADING = /^H([1-6])$/;

const ROLES: Readonly<Record<string, Role>> = {
  // A heading with no level reads at level 2 (default).
  H: { role: 'heading', level: 2 },
  P: { role: 'paragraph' },
  L: { role: 'list' },
  LI: { role: 'listitem' },
  TOC: { role: 'list' },
  TOCI: { role: 'listitem' },
  Table: { role: 'table' },
  THead: { role: 'rowgroup' },
  TBody: { role: 'rowgroup' },
  TFoot: { role: 'rowgroup' },
  TR: { role: 'row' },
  TD: { role: 'cell' },
  BlockQuote: { role: 'blockquote' },
  Note: { role: 'note' },
  Code: { role: 'code', inline: true },
  Span: { inline: true },
  Quote: { inline: true },
  Link: { inline: true },
  Reference: { inline: true },
  BibEntry: { inline: true },
  Lbl: { inline: true },
  Annot: { inline: true },
  Em: { inline: true },
  Strong: { inline: true },
  Sub: { inline: true },
};

// What a figure or a formula without alternative text is announced as: its kind, never a guess.
const PICTURES: Readonly<Record<string, string>> = { Figure: 'Figure', Formula: 'Formula' };

function roleOf(type: string, inHeaderRow: boolean): Role {
  const heading = HEADING.exec(type);
  if (heading) return { role: 'heading', level: Number(heading[1]) };
  // A header cell heads its column where its row holds only header cells, else its row (default).
  if (type === 'TH') return { role: inHeaderRow ? 'columnheader' : 'rowheader' };
  return ROLES[type] ?? {};
}

const isHeaderRow = (node: TagNode): boolean =>
  node.type === 'TR' &&
  node.kids.length > 0 &&
  node.kids.every((kid) => typeof kid !== 'string' && kid.type === 'TH');

function TagElement({ node, inHeaderRow }: { node: TagNode; inHeaderRow: boolean }) {
  const lang = node.lang || undefined;
  const picture = PICTURES[node.type];
  if (picture) return <span role="img" aria-label={node.alt || picture} lang={lang} />;
  const { role, level, inline } = roleOf(node.type, inHeaderRow);
  const Element = inline ? 'span' : 'div';
  return (
    <Element role={role} aria-level={level} lang={lang}>
      <TagKids kids={node.kids} inHeaderRow={isHeaderRow(node)} />
    </Element>
  );
}

function TagKids({
  kids,
  inHeaderRow,
}: {
  kids: TagNode['kids'];
  inHeaderRow: boolean;
}): ReactNode {
  return kids.map((kid, at) => (
    <Fragment key={at}>
      {at > 0 && ' '}
      {typeof kid === 'string' ? kid : <TagElement node={kid} inHeaderRow={inHeaderRow} />}
    </Fragment>
  ));
}

export function PdfPageTags({ nodes }: { nodes: readonly TagNode[] }) {
  return <TagKids kids={nodes} inHeaderRow={false} />;
}
