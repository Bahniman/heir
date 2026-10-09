/* Liquid Glass layer for the phone. It only enhances what game.js renders; it never changes game state.
   - Refraction: on Chromium, each floating glass control gets an SVG displacement filter built for its own size,
     strong at the rim and neutral in the middle, so content bends at the edges and stays clear in the centre.
     Other engines keep the blur-and-saturate glass already in the stylesheet.
   - Light: a specular rim that follows the pointer across the phone.
   - Motion: spring curves (CSS linear()), a tab bar that shrinks on scroll down and returns on scroll up,
     an inline title that appears when the large title scrolls away, sheets that can be dragged down,
     the screen behind an open sheet recedes, and a swipe up on the lock screen unlocks. */
(function () {
"use strict";
const root = document.documentElement;
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
const LESS_GLASS = matchMedia("(prefers-reduced-transparency: reduce)").matches;
const CHROMIUM = /(Chrome|Chromium)\//.test(navigator.userAgent) && !/Firefox\//.test(navigator.userAgent); // Chrome, Edge, Brave, Arc; Safari and iOS browsers have no "Chrome/" token

// ---------------------------------------------------------------- springs as CSS linear() curves
function spring(stiffness, damping, mass, ms) {
  const pts = [], n = 60; let x = 0, v = 0; const dt = ms / 1000 / n / 8;
  for (let i = 0; i <= n; i++) {
    pts.push(Math.round(x * 1000) / 1000);
    for (let k = 0; k < 8; k++) { const a = (-stiffness * (x - 1) - damping * v) / mass; v += a * dt; x += v * dt; }
  }
  pts[pts.length - 1] = 1;
  return `linear(${pts.join(", ")})`;
}
if (!REDUCED && CSS.supports("transition-timing-function", "linear(0, 1)")) {
  root.style.setProperty("--spring", spring(170, 17, 1, 620));        // a little overshoot, like a UIKit spring with bounce
  root.style.setProperty("--spring-soft", spring(210, 26, 1, 520));   // settles without visible overshoot
  root.style.setProperty("--spring-snappy", spring(420, 30, 1, 360)); // presses and toggles
}

// ---------------------------------------------------------------- refraction maps
const GLASS = ".ph .tabbar, .ph .sh-in, .ph .fwd, .ph .lk-note, .ph .perm, .ph .saf-url, .ph .saf-bar, .ph .ph-nav";
const svgNS = "http://www.w3.org/2000/svg";
let defs = null, uid = 0;
const mapCache = new Map();
function ensureDefs() {
  if (defs) return defs;
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("width", "0"); svg.setAttribute("height", "0"); svg.setAttribute("aria-hidden", "true");
  svg.style.cssText = "position:absolute;width:0;height:0;overflow:hidden";
  defs = document.createElementNS(svgNS, "defs"); svg.appendChild(defs); document.body.appendChild(svg);
  return defs;
}
// Displacement map for a rounded rectangle: R and G hold the x and y push, 128 means none.
// Inside a bezel band near the rim, pixels are pushed along the inward normal, harder the closer to the edge,
// which reads as a thick glass lens. The middle stays neutral.
function dispMap(w, h, r, bezel) {
  const key = [w, h, r, bezel].join("x");
  if (mapCache.has(key)) return mapCache.get(key);
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d"), img = g.createImageData(w, h), d = img.data;
  r = Math.min(r, w / 2, h / 2);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    // signed distance to the rounded rect edge (positive inside), and the outward normal
    const px = x + 0.5 - w / 2, py = y + 0.5 - h / 2;
    const qx = Math.abs(px) - (w / 2 - r), qy = Math.abs(py) - (h / 2 - r);
    let dist, nx, ny;
    if (qx > 0 && qy > 0) { const l = Math.hypot(qx, qy); dist = r - l; nx = qx / l; ny = qy / l; }
    else if (qx > qy) { dist = r - qx; nx = 1; ny = 0; } else { dist = r - qy; nx = 0; ny = 1; }
    nx *= Math.sign(px) || 1; ny *= Math.sign(py) || 1;
    let m = 0;
    if (dist > 0 && dist < bezel) { const t = 1 - dist / bezel; m = t * t * (3 - 2 * t); }
    const i = (y * w + x) * 4;
    d[i] = 128 - nx * m * 127; d[i + 1] = 128 - ny * m * 127; d[i + 2] = 128; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const url = c.toDataURL();
  mapCache.set(key, url);
  return url;
}
function refract(el) {
  if (!CHROMIUM || LESS_GLASS) return;
  const w = Math.round(el.offsetWidth), h = Math.round(el.offsetHeight);
  if (w < 24 || h < 16) return;
  const cs = getComputedStyle(el), r = Math.min(parseFloat(cs.borderTopLeftRadius) || 0, h / 2);
  const sig = `${w}x${h}x${Math.round(r)}`;
  if (el.dataset.lg === sig) return;
  const id = el.dataset.lgId || ("lg" + ++uid);
  el.dataset.lgId = id; el.dataset.lg = sig;
  let f = document.getElementById(id);
  if (!f) { f = document.createElementNS(svgNS, "filter"); f.id = id; ensureDefs().appendChild(f); }
  const bezel = Math.max(10, Math.min(22, h * 0.32)), scale = Math.min(34, 10 + h * 0.18);
  f.setAttribute("x", "0"); f.setAttribute("y", "0"); f.setAttribute("width", w); f.setAttribute("height", h);
  f.setAttribute("filterUnits", "userSpaceOnUse"); f.setAttribute("color-interpolation-filters", "sRGB");
  f.innerHTML = `<feImage href="${dispMap(w, h, r, bezel)}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none" result="map"/>
    <feGaussianBlur in="SourceGraphic" stdDeviation="0.6" result="soft"/>
    <feDisplacementMap in="soft" in2="map" scale="${scale}" xChannelSelector="R" yChannelSelector="G"/>`;
  el.style.setProperty("--lg-filter", `url(#${id})`);
  el.classList.add("lg-refract");
}
function enhanceAll() {
  document.querySelectorAll(GLASS).forEach((el) => { if (!el.closest(".ph-ghost")) refract(el); });
}

// ---------------------------------------------------------------- light that follows the pointer
let lightRaf = 0;
document.addEventListener("pointermove", (e) => {
  const ph = document.getElementById("ph"); if (!ph || REDUCED) return;
  if (lightRaf) return;
  lightRaf = requestAnimationFrame(() => {
    lightRaf = 0;
    const r = ph.getBoundingClientRect();
    const lx = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), ly = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
    ph.style.setProperty("--lx", lx.toFixed(3)); ph.style.setProperty("--ly", ly.toFixed(3));
  });
}, { passive: true });

// ---------------------------------------------------------------- scroll: tab bar minimises, inline title appears
let lastY = 0, bound = null;
function bindScroll() {
  const phs = document.getElementById("phs"); if (!phs || phs === bound) return;
  bound = phs; lastY = phs.scrollTop;
  phs.addEventListener("scroll", () => {
    const y = phs.scrollTop, dy = y - lastY, bar = document.querySelector("#tabs .tabbar"), ph = document.getElementById("ph");
    if (bar && Math.abs(dy) > 4) {
      if (dy > 0 && y > 60) bar.classList.add("min");
      else if (dy < 0 || y < 30) bar.classList.remove("min");
    }
    if (ph) ph.classList.toggle("titled", y > 46 && !!phs.querySelector(".ph-head"));
    lastY = y;
  }, { passive: true });
}
// the minimised tab bar is a small pill holding the current tab; tapping it opens the full bar again
document.addEventListener("click", (e) => {
  const mini = e.target.closest && e.target.closest("#tabs .tab-mini");
  if (mini) { const bar = document.querySelector("#tabs .tabbar"); if (bar) bar.classList.remove("min"); }
}, true);
function ensureMini() {
  const tabs = document.getElementById("tabs"); if (!tabs) return;
  const bar = tabs.querySelector(".tabbar"); let mini = tabs.querySelector(":scope > .tab-mini");
  if (!bar) { if (mini) mini.remove(); return; }
  const phs = document.getElementById("phs"); // nothing left to scroll (the list emptied): bring the full bar back
  if (bar.classList.contains("min") && phs && phs.scrollHeight - phs.clientHeight < 24) bar.classList.remove("min");
  if (!mini) { mini = document.createElement("button"); mini.type = "button"; mini.className = "tab-mini"; mini.setAttribute("aria-label", "Show all tabs"); tabs.appendChild(mini); }
  const on = bar.querySelector("button.on") || bar.querySelector("button"); const html = on ? on.innerHTML : "";
  if (mini.dataset.src !== html) { mini.innerHTML = html; mini.dataset.src = html; }
  mini.tabIndex = bar.classList.contains("min") ? 0 : -1;
}
function ensureNav() {
  const ph = document.getElementById("ph"); if (!ph) return;
  let nav = ph.querySelector(":scope > .ph-nav");
  if (!nav) { nav = document.createElement("div"); nav.className = "ph-nav"; nav.setAttribute("aria-hidden", "true"); ph.appendChild(nav); }
  const head = document.querySelector("#phs .ph-head"), t = head ? (head.firstChild && head.firstChild.nodeType === 3 ? head.firstChild.textContent : head.textContent).trim() : "";
  if (t && nav.textContent !== t) nav.textContent = t; // keep the old title while the pill fades out, so it never shrinks to an empty bubble
  if (!head) ph.classList.remove("titled");
}

// ---------------------------------------------------------------- sheets: grabber, drag down to dismiss, content recedes
function wireSheet(sh) {
  if (sh.dataset.lgWired) return; sh.dataset.lgWired = "1";
  const inner = sh.querySelector(".sh-in"); if (!inner) return;
  if (!inner.querySelector(".sh-grab")) { const g = document.createElement("i"); g.className = "sh-grab"; g.setAttribute("aria-hidden", "true"); inner.prepend(g); }
  let y0 = null, dy = 0, t0 = 0;
  inner.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button, textarea, input, a, [data-pr]")) return;
    // drag only from the grabber strip at the top, so text and lists inside the sheet still scroll on touch
    const z = (inner.getBoundingClientRect().height / inner.offsetHeight) || 1;
    if (!e.target.closest(".sh-grab") && e.clientY - inner.getBoundingClientRect().top > 46 * z) return;
    y0 = e.clientY; dy = 0; t0 = performance.now(); inner.setPointerCapture(e.pointerId); inner.classList.add("dragging");
  });
  inner.addEventListener("pointermove", (e) => {
    if (y0 === null) return;
    const z = (document.getElementById("ph").getBoundingClientRect().width / document.getElementById("ph").offsetWidth) || 1;
    const raw = (e.clientY - y0) / z;
    dy = raw > 0 ? raw : -Math.pow(-raw, 0.7); // pulling up rubber-bands
    inner.style.transform = `translateY(${dy}px)`;
  });
  const end = () => {
    if (y0 === null) return;
    const v = dy / Math.max(1, performance.now() - t0);
    y0 = null; inner.classList.remove("dragging"); inner.style.transform = "";
    if (dy > inner.offsetHeight * 0.28 || v > 0.6) {
      const close = inner.querySelector("#shBack, #shUndo, #fwX");
      if (close) close.click(); else if (window.HeirGame) window.HeirGame.closeSheet();
    }
  };
  inner.addEventListener("pointerup", end); inner.addEventListener("pointercancel", end);
}
function syncSheet() {
  const ph = document.getElementById("ph"); if (!ph) return;
  const open = ph.querySelector(".sheet.up:not(.leaving)");
  ph.classList.toggle("sheeted", !!open);
  ph.querySelectorAll(".sheet").forEach(wireSheet);
}

