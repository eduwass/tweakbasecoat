# tweakbasecoat

A visual theme editor for [Basecoat](https://basecoatui.com/) — the spiritual equivalent of
[tweakcn](https://tweakcn.com/), but aimed at Basecoat instead of React shadcn/ui.

Edit colors, radius, and dark/light mode against a live Basecoat preview, then copy a
ready-to-paste `theme.css`. No build step, no framework, no server — one static HTML file.

![screenshot](./media/screenshot.png)

## Why this exists

Basecoat and tweakcn both descend from shadcn/ui's CSS-variable convention
(`--primary`, `--background`, `--radius`, `:root` + `.dark`). tweakcn's output is already
~drop-in for Basecoat — but its **live preview renders React shadcn components**, so it can't
show you your theme on Basecoat's actual HTML class API (`class="btn btn-secondary"`), and it
knows nothing about Basecoat's style packs (vega, nova, maia, …).

tweakbasecoat fills exactly that gap: the preview is real Basecoat markup, and you can switch
style packs live.

## How it works

The entire theming engine is tiny and framework-free — three steps:

1. **token object** — colors/radius for `light` + `dark` (`app.js`)
2. **apply** — `root.style.setProperty('--token', value)` onto `:root`; the preview re-themes
   for free via the CSS cascade (lifted from tweakcn's 69-line `applyThemeToElement`)
3. **export** — serialize the token object to a `:root {}` / `.dark {}` block

Color math is [culori](https://culorijs.org/) (the same library tweakcn uses), loaded as a
browser ESM module. UI reactivity is [Alpine.js](https://alpinejs.dev/) — which is also
Basecoat's recommended JS pairing. Basecoat itself loads from a self-contained jsDelivr CDN
bundle, swapped at runtime when you change style pack.

```
src/
  index.html   preview (Basecoat HTML) + controls panel (Alpine)
  engine.js    shared token math · culori conversion · CSS serialization
  app.js        sidebar editor (Alpine component over the engine)
  inject.js     live-inject panel — drop the editor into any Basecoat app
  app.css       editor layout chrome only — components are styled by Basecoat
  presets.json  23 tweakcn preset themes
media/         README assets
```

`engine.js` is the single source of truth for the token/serialization logic; both the
sidebar (`app.js`) and the inject panel (`inject.js`) import it.

## Run

No install. Serve `src/` over any static server (CDN modules need http, not `file://`):

```sh
cd src && python3 -m http.server 8000
# then open http://localhost:8000
```

The repo deploys to GitHub Pages from `src/` via `.github/workflows/deploy.yml`.

Append `#selftest` to the URL to run the conversion/serialization self-check in the console.

## Usage

1. Pick a style pack and light/dark mode.
2. Tweak color swatches and the radius slider — the preview updates live.
3. **Copy theme.css** and paste it into your Basecoat project after the Basecoat import:

```css
@import "tailwindcss";
@import "basecoat-css";   /* or basecoat-css/sera, etc. */
@import "./theme.css";    /* <- paste here; last import wins */
```

## Status

Working: live colour theming, radius, dark/light, **typography** (sans/serif/mono with Google
Fonts loaded on demand + letter-spacing), **shadow editor** (colour/opacity/blur/spread/offset
driving the full `--shadow-*` scale), **23 built-in tweakcn preset themes** (searchable picker),
style-pack switching, localStorage persistence, **shareable `#t=` theme links**, `theme.css`
export, and a **live-inject panel** (bookmarklet / console / `<script>`) that drops the editor
into any running Basecoat app and copies CSS or an agent-ready diff. The editor chrome uses a
fixed neutral palette so it stays legible regardless of the edited theme.

Not yet built: chart + sidebar token controls, import-existing-theme, the full multi-tab demo
gallery.
