// Find across a PDF (docs/specs/035-pdf-documents/reading-surface.md "Find"): the bookmarks' titles where asked, then
// each page's text and, where asked, the words of the marks the file holds, page by page as each is read, told as it
// goes. A result keeps what drawing and listing it need (its quads, its line of text); the page's boxes are let go.
import {
  PDF_FIND_CONTEXT_CHARS,
  PDF_FIND_MAX_RESULTS,
  TextFind,
  TextRange,
  type LinkTarget,
  type PdfEngine,
  type Quad,
  type TextFindOptions,
  type TextSpan,
} from '@livedoc/pdf-documents';

export type PdfFindOptions = TextFindOptions & {
  /** Include comments and marks' text: the words of the marks the file holds. */
  readonly marks: boolean;
  /** Include bookmarks: the outline's titles. */
  readonly bookmarks: boolean;
};

/** A match in its line of text, for the results list. */
export type PdfFindSnippet = {
  readonly before: string;
  readonly match: string;
  readonly after: string;
};

export type PdfFindResult =
  | {
      readonly kind: 'text';
      readonly page: number;
      readonly span: TextSpan;
      readonly quads: readonly Quad[];
      readonly snippet: PdfFindSnippet;
    }
  | {
      readonly kind: 'mark';
      readonly page: number;
      readonly mark: string;
      readonly quads: readonly Quad[];
      readonly snippet: PdfFindSnippet;
    }
  | {
      readonly kind: 'bookmark';
      /** Its place in the outline's list. */
      readonly item: number;
      readonly target: LinkTarget | null;
      readonly snippet: PdfFindSnippet;
    };

export type PdfFindProgress = {
  /** The results so far, at most the most listed. */
  readonly results: readonly PdfFindResult[];
  /** Every result so far, listed or not. */
  readonly total: number;
  /** The pages searched so far. */
  readonly searched: number;
};

export type PdfFindSource = Pick<PdfEngine, 'pageText' | 'fileMarks' | 'outline'> & {
  readonly pages: number;
};

const plain = (text: string): string => text.replaceAll('\u0002', '').replace(/\s+/gu, ' ');

/** The match at `span` of `text`, with up to `context` characters of its line either side. */
export function snippetOf(
  text: string,
  [start, end]: TextSpan,
  context = PDF_FIND_CONTEXT_CHARS,
): PdfFindSnippet {
  const pageText = { text } as Parameters<typeof TextRange.line>[0];
  const [lineStart] = TextRange.line(pageText, start);
  const [, lineEnd] = TextRange.line(pageText, Math.max(start, end - 1));
  return {
    before: plain(text.slice(Math.max(lineStart, start - context), start)),
    match: plain(text.slice(start, end)),
    after: plain(text.slice(end, Math.min(lineEnd, end + context))),
  };
}

const rectQuad = ([left, bottom, right, top]: readonly number[]): Quad => [
  left!,
  top!,
  right!,
  top!,
  left!,
  bottom!,
  right!,
  bottom!,
];

/**
 * Searches the PDF for `query`, telling `onProgress` once the bookmarks are searched and after every page; stops
 * before the next page once `stopped` says a newer search began.
 */
export async function searchPdf(
  source: PdfFindSource,
  query: string,
  options: PdfFindOptions,
  {
    onProgress,
    stopped,
    most = PDF_FIND_MAX_RESULTS,
  }: { onProgress: (now: PdfFindProgress) => void; stopped: () => boolean; most?: number },
): Promise<void> {
  const results: PdfFindResult[] = [];
  let total = 0;
  const add = (result: PdfFindResult) => {
    total += 1;
    if (results.length < most) results.push(result);
  };
  const tell = (searched: number) => onProgress({ results: [...results], total, searched });
  if (query.trim().length === 0) return tell(source.pages);
  const spansIn = (text: string) => TextFind.spans(text, query, options);

  if (options.bookmarks) {
    const outline = await source.outline();
    outline.items.forEach((item, at) => {
      for (const span of spansIn(item.title))
        add({
          kind: 'bookmark',
          item: at,
          target: item.target,
          snippet: snippetOf(item.title, span),
        });
    });
  }
  for (let page = 0; page < source.pages; page += 1) {
    if (stopped()) return;
    const text = await source.pageText(page);
    for (const span of text ? spansIn(text.text) : [])
      add({
        kind: 'text',
        page,
        span,
        quads: TextRange.quads(text!, [span]),
        snippet: snippetOf(text!.text, span),
      });
    if (options.marks)
      for (const mark of await source.fileMarks(page))
        for (const span of spansIn(mark.words))
          add({
            kind: 'mark',
            page,
            mark: mark.id,
            quads: [rectQuad(mark.rect)],
            snippet: snippetOf(mark.words, span),
          });
    if (stopped()) return;
    tell(page + 1);
  }
}
