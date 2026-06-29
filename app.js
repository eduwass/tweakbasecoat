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

// hex (or any css color) -> "oklch(L C H)"  — the format Basecoat/Tailwind v4 ships.
const toOklch = (value) => {
  const c = culori.converter("oklch")(culori.parse(value));
  if (!c) return value;
  const n = (x) => (x === undefined ? 0 : Number(x.toFixed(4)));
  return `oklch(${n(c.l)} ${n(c.c)} ${n(c.h)})`;
};
const toHex = (value) => culori.formatHex(culori.parse(value)) || "#000000";

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

  async init() {
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
      root.style.setProperty(`--${k}`, toOklch(v));
    }
    root.style.setProperty("--radius", `${this.radius}rem`);
  },

  reset() {
    this.tokens = clone(PRESET);
    this.radius = "0.625";
    this.apply();
  },

  // Serialize to a Basecoat-ready theme.css ( :root + .dark blocks ).
  toCss() {
    const block = (sel, obj) =>
      `${sel} {\n` +
      `  --radius: ${this.radius}rem;\n` +
      Object.entries(obj).map(([k, v]) => `  --${k}: ${toOklch(v)};`).join("\n") +
      `\n}`;
    return `${block(":root", this.tokens.light)}\n\n${block(".dark", this.tokens.dark)}\n`;
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
