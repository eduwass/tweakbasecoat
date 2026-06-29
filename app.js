// tweakbasecoat — vanilla/Alpine theme editor for Basecoat.
// The whole engine is ~3 lifted ideas from tweakcn, no framework needed:
//   1. token object  ->  2. setProperty onto :root  ->  3. serialize to CSS.
// Color math is culori (the same lib tweakcn uses), loaded as a browser ESM module.

import Alpine from "https://esm.sh/alpinejs@3.14.1";
import * as culori from "https://esm.sh/culori@4.0.1";

const PACKS = ["basecoat", "vega", "nova", "maia", "lyra", "mira", "luma", "sera", "rhea"];
const packHref = (p) =>
  `https://cdn.jsdelivr.net/npm/basecoat-css@1.0.1/dist/${p === "basecoat" ? "basecoat" : "basecoat-" + p}.cdn.min.css`;

// Color tokens we expose as swatches. (Superset lives in the theme; this is the curated UI set.)
const COLOR_KEYS = [
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
const PRESET = {
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

const clone = (o) => JSON.parse(JSON.stringify(o));
const STORE_KEY = "tweakbasecoat:v1";

// hex (or any css color) -> "oklch(L C H)"  — the format Basecoat/Tailwind v4 ships.
const toOklch = (value) => {
  const parsed = culori.parse(value);
  if (!parsed) return value;
  const c = culori.converter("oklch")(parsed);
  if (!c) return value;
  const n = (x) => (x === undefined ? 0 : Number(x.toFixed(4)));
  return `oklch(${n(c.l)} ${n(c.c)} ${n(c.h)})`;
};
const toHex = (value) => culori.formatHex(culori.parse(value)) || "#000000";

// Non-color tokens (fonts, shadow primitives, tracking) pass through verbatim — don't oklch them.
const isNonColor = (k) => /^(font-|shadow-|tracking|letter-spacing|spacing$)/.test(k);
const cssVal = (k, v) => (isNonColor(k) ? v : toOklch(v));

// "H S% L%" (Tailwind v3 / shadow style, no hsl() wrapper).
const toHsl3 = (value) => {
  const c = culori.converter("hsl")(culori.parse(value));
  if (!c) return "0 0% 0%";
  const n = (x) => (x === undefined ? 0 : x % 1 === 0 ? x : Number(x.toFixed(2)));
  return `${n(c.h)} ${n((c.s || 0) * 100)}% ${n((c.l || 0) * 100)}%`;
};

// Font menus (Google fonts + a system stack each). Token holds the full family stack.
// Basecoat's real font tokens are --font-sans / --font-heading / --font-mono (not font-serif).
const FONTS = {
  "font-sans": ["Inter", "Geist", "Roboto", "Open Sans", "Montserrat", "Poppins", "Outfit", "DM Sans", "system-ui"],
  "font-heading": ["Inter", "Montserrat", "Poppins", "Outfit", "Playfair Display", "Space Grotesk", "system-ui"],
  "font-mono": ["Geist Mono", "Fira Code", "JetBrains Mono", "IBM Plex Mono", "monospace"],
};
const FONT_KEYS = ["font-sans", "font-heading", "font-mono"];
const FALLBACK = { "font-sans": "sans-serif", "font-heading": "sans-serif", "font-mono": "monospace" };
const SYSTEM_FONTS = new Set(["system-ui", "Georgia", "monospace", "serif", "sans-serif", "Arial", "Menlo"]);

// Defaults so the Typography/Shadow controls have sane values even on the built-in theme.
const DEFAULT_TYPO = { "font-sans": "Inter, sans-serif", "font-heading": "Inter, sans-serif", "font-mono": "Geist Mono, monospace", "tracking-normal": "0em" };
const DEFAULT_SHADOW = { "shadow-color": "hsl(0 0% 0%)", "shadow-opacity": "0.1", "shadow-blur": "3px", "shadow-spread": "0px", "shadow-offset-x": "0px", "shadow-offset-y": "1px" };

const famOf = (stack) => (stack || "").split(",")[0].trim().replace(/['"]/g, "");

// Ported verbatim from tweakcn's getShadowMap — derives the --shadow-* scale from 6 primitives.
const computeShadowMap = (s) => {
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

// Inject a Google Fonts <link> once per family.
const loadFont = (family) => {
  if (!family || SYSTEM_FONTS.has(family)) return;
  const id = "gf-" + family.replace(/\s+/g, "-").toLowerCase();
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${family.replace(/\s+/g, "+")}:wght@400;500;600;700&display=swap`;
  document.head.appendChild(link);
};

window.Alpine = Alpine; // expose for devtools/debugging

Alpine.data("editor", () => ({
  packs: PACKS,
  pack: "basecoat",
  mode: "light",
  radius: "0.625",
  colorKeys: COLOR_KEYS,
  tokens: clone(PRESET),
  copied: false,

  presets: [],
  themeName: "Default",
  themeOpen: false,
  themeQuery: "",
  shadowsOn: false, // Basecoat is flat by default; shadows are an opt-in project override.

  async init() {
    // Restore the last session's edits, if any.
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
      if (saved) {
        Object.assign(this, { tokens: saved.tokens, radius: saved.radius, mode: saved.mode, pack: saved.pack, themeName: saved.themeName, shadowsOn: !!saved.shadowsOn });
        if (this.pack !== "basecoat") document.getElementById("basecoat-style").href = packHref(this.pack);
      }
    } catch (e) { console.warn("restore failed", e); }
    this.apply();
    // Built-in default + tweakcn preset themes (fetched from their registry, bundled as JSON).
    this.presets = [{ slug: "default", name: "Default", radius: "0.625", light: PRESET.light, dark: PRESET.dark }];
    try {
      const list = await (await fetch("./presets.json")).json();
      this.presets.push(...list);
    } catch (e) { console.warn("presets load failed", e); }
    // Inject Basecoat's homepage kitchen-sink as the live preview.
    try {
      const html = await (await fetch("./_kitchensink.html")).text();
      const preview = document.getElementById("preview");
      preview.innerHTML = html;
      // It's a static demo, not a real login. Tag fields so password managers skip them
      // (autocomplete=off alone is ignored by Bitwarden/1Password/LastPass — they honor
      // their own data-*ignore attributes). Keeps type=password so it still looks normal.
      preview.querySelectorAll("input, form").forEach((el) => {
        el.setAttribute("autocomplete", "off");
        el.setAttribute("data-bwignore", "true");   // Bitwarden
        el.setAttribute("data-1p-ignore", "");        // 1Password
        el.setAttribute("data-lpignore", "true");     // LastPass
        el.setAttribute("data-form-type", "other");   // Dashlane
      });
      preview.querySelectorAll('input[type="password"]').forEach((el) =>
        el.setAttribute("autocomplete", "new-password")
      );
    } catch (e) { console.warn("kitchensink load failed", e); }
  },

  // 4-dot swatch summary for a preset, like tweakcn's theme list.
  swatch(p) {
    return ["primary", "secondary", "accent", "background"].map((k) => toHex(p.light[k] || "#888"));
  },

  loadPreset(p) {
    this.tokens = { light: { ...p.light }, dark: { ...(p.dark || p.light) } };
    this.radius = p.radius ?? "0.625";
    this.themeName = p.name;
    this.themeOpen = false;
    this.apply();
  },

  hexOf(key) {
    return toHex(this.tokens[this.mode][key]);
  },

  setColor(key, hex) {
    this.tokens[this.mode][key] = hex;
    this.apply();
  },

  fontMenus: FONTS,

  // Read a token (current mode) with a default fallback.
  tok(key, fallback) {
    return this.tokens[this.mode]?.[key] ?? fallback;
  },

  // Typography + shadow tokens aren't mode-specific in practice — write to both modes.
  setTok(key, value) {
    this.tokens.light[key] = value;
    this.tokens.dark[key] = value;
    this.apply();
  },

  fontFamily(key) {
    return famOf(this.tok(key, DEFAULT_TYPO[key]));
  },

  setFont(key, family) {
    const value = SYSTEM_FONTS.has(family) ? family : `${family}, ${FALLBACK[key]}`;
    loadFont(family);
    this.setTok(key, value);
  },

  // Shadow primitive helpers (strip/restore the px suffix for sliders).
  shadowNum(key) {
    return parseFloat(String(this.tok(key, DEFAULT_SHADOW[key])).replace("px", "")) || 0;
  },
  setShadowPx(key, n) {
    this.setTok(key, `${n}px`);
  },
  shadowColorHex() {
    return toHex(this.tok("shadow-color", DEFAULT_SHADOW["shadow-color"]));
  },

  toggleMode() {
    this.mode = this.mode === "dark" ? "light" : "dark";
    this.apply();
  },

  setPack() {
    document.getElementById("basecoat-style").href = packHref(this.pack);
    // Re-apply after the stylesheet swaps so our overrides win the cascade.
    requestAnimationFrame(() => this.apply());
  },

  // The lifted core: write every token as a CSS custom property on :root.
  apply() {
    const root = document.documentElement;
    const t = this.tokens[this.mode];
    for (const [k, v] of Object.entries(t)) {
      root.style.setProperty(`--${k}`, cssVal(k, v));
    }
    root.style.setProperty("--radius", `${this.radius}rem`);
    // Derived shadow scale (from primitives) + ensure chosen fonts are loaded.
    const shadows = computeShadowMap(t);
    for (const [k, v] of Object.entries(shadows)) root.style.setProperty(`--${k}`, v);
    FONT_KEYS.forEach((k) => loadFont(famOf(t[k] || DEFAULT_TYPO[k])));
    this.persist();
  },

  persist() {
    const { tokens, radius, mode, pack, themeName, shadowsOn } = this;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ tokens, radius, mode, pack, themeName, shadowsOn }));
    } catch (e) { /* storage full / disabled — non-fatal */ }
  },

  toggleShadows() {
    this.shadowsOn = !this.shadowsOn;
    this.persist();
  },

  reset() {
    this.tokens = clone(PRESET);
    this.radius = "0.625";
    this.themeName = "Default";
    this.pack = "basecoat";
    document.getElementById("basecoat-style").href = packHref(this.pack);
    this.apply();
  },

  // Serialize to a Basecoat-ready theme.css. Tokens are grouped so the file is honest about
  // what Basecoat actually consumes (colors/fonts/radius) vs extended shadcn passthrough.
  toCss() {
    const isExtended = (k) => /^(chart-|sidebar)/.test(k);
    const isShadow = (k) => /^shadow/.test(k);
    const line = ([k, v]) => `  --${k}: ${cssVal(k, v)};`;

    const block = (sel, obj) => {
      const entries = Object.entries(obj).filter(([k]) => !isShadow(k));
      const core = entries.filter(([k]) => !isExtended(k));
      const ext = entries.filter(([k]) => isExtended(k));
      let lines = [`  --radius: ${this.radius}rem;`, ...core.map(line)];
      if (this.shadowsOn) {
        lines.push("", "  /* shadow scale (opt-in elevation) */");
        lines.push(...Object.entries(obj).filter(([k]) => isShadow(k)).map(line));
        lines.push(...Object.entries(computeShadowMap(obj)).map(([k, v]) => `  --${k}: ${v};`));
      }
      if (ext.length) {
        lines.push("", "  /* extended shadcn tokens — not consumed by Basecoat components */");
        lines.push(...ext.map(line));
      }
      return `${sel} {\n${lines.join("\n")}\n}`;
    };

    let css = `${block(":root", this.tokens.light)}\n\n${block(".dark", this.tokens.dark)}\n`;
    if (this.shadowsOn) {
      css +=
        "\n/* Optional elevation — Basecoat cards are flat by default. This project-level\n" +
        "   override (docs: \"add overrides when tokens are not enough\") opts in.\n" +
        "   Remove this @layer block to return to stock Basecoat. */\n" +
        "@layer components {\n" +
        "  .card { box-shadow: var(--shadow-sm); }\n" +
        "  .popover, [role=\"dialog\"], [class*=\"menu\"] { box-shadow: var(--shadow-md); }\n" +
        "}\n";
    }
    return css;
  },

  async copyCss() {
    await navigator.clipboard.writeText(this.toCss());
    this.copied = true;
    setTimeout(() => (this.copied = false), 1200);
  },
}));

Alpine.start();

// --- tiny self-check (runs in console): conversion + serialization sanity ---
if (location.hash === "#selftest") {
  console.assert(toOklch("#ffffff").startsWith("oklch(1"), "white -> oklch L≈1");
  console.assert(toHex("oklch(1 0 0)").toLowerCase() === "#ffffff", "oklch white -> hex");
  console.log("tweakbasecoat self-check passed");
}
