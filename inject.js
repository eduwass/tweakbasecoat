// tweakbasecoat — live inject panel.
// Loaded into ANY Basecoat app (bookmarklet / console / <script>). Mounts a floating
// shadow-DOM panel, seeds itself from the page's *actual* :root tokens, lets you tweak
// them live on the real components, then copies CSS (or an agent-ready diff) to apply.
//
// Reuse, not duplication: the token math/serialization comes from ./engine.js (shared with
// the sidebar), and the panel is styled by the very same app.css loaded into the shadow
// root — so it looks identical to the editor. Only the thin view layer is bespoke, because
// it edits the *host* document's :root and seeds from the live theme.
import {
  COLOR_KEYS, FONT_KEYS, SYSTEM_FONTS, FALLBACK,
  toOklch, toHex, famOf, buildFontMenus, loadFont,
} from "./engine.js";

if (window.__tbInject) {
  window.__tbInject.toggle();
} else {
  const BASE = new URL(".", import.meta.url); // wherever this script is hosted (Pages)
  const isColor = (k) => COLOR_KEYS.includes(k) || /^(chart-|sidebar)/.test(k);

  // Lucide icons (same set the sidebar uses) — group headers + mode/footer.
  const ICON = {
    palette: '<path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z"/><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/>',
    swatch: '<path d="M11 17a4 4 0 0 1-8 0V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2Z"/><path d="M16.7 13H19a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H7"/><path d="M 7 17h.01"/><path d="m11 8 2.3-2.3a2.4 2.4 0 0 1 3.404.004L18.6 7.6a2.4 2.4 0 0 1 .026 3.434L9.9 19.8"/>',
    type: '<path d="M12 4v16"/><path d="M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2"/><path d="M9 20h6"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
    moon: '<path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"/>',
    code: '<path d="m18 16 4-4-4-4"/><path d="m6 8-4 4 4 4"/><path d="m14.5 4-5 16"/>',
  };
  const svg = (paths, cls = "tb-ico") =>
    `<svg class="${cls}" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;

  // ---- read the host app's current theme off :root -----------------------------------
  const root = document.documentElement;
  const mode = root.classList.contains("dark") ? "dark" : "light";
  const sel = mode === "dark" ? ".dark" : ":root";
  const read = (k) => getComputedStyle(root).getPropertyValue("--" + k).trim();
  const baseline = {};          // values as the page shipped them (for the "changed" diff)
  const tokens = {};            // current working values
  for (const k of [...COLOR_KEYS, ...FONT_KEYS, "radius"]) {
    const v = read(k);
    if (v) { baseline[k] = v; tokens[k] = v; }
  }
  const emit = (k, v) => (isColor(k) ? toOklch(v) : v);
  const apply = (k, v) => {
    tokens[k] = v;
    root.style.setProperty("--" + k, emit(k, v));
  };

  // ---- panel (shadow DOM so host styles can't touch it, and vice versa) --------------
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;top:16px;right:16px;z-index:2147483647;";
  const sh = host.attachShadow({ mode: "open" });
  document.body.appendChild(host);

  // The shared stylesheet IS the look. A small override block re-floats the panel (app.css
  // makes .tb-panel a full-height sticky sidebar; here it's a draggable card).
  sh.innerHTML = `
    <link rel="stylesheet" href="${new URL("app.css", BASE)}">
    <style>
      :host { all: initial; }
      .tb-panel { position: static; height: auto; max-height: 86vh; width: 320px;
        border: 1px solid var(--pc-border); border-radius: 14px; padding: 0 1rem;
        box-shadow: 0 16px 50px rgba(0,0,0,.24); }
      .tb-ihead { display: flex; align-items: center; gap: .5rem; margin: 0 -1rem;
        padding: .7rem 1rem; border-bottom: 1px solid var(--pc-border); cursor: move; font-weight: 650; }
      .tb-ihead .tb-x { margin-left: auto; cursor: pointer; border: 0; background: none;
        font-size: 18px; line-height: 1; color: var(--pc-muted); }
      .tb-panel { padding-top: 0; }
      .tb-ibody { display: flex; flex-direction: column; gap: .8rem; padding: .9rem 0; }
      .tb-actions { margin: 0 -1rem; }
    </style>
    <aside class="tb-panel">
      <header class="tb-ihead">${svg(ICON.palette)} tweakbasecoat <button class="tb-x" title="Close">×</button></header>
      <div class="tb-ibody"></div>
    </aside>`;

  const $ = (s) => sh.querySelector(s);
  const body = $(".tb-ibody");
  const el = (html) => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  const section = (icon, title) => el(`<details class="tb-section" open><summary>${svg(icon)} ${title}</summary></details>`);

  // ---- Base: preset + mode + radius --------------------------------------------------
  const base = section(ICON.palette, "Base");
  const baseRow = (label, control) => { const r = el(`<div class="tb-row"><label>${label}</label></div>`); r.appendChild(control); return r; };

  // The same searchable swatch-preview theme dropdown the sidebar uses (vanilla here,
  // but identical markup/classes so app.css styles it the same).
  const theme = el(`<div class="tb-theme">
    <label>Theme</label>
    <button class="tb-theme-btn"><span class="tb-dots"></span><span class="tb-theme-name" style="flex:1;text-align:left">— current —</span><span style="color:var(--pc-muted)">▾</span></button>
    <div class="tb-theme-menu" hidden>
      <input class="input tb-theme-search" type="text" placeholder="Search themes…">
      <div class="tb-theme-list"></div>
    </div>
  </div>`);
  base.appendChild(theme);
  const themeMenu = theme.querySelector(".tb-theme-menu");
  const themeList = theme.querySelector(".tb-theme-list");
  const themeName = theme.querySelector(".tb-theme-name");
  const themeSearch = theme.querySelector(".tb-theme-search");
  const dots = (p) => `<span class="tb-dots">${["primary", "secondary", "accent", "background"].map((k) => { let c = "#888"; try { c = toHex(p.light?.[k] || "#888"); } catch {} return `<i style="background:${c}"></i>`; }).join("")}</span>`;
  theme.querySelector(".tb-theme-btn").addEventListener("click", () => { themeMenu.hidden = !themeMenu.hidden; if (!themeMenu.hidden) themeSearch.focus(); });

  const modeBtn = el(`<button class="tb-mode-toggle">${svg(mode === "dark" ? ICON.moon : ICON.sun)}<span>${mode === "dark" ? "Dark" : "Light"}</span></button>`);
  modeBtn.addEventListener("click", () => {
    // Mode is the host app's own concern; flip its class, then remount to reseed from
    // the new :root (so swatches/fonts reflect the other mode's values).
    root.classList.toggle("dark");
    window.__tbInject?.remount();
  });
  base.appendChild(baseRow("Mode", modeBtn));

  const radiusInput = el(`<input type="range" min="0" max="1.5" step="0.025" value="${parseFloat(tokens.radius) || 0.625}">`);
  const radiusOut = el(`<span>${tokens.radius || "0.625rem"}</span>`);
  radiusInput.addEventListener("input", () => { apply("radius", radiusInput.value + "rem"); radiusOut.textContent = radiusInput.value + "rem"; });
  const radiusRow = baseRow("Radius", radiusInput); radiusRow.appendChild(radiusOut);
  base.appendChild(radiusRow);
  body.appendChild(base);

  // ---- Colors ------------------------------------------------------------------------
  const colors = section(ICON.swatch, "Colors");
  const grid = el(`<div class="tb-colors"></div>`);
  const colorInputs = {};
  for (const k of COLOR_KEYS) {
    if (!tokens[k]) continue;
    const lab = el(`<label class="tb-color"><span>${k}</span></label>`);
    const inp = el(`<input type="color">`);
    try { inp.value = toHex(tokens[k]); } catch { inp.value = "#888888"; }
    inp.addEventListener("input", () => apply(k, inp.value));
    lab.prepend(inp);
    colorInputs[k] = inp;
    grid.appendChild(lab);
  }
  colors.appendChild(grid);
  body.appendChild(colors);

  // ---- Typography --------------------------------------------------------------------
  const typo = section(ICON.type, "Typography");
  const fontSelects = {};
  for (const k of FONT_KEYS) {
    const r = el(`<div class="tb-row"><label>${k.replace("font-", "")}</label></div>`);
    const s = el(`<select class="select"></select>`);
    s.addEventListener("change", () => {
      const fam = s.value;
      loadFont(fam);
      apply(k, SYSTEM_FONTS.has(fam) ? fam : `${fam}, ${FALLBACK[k]}`);
    });
    fontSelects[k] = s;
    r.appendChild(s);
    typo.appendChild(r);
  }
  body.appendChild(typo);

  // populate font menus (curated now, pooled-from-presets after they load)
  const fillFonts = (menus) => {
    for (const k of FONT_KEYS) {
      const cur = famOf(tokens[k]);
      fontSelects[k].innerHTML = [...new Set([cur, ...(menus[k] || [])].filter(Boolean))]
        .map((f) => `<option${f === cur ? " selected" : ""}>${f}</option>`).join("");
    }
  };
  fillFonts(buildFontMenus([]));

  // ---- footer: export ----------------------------------------------------------------
  const footer = el(`<div class="tb-actions">
    <button class="tb-primary">Copy CSS</button>
    <button class="tb-ghost">For agent</button>
  </div>`);
  const [copyBtn, agentBtn] = footer.querySelectorAll("button");
  $(".tb-panel").appendChild(footer);

  const blockOf = (entries) => `${sel} {\n${entries.map(([k, v]) => `  --${k}: ${emit(k, v)};`).join("\n")}\n}\n`;
  const flash = (btn, msg) => { const old = btn.textContent; btn.textContent = msg; setTimeout(() => (btn.textContent = old), 1300); };
  copyBtn.addEventListener("click", () =>
    navigator.clipboard.writeText(blockOf(Object.entries(tokens))).then(() => flash(copyBtn, "✓ Copied")));
  agentBtn.addEventListener("click", () => {
    const changed = Object.entries(tokens).filter(([k, v]) => !(k in baseline) || emit(k, v) !== emit(k, baseline[k]));
    const css = changed.length ? blockOf(changed) : "/* no changes yet */";
    const prompt = `Apply this Basecoat theme override to my global stylesheet (the \`${sel}\` block). Only these tokens changed:\n\n\`\`\`css\n${css}\`\`\``;
    navigator.clipboard.writeText(prompt).then(() => flash(agentBtn, "✓ Copied"));
  });

  // ---- presets + pooled font menus from the hosted bundle ----------------------------
  const applyPreset = (p) => {
    const src = (mode === "dark" ? p.dark : p.light) || p.light;
    for (const [k, v] of Object.entries(src)) if (isColor(k) || k.startsWith("font-")) apply(k, v);
    if (p.radius != null) { apply("radius", p.radius + "rem"); radiusInput.value = p.radius; radiusOut.textContent = p.radius + "rem"; }
    for (const k of COLOR_KEYS) if (colorInputs[k] && tokens[k]) try { colorInputs[k].value = toHex(tokens[k]); } catch {}
    for (const k of FONT_KEYS) { const fam = famOf(tokens[k]); if (fam) { loadFont(fam); fontSelects[k].value = fam; } }
    themeName.textContent = p.name;
    theme.querySelector(".tb-theme-btn .tb-dots").outerHTML = dots(p);
    themeMenu.hidden = true;
  };
  const renderThemeList = (list, q = "") => {
    themeList.innerHTML = "";
    for (const p of list.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()))) {
      const item = el(`<button class="tb-theme-item">${dots(p)}<span style="font-size:13px">${p.name}</span></button>`);
      item.addEventListener("click", () => applyPreset(p));
      themeList.appendChild(item);
    }
  };
  themeSearch.addEventListener("input", () => renderThemeList(presets, themeSearch.value));
  // Close on outside click. Capture phase + composedPath so it still fires on host apps
  // (like basecoatui.com) whose own JS calls stopPropagation() on bubbling document clicks.
  window.addEventListener("click", (e) => {
    if (!themeMenu.hidden && !e.composedPath().includes(theme)) themeMenu.hidden = true;
  }, true);
  window.addEventListener("keydown", (e) => { if (e.key === "Escape") themeMenu.hidden = true; }, true);

  let presets = [];
  fetch(new URL("presets.json", BASE)).then((r) => r.json()).then((list) => {
    presets = list;
    renderThemeList(presets);
    fillFonts(buildFontMenus(list));
  }).catch(() => { themeList.innerHTML = `<div class="tb-row" style="padding:.4rem .2rem;color:var(--pc-muted)">presets unavailable</div>`; });

  // ---- drag + close ------------------------------------------------------------------
  let drag = null;
  $(".tb-ihead").addEventListener("mousedown", (e) => {
    if (e.target.closest(".tb-x")) return;
    drag = { x: e.clientX, y: e.clientY, top: host.offsetTop, left: host.offsetLeft };
    e.preventDefault();
  });
  window.addEventListener("mousemove", (e) => {
    if (!drag) return;
    host.style.top = drag.top + (e.clientY - drag.y) + "px";
    host.style.left = drag.left + (e.clientX - drag.x) + "px";
    host.style.right = "auto";
  });
  window.addEventListener("mouseup", () => (drag = null));
  $(".tb-x").addEventListener("click", () => host.remove());

  window.__tbInject = {
    toggle: () => (host.style.display = host.style.display === "none" ? "" : "none"),
    // Re-seed after the host's light/dark flips: simplest correct path is a fresh mount.
    remount: () => { host.remove(); delete window.__tbInject; import(import.meta.url + "?r=" + Date.now()); },
  };
}
