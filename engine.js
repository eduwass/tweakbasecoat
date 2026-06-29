// tweakbasecoat — shared engine.
// The token model + color math + serialization, framework-free. Imported by BOTH the
// sidebar editor (app.js) and the live-inject panel (inject.js) so there's exactly one
// source of truth for the logic. The whole idea is ~3 lifted from tweakcn:
//   1. token object  ->  2. setProperty onto :root  ->  3. serialize to CSS.
import * as culori from "https://esm.sh/culori@4.0.1";

export const PACKS = ["basecoat", "vega", "nova", "maia", "lyra", "mira", "luma", "sera", "rhea"];
export const packHref = (p) =>
  `https://cdn.jsdelivr.net/npm/basecoat-css@1.0.1/dist/${p === "basecoat" ? "basecoat" : "basecoat-" + p}.cdn.min.css`;

// Color tokens we expose as swatches. (Superset lives in the theme; this is the curated UI set.)
export const COLOR_KEYS = [
  "background", "foreground",
  "primary", "primary-foreground",
  "secondary", "secondary-foreground",
  "accent", "accent-foreground",
  "muted", "muted-foreground",
  "destructive", "destructive-foreground",
  "card", "card-foreground",
  "border", "input", "ring",
];

// Default shadcn/Basecoat palette (hex for easy editing; we emit oklch on export).
export const PRESET = {
  light: {
    background: "#ffffff", foreground: "#0a0a0a",
    primary: "#171717", "primary-foreground": "#fafafa",
    secondary: "#f5f5f5", "secondary-foreground": "#171717",
    accent: "#f5f5f5", "accent-foreground": "#171717",
    muted: "#f5f5f5", "muted-foreground": "#737373",
    destructive: "#e7000b", "destructive-foreground": "#fafafa",
    card: "#ffffff", "card-foreground": "#0a0a0a",
    border: "#e5e5e5", input: "#e5e5e5", ring: "#a1a1a1",
  },
  dark: {
    background: "#0a0a0a", foreground: "#fafafa",
    primary: "#fafafa", "primary-foreground": "#171717",
    secondary: "#262626", "secondary-foreground": "#fafafa",
    accent: "#262626", "accent-foreground": "#fafafa",
    muted: "#262626", "muted-foreground": "#a1a1a1",
    destructive: "#ff6467", "destructive-foreground": "#fafafa",
    card: "#171717", "card-foreground": "#fafafa",
    border: "#262626", input: "#333333", ring: "#737373",
  },
};

export const clone = (o) => JSON.parse(JSON.stringify(o));
export const STORE_KEY = "tweakbasecoat:v1";

