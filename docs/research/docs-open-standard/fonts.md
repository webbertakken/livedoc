# Document fonts

Which families a text document offers, how they load with no required outside service, how a file carries them, and
what stands in when one is missing. Researched November 2026.

## What exists

- Eleven Google Fonts, loaded from Google's stylesheet with `display=swap`; a blocked or absent Google falls back to the
  system face and the editor never depends on the fonts loading (verified: [Fonts](../../specs/004-interface-design/fonts.md)).
- Exports embed the Latin subsets of used faces as base64 (verified: same spec, "Exports carry the face").

## What a word processor needs

- Google Docs' default is Arial 11 pt, with a font menu of about 30 families and "More fonts" from Google Fonts
  (assumed: the product as known).
- Files from Word and LibreOffice name Calibri, Cambria, Arial, Times New Roman, Courier New, Liberation and DejaVu
  families. These are proprietary or system fonts that cannot ship with LiveDoc (assumed: Microsoft's licences).
- **Metric-compatible open families** keep a document's line breaks and page count when its named font is missing:
  Liberation Sans, Serif, Mono (Arial, Times New Roman, Courier New); Carlito (Calibri); Caladea (Cambria); Arimo,
  Tinos, Cousine (the same three as Liberation) (assumed: their projects' stated aims; licences OFL-1.1 or Apache-2.0,
  to verify per family before shipping).

## Designs for loading

| Design                                           | Outside service              | Self-host           | Fidelity               |
| ------------------------------------------------ | ---------------------------- | ------------------- | ---------------------- |
| Google's stylesheet (today)                      | Google Fonts                 | Falls back silently | Exact when loaded      |
| Font files served from the app                   | None                         | Same files          | Exact, offline too     |
| Google for the long tail, local for the core set | Google for "More fonts" only | Core set always     | Exact for the core set |

**Finding** (inferred): the core set (Google Docs' default menu where the faces are open, plus the metric-compatible
families) is served from LiveDoc's own static assets, so a document lays out the same offline and self-hosted; the
long tail may load from Google Fonts where allowed, never required.

## Embedding in the file

- ODF holds font declarations in `office:font-face-decls` (`style:font-face`), and may point a face at an embedded
  file with `svg:font-face-uri` inside the package (verified: both names in the 1.4 schema).
- LibreOffice embeds fonts when "Embed fonts in document" is on (assumed: its document properties).
- **Finding**: a downloaded file declares every face it uses with its generic family and pitch, so any reader picks a
  close fallback; embedding is offered, off by default, as LibreOffice does (inferred).

## Fallbacks

A substitution table maps a named face to its metric-compatible stand-in, then to a generic family. The table is data,
one row per face, used by import, layout and export alike, and listed in the spec so a person can see why a document
looks as it does.
