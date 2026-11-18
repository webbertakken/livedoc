# Comparison and recommendations

One recommendation per decision of plan 0019's research phase, drawn from the files beside this one. A decision that
is Webber's (taste, preference, business) is a fork and is asked; the rest are engineering decisions, recorded here and
carried into the specs. Researched November 2026.

| Decision               | Designs weighed                                       | Recommendation                                                                                     | Evidence                              |
| ---------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------- |
| The standard (fork C1) | ODF 1.4 text; OOXML WordprocessingML                  | ODF 1.4 native, flat `.fodt` for repositories; DOCX in and out (C1's default stands)               | [Standard](standard.md)               |
| The live model         | Sequence CRDT; block ops; server-ordered steps        | ProseMirror over **Yjs**, the room holding the CRDT and writing it in chunks                       | [Live model](live-model.md)           |
| The layout engine      | Measured DOM; own canvas engine; CSS paged media      | **Measured DOM**, incremental, with a page model that print and PDF reuse                          | [Layout engine](layout-engine.md)     |
| Adopt or build         | Whole suites; frameworks; building blocks             | Adopt ProseMirror, `prosemirror-tables`, Yjs, one XML parser, DOMPurify, pdf-lib; build the rest   | [Adopt or build](adopt-or-build.md)   |
| File formats           | Libraries per format; own mapping on shared layers    | Own readers and writers on a shared zip and XML layer that runs in browsers and Workers            | [File formats](file-libraries.md)     |
| Fonts                  | Google's stylesheet; served by the app; both          | A core set served by the app, metric-compatible stand-ins, Google Fonts optional for the long tail | [Fonts](fonts.md)                     |
| Spelling and grammar   | The browser's; Hunspell in the page; a grammar server | The browser's underlines, a Hunspell card with permissive dictionaries, grammar optional           | [Spelling](spelling.md)               |
| Import security        | One guard per abuse case                              | Every case a named rejection or a reported drop, tested in Phase 5                                 | [Import security](import-security.md) |

## Rulings since

Webber ruled forks C1 to C3 on 2026-11-18, after this research:

- **C1**: ODF 1.4 and OOXML are **both native**, and a file keeps the format it arrived in until a person converts it.
  The ODF-native recommendation above is superseded: one model maps onto both, each format's kept content is written
  back in that format, and every written file validates against its own schema. Which format a document made in
  LiveDoc is born in is fork C5 (default ODF 1.4).
- **C2**: all of Pages mode is removed, not only articles; the other page kinds' stored pages are fork D8.
- **C3**: core only. Scripting, add-ons, any assistant, smart chips and Google's own services are left out.

## Engineering decisions carried into the specs

- **What the standard lacks is kept beside it, not lost.** Comment replies and resolved state, reactions, assignments,
  chips, pageless mode and document tabs have no ODF 1.4 element (verified: [standard](standard.md)). They are written
  as LibreOffice's own extensions where LibreOffice has one (`loext:parent-name`, `loext:resolved` on comments, so
  LibreOffice shows threads) and in a `livedoc:` extension namespace otherwise, which ODF's extended conformance allows
  readers to ignore; every such construct also writes a plain fallback (a chip's text, a tab's heading).
- **Validation in CI** runs the strict 1.4 schema over LiveDoc's own output with Jing (BSD, Java), after removing the
  documented extension namespaces, as the ODF Toolkit's validator does for extended documents.
- **The package layer is DOM-free** so the api, the MCP server and the CLI read and write the same files.
- **One package layer holds both containers**, the ODF package and the OOXML container (C1).
- **The zip reader and writer move to a shared package**, with their byte budget, from `apps/live/lib`.

## New forks for Webber

Added to the plan's "Forks and rulings" table, asked with D1, D3 and D4 in Phase 3.

- **D5 Grammar on docs.nu.** Spelling needs no server; grammar does (LanguageTool, LGPL, a Java server). Options:
  docs.nu runs one (hosting cost), hosts configure their own (docs.nu has none), or grammar is left out.
- **D6 Fonts from Google.** The core set ships with LiveDoc; Google Docs' "More fonts" offers the whole Google Fonts
  catalogue. Options: load the long tail from Google Fonts (a request to Google per new face, as today's canvas fonts
  do), serve a larger curated set from LiveDoc only, or both with a setting.
