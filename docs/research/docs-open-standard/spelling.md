# Spelling and grammar

Spelling and grammar checks with no required outside service. Researched November 2026; versions and licences from
`npm view` on 2026-11-18 (verified).

## Designs

| Design                                                                                    | Licence                                                                                                                                 | Offline | Grammar                              | Cost                                                                                           |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------ | ---------------------------------------------------------------------------------------------- |
| The browser's own (`spellcheck` on the text)                                              | n/a                                                                                                                                     | Yes     | Some (Chrome, Edge, Safari; assumed) | None; works in contenteditable today (verified: articles use it, `article-pages.md` "Writing") |
| Hunspell dictionaries in JavaScript or WebAssembly (`nspell` 2.1.5, `hunspell-asm` 4.0.2) | MIT code; dictionaries vary: `dictionary-en` 4.0 is MIT and BSD, others GPL, LGPL or MPL (verified for `dictionary-en`; others assumed) | Yes     | No                                   | A dictionary is 0.5 to 2 MB per language (assumed)                                             |
| LanguageTool                                                                              | LGPL-2.1 server (assumed)                                                                                                               | No      | Yes                                  | A server, optional for self-hosters                                                            |

## What Google offers that the browser does not

A spelling and grammar pass with a side card (accept, ignore, add to dictionary), a personal dictionary that follows
the account, next and previous misspelling (⌘' and ⌘;), and grammar suggestions
([shortcuts](google-docs-inventory.md#shortcuts)).

## Finding

The browser's own check covers underlines and suggestions on right-click at no cost, offline and self-hosted. A
Spelling and grammar card (Google's surface) needs words and suggestions LiveDoc can read, which the browser does not
expose to pages (inferred: no web API returns spell-check results). So the card runs on Hunspell dictionaries with
permissive licences, loaded on demand per language, and the personal dictionary is stored with the account. Grammar
needs a server; it is optional, off unless a host configures one, and the matrix says so. Whether docs.nu runs one is fork **D5**.
