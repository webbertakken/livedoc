# Link cards

A **link tool**: a rectangular bookmark element that turns a URL into a rich
preview card — favicon, page title, site name, and (when available) the page's
OG image. The URL is edited the same way every other element's link is.

## The element

`LinkCardElement` (`type: 'link-card'`, `@livedoc/document`, declared in
`src/element-types.ts`) is a
boxed element added through the standard new-type surface (the `annotation`
precedent): `isBoxed`, `createLinkCard` (280×120 default), the `colors.ts`
defaults + `supportsColours`, `element-variant.ts` (a bordered, rounded card:
`fillColor` background + `strokeColor` border), `search.ts`, `svg-render.ts`
(exports as a rounded rect). It is **resizable** like a shape (not a fixed
marker) and recolour / move / lock / layer / delete like any element.

- **URL source = `element.link` (`{ kind: 'url' }`)** — no new field. Editing
  reuses the existing `LinkPickerDialog` + `applyElementLink`; the empty card
  prompts "Double-click to add a link", and double-clicking opens that picker
  (`onEditLink` → `setLinkPickerOpenForId`). The card also gets the normal
  link badge, so clicking it follows the URL.
- **`meta` is the cached preview** (`LinkCardMeta`: `url` + optional `title` /
  `siteName` / `image` / `favicon` / `description`). It rides the normal tab
  sync, so peers + reloads get the preview without re-fetching. `LinkCardView`
  only trusts `meta` whose `url` matches the current link (stale guard), and
  falls back to the bare URL + host while there's no meta.
- `THEME_COLOUR_FIELDS` gives link cards an **empty** list — a bookmark card
  keeps its neutral look across themes (like sticky / image); the user can
  still recolour per-card.

## Fetching the preview — `GET /api/unfurl`

The static client can't read cross-origin page HTML, so a Worker route
(`apps/api/src/routes/unfurl.ts`) does it. When `applyElementLink` sets a URL
on a link card, the editor that set it calls `apiUnfurl(url)` **once** and
commits the result into `meta`; peers receive it via the tab op. It fails
soft (null → the card shows the bare URL).

The endpoint is **SSRF-safe** (public, self-hostable repo):

- Accepts only `http:` / `https:`; rejects everything else.
- Blocks non-public hosts before fetching: `localhost` / `*.local`, loopback,
  private ranges (10/8, 172.16/12, 192.168/16, 127/8, CGNAT 100.64/10), and
  link-local / cloud-metadata (`169.254.0.0/16`, incl. `169.254.169.254`), multicast
  and reserved IPv4, plus IPv6 ULA / link-local / multicast / NAT64. An IPv6 range is matched
  on an IPv6 address only: a domain that starts with the same letters (`fdic.gov`,
  `fcbarcelona.com`) is public and gets its card. Re-validates the **final** post-redirect URL.
- 8s `AbortController` timeout, ~512 KB read cap, HTML-only `Accept`, a
  descriptive `User-Agent`. Parses with **`HTMLRewriter`** (streaming — there's
  no DOMParser in Workers): `<title>`, `og:title|image|site_name|description`,
  `name="description"`, and the favicon `<link rel="…icon…">` (relative URLs
  resolved against the final URL, `/favicon.ico` fallback).
- Per-IP `UNFURL_RATE_LIMITER` (60/60s; absent binding → allowed, for
  self-host). Always returns 200 with at least the resolved `url`.

The pure helpers (`isBlockedHost`, `parsePublicHttpUrl`, `buildUnfurlResult`)
are unit-tested. `UnfurlResult` is a shared `@livedoc/api-schema` DTO.

## Images

The OG image and favicon are **referenced by URL** (`<img src=…>`,
`referrerPolicy="no-referrer"`) — like a normal web embed, no bytes stored in
R2. Broken images fall back gracefully (the image hides, the favicon shows a
neutral chip).

## Telemetry

`track('Element', 'Added', 'LinkCard')` on create; `track('Element',
'Changed', 'LinkUnfurled')` on a successful fetch (reuses existing actions).

## Out of scope

A Worker **image proxy / cache** (so viewers don't hit the third-party image
host directly, and dead links keep their thumbnail) — noted follow-up.
oEmbed players (the separate embed-element idea), manual metadata editing, and
scheduled re-unfurling.

## Defaults

Each default below was applied where this spec is silent or qualitative, and holds until a human confirms it.
The code cites each by its id.

- **D50** Which URL the cached meta is keyed to: The requested URL on the element, not the post-redirect URL (default).
- **D51** Field precedence: Title `og:title ?? <title>`; description `og:description ?? description`; first tag wins;
  `og:image:url` accepted (default).
- **D52** Which `<link>` is the favicon: First `rel` containing `icon`; else `/favicon.ico` on the final origin
  (default).
- **D53** Non-HTML page / network failure: Non-HTML: `url` + favicon; network error or timeout: `{ url }` only
  (default).
- **D54** Card with no OG image / broken favicon: Neutral globe banner; kind glyph instead of the favicon (default).
- **D55** Which part of the card follows the link: Only the bottom info row ("Open link" button); the rest drags
  (default).
- **D56** Export look: Generic rect, `rx` 6, fill and stroke, no text (default).
- **D57** History for the arriving preview: The meta write is its own `commit` (undo step) (default).
- **D58** Hosts blocked beyond the spec's list: `0/8`, `0.0.0.0`, `*.localhost`, `::`, IPv4-mapped IPv6 (default).