// ---------------------------------------------------------------- lock screen: swipe up to unlock
function wireLock() {
  const lock = document.querySelector("#phs .lock"); if (!lock || lock.dataset.lgWired) return;
  lock.dataset.lgWired = "1";
  let y0 = null, dy = 0;
  const hint = document.createElement("div"); hint.className = "lk-swipe"; hint.textContent = "Swipe up to open"; lock.appendChild(hint);
  lock.addEventListener("pointerdown", (e) => { if (e.target.closest("button")) return; y0 = e.clientY; dy = 0; lock.setPointerCapture(e.pointerId); });
  lock.addEventListener("pointermove", (e) => { if (y0 === null) return; dy = Math.min(0, e.clientY - y0); lock.style.transform = `translateY(${dy * 0.6}px)`; lock.style.opacity = String(1 + dy / 500); });
  const end = () => { if (y0 === null) return; y0 = null; const go = dy < -70; lock.style.transform = ""; lock.style.opacity = "";
    if (go) { const b = document.getElementById("lkOpen"); if (b) b.click(); } };
  lock.addEventListener("pointerup", end); lock.addEventListener("pointercancel", end);
}

// ---------------------------------------------------------------- a light tick on phones that support it (Android), like a haptic
document.addEventListener("pointerdown", (e) => {
  if (e.pointerType !== "touch" || !navigator.vibrate) return;
  if (e.target.closest && e.target.closest(".ph button, .ph .lk-note, .ph .hz")) { try { navigator.vibrate(8); } catch (err) { /* not allowed here */ } }
}, { passive: true });

// ---------------------------------------------------------------- keep everything in step with what game.js renders
let pending = false;
function tick() {
  pending = false;
  bindScroll(); ensureNav(); ensureMini(); syncSheet(); wireLock(); enhanceAll();
}
new MutationObserver(() => { if (!pending) { pending = true; requestAnimationFrame(tick); } })
  .observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "data-mode"] });
addEventListener("resize", () => { document.querySelectorAll(".lg-refract").forEach((el) => delete el.dataset.lg); requestAnimationFrame(tick); });
root.classList.toggle("lg-chromium", CHROMIUM && !LESS_GLASS);
tick();
})();
