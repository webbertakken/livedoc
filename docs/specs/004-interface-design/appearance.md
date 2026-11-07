# Appearance (light / dark / system), site-wide

**Appearance** is the reader's own choice of light or dark chrome. It is one setting for the whole origin: the editor (`apps/live`), the marketing site (`apps/marketing`), the help centre (`apps/help`) and the telemetry dashboard (`apps/telemetry`) all read and write the same value, so a pick made anywhere holds everywhere. It is distinct from a document's **theme**, which recolours canvas content and is stored in the document ([Live app](../007-editor/live-app.md#appearance-light--dark--system) covers the editor-specific parts: the Default theme following it, the match nudge).

## The setting

- Three settings: **Light**, **Dark**, **System**. System resolves through `(prefers-color-scheme: dark)` and is watched, so an OS that turns dark at sunset takes every open page with it without a reload.
- **System is the default** on every surface. Only an explicit Light or Dark pick overrides the device, and it keeps overriding it until the reader picks again.
- Stored per browser in `localStorage` under `livedoc:v2:ui-mode` (`'light'` / `'dark'` / `'system'`; anything else reads as System). The key keeps its historical name because it is stored data. Every app is served from one origin by the router, so they share it. A pick made in another open tab applies on the next page load there.
- Painted as a `dark` class on `<html>`; the shared Tailwind theme maps `dark:` to that class and swaps in the Steel dark palette ([Colour scheme](color-scheme.md)). The document's CSS `color-scheme` follows the class, so form controls and native scrollbars match the painted appearance rather than the OS.

## No flash

Every app's root layout inlines the same tiny script, before first paint, that applies the stored setting (System consulting the OS). A first-time visitor on a dark machine therefore lands dark on their very first load. The script never throws (storage denied, no `matchMedia`); it degrades to light.

## The browser's chrome

The browser's own chrome (an installed app's title bar, a phone's status bar and URL bar) wears the colour at the top
of the page, so the window reads as one piece. That is one of two surfaces:

- **Header**, in the editor app (the editor, the Explorer, the account pages): the colour of the editor's toolbar
  groups ([Toolbar group](toolbar-group.md)), the Explorer's header and the site footer. White in light; in dark `slate-900` as painted now: Steel's `#131b26`, a themed tab's tinted surface, or
  Midnight's navy.
- **Ground**, on the public sites (marketing, help, telemetry): their translucent header shows the page ground.
  `slate-50` (`#f8fafc`) in light; in dark `slate-950` as painted, Steel's `#0b0f16`.

A layout whose top is the ground says so with `data-chrome-surface="ground"` on `<html>`; without it, the header
applies. It is one `<meta name="theme-color">`, written by the No flash script before first paint, then kept current
whenever the appearance, a tab's theme tint or Midnight changes. It is never set through Next's viewport, so no copy
carries the brand blue. The web app manifest's `theme_color` is the homepage's light ground, where an installed app
opens, so it starts there before the page says otherwise.

## The control

- One button that **cycles Light → Dark → System**, showing the CURRENT setting (sun / moon / monitor); its accessible name says where the next click goes.
- **Right-click sets System**, on every Appearance control (the editor's and the public sites'): the context menu gesture (right-click, the Menu key or Shift+F10, a long press where the device maps it to a context menu) hands the choice back to the device and opens no browser menu. On System already it changes nothing (and still opens no browser menu). While the setting is not System, the accessible name and the hover card end "Right-click to follow your device."
- In the editor it sits in the actions group ([Toolbar layout](../007-editor/toolbar-layout.md#the-top-line)). It behaves the same with [Power user mode](../007-editor/power-user-mode.md) on or off. The public sites, the home page included, have no power user mode and always cycle.
- On the public sites the toggle is **never in the header**. It sits on **its own small rail at the right edge**, directly under the [share rail](../019-marketing/marketing-site.md#social-sharing) where that shows, an icon button in the rail's style, with the toolbar name "Appearance". The rail shows from `xl` up on every public site, and from `2xl` on the wide ones (`max-w-7xl` pages: the help centre), where a narrower screen leaves no gutter beside the content. A surface that turns sharing off, such as the help centre, keeps the Appearance card alone. Below that there is no gutter for it, so it is left out and the appearance follows its saved choice or the device (System). It is quiet (a ghost icon button).
- The public-site control emits **no telemetry**: those sites report page views only ([Page view telemetry](../017-telemetry/page-view-telemetry.md)). The editor's control keeps its `UI / Toggled / <setting>` event.

## What goes dark

Everything a reader sees on those five apps, including the landing page's illustrations. The editor mock-ups on the marketing site (the hero's windows and the feature art) render **the editor as it looks in dark**: dark chrome around diagrams drawn exactly as the real editor draws them on the **Default theme** (its dark half: the dark canvas and the dark ink of unpainted elements), so the examples show the real thing rather than an illustrator's palette. The one exception is the hero's theme beat, which demonstrates switching theme and so switches to Pine, the dark counterpart of the light appearance's Forest. Elements whose colour is their identity in the real editor (sticky notes, link cards, cursors and avatars, highlights, selection) keep it, as does an element the example deliberately painted, since the editor keeps a user's paint on any theme, and art whose subject IS colour (the theme catalogue, the format painter, custom themes) shows those colours. In light appearance the same examples are drawn on the Default theme's light half. Template previews use the shared `preview-art-tile` re-lighting. The help centre's article illustrations and category banners do the same: in dark they show the editor's dark chrome, while a surface that is dark in both appearances (a code block, the presenter HUD, an embed snippet), the light half of a light/dark comparison and a theme's swatches keep their own colours.

## Defaults

Each default below was applied where this spec is silent or qualitative, and holds until a human confirms it.
The code cites each by its id.

- **D76** Lifetime of the OS watch: One `MediaQueryList`, attached on first subscribe or write, never detached (default).
- **D77** Content of the `darkreader-lock` meta: `'true'`: Dark Reader keys on the name alone, and Next drops a meta with
  empty content (default).