// Share a theme as a self-contained #t=<base64> link — state round-trips through the URL,
// nothing hits a server. btoa is latin1-only, so utf8-encode first (font stacks are ascii
// today, but this keeps it honest).
export const encodeState = (state) => btoa(unescape(encodeURIComponent(JSON.stringify(state))));
export const decodeState = (hash) => {
  const m = /[#&]t=([^&]+)/.exec(hash || "");
  if (!m) return null;
  try { return JSON.parse(decodeURIComponent(escape(atob(m[1])))); } catch { return null; }
};

// hex (or any css color) -> "oklch(L C H)"  — the format Basecoat/Tailwind v4 ships.
export const toOklch = (value) => {
  const parsed = culori.parse(value);
  if (!parsed) return value;
  const c = culori.converter("oklch")(parsed);
  if (!c) return value;
  const n = (x) => (x === undefined ? 0 : Number(x.toFixed(4)));
  return `oklch(${n(c.l)} ${n(c.c)} ${n(c.h)})`;
};
export const toHex = (value) => culori.formatHex(culori.parse(value)) || "#000000";

// Non-color tokens (fonts, shadow primitives, tracking, radius) pass through verbatim —
// don't oklch them. Everything else is a color and gets converted on the way out.
export const isNonColor = (k) => /^(font-|shadow-|tracking|letter-spacing|radius$|spacing$)/.test(k);
export const cssVal = (k, v) => (isNonColor(k) ? v : toOklch(v));
// Which tokens render as a colour swatch in the UI (distinct from cssVal: this is the
// "show a color picker / treat as a palette entry" predicate, not the serializer).
export const isColorKey = (k) => COLOR_KEYS.includes(k) || /^(chart-|sidebar)/.test(k);

// The one canonical way to emit a custom-property line and a selector block. Shared by the
// sidebar's theme.css export and the inject panel's live copy so the output can never drift.
export const cssVar = ([k, v]) => `  --${k}: ${cssVal(k, v)};`;
export const tokenBlock = (selector, entries) => `${selector} {\n${entries.map(cssVar).join("\n")}\n}\n`;

// "H S% L%" (Tailwind v3 / shadow style, no hsl() wrapper).
export const toHsl3 = (value) => {
  const c = culori.converter("hsl")(culori.parse(value));
  if (!c) return "0 0% 0%";
  const n = (x) => (x === undefined ? 0 : x % 1 === 0 ? x : Number(x.toFixed(2)));
  return `${n(c.h)} ${n((c.s || 0) * 100)}% ${n((c.l || 0) * 100)}%`;
};

// Font menus (Google fonts + a system stack each). Token holds the full family stack.
// Basecoat's real font tokens are --font-sans / --font-heading / --font-mono (not font-serif).
export const FONTS = {
  "font-sans": ["Inter", "Geist", "Roboto", "Open Sans", "Montserrat", "Poppins", "Outfit", "DM Sans", "system-ui"],
  "font-heading": ["Inter", "Montserrat", "Poppins", "Outfit", "Playfair Display", "Space Grotesk", "system-ui"],
  "font-mono": ["Geist Mono", "Fira Code", "JetBrains Mono", "IBM Plex Mono", "monospace"],
};
export const FONT_KEYS = ["font-sans", "font-heading", "font-mono"];

export const famOf = (stack) => (stack || "").split(",")[0].trim().replace(/['"]/g, "");

// Build the dropdown menus from the curated lists PLUS every family any preset ships,
// so a theme's font is always selectable (themes use Lora, Oxanium, Source Serif 4, … —
// none of which are in the hand-picked lists). Presets store fonts under font-sans /
// font-serif / font-mono; we have no serif control, so serif families join the text menus.
export const buildFontMenus = (presets) => {
  const text = new Set(), mono = new Set();
  for (const p of presets) {
    for (const t of [p.light, p.dark]) {
      if (!t) continue;
      for (const k of ["font-sans", "font-serif", "font-heading"]) if (t[k]) text.add(famOf(t[k]));
      if (t["font-mono"]) mono.add(famOf(t["font-mono"]));
    }
  }
  // Curated picks first (familiar order), then anything else a theme introduced, sorted.
  const merge = (curated, seen) => {
    const extra = [...seen].filter((f) => f && !curated.includes(f)).sort();
    return [...curated, ...extra];
  };
  return {
    "font-sans": merge(FONTS["font-sans"], new Set([...text].filter((f) => !mono.has(f)))),
    "font-heading": merge(FONTS["font-heading"], new Set([...text].filter((f) => !mono.has(f)))),
    "font-mono": merge(FONTS["font-mono"], mono),
  };
};
export const FALLBACK = { "font-sans": "sans-serif", "font-heading": "sans-serif", "font-mono": "monospace" };
export const SYSTEM_FONTS = new Set(["system-ui", "Georgia", "monospace", "serif", "sans-serif", "Arial", "Menlo", "ui-sans-serif", "ui-serif", "ui-monospace"]);

// Defaults so the Typography/Shadow controls have sane values even on the built-in theme.
export const DEFAULT_TYPO = { "font-sans": "Inter, sans-serif", "font-heading": "Inter, sans-serif", "font-mono": "Geist Mono, monospace", "tracking-normal": "0em" };
export const DEFAULT_SHADOW = { "shadow-color": "hsl(0 0% 0%)", "shadow-opacity": "0.1", "shadow-blur": "3px", "shadow-spread": "0px", "shadow-offset-x": "0px", "shadow-offset-y": "1px" };

// Ported verbatim from tweakcn's getShadowMap — derives the --shadow-* scale from 6 primitives.
export const computeShadowMap = (s) => {
  const hsl = toHsl3(s["shadow-color"] || DEFAULT_SHADOW["shadow-color"]);
  const ox = s["shadow-offset-x"] || DEFAULT_SHADOW["shadow-offset-x"];
  const oy = s["shadow-offset-y"] || DEFAULT_SHADOW["shadow-offset-y"];
  const blur = s["shadow-blur"] || DEFAULT_SHADOW["shadow-blur"];
  const spread = s["shadow-spread"] || DEFAULT_SHADOW["shadow-spread"];
  const opacity = parseFloat(s["shadow-opacity"] ?? DEFAULT_SHADOW["shadow-opacity"]);
  const color = (m) => `hsl(${hsl} / ${(opacity * m).toFixed(2)})`;
  const second = (fy, fb) => {
    const sp = (parseFloat((spread || "0").replace("px", "")) - 1).toString() + "px";
    return `${ox} ${fy} ${fb} ${sp} ${color(1.0)}`;
  };
  return {
    "shadow-2xs": `${ox} ${oy} ${blur} ${spread} ${color(0.5)}`,
    "shadow-xs": `${ox} ${oy} ${blur} ${spread} ${color(0.5)}`,
    "shadow-sm": `${ox} ${oy} ${blur} ${spread} ${color(1.0)}, ${second("1px", "2px")}`,
    shadow: `${ox} ${oy} ${blur} ${spread} ${color(1.0)}, ${second("1px", "2px")}`,
    "shadow-md": `${ox} ${oy} ${blur} ${spread} ${color(1.0)}, ${second("2px", "4px")}`,
    "shadow-lg": `${ox} ${oy} ${blur} ${spread} ${color(1.0)}, ${second("4px", "6px")}`,
    "shadow-xl": `${ox} ${oy} ${blur} ${spread} ${color(1.0)}, ${second("8px", "10px")}`,
    "shadow-2xl": `${ox} ${oy} ${blur} ${spread} ${color(2.5)}`,
  };
};

// Inject a Google Fonts <link> once per family. Goes on the host document head (fonts
// must load at the document level, not inside a shadow root, to apply to the page).
export const loadFont = (family) => {
  if (!family || SYSTEM_FONTS.has(family)) return;
  const id = "gf-" + family.replace(/\s+/g, "-").toLowerCase();
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${family.replace(/\s+/g, "+")}:wght@400;500;600;700&display=swap`;
  document.head.appendChild(link);
};
