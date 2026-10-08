(function () {
"use strict";
const H = window.HeirEngine;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmt = (s, yr = true) => { if (!s) return ""; const d = new Date(s + "T00:00:00Z"); return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: yr ? "numeric" : undefined, timeZone: "UTC" }); };
const GAPK = ["commitment", "promise", "lead_time", "claim", "criterion", "restriction"];
const QT = { "Inherited commitment, no owner": "Who owns last year's unsent sponsor report?", "Conflicting records": "Which airfare rule is right?",
  "Access held outside the team": "Who should hold the website and YouTube logins?", "Deadline can no longer be met": "A planned task is past its date", "Silent after follow-up": "Still no reply after a follow-up", "Suspicious instruction in mail": "An email asked Heir for the club logins", "Contract conflict": "A rival sponsor offered INR 60,000" };
const QS = { "Inherited commitment, no owner": "Aditi owed the sponsor a report, then graduated. The sponsor has already chased it.", "Conflicting records": "Neel told a speaker their airfare would be reimbursed, but the club's policy says it isn't.",
  "Access held outside the team": "Only the faculty advisor can log in. Nobody on your team has access.", "Deadline can no longer be met": "Its date has passed and it isn't done yet.", "Silent after follow-up": "The office has gone quiet again.", "Suspicious instruction in mail": "It claims to be from Neel, but it comes from an outside address and talks to \"the AI assistant\". Heir treats what emails say as information, never as orders, so nothing was sent.", "Contract conflict": "BrightPath wants to be title sponsor, but last year's Quillstone deal rules out any other education sponsor this year. Saying yes would break it." };
const ANS = {
  "Inherited commitment, no owner": [["Kabir. Send it, with an apology", "owner: Kabir. Send it now with an apology"], ["Riya", "owner: Riya. Send it now with an apology"]],
  "Conflicting records": [["Policy stands: no airfare", "Policy stands: airfare is not covered. Say so plainly if asked"], ["Cover airfare this year", "Airfare is covered this year for confirmed speakers"]],
  "Access held outside the team": [["Ask the advisor for access", "Request delegated access from the faculty advisor"], ["Leave it for now", "Leave access with the faculty advisor this year"]],
  "Deadline can no longer be met": [["It is done", "Mark done: handled outside Heir"], ["Move it a week", "Move it a week"]],
  "Silent after follow-up": [["We will call them", "Call the Estate Office today"], ["Use the fallback hall", "Switch to the fallback hall"]],
  "Contract conflict": [["Decline politely", "Decline: the Quillstone exclusivity stands"], ["Ask Quillstone first", "Ask Quillstone before we answer BrightPath"]],
  "Suspicious instruction in mail": [["Not genuine. Flag it", "Not genuine: flag as phishing and warn the committee"], ["I'll check with Neel", "Ishaan will check with Neel directly; Heir sends nothing"]],
};
const SETTLE = (e) => e.reason === "Inherited commitment, no owner" && /settlement/i.test(e.question);
const qt = (e) => e.title ? e.title : e.reason === "Deadline can no longer be met" ? `"${e.question.split(" was due")[0]}" slipped past its date` : SETTLE(e) ? "Who submits last year's accounts?" : QT[e.reason] || e.reason;
const qs = (e) => e.why ? e.why : SETTLE(e) ? "Nobody took on the Summit 2026 settlement, and Student Affairs is holding this year's grant until it arrives." : QS[e.reason] || "";
const ans = (e) => e.opts ? e.opts.map((o) => [o, o]) : SETTLE(e) ? [["Riya. Send it now", "owner: Riya. Send it now with an apology"], ["Kabir", "owner: Kabir. Send it now with an apology"]] : ANS[e.reason] || [["Noted", "Noted"]];
const DAYS = ["2027-05-20", "2027-05-27", "2027-05-28", "2027-06-04"];
const nameOf = (a) => ({ "estate.office": "the Estate Office", partnerships: "Quillstone", guesthouse: "the Guest House", orders: "PrintPoint" }[a.split("@")[0]] ||
  a.split("@")[0].split(/[._]/).filter((p) => !/^\d+$/.test(p)).map((p) => p[0].toUpperCase() + p.slice(1)).join(" "));
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const keysOf = (r) => r.evidence.split(" | ").map((x) => (x.trim().match(/^(?:done: )?(mail:m\d+|whatsapp:\d+|capture:c\d+)/) || [])[1]).filter(Boolean);

// the pile
const X0 = H.createState();
const HANDOVER = X0.drive["Handover_2026-27.md"].trim();
const X1 = H.createState(); H.run(X1, "2027-03-10");
const HIDDEN = X1.ledger.filter((r) => GAPK.includes(r.kind)).length;
const PILE = [{ key: "handover", type: "Handover doc", title: "Handover_2026-27.md", who: "The old team", body: HANDOVER, hand: true }]
  .concat(X0.mail.filter((m) => m.date <= "2027-04-01").map((m) => ({ key: "mail:" + m.id, type: "Email · " + fmt(m.date), title: m.subject, who: m.from.includes("meridian.mock") ? "Club mailbox" : nameOf(m.from), body: `From ${m.from}\nTo ${m.to}\n\n${m.body}` })))
  .concat([{ key: "chat", type: "Chat export", title: "Core team group", who: "6 messages", lines: X0.drive["whatsapp_export_core_team.txt"].split("\n").filter((l) => l.startsWith("[")).map((t, i) => ({ key: "whatsapp:" + i, t })) },
    { key: "capture:c01", type: "Voice note", title: "After the event", who: "Neel", body: X0.captures[0].text },
    { key: "drive:pol", type: "Drive file", title: "Speaker_Policy.md", who: "Drive", body: X0.drive["Speaker_Policy.md"].trim() },
    { key: "drive:trk", type: "Drive file", title: "Outreach_Tracker.csv", who: "Drive", body: X0.drive["Outreach_Tracker.csv"].trim() }]);

let S, pins, t0, timer, taps, di, seen;
const SCR = ["land", "hand", "search", "score", "setup", "run", "end"];
function go(name, html, keep) {
  if (name !== "setup" && name !== "run") curScr = null;
  const i = SCR.indexOf(name);
  $("dots").innerHTML = SCR.map((s, j) => `<b class="${j < i ? "done" : j === i ? "on" : ""}"></b>`).join("");
  $("toast").className = "toast";
  const st = $("stage"), old = st.querySelector(".scr"), fade = !!old && !REDUCED;
  hideCoach(true);
  // the old screen fades out quickly on its own; the new one waits until it is gone, so the two never overlap
  if (fade) {
    const r = old.getBoundingClientRect(), g = old.cloneNode(true);
    g.querySelectorAll("[id]").forEach((e) => e.removeAttribute("id")); g.removeAttribute("id"); g.querySelectorAll(".tapme").forEach((e) => e.classList.remove("tapme"));
    g.className = "scr scr-out"; g.setAttribute("aria-hidden", "true");
    Object.assign(g.style, { left: r.left + "px", top: r.top + "px", width: r.width + "px" });
    document.body.appendChild(g); setTimeout(() => g.remove(), 220);
  }
  st.style.alignItems = ""; // undo the end screen's pin
  st.innerHTML = `<section class="scr enter${fade ? " after" : ""}">${html}</section>`;
  stagger(st.querySelector(".scr"), fade ? 110 : 0);
  if (!keep) window.scrollTo(0, 0);
}
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
// once an entrance has played, take it off the element. A finished animation that stays applied blocks later
// transitions on the same properties (a press, a slide-out), which then jump instead of moving.
document.addEventListener("animationend", (e) => {
  const t = e.target, n = e.animationName;
  if ((n === "rise" && t.classList.contains("rise")) || (n === "drop" && t.classList.contains("lk-note"))) t.style.animation = "none";
  else if (n === "cardin" && t.classList.contains("new")) t.classList.remove("new");
  else if (t.id === "phs" && /^in(push|fade|launch|unlock|lock)$/.test(n)) t.classList.remove("in-push", "in-fade", "in-launch", "in-unlock", "in-lock");
});
const RISE = ".k, .big, .mid, .lede, .act, .land > .paper, .rounds > *, .vs > *, .miss > div, .also, .tiles > *, .bar, .side.l, .ph-col, .side.r, .two > *, .final";
function stagger(root, base) {
  if (!root) return; base = base || 0;
  root.querySelectorAll(RISE).forEach((e, i) => { e.classList.add("rise"); e.style.setProperty("--d", base + Math.min(i * 45, 360) + "ms"); });
  root.querySelectorAll(".pile > .card").forEach((e, i) => { e.classList.add("rise"); e.style.setProperty("--d", base + 120 + i * 22 + "ms"); });
}
function countUp(el, to, ms) {
  if (!el || REDUCED) return; const t0 = performance.now(), fmtN = (v) => String(Math.round(v));
  const step = (t) => { const p = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - p, 3); el.textContent = fmtN(to * e); if (p < 1) requestAnimationFrame(step); };
  el.textContent = "0"; requestAnimationFrame(step);
}
function closeModal(m) { if (!m || m.classList.contains("out")) return; m.classList.add("out"); setTimeout(() => m.remove(), 180); }
function toast(m, good) { const t = $("toast"); t.textContent = m; t.className = "toast show" + (good ? " good" : ""); clearTimeout(toast.h); toast.h = setTimeout(() => (t.className = "toast"), 2600); }
function burst() { const b = document.createElement("div"); b.className = "burst"; b.innerHTML = Array.from({ length: 28 }, (_, i) => `<i style="--a:${i * 360 / 28}deg;--d:${90 + (i % 5) * 34}px;--c:${["#ff4fa3", "#1f5cff", "#ffe14f", "#1d1a16"][i % 4]}"></i>`).join(""); document.body.appendChild(b); setTimeout(() => b.remove(), 1200); }

