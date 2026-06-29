// tweakbasecoat — live inject panel.
// Loaded into ANY Basecoat app (bookmarklet or pasted snippet). It mounts a floating
// shadow-DOM panel, seeds itself from the page's *actual* :root tokens, lets you tweak
// them live on the real components, then copies CSS (or an agent-ready diff) to apply.
//
// Standalone by design: a bookmarklet must run on pages that don't ship our code, so the
// few pure helpers below are duplicated from app.js rather than imported. app.js is the
// source of truth for the editor proper; this is the portable cousin.
import * as culori from "https://esm.sh/culori@4.0.1";

if (window.__tbInject) {
  window.__tbInject.toggle();
} else {
  // ---- pure helpers (mirror app.js) -------------------------------------------------
  const BASE = new URL(".", import.meta.url); // wherever this script is hosted (Pages)
  const COLOR_KEYS = [
    "background", "foreground", "primary", "primary-foreground",
    "secondary", "secondary-foreground", "accent", "accent-foreground",
    "muted", "muted-foreground", "destructive", "destructive-foreground",
    "card", "card-foreground", "border", "input", "ring",
  ];
  const FONT_KEYS = ["font-sans", "font-heading", "font-mono"];
  const SYSTEM_FONTS = new Set(["system-ui", "Georgia", "monospace", "serif", "sans-serif", "Arial", "Menlo", "ui-sans-serif", "ui-serif", "ui-monospace"]);
  const FALLBACK = { "font-sans": "sans-serif", "font-heading": "sans-serif", "font-mono": "monospace" };

  const toOklch = (value) => {
    const c = culori.converter("oklch")(culori.parse(value));
    if (!c) return value;
    const n = (x) => (x === undefined ? 0 : Number(x.toFixed(4)));
    return `oklch(${n(c.l)} ${n(c.c)} ${n(c.h)})`;
  };
  const toHex = (value) => culori.formatHex(culori.parse(value)) || "#000000";
  const famOf = (stack) => (stack || "").split(",")[0].trim().replace(/['"]/g, "");
  const isColor = (k) => COLOR_KEYS.includes(k) || /^(chart-|sidebar)/.test(k);

  const loadFont = (family) => {
    if (!family || SYSTEM_FONTS.has(family)) return;
    const id = "gf-" + family.replace(/\s+/g, "-").toLowerCase();
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id; link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${family.replace(/\s+/g, "+")}:wght@400;500;600;700&display=swap`;
    document.head.appendChild(link);
  };

  // ---- read the host app's current theme off :root -----------------------------------
  const root = document.documentElement;
  const mode = root.classList.contains("dark") ? "dark" : "light";
  const read = (k) => getComputedStyle(root).getPropertyValue("--" + k).trim();
  const baseline = {};          // values as the page shipped them (for the "changed" diff)
  const tokens = {};            // current working values
  for (const k of [...COLOR_KEYS, ...FONT_KEYS, "radius"]) {
    const v = read(k);
    if (v) { baseline[k] = v; tokens[k] = v; }
  }

  const apply = (k, v) => {
    tokens[k] = v;
    root.style.setProperty("--" + k, isColor(k) ? toOklch(v) : v);
  };

  // ---- panel (shadow DOM so host styles can't touch it, and vice versa) --------------
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;top:16px;right:16px;z-index:2147483647;";
  const sh = host.attachShadow({ mode: "open" });
  document.body.appendChild(host);

  sh.innerHTML = `
    <style>
      :host { all: initial; }
      .p { font: 13px/1.4 system-ui, sans-serif; width: 300px; max-height: 86vh; overflow:auto;
           background:#fff; color:#111; border:1px solid #e5e5e5; border-radius:12px;
           box-shadow:0 12px 40px rgba(0,0,0,.22); }
      .hd { display:flex; align-items:center; gap:8px; padding:10px 12px; cursor:move;
            border-bottom:1px solid #eee; font-weight:600; }
      .hd .x { margin-left:auto; cursor:pointer; border:none; background:none; font-size:16px; color:#888; }
      .bd { padding:10px 12px; display:flex; flex-direction:column; gap:10px; }
      label.row { display:flex; align-items:center; justify-content:space-between; gap:8px; }
      label.row span { color:#555; font-size:12px; }
      select, input[type=range] { font:inherit; }
      input[type=color] { width:34px; height:24px; padding:0; border:1px solid #ddd; border-radius:6px; background:none; }
      .grid { display:grid; grid-template-columns:1fr 1fr; gap:6px 10px; }
      .btns { display:flex; gap:6px; }
      button.b { flex:1; cursor:pointer; border:1px solid #d4d4d4; border-radius:8px; padding:7px 8px;
                 background:#fafafa; font:inherit; }
      button.b:hover { background:#f0f0f0; }
      button.b.pri { background:#171717; color:#fff; border-color:#171717; }
      .sec { font-size:11px; text-transform:uppercase; letter-spacing:.04em; color:#999; margin-top:2px; }
      .note { font-size:11px; color:#999; }
    </style>
    <div class="p">
      <div class="hd">🎨 tweakbasecoat <span class="note" id="mode"></span><button class="x" id="close">×</button></div>
      <div class="bd">
        <label class="row"><span>theme preset</span><select id="presets"><option>loading…</option></select></label>
        <div class="sec">colors (${mode})</div>
        <div class="grid" id="colors"></div>
        <div class="sec">type & radius</div>
        <div id="type"></div>
        <label class="row"><span>radius</span><input type="range" id="radius" min="0" max="2" step="0.025"></label>
        <div class="btns">
          <button class="b pri" id="copy">Copy CSS</button>
          <button class="b" id="agent">Copy for agent</button>
        </div>
        <div class="note" id="status">Edits apply live to this page. Nothing is saved to the site.</div>
      </div>
    </div>`;

  const $ = (s) => sh.querySelector(s);
  $("#mode").textContent = mode + " mode";

  // color swatches
  const colorsEl = $("#colors");
  for (const k of COLOR_KEYS) {
    if (!tokens[k]) continue;
    const lab = document.createElement("label");
    lab.className = "row";
    lab.innerHTML = `<span>${k}</span>`;
    const inp = document.createElement("input");
    inp.type = "color";
    try { inp.value = toHex(tokens[k]); } catch { inp.value = "#888888"; }
    inp.oninput = () => apply(k, inp.value);
    lab.appendChild(inp);
    colorsEl.appendChild(lab);
  }

  // font dropdowns — options pooled from presets once they load
  const fontSelects = {};
  const typeEl = $("#type");
  for (const k of FONT_KEYS) {
    const lab = document.createElement("label");
    lab.className = "row";
    lab.innerHTML = `<span>${k.replace("font-", "")}</span>`;
    const sel = document.createElement("select");
    sel.onchange = () => {
      const fam = sel.value;
      loadFont(fam);
      apply(k, SYSTEM_FONTS.has(fam) ? fam : `${fam}, ${FALLBACK[k]}`);
    };
    fontSelects[k] = sel;
    lab.appendChild(sel);
    typeEl.appendChild(lab);
  }

  // radius
  const radiusEl = $("#radius");
  radiusEl.value = parseFloat(tokens.radius) || 0.625;
  radiusEl.oninput = () => apply("radius", radiusEl.value + "rem");

  // presets + font menus from the hosted bundle
  const presetSel = $("#presets");
  let presets = [];
  fetch(new URL("presets.json", BASE))
    .then((r) => r.json())
    .then((list) => {
      presets = list;
      presetSel.innerHTML = `<option value="">— pick a theme —</option>` +
        list.map((p, i) => `<option value="${i}">${p.name}</option>`).join("");
      // pool every family any preset ships, per category
      const text = new Set(), monoS = new Set();
      for (const p of list) for (const t of [p.light, p.dark]) {
        if (!t) continue;
        for (const kk of ["font-sans", "font-serif", "font-heading"]) if (t[kk]) text.add(famOf(t[kk]));
        if (t["font-mono"]) monoS.add(famOf(t["font-mono"]));
      }
      const opts = (arr, cur) => [...new Set([cur, ...arr].filter(Boolean))]
        .map((f) => `<option${f === cur ? " selected" : ""}>${f}</option>`).join("");
      const textArr = [...text].filter((f) => !monoS.has(f)).sort();
      fontSelects["font-sans"].innerHTML = opts(textArr, famOf(tokens["font-sans"]));
      fontSelects["font-heading"].innerHTML = opts(textArr, famOf(tokens["font-heading"]));
      fontSelects["font-mono"].innerHTML = opts([...monoS].sort(), famOf(tokens["font-mono"]));
    })
    .catch(() => { presetSel.innerHTML = `<option>presets unavailable</option>`; });

  presetSel.onchange = () => {
    const p = presets[+presetSel.value];
    if (!p) return;
    const src = (mode === "dark" ? p.dark : p.light) || p.light;
    for (const [k, v] of Object.entries(src)) {
      if (k in tokens || isColor(k) || k.startsWith("font-")) apply(k, v);
    }
    if (p.radius != null) { apply("radius", p.radius + "rem"); radiusEl.value = p.radius; }
    syncControls();
  };

  const syncControls = () => {
    colorsEl.querySelectorAll("label").forEach((lab, idx) => {
      const k = COLOR_KEYS[idx];
      const inp = lab.querySelector("input");
      if (inp && tokens[k]) try { inp.value = toHex(tokens[k]); } catch {}
    });
    for (const k of FONT_KEYS) { const fam = famOf(tokens[k]); if (fam) { loadFont(fam); fontSelects[k].value = fam; } }
  };

  // ---- export -----------------------------------------------------------------------
  const sel = mode === "dark" ? ".dark" : ":root";
  const emit = (k, v) => (isColor(k) ? toOklch(v) : v);
  const block = (entries) => `${sel} {\n${entries.map(([k, v]) => `  --${k}: ${emit(k, v)};`).join("\n")}\n}\n`;
  const fullCss = () => block(Object.entries(tokens));
  const changedCss = () => {
    const changed = Object.entries(tokens).filter(([k, v]) => !(k in baseline) || emit(k, v) !== emit(k, baseline[k]));
    return changed.length ? block(changed) : "/* no changes yet */";
  };

  const flash = (msg) => { const s = $("#status"); const old = s.textContent; s.textContent = msg; setTimeout(() => (s.textContent = old), 1400); };
  $("#copy").onclick = () => navigator.clipboard.writeText(fullCss()).then(() => flash("✓ full theme copied"));
  $("#agent").onclick = () => {
    const prompt = `Apply this Basecoat theme override to my global stylesheet (the \`${sel}\` block). Only these tokens changed:\n\n\`\`\`css\n${changedCss()}\`\`\``;
    navigator.clipboard.writeText(prompt).then(() => flash("✓ agent prompt copied"));
  };

  // ---- drag + close -----------------------------------------------------------------
  let drag = null;
  $(".hd").addEventListener("mousedown", (e) => {
    if (e.target.id === "close") return;
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
  $("#close").onclick = () => (host.style.display = host.style.display === "none" ? "" : "none");

  window.__tbInject = { toggle: () => (host.style.display = host.style.display === "none" ? "" : "none") };
}
