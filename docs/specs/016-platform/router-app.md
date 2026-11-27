# Router app

A small Cloudflare Worker that fronts the apex domain (`docs.nu`) and routes URL paths to the right underlying app.

- **Workspace:** `apps/router` (`@livedoc/router`).
- **Runtime:** Cloudflare Workers.
- **Production hostname:** `docs.nu` (custom domain configured in the Cloudflare dashboard). Default Workers URL also remains reachable.

## Routing table

| Path                                                                                                                                                                                   | Forwards to                      |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| `/api`, `/api/*`                                                                                                                                                                       | api worker (`apps/api`)          |
| `/telemetry`, `/telemetry/*`                                                                                                                                                           | telemetry app (`apps/telemetry`) |
| `/help`, `/help/*`                                                                                                                                                                     | help app (`apps/help`), stripped |
| `/live/*` (the live app's `_next` assets only)                                                                                                                                         | live app (`apps/live`), stripped |
| `/` (the front door: the live worker sends it on to Home, [Explorer Home](../013-workspace/explorer-home.md#route))                                                                    | live app (`apps/live`), as-is    |
| live page routes: `/document/*`, `/explorer/*`, `/form/*`, `/new`, `/join`, `/sign-in`, `/get-started`, `/embed`, `/oauth/*`, `/report-a-bug/*`, `/notification-settings`, `/icon.svg` | live app (`apps/live`), as-is    |
| a marketing page's address from before `/about` (`/faq`, `/ai`, `/features/*`, `/alternatives/*`, `/security`, `/status`, `/licences`, `/privacy`, `/terms`)                           | 308 redirect to `/about/<path>`  |
| a help category segment with no `/help` prefix (`/canvas/*`, `/policies/*`, ...)                                                                                                       | 308 redirect to `/help/<path>`   |
| `/about`, `/about/*`, and everything else                                                                                                                                              | marketing app (`apps/marketing`) |

The live app serves at **clean URLs** — there's no `/live` prefix in the address bar. The product is the front door ([Purpose](../001-project-vision/purpose.md#the-product-comes-first)): `/` belongs to the live app. Marketing's pages all live under `/about` (`/about`, `/about/faq`, `/about/features/<slug>`, ...), and marketing owns every other first segment too (its `/_next` assets, `/robots.txt`, `/sitemap.xml`, its not-found page). The live app's route segments don't overlap any of them, so the router selects the live app by matching its known first segments (`LIVE_ROUTE_SEGMENTS`, exported from `@livedoc/api-schema` so the telemetry dashboard's per-app page-view split, [Page view telemetry](../017-telemetry/page-view-telemetry.md), reads the same list) and forwards those **as-is** (no strip — the live worker's `out/` files are already prefix-free).

The one thing that keeps a `/live` prefix is the live app's bundled **`_next` assets** (its prod `assetPrefix: '/live'`). Both Next static exports want `/_next`, so the live app's assets ride `/live/_next/*` to avoid colliding with marketing's `/_next`. The router **strips** `/live` from those before forwarding (the shared `forward()` helper with `stripPrefix`, same as `/telemetry/*`) so the worker serves them from `out/_next`. (Next's `basePath` used to add the prefix to pages too; that's gone — only `assetPrefix` remains, on assets only.)

`/api/*` is forwarded **as-is** — no prefix stripping. The api worker expects the full `/api/...` path. Marketing sees `/about`, `/about/faq`, etc. as-is: its pages sit in `app/about/` (no `basePath`), so its `/_next` assets and root files keep their addresses.

**Marketing's old addresses redirect.** Before the Explorer took `/`, marketing's pages sat at the root. Their first segments (`MARKETING_MOVED_SEGMENTS`: `ai`, `alternatives`, `faq`, `features`, `licences`, `privacy`, `security`, `status`, `terms`) answer a permanent **308** to the same path under `/about`, query string included, so every shared link and search result still lands. A table of segments and a destination: routing, not logic.

**Bare help-article paths redirect rather than 404.** A help URL that has lost its `/help` prefix (`/privacy-and-security/data-privacy/`) used to fall through to marketing and 404, which is the wrong answer to an unambiguous address: every help article lives under one of the registry's category slugs, and none of those segments belongs to marketing. So the router matches the first segment against `HELP_CATEGORY_SEGMENTS` and answers **308** to `/help/<path>`. Still routing, not logic: a table of segments and a destination.

**Not found.** An address no site has a page for gets that site's own not-found page, never the framework's bare
"404 | This page could not be found.": the site's header and footer around one card (`PageNotFound` in
`@livedoc/ui`) titled **Page not found**, "There is no page at this address. It may have moved, or the link may
have a typo.", with a way back to the site's home (marketing: **Go to the Home Page**; the help centre: **Browse Help
Centre** and **Troubleshooting**), then **Help Centre**. It is still a 404, so search
engines drop it. The editor answers an unknown address with its own card instead
([New document route](../007-editor/new-document-route.md) "Unknown addresses").

**Retired paths 404; nothing redirects.** `/community` and everything under it belonged to the Community gallery,
which LiveDoc does not have ([Purpose](../001-project-vision/purpose.md#boundaries-that-have-moved)). The router has
no rule for it, so it reaches the marketing site as-is, like any unknown address, and answers its **Page not found**.
There is no successor page to send anyone to. The same goes for `/api/community/*`: the api has no `community`
segment, so it answers the api's own 404.

Two properties keep it safe. It sits **after** the live-route check, so `/explorer/*` (a segment the help centre and the live app both use) still reaches the editor — which is why `explorer` is absent from the set. And `index.test.ts` walks the registry's own categories and asserts each one redirects, so a new help category cannot silently stop working. The help centre's **About** category (`about`) is the one other exception: `/about` is marketing's, so a bare `/about/...` reaches marketing, and the help articles of that category are reached only under `/help/about/...`.

## Implementation

In production the Worker has five **service bindings**, one to each downstream app (MARKETING / LIVE / API / TELEMETRY / HELP). A shared `forward()` helper resolves each target as _binding if present, else local-dev origin_ (see Local development below) and strips the prefix for the basePath/assetPrefix paths (live assets + telemetry + help) when forwarding to a binding. It forwards the visitor's request with its headers, `CF-Connecting-IP` among them, so the api's per-IP limits key on the visitor and never on the router ([Rate limiting](../015-api/api.md#rate-limiting)):

```ts
// sketch, real source: apps/router/src/index.ts
const LIVE_ROUTE_SEGMENTS = new Set([
  'document',
  'embed',
  'explorer',
  'get-started',
  'join',
  'new',
  'oauth',
  'sign-in',
]);
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      return forward(request, url, env.API, env.API_ORIGIN); // /api/* as-is; api worker wants the full path
    }
    // /live/* is now ONLY the live app's _next assets — strip and forward.
    if (url.pathname === '/live' || url.pathname.startsWith('/live/')) {
      return forward(request, url, env.LIVE, env.LIVE_ORIGIN, '/live');
    }
    if (url.pathname === '/telemetry' || url.pathname.startsWith('/telemetry/')) {
      return forward(request, url, env.TELEMETRY, env.TELEMETRY_ORIGIN, '/telemetry');
    }
    // The front door, clean live-app page routes + its root icon: forward as-is (no strip).
    if (
      url.pathname === '/' ||
      LIVE_ROUTE_SEGMENTS.has(url.pathname.split('/')[1]) ||
      url.pathname === '/icon.svg'
    ) {
      return forward(request, url, env.LIVE, env.LIVE_ORIGIN);
    }
    // Marketing's pre-/about addresses: 308 to /about/<path>.
    if (MARKETING_MOVED_SEGMENTS.has(url.pathname.split('/')[1])) {
      url.pathname = `/about${url.pathname}`;
      return Response.redirect(url.toString(), 308);
    }
    return forward(request, url, env.MARKETING, env.MARKETING_ORIGIN);
  },
};
```

Adding a new top-level route to the live app means adding its first segment to `LIVE_ROUTE_SEGMENTS` (in `packages/api-schema/src/page-views.ts`), or the router will send it to marketing.

The router does **not** count page views. It can't see client-side navigations inside the Next apps, and can't read the per-browser telemetry opt-out, so each frontend reports its own ([Page view telemetry](../017-telemetry/page-view-telemetry.md)).

Service bindings target deployed Workers. The downstream apps deploy as their own units; the router stitches them together.

### When a service answers 5xx

- The router hands a service's `5xx` answer to the caller unchanged: its status, headers and body.
- It never rewrites the status; a proxy that turns a `500` into a `502` hides which side failed.
- It writes one warning naming the service that answered: `[router] upstream fault service=<name> status=<n>`.
- The line carries the method too; Workers Logs stores the path beside it ([Worker logs](worker-logs.md)).
- The warning is a `console.warn`, never a `console.error`, because the `5xx` answer itself already opens a
  [Worker issue](worker-issues.md); an error line would open a second issue for the same fault.
- The static frontends (marketing, live, help, telemetry) run no code of ours and keep no logs, so this line is the
  only record of which one failed.

<!-- legacy-names -->

## Legacy editor route

The editor lived at `/diagram/<id>` before the container became a document ([Document](../006-document/document.md)). Every such URL (share links, embeds, bookmarks, `/diagram/shared?s=…`) answers a permanent `308` to the same path under `/document`, query string included, before any worker sees it (`apps/router/src/legacy-editor-route.ts`). A redirect is routing, not business logic, the same as the prefix-less help paths.

The help articles renamed with it ([Help app, Renamed articles](../018-help/help-app.md#renamed-articles)) redirect the same way, from their old `/help/…` address.
<!-- /legacy-names -->

## Local development

The router **also runs locally**, so `pnpm dev` gives you the production URL shape on one port — `http://localhost:4000` serves the Explorer at `/`, marketing at `/about`, the editor at `/new` etc., `/telemetry`, `/help` and `/api`, with no per-app port to remember. Each app still runs on its own port underneath and stays directly reachable:

| App       | Local URL                                                           |
| --------- | ------------------------------------------------------------------- |
| router    | `http://localhost:4000/` — everything, stitched like production     |
| marketing | `http://localhost:4001/about`                                       |
| live      | `http://localhost:4002/new`, `/explorer/recent`, ... (clean routes) |
| telemetry | `http://localhost:4003/telemetry` (basePath baked in)               |
| help      | `http://localhost:4004/help` (basePath baked in)                    |
| api       | `http://localhost:8787/api/...` (wrangler dev)                      |

**How local mode works.** Service bindings only exist between deployed Workers, so the router's `wrangler.toml` carries an `[env.local]` environment that defines no service bindings and instead sets `<APP>_ORIGIN` vars (`http://127.0.0.1:<port>` for each downstream app). The worker resolves each target as _binding if present, else proxy to the origin_; `pnpm --filter @livedoc/router dev` runs `wrangler dev --env local --port 4000`, and the root `pnpm dev` includes it.

Origin mode forwards **as-is, never stripped**: unlike the deployed static-asset workers (which hold prefix-free `out/` files), the local Next dev servers serve their own prefixes themselves — `basePath` for telemetry/help, and the live app's `/live` assetPrefix, which applies **in dev too** (Next's dev server serves both the prefixed and unprefixed asset paths) precisely so the local router can tell live's `/live/_next/*` apart from marketing's `/_next/*` the same way production does.

**The dev router names itself as the upstream** (`--local-upstream localhost:4000` in its `dev` script). Left to itself, `wrangler dev` rewrites each request's `Origin` to the first production route (`docs.nu`), and the Next dev servers refuse their dev resources to a foreign origin: the live app's Turbopack HMR socket answers no `101`, its pages never hydrate, and every client-side redirect (`/` and `/explorer` to Home) stands still.

The routing decisions stay identical in both modes — only the transport (binding vs origin proxy) and the stripping differ. The router remains optional: visiting each app's own port directly still works.

## Routing infrastructure, not logic

The router is **routing infrastructure**, not application logic, holding no data and running no business rules. That separation is non-negotiable: if you find yourself adding business logic to the router, stop, the logic belongs in a service the router forwards to (marketing, live, telemetry, help, or api).

Two response rules sit with the routing because every site passes through it, and they are HTTP
policy rather than business rules: on a preview every response is marked `X-Robots-Tag: noindex,
nofollow` ([Preview deployments](./preview-deployments.md)), and every site's response follows the
caching rules (`src/cache-policy.ts`: pages `no-store`, build assets immutable, a missing asset a
plain-text 404; [Stale builds](./stale-builds.md) "Caching rules"). The api's responses are left as
the api sets them.