// 0. landing
function land() {
  if (typeof inApp !== "undefined") { inApp = false; welcome = false; }
  go("land", `<div class="land"><div><p class="k">A 5-minute prototype · you play the new committee head</p><h1 class="big">Your seniors graduated. <em>Their promises didn't.</em></h1>
    <p class="lede">The old team left you an eight-line handover. Somewhere in their files are things the club still owes people. <b>Can you find them?</b></p>
    <div class="act"><button class="pk-btn pri" id="b1" type="button">Take over →</button></div></div>
    <div class="paper tilt"><h5>What they left you</h5><pre>${esc(HANDOVER)}</pre></div></div>`);
  $("b1").onclick = hand;
}
// 1. handover
function hand() {
  go("hand", `<div class="c"><p class="k">1 April 2027 · Meridian Club, a mock club</p><h2 class="mid">You're the new head.<br>Summit 2027 is in ${H.diffDays("2027-08-07", "2027-04-01")} days.</h2>
    <p class="lede">Before your first meeting, try to work out what the old team still owes: promises, debts, deadlines. <b>There are ${HIDDEN} hidden in their files</b>, and everyone who'd know has graduated.</p>
    <div class="rounds"><div class="rd on"><b>Round 1 · without Heir</b><span>The usual way: just you, their files and not much time. The 2-minute clock stands in for your first busy week.</span></div><div class="rd"><b>Round 2 · with Heir</b><span>Heir reads the same files. Then you put Heir on your phone and run the club with it.</span></div></div>
    <div class="act"><button class="pk-btn pri" id="b2" type="button">Start round 1 · open their files</button></div></div>`);
  $("b2").onclick = search;
}
// 2. search
const LIMIT = 120;
function search() {
  pins = new Set(); t0 = Date.now(); searchT0 = Date.now();
  go("search", `<div class="bar"><h2><span class="wo">Round 1 · without Heir</span>Open a file and pin anything the club still owes.</h2><div class="clock"><b id="clk">2:00</b><span><span id="np">0</span> pinned</span><button class="pk-btn" id="b3" type="button">Done</button></div></div><div class="pile" id="pile"></div>`);
  drawPile(); $("b3").onclick = score;
  clearInterval(timer);
  timer = setInterval(() => { const c = $("clk"); if (!c) return clearInterval(timer); const left = Math.max(0, LIMIT - Math.floor((Date.now() - t0) / 1000));
    c.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`; c.classList.toggle("hot", left <= 20); if (!left) score(); }, 250);
}
const nPinned = (it) => it.lines ? it.lines.filter((l) => pins.has(l.key)).length : pins.has(it.key) ? 1 : 0;
function drawPile() {
  $("pile").innerHTML = PILE.map((it, i) => `<button type="button" class="card ${it.hand ? "hand" : ""} ${nPinned(it) ? "pinned" : ""}" data-i="${i}"><span class="t">${esc(it.type)}</span><b>${esc(it.title)}</b><span class="w">${esc(it.who)}</span>${nPinned(it) ? `<span class="pn">${nPinned(it)}</span>` : ""}</button>`).join("");
  $("pile").querySelectorAll(".card").forEach((b) => (b.onclick = () => open(PILE[+b.dataset.i])));
  $("np").textContent = pins.size;
}
function open(it) {
  const m = document.createElement("div"); m.className = "modal";
  const pb = (k) => `<button type="button" class="pin ${pins.has(k) ? "on" : ""}" data-p="${k}">${pins.has(k) ? "Pinned" : "Pin"}</button>`;
  const draw = () => {
    m.innerHTML = `<div class="paper"><h5>${esc(it.type)} · ${esc(it.who)}</h5><div class="body"><h4>${esc(it.title)}</h4>${it.lines ? it.lines.map((l) => `<div class="ln"><span>${esc(l.t)}</span>${pb(l.key)}</div>`).join("") : `<pre>${esc(it.body)}</pre>`}</div>
      <div class="row">${it.lines || it.hand ? "" : pb(it.key)}<button type="button" class="pk-btn" data-x>Close</button></div></div>`;
    // pinning updates the button in place: redrawing the paper replayed its pop-in and reset a long email to the top
    m.querySelectorAll("[data-p]").forEach((b) => (b.onclick = () => { const k = b.dataset.p, on = !pins.has(k); on ? pins.add(k) : pins.delete(k);
      b.classList.toggle("on", on); b.textContent = on ? "Pinned" : "Pin"; drawPile(); }));
    m.querySelector("[data-x]").onclick = () => closeModal(m);
  };
  m.onclick = (e) => { if (e.target === m) closeModal(m); };
  draw(); document.body.appendChild(m);
}
// 3. score
function score() {
  if (!$("pile")) return;
  clearInterval(timer); document.querySelectorAll(".modal").forEach((m) => m.remove());
  S = H.createState(); const a = performance.now(); H.run(S, "2027-03-10"); const ms = Math.max(1, Math.round(performance.now() - a));
  const gap = S.ledger.filter((r) => GAPK.includes(r.kind)); const found = gap.filter((r) => keysOf(r).some((k) => pins.has(k)));
  const L = (id) => S.ledger.find((r) => r.id === id), f = (r) => found.includes(r);
  const card = (r, head, line) => `<div><span class="tag ${f(r) ? "y" : "n"}">${f(r) ? "You found it" : "You missed it"}</span><b>${head}</b><p>${line}</p></div>`;
  go("score", `<div class="c"><p class="k">Round 2 · the same files, read by Heir</p><div class="vs"><div class="you"><b>${found.length}</b><span>You found</span></div><i>vs</i><div class="heir"><b>${gap.length}</b><span>Heir found</span></div></div>
    <p class="lede">Heir went through the same files in ${ms} ms, three weeks before the handover, and noted where every line came from.</p>
    <div class="miss">${card(L("L-103"), "Next year's club grant is frozen.", `Last year's accounts were due on ${fmt(L("L-103").due)}, but nobody took them on, so Student Affairs is holding the grant until they arrive.`)}
      ${card(L("L-101"), "Last year's sponsor deal still binds you.", "Quillstone is meant to be the only education sponsor this year. That's in one old email and nowhere in the handover.")}
      ${card(L("L-005"), "The \"done\" sponsor report was never sent.", `It's ${H.diffDays("2027-03-10", L("L-005").due)} days late, and the sponsor has already chased it.`)}</div>
    <p class="also">Heir also found a speaker who was promised a slot, another who was told airfare is covered when the policy says it isn't, the hall's 30-day booking rule, and logins only the faculty advisor holds.</p>
    <p class="lede" style="margin:30px auto 0">That was round 2. From here on, Heir works alongside you every day, <b>right from your phone</b>.</p>
    <div class="act"><button class="pk-btn pri" id="b4" type="button">Set Heir up on your phone →</button></div></div>`);
  countUp(document.querySelector(".vs .you b"), found.length, 700); countUp(document.querySelector(".vs .heir b"), gap.length, 1100);
  $("b4").onclick = () => { di = -1; taps = 0; seen = {}; rcpt = null; outs = null; busy = false; tabNow = "today"; lf = "all"; openRow = null; curScr = null; setup1(); };
}
// 4. the phone: setup, then every morning
let locked = true, rcpt = null, outs = null, busy = false, tabNow = "today", lf = "all", openRow = null, inApp = false, welcome = false;
const NOTE = `<p class="ph-note">The phone screens show how the app is meant to look. What's inside them (the ledger, plan, drafts and checks) comes from the real engine, running right here in the page.</p>`;
const spn = (k, html, cls) => `<div class="spn ${cls || ""}"><span class="spn-k">${k}</span>${html}</div>`;
let curScr = null;
// kinds: push (next screen in the same flow), fade (same app), launch (app opens from its icon),
// unlock (lock screen slides away), lock (phone locks for the night)
function phoneSwap(kind, update, origin) {
  const ph = $("ph"), phs = $("phs");
  if (!ph || !phs || REDUCED) { update(); return; }
  const g = document.createElement("div"); g.className = "ph-ghost g-" + kind; g.dataset.mode = ph.dataset.mode;
  g.innerHTML = `<div class="ph-scr">${phs.innerHTML}</div>` + ($("tabs").innerHTML ? `<div class="ghost-tabs">${$("tabs").innerHTML}</div>` : "");
  g.querySelectorAll("[id]").forEach((e) => e.removeAttribute("id")); g.querySelectorAll(".tapme").forEach((e) => e.classList.remove("tapme"));
  const shOld = ph.querySelector(".sheet:not(.leaving)");
  if (shOld) { shOld.querySelectorAll("[id]").forEach((e) => e.removeAttribute("id")); shOld.classList.add("leaving"); setTimeout(() => shOld.remove(), 200); }
  // the ghost sits between #phs and #tabs while it fades; styles that look for "#phs followed by #tabs" use ~, not +
  ph.insertBefore(g, $("tabs")); g.firstChild.scrollTop = phs.scrollTop;
  update();
  const n = $("phs");
  n.classList.remove("in-push", "in-fade", "in-launch", "in-unlock", "in-lock"); void n.offsetWidth;
  if (origin) n.style.transformOrigin = origin; else n.style.transformOrigin = "";
  n.classList.add("in-" + kind);
  setTimeout(() => g.remove(), 480);
}
function device(o) {
  // Same screen and the phone is already on the page: update the parts in place, so nothing jumps.
  if (curScr === o.scr && $("ph")) {
    swapIn($("sideL"), o.left || ""); swapIn($("sideR"), o.right || ""); swapIn($("ctl"), o.ctl || "");
    $("dchip").textContent = o.chip;
    phoneSwap(o.anim || "push", () => {
      $("ph").dataset.mode = o.mode || "app"; $("phTime").textContent = o.time || "7:02";
      $("tabs").innerHTML = "";
      const p = $("phs"); p.className = "ph-scr"; p.innerHTML = o.phone || ""; p.scrollTop = 0;
    }, o.origin);
    showPhone(true);
    return;
  }
  curScr = o.scr;
  go(o.scr, `<div class="dev">
    <aside class="side l"><div id="sideL">${o.left || ""}</div><div class="ctl" id="ctl">${o.ctl || ""}</div></aside>
    <div class="ph-col"><div class="ph-hd"><span class="dchip" id="dchip">${esc(o.chip)}</span><span class="nextbox" id="nextBox"><span>Next</span><b id="nextTxt"></b></span></div>
      <div class="ph-fit" id="phFit"><div class="ph" id="ph" data-mode="${o.mode || "app"}"><div class="ph-island"></div><div class="ph-top" id="phTop"><span id="phTime">${o.time || "7:02"}</span><span class="ph-ic">${SB}</span></div>
        <div class="ph-scr" id="phs">${o.phone || ""}</div><div id="tabs"></div><div class="ph-home"></div></div></div>
      ${NOTE}</div>
    <aside class="side r" id="sideR">${o.right || ""}</aside></div>`);
  fitPhone(); showPhone();
}
// a real iPhone 15/16 screen is 393 x 852 points; draw it at that size and scale the whole device to fit the window
// On a phone the unscaled device widened the layout viewport, so innerWidth read wider than the screen and the
// device never shrank: use the document's client width, and fit the height too so the whole device is on screen.
const vv = window.visualViewport;
const viewW = () => Math.min(innerWidth, document.documentElement.clientWidth || innerWidth, vv ? Math.round(vv.width * vv.scale) : innerWidth);
const viewH = () => Math.min(innerHeight, vv ? Math.round(vv.height * vv.scale) : innerHeight);
function fitPhone() {
  const f = $("phFit"), ph = $("ph"); if (!f || !ph) return;
  const W = 417, Ht = 876, vw = viewW(), small = vw < 900;
  const z = Math.min(1, (vw - 32) / W, (viewH() - (small ? 132 : 215)) / Ht);
  ph.style.transform = `scale(${z})`; f.style.width = W * z + "px"; f.style.height = Ht * z + "px";
}
// on a narrow screen the device comes first: put it just under the top bar instead of leaving its bottom off screen
// smooth: the phone changed after a tap below it (Sleep, Weeks pass), so glide back up to it, but only if it is out of view
function showPhone(smooth) {
  if (viewW() >= 900) return;
  const col = document.querySelector(".ph-col"), bar = document.querySelector(".g-top"); if (!col) return;
  const top = col.getBoundingClientRect().top, bh = bar ? bar.offsetHeight : 0;
  if (smooth && top >= bh - 4 && top < viewH() * 0.35) return;
  window.scrollTo({ top: Math.max(0, top + scrollY - bh - 10), behavior: smooth && !REDUCED ? "smooth" : "auto" });
}
addEventListener("resize", fitPhone);
const SB = `<svg viewBox="0 0 18 12" width="18" height="12"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="5" width="3" height="7" rx="1"/><rect x="10" y="2.5" width="3" height="9.5" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/></svg>
  <svg viewBox="0 0 16 12" width="16" height="12"><path d="M8 11.5 5.6 9a3.4 3.4 0 0 1 4.8 0zM3.5 6.9a6.4 6.4 0 0 1 9 0l-1.4 1.4a4.4 4.4 0 0 0-6.2 0zM1.3 4.7a9.5 9.5 0 0 1 13.4 0l-1.4 1.4a7.5 7.5 0 0 0-10.6 0z"/></svg>
  <svg viewBox="0 0 27 13" width="27" height="13"><rect x=".5" y=".5" width="23" height="12" rx="3.5" fill="none" stroke="currentColor" opacity=".4"/><rect x="2" y="2" width="17" height="9" rx="2"/><rect x="24.5" y="4.5" width="2" height="4" rx="1" opacity=".4"/></svg>`;
const setH = (n, h, p) => `<p class="k">Setup · step ${n} of 5</p><h3 class="sd-h">${h}</h3><p class="sd-p">${p}</p><div class="sdots">${[1, 2, 3, 4, 5].map((i) => `<b class="${i <= n ? "on" : ""}"></b>`).join("")}</div><button type="button" class="skip" id="skip">Skip setup →</button>`;
function bindSkip() { $("skip").onclick = () => setupDone(true); }

function setup1() {
  device({ scr: "setup", chip: "Mail app", time: "18:40",
    left: setH(1, "An invite from the club", "Heir already runs in the club's Google account. As soon as the old head adds you to the roster, you get this email."),
    phone: `<div class="ma"><div class="ma-h">Inbox</div>
      <div class="ma-open"><p class="ma-f"><b>Meridian Club</b> &lt;meridian.mock@campus.example&gt;<br>to you · 18:39</p><h4>You're the new committee head</h4>
      <p>Hi Ishaan,</p><p>Aditi has added you as head of Meridian Club. Heir has been keeping the club's records since March, so you'll start with everything the old team still owed.</p>
      <button type="button" class="ma-btn" id="t1">Open Heir</button><p class="ma-s">Sent by Heir from the club mailbox.</p></div>
      <div class="ma-it"><b>Campus IT</b><span>Password expiry notice</span></div><div class="ma-it"><b>Placement Cell</b><span>Pre-placement talk schedule</span></div></div>`,
    right: spn("Behind the scenes", "<p>Aditi, the outgoing head, added Ishaan to the club roster in Heir, and that's what sent this invite.</p>") });
  $("t1").onclick = setup2; bindSkip();
}
const SAFBAR = `<div class="saf-bar"><span>‹</span><span>›</span><button type="button" class="share" id="share" aria-label="Share">⇪</button><span>⧉</span></div>`;
function setup2() {
  device({ scr: "setup", chip: "Safari browser", time: "18:41", anim: "push",
    left: setH(2, "It opens as a website", "There's no app store and nothing to download. Heir is just a website that belongs to the club."),
    phone: `<div class="saf"><div class="saf-url">🔒 heir.campus.example/meridian</div><div class="saf-pg"><div class="hl"><i></i>Heir</div><p class="saf-c">Meridian Club</p>
      <button type="button" class="g-btn" id="t2"><b>G</b> Sign in with campus Google</button><small>Only people on the club roster can sign in.</small></div>${SAFBAR}</div>`,
    right: spn("Behind the scenes", "<p>Your campus Google account proves it's you, and the roster decides what you see. The head sees everything; members see only their own items.</p>") });
  $("t2").onclick = setup3; bindSkip();
}
function setup3() {
  device({ scr: "setup", chip: "Safari browser", time: "18:41", anim: "fade",
    left: setH(3, "Add it to your home screen", "Tap Share, then Add to Home Screen, and the website turns into an app icon. This kind of app is called a web app, or PWA."),
    phone: `<div class="saf"><div class="saf-url">🔒 heir.campus.example/meridian</div><div class="saf-pg"><div class="hl"><i></i>Heir</div><p class="saf-c">Signed in as ishaan.2027@campus.example<br><b>Committee head</b></p>
      </div>${SAFBAR}</div>`,
    right: spn("Why this step", "<p>On an iPhone, a website can only send notifications once it's on the home screen (iOS 16.4 or later). On Android, Chrome shows an Install app button instead.</p>") });
  const sh = $("share");
  sh.onclick = () => {
    const ph = $("ph"); const d = document.createElement("div"); d.className = "sheet";
    d.innerHTML = `<div class="sh-in"><p class="sh-k">heir.campus.example</p><div class="sh-row"><span>Copy</span></div><div class="sh-row"><span>Add to Reading List</span></div>
      <button type="button" class="sh-row hi" id="t3"><span>Add to Home Screen</span><i>⊞</i></button><div class="sh-row"><span>Add Bookmark</span></div></div>`;
    ph.appendChild(d); void d.offsetWidth; d.classList.add("up"); $("t3").onclick = setup4;
  };
  bindSkip();
}
function setup4() {
  const apps = ["Phone", "Mail", "Maps", "Photos", "Camera", "Notes", "Clock", "Calendar", "Music", "Weather", "Settings"];
  device({ scr: "setup", chip: "Home screen", time: "18:42", mode: "home", anim: "fade",
    left: setH(4, "Heir is now an app on your phone", "It's the same website, now full screen with its own icon. Tap it to open."),
    phone: `<div class="home"><div class="hg">${apps.map((a) => `<span><i></i>${a}</span>`).join("")}<button type="button" class="hz" id="t4"><i></i>Heir</button></div></div>`,
    right: spn("What it is", "<p>One website works on every phone and laptop, so nobody waits for an app store review and the club doesn't have to look after two apps.</p>") });
  $("t4").onclick = setup5; bindSkip();
}
function setup5() {
  const ic = $("t4"), pr = $("phs").getBoundingClientRect(), ir = ic ? ic.getBoundingClientRect() : null, z = pr.width / $("phs").offsetWidth || 1;
  device({ scr: "setup", chip: "Heir app", time: "18:42", anim: "launch", origin: ir ? `${(ir.left + ir.width / 2 - pr.left) / z}px ${(ir.top + ir.height / 2 - pr.top) / z}px` : "",
    left: setH(5, "Let Heir tap you on the shoulder", "Heir only asks once. If you allow it, you'll hear from it only when something actually needs you."),
    phone: `<div class="app0"><div class="hl big"><i></i>Heir</div><div class="perm"><b>"Heir" would like to send you notifications</b><span>Notifications may include alerts, sounds and icon badges.</span>
      <div><button type="button" id="no">Don't Allow</button><button type="button" id="yes">Allow</button></div></div></div>`,
    right: spn("If you say no", "<p>You'll still get the same list every morning at 7:00, as an email from the club mailbox. Nothing depends on notifications.</p>") });
  $("yes").onclick = () => setupDone(true); $("no").onclick = () => setupDone(false); bindSkip();
}
function setupDone(allowed) {
  welcome = true; inApp = true; tabNow = "today"; locked = false;
  device({ scr: "setup", chip: "Heir app · Today", time: "18:43", anim: "fade",
    left: `<p class="k">Setup done${allowed ? "" : " · email digest on"}</p><h3 class="sd-h">You're in. Have a look around.</h3><p class="sd-p">The tabs at the bottom are your dashboard: everything the club owes, the event plan, and a log of everything that's happened. They're there whenever you want them.</p>`,
    right: spn("Behind the scenes", "<p>The ledger lives in the club's Google account, not on your phone, so next year's head sees exactly this on their first day.</p>"),
    ctl: `<button type="button" class="pk-btn pri" id="b5">Weeks pass · go to 20 May →</button>` });
  paint();
  $("b5").onclick = () => { welcome = false; di = 0; H.run(S, DAYS[0]); morning(); };
}

// one morning: lock screen first, then the app
function morning() {
  locked = true; inApp = false; rcpt = null; tabNow = "today"; openRow = null;
  const today = S.meta.today, n = pending().length, first = pending()[0];
  const last = di >= DAYS.length - 1;
  device({ scr: "run", chip: "Lock screen", time: "7:02", mode: "lock", anim: "lock",
    left: dayPanel(), right: sideR(),
    phone: lockScreen(today, n, first ? first.title : ""),
    ctl: `<button type="button" class="pk-btn pri" id="b5">${last ? "See how it went →" : "Sleep · next morning →"}</button><button type="button" class="pk-btn ai-btn" id="aiBtn"><i>✦</i> Throw Heir a curveball · live AI</button>` });
  const unlock = () => phoneSwap("unlock", () => { locked = false; inApp = true; $("ph").dataset.mode = "app"; $("phTime").textContent = "7:03"; paint(); });
  $("aiBtn").onclick = () => { showPhone(true); if (!inApp) unlock(); aiTried = true; setTimeout(() => window.HeirAI && window.HeirAI.open(), inApp ? 0 : 380); };
  $("lkOpen").onclick = unlock;
  $("b5").onclick = sleep;
}
function sleep() {
  if (busy) return;
  if (di >= DAYS.length - 1) return end();
  di++;
  // day 3: the Estate Office finally answers the hall request, before any follow-up is approved
  if (di === 2 && H.canInject(S, "estate_approves")) H.inject(S, "estate_approves");
  if (window.HeirAI) window.HeirAI.reset();
  H.run(S, DAYS[di]); outs = overnightMail(); morning(); cheer();
}
function pending() {
  return S.escalations.filter((e) => e.status === "open").map((e) => ({ kind: "q", id: e.id, title: qt(e), e }))
    .concat(S.drafts.filter((d) => d.status === "pending approval").map((d) => ({ kind: "m", id: d.id, title: d.subject, d })));
}
function overnightMail() {
  const prev = DAYS[di - 1] || "2027-04-01", today = S.meta.today;
  const got = S.mail.filter((m) => m.date > prev && m.date <= today && !m.from.includes("meridian.mock") && !/\.20\d\d@/.test(m.from));
  return got.length ? { k: "Club mailbox · arrived overnight", items: got.slice(-2).map((m) => ({ from: nameOf(m.from) === m.from ? m.from : cap(nameOf(m.from)), addr: m.from, subject: m.subject, body: m.body.split("\n")[0] })) } : null;
}
function dayPanel() {
  const today = S.meta.today;
  return `<div class="day"><b>${H.diffDays("2027-08-07", today)}</b><span>days to Summit · ${fmt(today, false)}</span></div>
    <h3 class="sd-h" style="margin-top:14px">${di ? "Heir ran again overnight." : "It's 7:00, and Heir has already run."}</h3>
    <ul class="news">${news(S.runs.length).map(([k, t]) => `<li class="${k}">${esc(t)}</li>`).join("")}</ul>`;
}
function sideR() {
  const sent = S.outbox.length;
  let h = "";
  if (rcpt) h += `<div class="rcpt"><h6>${esc(rcpt.t)}</h6><ol>${rcpt.l.map((x) => `<li>${esc(x)}</li>`).join("")}</ol></div>`;
  if (outs) h += `<div class="outw"><span class="spn-k">Outside the phone · ${esc(outs.k)}</span>${outs.items.map((m) => `<div class="om"><p class="om-f"><b>${esc(m.from)}</b> &lt;${esc(m.addr)}&gt;</p><b>${esc(m.subject)}</b><p>${esc(m.body)}</p></div>`).join("")}</div>`;
  h += `<div class="zero sm"><b>0</b><span>emails sent without a tap</span><p>${sent} sent so far, and a person approved every one.</p></div>`;
  return h;
}
function swapIn(el, html) {
  if (!el || el.__h === html) return;
  const had = el.__h !== undefined || el.innerHTML.trim() !== "" || html.trim() !== ""; // content arriving in an empty slot fades in too
  el.innerHTML = html; el.__h = html;
  if (had && !REDUCED) { el.classList.remove("swapin"); void el.offsetWidth; el.classList.add("swapin"); }
}
function sides() { if ($("sideL") && S.meta.today && !welcome) swapIn($("sideL"), dayPanel()); if ($("sideR") && !welcome && !(window.HeirAI && window.HeirAI.busy)) swapIn($("sideR"), (window.HeirAI ? window.HeirAI.panel() : "") + sideR()); }

// phone views
function news(run) {
  const out = []; let m;
  for (const t of S.trace.filter((x) => x.run === run)) {
    const a = t.action, d = t.detail;
    if (a === "goal" && t.agent === "Planner" && run === 2) out.push(["plan", "Planned your event backwards from 7 August."]);
    else if (a === "reply received" && (m = d.match(/answered by (.+?) on \S+: (\w+)/))) out.push(["mail", `${m[1]} replied${m[2] === "confirmed" ? " and said yes" : ""}.`]);
    else if (a === "promise kept") out.push(["good", "Last year's promise has been kept."]);
    else if (a === "untrusted instruction ignored") out.push(["warn", "A strange email asked for the club logins. Heir didn't act on it and checked with you instead."]);
    else if (a === "draft withdrawn" && (m = d.match(/to (.+?): they wrote/))) out.push(["plan", `${m[1]} wrote back before your follow-up went out, so Heir pulled the follow-up.`]);
    else if (a === "no reply" && (m = d.match(/to (\S+): (\d+) days/)) && !out.some((x) => x[0] === "warn")) out.push(["warn", `Still nothing from ${nameOf(m[1])} after ${m[2]} days.`]);
    else if (a === "conflict with a standing agreement") out.push(["warn", "A new sponsor offer clashes with last year's Quillstone deal. Heir is checking with you before anyone replies."]);
    else if (a === "REPLAN") out.push(["plan", "Lined up a follow-up and a backup hall."]);
    else if (a === "task updated" && /Renew the title sponsor: todo/.test(d)) out.push(["good", "The sponsor renewal is unblocked."]);
  }
  if (!out.length) out.push(["plan", "A quiet night. Nothing new needs you."]);
  return out.filter((x, i) => out.findIndex((y) => y[1] === x[1]) === i).slice(0, 4);
}
const longDay = (s) => new Date(s + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
function lockScreen(today, n, first) {
  return `<div class="lock"><div class="lk-time">7:02</div><div class="lk-date">${longDay(today)}</div>
    ${n ? `<button type="button" class="lk-note" id="lkOpen"><span class="lk-app"><i></i>HEIR · MERIDIAN CLUB<em>now</em></span><b>${n} thing${n > 1 ? "s" : ""} need${n > 1 ? "" : "s"} you today</b><span>${esc(first)}</span></button>
    <div class="lk-note mail"><span class="lk-app"><i></i>GMAIL<em>7:00</em></span><b>Heir daily digest, ${fmt(today, false)}</b><span>The same list, for anyone without the app</span></div>
` : `<div class="lk-quiet">No notifications</div><button type="button" class="lk-note" id="lkOpen"><span class="lk-app"><i></i>HEIR<em></em></span><b>Open Heir</b><span>Nothing needs you right now. The dashboard's there whenever you want it.</span></button>`}</div>`;
}
const TI = {
  today: `<svg viewBox="0 0 24 24"><path d="M4 13h4l2 3h4l2-3h4M4 13l2-8h12l2 8v6H4z"/></svg>`,
  ledger: `<svg viewBox="0 0 24 24"><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11M9 8h6"/></svg>`,
  plan: `<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 3v4M15 3v4"/></svg>`,
  log: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></svg>` };
const TABS = [["today", "Today"], ["ledger", "Ledger"], ["plan", "Plan"], ["log", "Activity"]];
function paint() {
  if (!$("phs")) return;
  const label = TABS.find((t) => t[0] === tabNow)[1];
  $("dchip").textContent = "Heir app · " + label;
  const n = pending().length;
  const keepY = paint.tab === tabNow ? $("phs").scrollTop : 0; paint.tab = tabNow;
  $("phs").innerHTML = tabNow === "today" ? today() : tabNow === "ledger" ? ledgerView() : tabNow === "plan" ? planView() : logView();
  $("phs").scrollTop = keepY;
  $("phs").querySelectorAll(".new").forEach((e, i) => e.style.setProperty("--d", 40 + i * 70 + "ms"));
  const ti = TABS.findIndex((t) => t[0] === tabNow), nav = $("tabs").querySelector(".tabbar");
  if (nav) { nav.style.setProperty("--ti", ti); nav.querySelectorAll("[data-t]").forEach((b, i) => { b.classList.toggle("on", i === ti); const bd = b.querySelector("b"); if (b.dataset.t === "today") { if (n) { if (bd) bd.textContent = n; else b.insertAdjacentHTML("beforeend", `<b>${n}</b>`); } else if (bd) bd.remove(); } }); }
  else {
    $("tabs").innerHTML = `<nav class="tabbar" style="--ti:${ti}">${TABS.map(([k, l]) => `<button type="button" data-t="${k}" class="${k === tabNow ? "on" : ""}">${TI[k]}${l}${k === "today" && n ? `<b>${n}</b>` : ""}</button>`).join("")}</nav>`;
    $("tabs").querySelectorAll("[data-t]").forEach((b) => (b.onclick = () => { if (b.dataset.t === tabNow) return; phoneSwap("fade", () => { tabNow = b.dataset.t; if (tabNow !== "today") seenLedger = true; openRow = null; paint(); }); }));
  }
  bindToday(); bindLedger(); sides();
  if ($("fwdBtn")) $("fwdBtn").onclick = () => { aiTried = true; window.HeirAI && window.HeirAI.open(); };
}
const SEENC = new Set();
const nw = (k) => { const f = !SEENC.has(k); SEENC.add(k); return f ? " new" : ""; };
function today() {
  if (welcome) {
    const gap = S.ledger.filter((r) => GAPK.includes(r.kind)).length, owed = S.ledger.filter((r) => r.kind === "commitment" && r.status === "open").length;
    return `<p class="ph-head">Welcome, Ishaan</p><div class="ph-card${nw("w1")}"><span class="ph-tag">What you inherited</span><b>${S.ledger.length} records from the old team's files</b><p>That's ${gap} debts, promises, deadlines and lessons, and ${gap - S.ledger.filter((r) => GAPK.includes(r.kind) && r.in_handover).length} of them aren't in the handover doc.</p>
      <div class="ph-acts"><button type="button" class="pri" id="goLedger">Open the ledger</button></div></div>
      <div class="ph-card${nw("w2")}"><span class="ph-tag">How Heir works with you</span><p>Every morning at 7:00, Heir reads the club's mail and files. If something needs a person, you get one notification, and nothing leaves the club until someone taps approve.</p></div>
      <div class="ph-card${nw("w3")}"><span class="ph-tag">Your committee</span><p>Tara, Kabir and Riya join the same way. They'll see only their own items, while you see everything.</p></div>`;
  }
  const aiFirst = (a, b) => (b.ai ? 1 : 0) - (a.ai ? 1 : 0);
  const qq = S.escalations.filter((e) => e.status === "open").sort(aiFirst), ds = S.drafts.filter((d) => d.status === "pending approval").sort(aiFirst);
  const n = qq.length + ds.length;
  const qc = (e) => `<div class="ph-card q ${e.ai ? "ai" : ""}${nw(e.id)}"><span class="ph-tag">${e.ai ? "You decide · from your forward" : "You decide"}</span><b>${esc(qt(e))}</b><p>${esc(qs(e))}</p>
      <div class="ph-acts">${ans(e).map(([l], i) => `<button type="button" class="${i ? "" : "pri"}" data-a="${e.id}" data-i="${i}">${esc(l)}</button>`).join("")}</div></div>`;
  const dc = (d) => `<div class="ph-card m ${d.ai ? "ai" : ""}${nw(d.id)}" data-card="${d.id}"><span class="ph-tag">${d.ai ? "Ready to send · drafted live" : "Ready to send"}</span><b>${esc(d.subject)}</b><p>To ${esc(nameOf(d.recipient))} · ${esc(why(d))}</p>
      <details><summary>Read it</summary><pre data-body="${d.id}">${esc(d.body)}</pre></details>
      <div class="ph-acts"><button type="button" class="pri" data-ok="${d.id}">Approve and send</button><button type="button" data-edit="${d.id}">Edit</button><button type="button" data-hold="${d.id}">Hold</button></div>
      <button type="button" class="ph-wrong" data-wrong="${d.id}">Something's not right?</button></div>`;
  const cards = qq.filter((x) => x.ai).map(qc).join("") + ds.filter((x) => x.ai).map(dc).join("") + qq.filter((x) => !x.ai).map(qc).join("") + ds.filter((x) => !x.ai).map(dc).join("");
  const fwd = `<button type="button" class="fwd" id="fwdBtn"><i>＋</i><span><b>Forward something to Heir</b><small>An email, a chat or a voice note. AI reads it live.</small></span></button>`;
  return fwd + (n ? `<p class="ph-head">${n} thing${n > 1 ? "s" : ""} for you</p>${cards}` : `<div class="ph-empty"><b>All clear.</b><span>Heir will ping you when it needs you. Everything else is in Ledger and Plan.</span></div>`);
}
function why(d) {
  if (d.ai) return "drafted live from your forward";
  if (/promise/i.test(d.reason)) return "kept from a promise the old team made";
  if (/lead time/i.test(d.reason)) return "the hall needs 30 days' notice";
  if (/no reply/i.test(d.reason)) return "no answer in 4 days";
  if (/inherited/i.test(d.reason)) return "last year's unpaid debt";
  if (/exclusivity/i.test(d.reason)) return "your decision, written up";
  return "due soon";
}
const LF = [["all", "All", null], ["owed", "Owed", ["commitment"]], ["prom", "Promised", ["promise", "claim"]], ["dead", "Deadlines", ["lead_time"]], ["less", "Lessons", ["criterion", "policy"]], ["login", "Logins", ["account"]], ["people", "People", ["contact"]]];
const srcName = (e) => e.split(" | ").map((x) => x.replace(/^(done: |kept: |chased by \S+ )/, "").split(" ")[0]).filter((x) => /:/.test(x))
  .map((x) => x.replace(/^mail:(m\d+)$/, "email $1").replace(/^mail:x-.*/, "email").replace(/^mail:r-(D-\d+)/, "reply to $1").replace("whatsapp:", "chat line ").replace(/^capture:c(\d+).*/, "note c$1").replace("drive:", "").replace(/\.(md|csv|txt)$/, ""));
function rowStatus(r) {
  const t = S.meta.today || "2027-04-01";
  if (r.status === "open" && r.kind === "commitment" && r.due && r.due < t) return ["bad", `overdue ${H.diffDays(t, r.due)}d`];
  if (r.status === "disputed") return ["warn", "flagged wrong"];
  if (r.status === "closed") return ["ok", "closed"];
  if (r.status === "superseded") return ["mute", "replaced"];
  if (r.status === "missing") return ["bad", "missing"];
  if (r.kind === "lead_time" || r.kind === "criterion" || r.kind === "policy") return ["mute", r.tag === "historical" ? "reconfirm" : "on record"];
  return ["", r.status];
}
function ledgerView() {
  const f = LF.find((x) => x[0] === lf), rows = S.ledger.filter((r) => !f[2] || f[2].includes(r.kind));
  return `<p class="ph-head">Ledger <small>${S.ledger.length} records, each with a source</small></p>
    <div class="lfil">${LF.map(([k, l, ks]) => `<button type="button" data-lf="${k}" class="${k === lf ? "on" : ""}">${l} <i>${S.ledger.filter((r) => !ks || ks.includes(r.kind)).length}</i></button>`).join("")}</div>
    ${rows.map((r) => { const [c, st] = rowStatus(r); const src = srcName(r.evidence);
      return `<button type="button" class="lr ${openRow === r.id ? "open" : ""}" data-row="${r.id}"><span class="lr-t"><i>${r.id}</i><span class="lst ${c}">${esc(st)}</span></span><b>${esc(r.title)}</b>
        <small>${r.due ? `due ${fmt(r.due)} · ` : ""}${r.detail && r.kind === "lead_time" ? esc(r.detail) + " · " : ""}source: ${esc(src[0] || "file")}</small></button>
        ${openRow === r.id ? rowX(r) : ""}`; }).join("")}`;
}
const rowX = (r) => { const src = srcName(r.evidence);
  return `<div class="lr-xw"><div class="lr-x">${r.detail ? `<p>${esc(r.detail)}</p>` : ""}<p class="lr-src">Sources: ${src.map(esc).join(", ") || "file"}</p>${r.owner ? `<p>Owner on record: ${esc(r.owner)}</p>` : ""}
    ${["open", "missing"].includes(r.status) ? `<button type="button" class="ph-wrong" data-lw="${r.id}">Something's not right?</button>` : ""}</div></div>`; };
// a ledger row opens and closes in place; re-rendering the list made the rows below snap
function collapseRow(b) {
  b.classList.remove("open"); const w = b.nextElementSibling;
  if (!w || !w.classList.contains("lr-xw")) return;
  if (REDUCED) { w.remove(); return; }
  w.dataset.closing = "1"; // the opening's transitionend listener must not restore the height at the end of this collapse
  w.style.height = w.offsetHeight + "px"; void w.offsetWidth;
  w.style.transition = "height .22s ease, opacity .16s ease"; w.style.height = "0px"; w.style.opacity = "0";
  setTimeout(() => w.remove(), 240);
}
function toggleRow(b) {
  const id = b.dataset.row, cur = $("phs").querySelector(".lr.open");
  if (cur) collapseRow(cur);
  if (openRow === id) { openRow = null; return; }
  openRow = id; b.classList.add("open");
  b.insertAdjacentHTML("afterend", rowX(S.ledger.find((x) => x.id === id)));
  const w = b.nextElementSibling;
  w.querySelectorAll("[data-lw]").forEach((x) => (x.onclick = () => wrong(null, x.dataset.lw)));
  if (REDUCED) return;
  const h = w.scrollHeight; w.style.height = "0px"; w.style.opacity = "0"; void w.offsetWidth;
  w.style.transition = "height .28s cubic-bezier(.2,.8,.2,1), opacity .22s ease"; w.style.height = h + "px"; w.style.opacity = "1";
  w.addEventListener("transitionend", (e) => { if (e.propertyName === "height" && !w.dataset.closing) { w.style.height = ""; w.style.transition = ""; } });
}
function planView() {
  const ev = H.COMMITTEE.events[1], t = S.meta.today || "2027-04-01";
  const ts = S.tasks.filter((x) => x.event === ev.name).slice().sort((a, b) => (a.due < b.due ? -1 : 1));
  if (!ts.length) return `<p class="ph-head">Plan</p><div class="ph-empty"><b>No plan yet.</b><span>Heir will plan ${ev.name} backwards from ${fmt(ev.date)} on its first run after the handover.</span></div>`;
  const lab = { todo: "to do", waiting: "waiting for reply", done: "done", blocked: "blocked", paused: "paused" };
  return `<p class="ph-head">${ev.name} <small>${H.diffDays(ev.date, t)} days · ${ts.filter((x) => x.status === "done").length} of ${ts.length} done</small></p>
    ${ts.map((x) => `<div class="pr s-${x.status}"><span class="pr-d">${fmt(x.due, false)}</span><div><b>${esc(x.title)}</b><small>${esc(x.owner)}${x.status === "blocked" ? " · " + esc(x.basis) : ""}</small></div><i>${lab[x.status] || x.status}</i></div>`).join("")}`;
}
function logView() {
  const NOTE = { "untrusted instruction ignored": "Flagged a suspicious email; sent nothing", "draft withdrawn": "Pulled a draft: the person wrote first", "promise kept": "Recorded a promise as kept",
    "reply received": "Matched a reply to a sent email", "ESCALATE": "Asked the head a question", REPLAN: "Replanned after silence", "handover gap check": "Checked the handover doc against the ledger", "forward read live": "Read a forwarded message with the live model" };
  const out = [];
  for (const r of S.runs.slice().reverse()) {
    for (const h of S.human.filter((x) => x.after === r.id).slice().reverse()) out.push(`<div class="lg you"><i>${fmt(r.today, false)}</i><span>${esc(h.text)}</span></div>`);
    const sm = r.summary || {}, rd = sm.read || {};
    const acts = [...new Set(S.trace.filter((t) => t.run === r.id && NOTE[t.action]).map((t) => NOTE[t.action]))];
    out.push(`<div class="lg heir"><i>${fmt(r.today, false)} · 7:00</i><span><b>Heir run ${r.id}</b> read ${rd.mail || 0} emails${rd.drive ? `, ${rd.drive} files` : ""}${rd.whatsapp ? `, ${rd.whatsapp} chat lines` : ""}. ${acts.join(". ")}${acts.length ? "." : ""}</span></div>`);
  }
  return `<p class="ph-head">Activity <small>every action, by Heir or a person</small></p>${out.join("")}`;
}
function bindLedger() {
  const st = $("phs");
  st.querySelectorAll("[data-lf]").forEach((b) => (b.onclick = () => { lf = b.dataset.lf; openRow = null; paint.tab = null; paint(); $("phs").querySelectorAll(".lr").forEach((e, i) => { e.classList.add("rowin"); e.style.setProperty("--d", Math.min(i * 30, 300) + "ms"); }); }));
  st.querySelectorAll("[data-row]").forEach((b) => (b.onclick = () => toggleRow(b)));
  st.querySelectorAll("[data-lw]").forEach((b) => (b.onclick = () => wrong(null, b.dataset.lw)));
  if ($("goLedger")) $("goLedger").onclick = () => phoneSwap("fade", () => { tabNow = "ledger"; seenLedger = true; paint(); });
}
function bindToday() {
  const st = $("phs");
  st.querySelectorAll("[data-ok]").forEach((b) => (b.onclick = () => send(b.dataset.ok)));
  st.querySelectorAll("[data-edit]").forEach((b) => (b.onclick = () => edit(b.dataset.edit)));
  st.querySelectorAll("[data-wrong]").forEach((b) => (b.onclick = () => wrong(b.dataset.wrong)));
  st.querySelectorAll("[data-hold]").forEach((b) => (b.onclick = () => act(b, () => { H.hold(S, b.dataset.hold, "Ishaan");
    rcpt = { t: "You held it. Here's what changed:", l: ["Nothing was sent.", "The draft stays in Heir, marked as held by you.", "It shows up in Activity, so the committee knows it was a deliberate call."] }; toast("Held. Nothing was sent."); })));
  st.querySelectorAll("[data-a]").forEach((b) => (b.onclick = () => act(b, () => { const e = S.escalations.find((x) => x.id === b.dataset.a), note = ans(e)[+b.dataset.i][1];
    H.resolve(S, e.id, "Ishaan", note);
    const extra = { "Conflicting records": "The other record is kept but marked as replaced, so nothing is lost.", "Suspicious instruction in mail": "Nothing from that email goes into the ledger, and the sender stays flagged.",
      "Inherited commitment, no owner": "The debt has an owner now, and Heir will draft the overdue message for them tomorrow.", "Contract conflict": "Heir will draft the reply for the sponsorship lead at its next run.", "Access held outside the team": "The login record now says who should hold it." }[e.reason];
    rcpt = { t: "You decided. Here's what changed:", l: [`Saved to the ledger as your decision: "${note}".`].concat(extra ? [extra] : [], ["Heir will act on it from tomorrow's 7:00 run onwards."]) };
    toast("Got it. Heir will act on it tomorrow."); })));
}
function sheet(html) {
  const ph = $("ph"); ph.querySelector(".sheet")?.remove();
  const sh = document.createElement("div"); sh.className = "sheet"; sh.innerHTML = `<div class="sh-in">${html}</div>`;
  ph.appendChild(sh); void sh.offsetWidth; sh.classList.add("up"); return sh;
}
function closeSheet() { const sh = $("ph")?.querySelector(".sheet:not(.leaving)"); if (sh) { sh.classList.remove("up"); setTimeout(() => sh.remove(), 360); } busy = false; }
function edit(id) {
  const pre = document.querySelector(`[data-body="${id}"]`); if (!pre) return;
  pre.closest("details").open = true;
  const ta = document.createElement("textarea"); ta.className = "ph-ta"; ta.value = pre.textContent; ta.dataset.ta = id; ta.setAttribute("aria-label", "Edit the message");
  pre.replaceWith(ta); ta.focus();
  const b = document.querySelector(`[data-edit="${id}"]`); if (b) { b.textContent = "Editing"; b.disabled = true; }
}
function send(id) {
  if (busy) return; busy = true;
  const d = S.drafts.find((x) => x.id === id), t = S.tasks.find((x) => x.id === d.task_ref), ta = document.querySelector(`[data-ta="${id}"]`);
  const body = ta ? ta.value : null, edited = body && body.trim() !== d.body.trim();
  const checks = ["Nobody in this thread has written since Heir drafted it", "You're allowed to approve this (committee head)", `It's going to ${d.recipient}, the address on record`];
  sheet(`<p class="sh-k">Before it sends</p>${checks.map((c, i) => `<div class="chk" style="animation-delay:${i * .25}s">✓ ${esc(c)}</div>`).join("")}
    <p class="sh-from">It'll go from the club's own mailbox, meridian.mock@campus.example${edited ? ", with your edits" : ""}</p>
    <div class="sh-bar"><i id="shBar"></i></div><div class="sh-acts"><button type="button" id="shUndo">Undo</button><button type="button" class="pri" id="shNow">Send now</button></div>`);
  const bar = $("shBar"); bar.style.transition = "width 4s linear"; requestAnimationFrame(() => requestAnimationFrame(() => (bar.style.width = "100%")));
  let timerS;
  const go2 = () => { clearTimeout(timerS); closeSheet();
    try { H.approve(S, id, "Ishaan", edited ? body : undefined); }
    catch (e) { rcpt = { t: "Heir stopped this one. Here's why:", l: [String(e.message), "Nothing was sent. Have a look at their message first."] }; toast("Not sent. There's a newer reply to read first."); return paint(); }
    const closes = t && t.title.startsWith("Close inherited");
    rcpt = { t: "You approved it. Here's what changed:", l: [`Sent to ${nameOf(d.recipient)} from the club mailbox${edited ? ", in your words" : ""}.`,
      closes ? (/report/i.test(t.title) ? "Last year's debt is marked as paid, which frees up the sponsor renewal it was blocking." : "Last year's debt is marked as paid, so Student Affairs can release the grant.") : t ? `The task "${t.title}" is now waiting on their reply.` : "The message now waits for their reply.",
      closes ? "It doesn't need a reply to close." : t ? "If they don't reply within 4 days, Heir will draft a follow-up and plan a backup." : "When they reply, Heir matches it to this message at the next run.",
      `Logged in Activity: Ishaan approved ${id}.`] };
    outs = { k: `${cap(nameOf(d.recipient))}'s inbox`, items: [{ from: "Meridian Club", addr: "meridian.mock@campus.example", subject: d.subject, body: (edited ? body : d.body).split("\n").filter(Boolean)[1] || "" }] };
    taps++;
    const card = $("phs").querySelector(`[data-card="${id}"]`);
    if (closes) { toast("Sent. That old debt is paid.", true); burst(); } else toast(`Sent to ${nameOf(d.recipient)}.`, true);
    removeCard(card, paint); };
  timerS = setTimeout(go2, 4000);
  $("shNow").onclick = go2;
  $("shUndo").onclick = () => { clearTimeout(timerS); closeSheet(); toast("Undone. Nothing was sent."); };
}
function wrong(id, lid) {
  if (busy) return; busy = true;
  const d = id ? S.drafts.find((x) => x.id === id) : null, r = S.ledger.find((x) => x.id === (lid || (d && d.ledger_ref)));
  const src = r ? srcName(r.evidence)[0] : "";
  sheet(`<p class="sh-k">What's off?</p><p class="sh-q">${d ? "Heir wrote this because of" : "This record says"} <b>${esc(r ? r.title : d.reason)}</b>${src ? ` (source: ${esc(src)})` : ""}.</p>
    <button type="button" class="sh-opt" data-w="wrong">The facts are wrong<span>Heir pulls any draft and stops planning around this record</span></button>
    <button type="button" class="sh-opt" data-w="handled">Already handled outside Heir<span>Heir closes it and moves on</span></button>
    <div class="sh-acts"><button type="button" id="shBack">Never mind</button></div>`);
  $("shBack").onclick = closeSheet;
  $("ph").querySelectorAll("[data-w]").forEach((b) => (b.onclick = () => {
    const handled = b.dataset.w === "handled";
    if (r) H.correct(S, r.id, "Ishaan", handled ? "handled outside Heir" : "facts are wrong, check the source"); else H.hold(S, id, "Ishaan");
    rcpt = handled ? { t: "You said it was handled. Here's what changed:", l: ["Any draft for it is withdrawn. Nothing was sent.", `${r ? r.id : "The record"} is closed, marked "handled outside Heir, per Ishaan".`, "Anything it was blocking is free again."] }
      : { t: "You flagged a mistake. Here's what changed:", l: ["Any draft for it is withdrawn. Nothing was sent.", `${r ? r.id : "The record"} is marked "flagged wrong", with the original source kept beside it.`, "Heir won't draft or plan anything on it until someone fixes the record.", "It'll go into the next handover under \"Check before acting\"."] };
    taps++; closeSheet(); toast(handled ? "Closed. Heir will move on." : "Pulled. Heir won't act on it.", true); paint();
  }));
}
function removeCard(card, then) {
  if (!card || REDUCED) { then(); return; }
  // one motion, not two steps: the card slides away and, while it is still fading, the gap starts closing
  // a card that arrived with an entrance animation keeps it applied; drop it first, or the slide-out jumps instead of moving
  card.classList.remove("new"); card.style.animation = "none";
  card.style.height = card.offsetHeight + "px"; card.style.overflow = "hidden"; void card.offsetWidth;
  card.classList.add("gone");
  setTimeout(() => card.classList.add("collapse"), 110);
  setTimeout(then, 110 + 330);
}
function act(b, fn) { if (busy) return; taps++; fn(); removeCard(b.closest(".ph-card"), paint); }
function cheer() {
  const L = S.trace.filter((t) => t.run === S.runs.length);
  if (L.some((t) => t.action === "promise kept") && !seen.p) { seen.p = 1; burst(); toast("Last year's promise has been kept.", true); }
  else if (L.some((t) => t.action === "task updated" && /Renew the title sponsor: todo/.test(t.detail)) && !seen.r) { seen.r = 1; burst(); toast("The sponsor renewal is unblocked.", true); }
}
// 5. end
function end() {
  const inh = S.ledger.filter((r) => ["commitment", "promise"].includes(r.kind)), closed = inh.filter((r) => r.status === "closed").length;
  const prom = S.ledger.find((r) => r.kind === "promise");
  const disp = S.ledger.filter((r) => r.status === "disputed").length;
  const all = closed === inh.length;
  go("end", `<div class="c"><p class="k">Your first weeks as head</p><h2 class="mid">${all ? "Nothing the old team owed was dropped." : disp ? "You flagged some records, so Heir held off on them." : "Some of what they owed is still open."}</h2>
    <div class="tiles"><div class="tile ${all ? "" : "no"}"><b>${closed}/${inh.length}</b><span>old debts and promises closed</span></div>
      <div class="tile ${prom.status === "closed" ? "" : "no"}"><b>${prom.status === "closed" ? "Kept" : prom.status === "disputed" ? "Flagged" : "Open"}</b><span>the promise to a speaker</span></div>
      <div class="tile"><b>${taps}</b><span>taps from you, and nothing to keep in your head</span></div></div>
    <p class="lede">Next April you graduate too. What will the next head inherit?</p>
    <div class="act"><button class="pk-btn pri" id="b6" type="button">Write their handover</button><button class="pk-btn" id="b7" type="button">Play again</button></div><div id="doc"></div></div>`);
  // the button stays where it is (removing it pulled "Play again" up under the pointer)
  $("b6").onclick = () => { const b = $("b6"); b.disabled = true; b.textContent = "Their handover is below ↓"; handover(); };
  $("b7").onclick = () => { curScr = null; land(); };
}
function handover() {
  const by = (k) => S.ledger.filter((r) => r.kind === k), L = ["# Meridian Club handover, 2027-28 (written by Heir)"];
  const open = S.ledger.filter((r) => ["commitment", "promise"].includes(r.kind) && r.status === "open");
  L.push("", "## Still open"); (open.length ? open.map((r) => `- ${r.title}${r.due ? `, due ${fmt(r.due)}` : ""}`) : ["- Nothing inherited is open."]).forEach((x) => L.push(x));
  const disputed = S.ledger.filter((r) => r.status === "disputed");
  if (disputed.length) { L.push("", "## Check before acting"); disputed.forEach((r) => L.push(`- ${r.title}: flagged as wrong, source ${r.evidence.split(" ")[0]}`)); }
  const flagged = S.escalations.filter((e) => e.reason === "Suspicious instruction in mail");
  if (flagged.length) { L.push("", "## Flagged mail"); flagged.forEach((e) => L.push(`- ${e.question.split(" asks")[0].replace("A mail from ", "")}: asked for club logins. ${e.resolution || "Not answered yet"}`)); }
  L.push("", "## Lead times"); by("lead_time").forEach((r) => L.push(`- ${r.title}: ${r.detail}`));
  L.push("", "## Lessons"); by("criterion").forEach((r) => L.push(`- ${r.title}`));
  L.push("", "## Rules"); by("policy").forEach((r) => L.push(`- ${r.title}${r.status === "superseded" ? " (replaced)" : ""}`));
  L.push("", "## Logins"); by("account").forEach((r) => L.push(`- ${r.title}: ${r.owner || "unknown"}`));
  L.push("", "## People"); by("contact").forEach((r) => L.push(`- ${r.title}: ${r.status}`));
  // the stage centres short screens; pin this one where it sits before it grows, or the whole screen jumps up
  const st = $("stage"), sc = st.querySelector(".scr");
  if (sc && getComputedStyle(st).alignItems !== "start") {
    const off = sc.getBoundingClientRect().top - st.getBoundingClientRect().top - parseFloat(getComputedStyle(st).paddingTop);
    st.style.alignItems = "start"; sc.style.marginTop = Math.max(0, off) + "px";
  }
  $("doc").innerHTML = `<div class="two"><div class="paper"><h5>What you got · 8 lines</h5><pre>${esc(HANDOVER)}</pre></div><div class="paper" style="box-shadow:6px 6px 0 var(--pink)"><h5>What they get · ${L.length} lines, each with a source</h5><pre>${esc(L.join("\n"))}</pre></div></div>
    <p class="final">This time, the next head starts with <em>all of it</em>.</p><div class="act" style="justify-content:center"><button class="pk-btn" data-how="phone" type="button">How it reaches your phone</button><button class="pk-btn" data-how="wrong" type="button">When Heir gets it wrong</button><button class="pk-btn" data-how="why" type="button">Why we built it</button></div>`;
  document.querySelectorAll("[data-how]").forEach((b) => (b.onclick = () => how(b.dataset.how)));
  stagger($("doc"), 60);
  setTimeout(() => $("doc").scrollIntoView({ behavior: REDUCED ? "auto" : "smooth", block: "start" }), 120);
}

// ---------- quiet guidance: a hint appears only after the visitor has been idle for a few seconds,
// disappears the moment they act, never scrolls anything for them, and waits for the screen to settle.
let coachEl = null, coachT = null, cand = null, candTxt = "", shown = false, seenLedger = false, aiTried = false, searchT0 = 0;
let lastAct = Date.now(), lastChange = Date.now();
// Until notifications are allowed, the visitor is being walked through setup, so hints come as soon as a screen settles.
// After that, hints wait for 2 seconds of no activity.
const IDLE = 2000, SETTLE_MS = 900;
const onboarding = () => !inApp && !welcome && !(S && S.meta && S.meta.today && S.runs && S.runs.length > 1) && curScr !== "run";
function interact() { lastAct = Date.now(); hideCoach(); }
["pointerdown", "keydown", "wheel", "touchstart"].forEach((ev) => addEventListener(ev, interact, { capture: true, passive: true }));
function setCand(el, text) { el = el || null; text = el ? text : ""; if (el !== cand || text !== candTxt) { cand = el; candTxt = text; if (shown) hideCoach(); } }
function hideCoach(now) {
  shown = false;
  if (coachT) coachT.classList.remove("tapme");
  coachT = null;
  if (coachEl && now) { clearTimeout(hideCoach.t); coachEl.classList.remove("show"); coachEl.hidden = true; } // the screen is changing: no label left floating over the new one
  else if (coachEl) { coachEl.classList.remove("show"); clearTimeout(hideCoach.t); hideCoach.t = setTimeout(() => { if (!shown) coachEl.hidden = true; }, 200); }
  if ($("nextBox")) $("nextBox").classList.remove("on");
}
function showCoach() {
  if (!cand || !document.body.contains(cand)) return;
  if (!coachEl) { coachEl = document.createElement("div"); coachEl.className = "coach"; coachEl.setAttribute("role", "status"); document.body.appendChild(coachEl); }
  shown = true; coachT = cand; cand.classList.add("tapme");
  clearTimeout(hideCoach.t);
  coachEl.textContent = candTxt; coachEl.hidden = false; coachEl.classList.remove("show"); coachEl.dataset.placed = "";
  if ($("nextBox") && cand.closest(".dev")) { $("nextTxt").textContent = candTxt; $("nextBox").classList.add("on"); }
  placeCoach();
  requestAnimationFrame(() => coachEl.classList.add("show"));
}
function placeCoach() {
  if (!coachEl || coachEl.hidden || !coachT) return;
  if (!document.body.contains(coachT)) { hideCoach(); return; }
  const r = coachT.getBoundingClientRect(), box = coachT.closest("#phs"), w = coachEl.offsetWidth, h = coachEl.offsetHeight, gap = 14;
  const inPhone = !!coachT.closest(".dev") || coachT.classList.contains("card");
  let off = r.bottom < 70 ? "up" : r.top > innerHeight - 20 ? "down" : "", inBox = false;
  if (box && !off) { const b = box.getBoundingClientRect(); if (r.bottom < b.top + 10 || r.top > b.bottom - 10) { off = r.top > b.bottom - 10 ? "down" : "up"; inBox = true; } }
  coachEl.classList.toggle("edge", !!off);
  if (off) { // the target is out of view: say where it is, at the edge of the window, without moving anything
    coachEl.textContent = (off === "down" ? "↓ " : "↑ ") + candTxt + (inBox ? " (scroll the phone)" : " (scroll)");
    moveCoach(Math.max(8, innerWidth / 2 - w / 2), off === "down" ? innerHeight - h - 18 : 76); coachEl.dataset.side = "none"; return;
  }
  if (coachEl.textContent !== candTxt) coachEl.textContent = candTxt;
  if (inPhone) { coachEl.style.visibility = "hidden"; return; } // on the phone, the Next strip above it says it; nothing covers the app
  coachEl.style.visibility = "visible";
  let side = "right", x = r.right + gap, y = r.top + r.height / 2 - h / 2;
  if (x + w > innerWidth - 8) { side = "left"; x = r.left - gap - w; }
  if (x < 8 || coachT.closest(".modal .row") || coachT.closest(".bar")) { side = coachT.closest(".bar") || coachT.matches(".modal [data-x]") ? "below" : r.top > h + 90 ? "above" : "below"; x = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2)); y = side === "above" ? r.top - h - gap : r.bottom + gap; }
  if (coachT.closest(".modal .row") && coachT.classList.contains("pin")) { side = "left"; x = r.left - gap - w; y = r.top + r.height / 2 - h / 2; if (x < 8) { side = "above"; x = r.left; y = r.top - h - gap; } }
  const cx = Math.max(8, Math.min(innerWidth - w - 8, x));
  if (cx !== x && (side === "left" || side === "right")) { side = r.top > h + 90 ? "above" : "below"; y = side === "above" ? r.top - h - gap : r.bottom + gap; }
  x = cx;
  moveCoach(x, y); coachEl.dataset.side = side;
  coachEl.style.setProperty("--ax", Math.max(14, Math.min(w - 14, r.left + r.width / 2 - x)) + "px");
}
function moveCoach(x, y) {
  const glide = coachEl.dataset.placed === "1";
  coachEl.style.transition = glide ? "" : "none";
  coachEl.style.setProperty("--x", Math.round(x) + "px"); coachEl.style.setProperty("--y", Math.round(y) + "px");
  if (!glide) { void coachEl.offsetWidth; coachEl.style.transition = ""; coachEl.dataset.placed = "1"; }
}
addEventListener("scroll", placeCoach, { passive: true }); addEventListener("resize", placeCoach);
document.addEventListener("scroll", placeCoach, { capture: true, passive: true });
function nextStep() {
  const q = (x) => document.querySelector(x), stage = $("stage");
  if ($("drawer").classList.contains("open")) return setCand(null);
  const md = q(".modal");
  if (md) { const pin = md.querySelector(".pin:not(.on)"); return setCand(pin || md.querySelector("[data-x]"), pin ? "Does the club still owe this? Pin it" : "Close, then open another file"); }
  const sh = q("#ph .sheet:not(.leaving)");
  if (sh) {
    if (q("#fwTxt")) return q("#fwTxt").value.trim() ? setCand(q("#fwGo"), "Send it to Heir") : setCand(q("[data-pr]"), "Pick a message, or paste your own");
    if (q("#t3")) return setCand(q("#t3"), "Tap Add to Home Screen");
    return setCand(null);
  }
  if (window.HeirAI && window.HeirAI.busy) return setCand(null);
  for (const [id, t] of [["b1", "Start here"], ["b2", "Start round 1"], ["b4", "Next: put Heir on your phone"], ["t1", "Tap Open Heir"], ["t2", "Sign in"], ["share", "Tap Share"], ["t4", "Tap the Heir icon"], ["yes", "Tap Allow"], ["lkOpen", "Tap the notification"], ["b6", "See what the next head gets"]])
    if ($(id) && stage.contains($(id))) return setCand($(id), t);
  if ($("pile")) {
    const unopened = stage.querySelector(".card:not(.hand):not(.pinned)");
    return pins.size >= 2 || Date.now() - searchT0 > 45000 ? setCand($("b3"), "Done? See what Heir found") : setCand(unopened, "Open a file");
  }
  if ($("phs") && $("tabs") && $("tabs").innerHTML) {
    if (welcome) return seenLedger ? setCand($("b5"), "When you're ready, jump to 20 May") : setCand($("goLedger"), "Open the ledger");
    const card = $("phs").querySelector(".ph-card.q .ph-acts button, .ph-card.m [data-ok]");
    if (card && tabNow !== "today") return setCand($("tabs").querySelector('[data-t="today"]'), "Back to Today");
    if (card) return setCand(card, card.dataset.ok ? "Read it, then approve" : "Pick an answer");
    if (!aiTried && di >= 1 && $("aiBtn")) return setCand($("aiBtn"), "Try this: give Heir something it's never seen");
    if ($("b5")) return setCand($("b5"), di >= DAYS.length - 1 ? "See how it went" : "Sleep to the next morning");
  }
  return setCand(null);
}
// a screen counts as settled one second after its last structural change (ticking clocks and the AI trace do not count)
new MutationObserver((recs) => {
  if (recs.some((r) => !(r.target.closest && (r.target.closest(".clock") || r.target.closest(".coach") || r.target.closest("#aiTrace") || r.target.closest(".toast"))))) lastChange = Date.now();
}).observe(document.body, { childList: true, subtree: true });
setInterval(() => {
  nextStep();
  const now = Date.now();
  if (!shown && cand && now - lastAct > (onboarding() ? 0 : IDLE) && now - lastChange > SETTLE_MS) showCoach();
  else if (shown) placeCoach();
}, 300);


// how it works drawer
function tab(name) {
  document.querySelectorAll(".tab").forEach((t) => { const on = t.dataset.tab === name; t.classList.toggle("on", on); t.setAttribute("aria-selected", on); });
  document.querySelectorAll(".pane").forEach((p) => (p.hidden = p.dataset.pane !== name));
  $("drawer").scrollTo({ top: 0 });
}
document.querySelectorAll(".tab").forEach((t) => (t.onclick = () => tab(t.dataset.tab)));
function how(name) { if (typeof name === "string") tab(name); $("drawer").classList.add("open"); $("drawer").setAttribute("aria-hidden", "false"); }
$("howBtn").onclick = () => how();
const root = document.documentElement;
function setTheme(t) { root.dataset.theme = t; try { localStorage.setItem("heir-theme", t); } catch (e) {} $("themeBtn").setAttribute("aria-label", t === "dark" ? "Switch to light theme" : "Switch to dark theme"); }
$("themeBtn").onclick = () => setTheme(root.dataset.theme === "dark" ? "light" : "dark");
setTheme(root.dataset.theme === "dark" ? "dark" : "light");
$("restartBtn").onclick = () => { clearInterval(timer); document.querySelectorAll(".modal").forEach((m) => m.remove()); busy = false; curScr = null; land(); };
$("howClose").onclick = () => { $("drawer").classList.remove("open"); $("drawer").setAttribute("aria-hidden", "true"); };
document.addEventListener("keydown", (e) => { if (e.key === "Escape") { document.querySelectorAll(".modal").forEach(closeModal); $("howClose").click(); } });
window.HeirGame = { land, hand, search, score, end, how, tab, pin: (k) => pins.add(k),
  get S() { return S; }, paint, toast, burst, setRight: (h) => { if ($("sideR")) $("sideR").innerHTML = h; }, sides, sheet, closeSheet, nameOf, fmt, esc };
// the first screen waits (at most 1.5 s) for the web fonts, so its text does not re-wrap and shift once they arrive
// fonts load lazily, so ask for the three the first screen uses rather than waiting on document.fonts.ready
if (document.fonts && document.fonts.load) Promise.race([Promise.all(['800 40px "Bricolage Grotesque"', '400 20px "Newsreader"', '400 15px "Space Mono"', '700 12px "Space Mono"'].map((f) => document.fonts.load(f))).catch(() => {}),
  new Promise((r) => setTimeout(r, 1500))]).then(land);
else land();
})();
