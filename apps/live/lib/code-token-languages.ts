// The tokenizer's languages beyond the canvas code block's (docs/specs/034-text-documents/objects.md "Code blocks"):
// those of Google Docs' code blocks, each a comment, string and keyword setup for the one scanner in code-tokens.ts.
import type { LanguageConfig } from './code-tokens';

const words = (list: string) => new Set(list.split(/\s+/).filter(Boolean));

const C_KEYWORDS = words(`
  auto bool break case catch char class const constexpr continue default delete do double else enum explicit extern
  false float for friend goto if inline int long namespace new noexcept nullptr operator private protected public
  register return short signed sizeof static struct switch template this throw true try typedef typename union
  unsigned using virtual void volatile while include define ifdef ifndef endif pragma
`);

const C_STYLE = { lineComment: '//', blockComment: ['/*', '*/'] as [string, string] };

export const MORE_TOKEN_LANGUAGES = [
  'c',
  'csharp',
  'go',
  'java',
  'kotlin',
  'php',
  'rust',
  'protobuf',
  'textproto',
  'xml',
] as const;
export type MoreTokenLanguage = (typeof MORE_TOKEN_LANGUAGES)[number];

export const MORE_TOKEN_CONFIGS: Record<MoreTokenLanguage, LanguageConfig> = {
  c: { ...C_STYLE, stringQuotes: ['"', "'"], keywords: C_KEYWORDS },
  csharp: {
    ...C_STYLE,
    stringQuotes: ['"', "'"],
    keywords: words(`
      abstract as async await base bool break byte case catch char class const continue decimal default delegate do
      double else enum event false finally float for foreach get if in int interface internal is lock long namespace
      new null object out override params private protected public readonly record ref return sealed set short static
      string struct switch this throw true try typeof uint ulong using var virtual void while yield
    `),
  },
  go: {
    ...C_STYLE,
    stringQuotes: ['"', "'", '`'],
    keywords: words(`
      break case chan const continue default defer else fallthrough false for func go goto if import interface iota map
      nil package range return select struct switch true type var
    `),
  },
  java: {
    ...C_STYLE,
    stringQuotes: ['"', "'"],
    keywords: words(`
      abstract assert boolean break byte case catch char class const continue default do double else enum extends false
      final finally float for if implements import instanceof int interface long native new null package private
      protected public record return short static super switch synchronized this throw throws true try var void
      volatile while
    `),
  },
  kotlin: {
    ...C_STYLE,
    stringQuotes: ['"', "'"],
    keywords: words(`
      as break class companion continue data do else enum false for fun if import in interface is null object override
      package private protected public return sealed super this throw true try typealias val var when while
    `),
  },
  php: {
    ...C_STYLE,
    stringQuotes: ['"', "'"],
    keywords: words(`
      abstract and array as break case catch class clone const continue declare default do echo else elseif empty
      extends false final finally fn for foreach function global if implements include interface isset list match
      namespace new null or print private protected public require return static switch throw trait true try use var
      while yield php
    `),
  },
  rust: {
    ...C_STYLE,
    stringQuotes: ['"'],
    keywords: words(`
      as async await break const continue crate dyn else enum extern false fn for if impl in let loop match mod move mut
      pub ref return self Self static struct super trait true type unsafe use where while
    `),
  },
  protobuf: {
    ...C_STYLE,
    stringQuotes: ['"', "'"],
    keywords: words(`
      syntax package import option message enum service rpc returns repeated optional required map oneof reserved
      extend stream true false double float int32 int64 uint32 uint64 sint32 sint64 fixed32 fixed64 sfixed32 sfixed64
      bool string bytes
    `),
  },
  textproto: { lineComment: '#', stringQuotes: ['"', "'"], keywords: words('true false') },
  xml: {
    blockComment: ['<!--', '-->'],
    stringQuotes: ['"', "'"],
    keywords: words('xml DOCTYPE CDATA'),
    tagNames: true,
  },
};
