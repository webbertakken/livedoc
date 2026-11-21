// IMPORTFEED's reading of a feed (docs/specs/029-sheets/imports.md "The functions"): RSS 2.0, RSS 1.0 (RDF) and Atom
// read into the feed's own fields and its items', each item's summary without its markup.
import {
  attrOf,
  elementsOf,
  parseMarkup,
  shownText,
  shownTextOf,
  textOf,
  type MarkupElement,
} from './markup';
import { FEED_FIELDS, FEED_ITEM_FIELDS } from './import-request';

type FeedItem = Record<(typeof FEED_ITEM_FIELDS)[number], string>;
type FeedInfo = Record<(typeof FEED_FIELDS)[number], string>;
export type Feed = { info: FeedInfo; items: FeedItem[] };

// The column titles Google's items table and feed row carry (default, D62).
const TITLES: Record<string, string> = {
  title: 'Title',
  author: 'Author',
  url: 'URL',
  created: 'Date Created',
  summary: 'Summary',
  description: 'Description',
};

function child(el: MarkupElement, ...names: string[]): MarkupElement | undefined {
  for (const name of names) {
    const found = el.children.find(
      (c): c is MarkupElement => c.kind === 'element' && c.name === name,
    );
    if (found) return found;
  }
  return undefined;
}

function localName(name: string): string {
  return name.slice(name.indexOf(':') + 1);
}

function text(el: MarkupElement | undefined): string {
  return el ? shownTextOf(el) : '';
}

// A summary is markup written as text (RSS) or as elements (Atom): its words, without links and pictures.
function plain(el: MarkupElement | undefined): string {
  if (!el) return '';
  const inner = textOf(el);
  return /<[a-zA-Z/!]/.test(inner) ? shownTextOf(parseMarkup(inner, 'html')) : shownText(inner);
}

function atomLink(el: MarkupElement): string {
  const links = el.children.filter(
    (c): c is MarkupElement => c.kind === 'element' && localName(c.name) === 'link',
  );
  const link = links.find((l) => (attrOf(l, 'rel') ?? 'alternate') === 'alternate') ?? links[0];
  return link ? (attrOf(link, 'href') ?? '') : '';
}

function atomAuthor(el: MarkupElement): string {
  const author = child(el, 'author');
  return author ? text(child(author, 'name')) || text(author) : '';
}

function rssItem(item: MarkupElement): FeedItem {
  return {
    title: text(child(item, 'title')),
    author: text(child(item, 'author', 'dc:creator')),
    url: text(child(item, 'link')) || text(child(item, 'guid')),
    created: text(child(item, 'pubDate', 'dc:date')),
    summary: plain(child(item, 'description', 'content:encoded')),
  };
}

function atomItem(entry: MarkupElement): FeedItem {
  return {
    title: text(child(entry, 'title')),
    author: atomAuthor(entry),
    url: atomLink(entry),
    created: text(child(entry, 'published', 'updated')),
    summary: plain(child(entry, 'summary', 'content')),
  };
}

/** A feed's fields and items, or null when the page is no RSS or Atom feed. */
export function readFeed(src: string): Feed | null {
  const root = parseMarkup(src, 'xml');
  const top = root.children.find((c): c is MarkupElement => c.kind === 'element');
  if (!top) return null;
  const kind = localName(top.name);
  if (kind === 'feed') {
    return {
      info: {
        title: text(child(top, 'title')),
        description: text(child(top, 'subtitle')),
        author: atomAuthor(top),
        url: atomLink(top),
      },
      items: top.children
        .filter((c): c is MarkupElement => c.kind === 'element' && localName(c.name) === 'entry')
        .map(atomItem),
    };
  }
  if (kind !== 'rss' && kind !== 'RDF') return null;
  const channel = child(top, 'channel');
  if (!channel) return null;
  // RSS 2.0 keeps its items in the channel; RSS 1.0 beside it.
  const items = elementsOf(kind === 'rss' ? channel : top).filter(
    (e) => localName(e.name) === 'item',
  );
  return {
    info: {
      title: text(child(channel, 'title')),
      description: text(child(channel, 'description')),
      author: text(child(channel, 'managingEditor', 'dc:creator')),
      url: text(child(channel, 'link')),
    },
    items: items.map(rssItem),
  };
}

/** The rows IMPORTFEED answers for a query (`items`, `items <type>`, `feed`, `feed <type>`). */
export function feedRows(
  feed: Feed,
  query: string,
  headers: boolean,
  count: number | null,
): string[][] {
  const [what, type] = query.split(' ');
  if (what === 'feed') {
    const fields = type ? [type as keyof FeedInfo] : (['title', 'description', 'url'] as const);
    const row = fields.map((f) => feed.info[f]);
    return headers ? [fields.map((f) => TITLES[f]!), row] : [row];
  }
  const fields = type ? [type as keyof FeedItem] : FEED_ITEM_FIELDS;
  const items = count === null ? feed.items : feed.items.slice(0, count);
  const rows = items.map((it) => fields.map((f) => it[f]));
  return headers ? [fields.map((f) => TITLES[f]!), ...rows] : rows;
}
