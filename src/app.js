// tweakbasecoat — vanilla/Alpine theme editor for Basecoat.
// The whole engine is ~3 lifted ideas from tweakcn, no framework needed:
//   1. token object  ->  2. setProperty onto :root  ->  3. serialize to CSS.
// Color math is culori (the same lib tweakcn uses), loaded as a browser ESM module.

import Alpine from "https://esm.sh/alpinejs@3.14.1";
import {
  PACKS, packHref, COLOR_KEYS, PRESET, clone, STORE_KEY,
  encodeState, decodeState, toOklch, toHex, cssVal, cssVar,
  FONTS, FONT_KEYS, buildFontMenus, FALLBACK, SYSTEM_FONTS,
  DEFAULT_TYPO, DEFAULT_SHADOW, famOf, computeShadowMap, loadFont,
} from "./engine.js";

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
    // A shared #t=… link wins over localStorage; otherwise restore the last session's edits.
    const shared = decodeState(location.hash);
    try {
      const saved = shared || JSON.parse(localStorage.getItem(STORE_KEY) || "null");
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
    // Widen the font dropdowns to every family the loaded themes actually use.
    this.fontMenus = buildFontMenus(this.presets);
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

  _applied: null, // keys written on the last apply(), to clear stale ones on theme switch

  // The lifted core: write every token as a CSS custom property on :root.
  apply() {
    const root = document.documentElement;
    const t = this.tokens[this.mode];
    const set = new Set();
    for (const [k, v] of Object.entries(t)) {
      root.style.setProperty(`--${k}`, cssVal(k, v));
      set.add(k);
    }
    root.style.setProperty("--radius", `${this.radius}rem`);
    set.add("radius");
    // Derived shadow scale (from primitives) + ensure chosen fonts are loaded.
    for (const [k, v] of Object.entries(computeShadowMap(t))) {
      root.style.setProperty(`--${k}`, v);
      set.add(k);
    }
    FONT_KEYS.forEach((k) => loadFont(famOf(t[k] || DEFAULT_TYPO[k])));
    // Remove props a previous theme set that the current one doesn't define, so switching
    // back to a sparser theme (e.g. Default) doesn't inherit the old theme's fonts/colors.
    if (this._applied) for (const k of this._applied) if (!set.has(k)) root.style.removeProperty(`--${k}`);
    this._applied = set;
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
    if (location.hash.includes("t=")) history.replaceState(null, "", location.pathname);
    this.apply();
  },

  // Serialize to a Basecoat-ready theme.css. Tokens are grouped so the file is honest about
  // what Basecoat actually consumes (colors/fonts/radius) vs extended shadcn passthrough.
  toCss() {
    const isExtended = (k) => /^(chart-|sidebar)/.test(k);
    const isShadow = (k) => /^shadow/.test(k);

    const block = (sel, obj) => {
      const entries = Object.entries(obj).filter(([k]) => !isShadow(k));
      const core = entries.filter(([k]) => !isExtended(k));
      const ext = entries.filter(([k]) => isExtended(k));
      let lines = [`  --radius: ${this.radius}rem;`, ...core.map(cssVar)];
      if (this.shadowsOn) {
        lines.push("", "  /* shadow scale (opt-in elevation) */");
        lines.push(...Object.entries(obj).filter(([k]) => isShadow(k)).map(cssVar));
        lines.push(...Object.entries(computeShadowMap(obj)).map(([k, v]) => `  --${k}: ${v};`));
      }
      if (ext.length) {
        lines.push("", "  /* extended shadcn tokens — not consumed by Basecoat components */");
        lines.push(...ext.map(cssVar));
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

  shared: false,
  async shareLink() {
    const { tokens, radius, mode, pack, themeName, shadowsOn } = this;
    const url = location.origin + location.pathname + "#t=" + encodeState({ tokens, radius, mode, pack, themeName, shadowsOn });
    history.replaceState(null, "", url);
    await navigator.clipboard.writeText(url);
    this.shared = true;
    setTimeout(() => (this.shared = false), 1400);
  },
}));

Alpine.start();

// --- tiny self-check (runs in console): conversion + serialization sanity ---
if (location.hash === "#selftest") {
  console.assert(toOklch("#ffffff").startsWith("oklch(1"), "white -> oklch L≈1");
  console.assert(toHex("oklch(1 0 0)").toLowerCase() === "#ffffff", "oklch white -> hex");
  console.log("tweakbasecoat self-check passed");
}
