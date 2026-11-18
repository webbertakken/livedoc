# Platform

Follow the references below only as needed; never upfront.

- ./router-app.md - when working on Router app: Path-based routing across apps (`/` → marketing; `/document`, `/explorer`, `/new`, ... → editor)
- ./deployment.md - when working on Deployment: GitHub Actions → Cloudflare Workers pipeline for all eight workers
- ./preview-deployments.md - when working on pull request previews: a complete, isolated copy of the platform per pull request on workers.dev, generated from the production wrangler configs by scripts/preview.mjs, deleted when the pull request closes; noindex at the router
- ./new-version-prompt.md - when working on the document format number or the "A new version of LiveDoc is ready" reload prompt an editor shows when the server serves a newer document format
- ./stale-builds.md - when working on a tab left on an older build after a deploy: never-stale HTML and immutable assets, a pre-boot guard for stale pages, the live build id on the server release signal, full page loads instead of client navigation while stale, and the chunk-load safety net with its loop guard
- ./web-performance.md - when adding to what a page loads up front (a static import, a provider, a stylesheet, a catalogue), a timer or a public read: first-load budgets per page, lazy surfaces, non-blocking fonts, query plans that start from the person's own rows
- ./nextjs.md - when upgrading Next.js or React, changing a `next.config.ts` or `@livedoc/next-config`, or weighing a Next.js feature: versions, the one shared configuration, the Turbopack cache, features used and declined
- ./secure-context.md - when an API is secure-context only (`crypto.randomUUID`, `crypto.subtle`, the clipboard) or the editor runs in an embed on an http page or a self-hosted http instance: the randomUUID boot shim, the SHA-256 fallback and what still needs HTTPS
- ./trusted-types.md - when adding `dangerouslySetInnerHTML`, an inline script, a third-party script or a response header: the enforced Trusted Types header, the two policies, third parties and violations
- ./bug-reports.md - when working on Report a Bug: the one form and its entries, the context and opt-in screenshot, filing a report as a card on the private Bug Tracker board, the D1 fallback and refile, screenshots served to the owner only
