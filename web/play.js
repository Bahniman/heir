(function () {
"use strict";
/* "You just inherited a club": the main experience. Every number and line comes from the same engine. */
const H = window.HeirEngine;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmt = (s, yr = true) => { if (!s) return ""; const d = new Date(s + "T00:00:00Z"); return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: yr ? "numeric" : undefined, timeZone: "UTC" }); };
const root = $("play");
if (!root) return;

const GAPK = ["commitment", "promise", "lead_time", "claim", "criterion"];
const KLAB = { commitment: "Owed to a sponsor", promise: "Promise to a person", lead_time: "Lead time", claim: "Said to a speaker", criterion: "Lesson", policy: "Policy", account: "Login", contact: "Contact" };
const QT = { "Inherited commitment, no owner": "Who owns last year's unsent sponsor report?", "Conflicting records": "Which airfare rule is right?",
  "Access held outside the team": "Who should hold the website and YouTube logins?", "Deadline can no longer be met": "A planned task is past its date", "Silent after follow-up": "Still no reply after a follow-up" };
const ANS = {
  "Inherited commitment, no owner": [["Kabir owns it. Send it now, with an apology", "owner: Kabir. Send it now with an apology"], ["Riya owns it", "owner: Riya. Send it now with an apology"]],
  "Conflicting records": [["The policy stands: no airfare", "Policy stands: airfare is not covered. Say so plainly if asked"], ["Cover airfare this year", "Airfare is covered this year for confirmed speakers"]],
  "Access held outside the team": [["Ask the advisor for access", "Request delegated access from the faculty advisor"], ["Leave it with the advisor", "Leave access with the faculty advisor this year"]],
  "Deadline can no longer be met": [["It is done", "Mark done: handled outside Heir"], ["Move it a week", "Move it a week"]],
  "Silent after follow-up": [["We will call them", "Call the Estate Office today"], ["Switch to the fallback hall", "Switch to the fallback hall"]],
};
const DAYS = ["2027-05-20", "2027-05-27", "2027-05-28", "2027-06-04", "2027-06-11"];
const nameOf = (a) => ({ "estate.office": "the Estate Office", partnerships: "Quillstone", guesthouse: "the Guest House", orders: "PrintPoint" }[a.split("@")[0]] ||
  a.split("@")[0].split(/[._]/).filter((p) => !/^\d+$/.test(p)).map((p) => p[0].toUpperCase() + p.slice(1)).join(" "));
const srcKey = (e) => { let m; if ((m = e.match(/^(?:done: )?(mail:m\d+|whatsapp:\d+|capture:c\d+)/))) return m[1]; return null; };
const keysOf = (r) => r.evidence.split(" | ").map((x) => srcKey(x.trim())).filter(Boolean);
const srcLabel = (k) => k.startsWith("mail:") ? "email " + k.slice(5) : k.startsWith("whatsapp:") ? "chat line " + (+k.slice(9) + 1) : "voice note";

let S, phase, pins, t0, timer, tapCount, runIdx, ref, readSel, heirMs, celebrated;

// ---------------------------------------------------------------- the pile the old team left
function pile() {
  const X = H.createState();
  const items = X.mail.map((m) => ({ key: "mail:" + m.id, type: "Email", who: m.from.includes("meridian.mock") ? "Club mailbox" : nameOf(m.from) + (m.from.includes(".2026@") ? " (old team)" : ""), title: m.subject, date: m.date, body: `From ${m.from}\nTo ${m.to}\n\n${m.body}` }));
  const chat = X.drive["whatsapp_export_core_team.txt"].split("\n").filter((l) => l.startsWith("["));
  items.push({ key: "chat", type: "Chat export", who: "Core team group", title: "WhatsApp export, 6 lines", date: "2026-08-06", lines: chat.map((l, i) => ({ key: "whatsapp:" + i, text: l })) });
  const c1 = X.captures[0];
  items.push({ key: "capture:c01", type: "Voice note", who: "Neel (old team)", title: "Voice note after the event", date: c1.date, body: c1.text });
  items.push({ key: "drive:Speaker_Policy.md", type: "Drive file", who: "Drive", title: "Speaker_Policy.md", date: "2026-06-01", body: X.drive["Speaker_Policy.md"] });
  items.push({ key: "drive:Outreach_Tracker.csv", type: "Drive file", who: "Drive", title: "Outreach_Tracker.csv", date: "2026-08-06", body: X.drive["Outreach_Tracker.csv"] });
  items.unshift({ key: "handover", type: "Handover doc", who: "The old team", title: "Handover_2026-27.md", date: "2027-03-31", body: X.drive["Handover_2026-27.md"].trim(), nopin: true });
  return { items, handover: X.drive["Handover_2026-27.md"] };
}
const PILE = pile();

// ---------------------------------------------------------------- shell
function show(html) { const tt = $("playToast"); if (tt) tt.className = "pl-toast"; $("playStage").innerHTML = html; $("playStage").classList.remove("pin"); void $("playStage").offsetWidth; $("playStage").classList.add("pin"); }
function steps(n) { $("playSteps").innerHTML = ["Inherit", "Search", "Compare", "Run the club", "Hand over"].map((s, i) => `<span class="${i < n ? "done" : i === n ? "on" : ""}"><b>${i + 1}</b>${s}</span>`).join(""); }
function toast(m, good) { const t = $("playToast"); t.textContent = m; t.className = "pl-toast show" + (good ? " good" : ""); clearTimeout(toast.h); toast.h = setTimeout(() => (t.className = "pl-toast"), 2600); }
function burst() {
  const b = document.createElement("div"); b.className = "pl-burst";
  b.innerHTML = Array.from({ length: 26 }, (_, i) => `<i style="--a:${i * 360 / 26}deg;--d:${80 + (i % 5) * 30}px;--c:${["#ff4fa3", "#1f5cff", "#ffe14f", "#1d1a16"][i % 4]}"></i>`).join("");
  $("playStage").appendChild(b); setTimeout(() => b.remove(), 1200);
}

// ---------------------------------------------------------------- 1. inherit
function intro() {
  phase = "intro"; steps(0);
  show(`<div class="pl-intro">
    <div class="pl-letter"><p class="pl-k">1 April 2027 · Meridian Club (a mock club)</p>
      <h3>Congratulations. You are the new committee head.</h3>
      <p>The old team graduated last week. Their phones are off and their inboxes are gone. Your flagship event, <b>Summit 2027</b>, is on <b>7 August</b>.</p>
      <p>Here is everything they handed you.</p>
      <button class="pk-btn pri" id="plOpen" type="button">Open the handover ↓</button></div>
    <div class="pl-doc"><div class="pl-doc-h">Handover_2026-27.md · the whole thing</div><pre>${esc(PILE.handover.trim())}</pre></div></div>`);
  $("plOpen").onclick = desk;
}

// ---------------------------------------------------------------- 2. search the pile yourself
const LIMIT = 120;
function desk() {
  phase = "desk"; steps(1); pins = new Set(); t0 = Date.now(); readSel = PILE.items[0].key;
  show(`<div class="pl-brief"><div><h3>Before your first team meeting, find what the club still owes.</h3>
      <p>Promises, debts, deadlines, warnings. <b>Thirteen</b> of them are buried in this pile. Open anything, and pin what a new head must not miss.</p></div>
      <div class="pl-clock"><span>Meeting starts in</span><b id="plClock">2:00</b><em><span id="plPins">0</span> pinned</em><button class="pk-btn" id="plDone" type="button">I'm done</button></div></div>
    <div class="pl-desk"><ul class="pl-list" id="plList"></ul><div class="pl-read" id="plRead"></div></div>
    <p class="pl-hint">Nobody to ask: the people who wrote these have graduated. Start with their handover doc, at the top of the pile.</p>`);
  drawList(); drawRead();
  $("plDone").onclick = reveal;
  clearInterval(timer);
  timer = setInterval(() => { const left = Math.max(0, LIMIT - Math.floor((Date.now() - t0) / 1000)); const c = $("plClock"); if (!c) return clearInterval(timer);
    c.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`; c.classList.toggle("hot", left <= 20); if (!left) reveal(); }, 250);
}
function pinnedIn(it) { return it.lines ? it.lines.filter((l) => pins.has(l.key)).length : pins.has(it.key) ? 1 : 0; }
function drawList() {
  $("plList").innerHTML = PILE.items.map((it) => `<li><button type="button" data-k="${it.key}" class="${it.key === readSel ? "on" : ""}"><span class="t">${esc(it.type)} · ${fmt(it.date)}</span><b>${esc(it.title)}</b><span class="w">${esc(it.who)}</span>${pinnedIn(it) ? `<i class="pl-pinmark">${pinnedIn(it)}</i>` : ""}</button></li>`).join("");
  $("plList").querySelectorAll("button").forEach((b) => (b.onclick = () => { readSel = b.dataset.k; drawList(); drawRead(); }));
  $("plPins").textContent = pins.size;
}
function drawRead() {
  const it = PILE.items.find((x) => x.key === readSel);
  const pinBtn = (k) => `<button type="button" class="pl-pin ${pins.has(k) ? "on" : ""}" data-p="${k}">${pins.has(k) ? "Pinned" : "Pin this"}</button>`;
  $("plRead").innerHTML = `<div class="pl-read-h"><span>${esc(it.type)} · ${esc(it.who)} · ${fmt(it.date)}</span>${it.lines || it.nopin ? "" : pinBtn(it.key)}</div><h4>${esc(it.title)}</h4>` +
    (it.lines ? `<div class="pl-lines">${it.lines.map((l) => `<div><span>${esc(l.text)}</span>${pinBtn(l.key)}</div>`).join("")}</div>` : `<pre>${esc(it.body)}</pre>`);
  $("plRead").querySelectorAll("[data-p]").forEach((b) => (b.onclick = () => { const k = b.dataset.p; pins.has(k) ? pins.delete(k) : pins.add(k); drawList(); drawRead(); }));
}

// ---------------------------------------------------------------- 3. compare: you vs Heir
function reveal() {
  if (phase !== "desk") return;
  clearInterval(timer); phase = "reveal"; steps(2);
  const used = Math.min(LIMIT, Math.round((Date.now() - t0) / 1000));
  S = H.createState(); const a = performance.now(); H.run(S, "2027-03-10"); heirMs = Math.max(1, Math.round(performance.now() - a));
  const gap = S.ledger.filter((r) => GAPK.includes(r.kind));
  const found = gap.filter((r) => keysOf(r).some((k) => pins.has(k)));
  const late = S.ledger.find((r) => r.id === "L-005"), prom = S.ledger.find((r) => r.id === "L-015"), claim = S.ledger.find((r) => r.id === "L-011");
  const lateDays = H.diffDays("2027-03-10", late.due);
  const card = (r) => { const you = found.includes(r);
    return `<div class="pl-item ${you ? "you" : "miss"}" data-k="${r.kind}"><span class="pl-chip">${KLAB[r.kind]}</span><b>${esc(r.title)}</b>
      <span class="pl-src">${keysOf(r).map(srcLabel).filter((v, i, a) => a.indexOf(v) === i).join(", ")}${r.due ? ` · due ${fmt(r.due)}` : ""}${r.detail && r.kind === "lead_time" ? ` · ${esc(r.detail)}` : ""}</span>
      <em>${you ? "You found this" : "You missed this"}</em></div>`; };
  show(`<div class="pl-score">
      <div class="pl-side you"><span>You</span><b>${found.length}<small>/13</small></b><p>in ${Math.floor(used / 60)}:${String(used % 60).padStart(2, "0")}, from a pile you had never seen</p></div>
      <div class="pl-vs">vs</div>
      <div class="pl-side heir"><span>Heir</span><b>13<small>/13</small></b><p>in ${heirMs} ms, each with the line it came from, on 10 March, three weeks before the handover</p></div></div>
    <h3 class="pl-h">The three you could not afford to miss</h3>
    <div class="pl-traps">
      <div><span class="pl-chip">The doc says "All deliverables done"</span><b>The sponsor's post-event report was never sent.</b><p>Due ${fmt(late.due)}. ${lateDays} days late. The sponsor chased it in August, and said the report decides next year's budget.</p><em class="${found.includes(late) ? "y" : "n"}">${found.includes(late) ? "You found this" : "You missed this"}</em></div>
      <div><span class="pl-chip">One polite line in an old email</span><b>The club promised a speaker it would keep her posted.</b><p>${esc(prom.detail)}. Neel wrote that and graduated. Due ${fmt(prom.due)}, while this year's panel is still open.</p><em class="${found.includes(prom) ? "y" : "n"}">${found.includes(prom) ? "You found this" : "You missed this"}</em></div>
      <div><span class="pl-chip">Two records that disagree</span><b>A speaker was told airfare would be reimbursed.</b><p>The club's own policy says airfare is not covered. Write to a speaker without knowing this and you repeat it.</p><em class="${found.includes(claim) ? "y" : "n"}">${found.includes(claim) ? "You found this" : "You missed this"}</em></div></div>
    <details class="pl-all"><summary>See all 13, and which ones you caught</summary><div class="pl-grid">${gap.map(card).join("")}</div></details>
    <div class="pl-asked"><b>Heir also asked the leavers, while they could still answer.</b> Before the handover it emailed Aditi about the report and Sana about the logins. Their replies are now part of the club's memory.</div>
    <div class="pl-next"><p>Heir found them. Now see what it is like to run the club with it.</p><button class="pk-btn pri" id="plRun" type="button">Fast-forward to 20 May →</button></div>`);
  $("plRun").onclick = runStart;
}

// ---------------------------------------------------------------- 4. run the club, from your phone
function runStart() { phase = "run"; steps(3); runIdx = 0; tapCount = 0; celebrated = {}; H.run(S, DAYS[0]); drawRun(true); }
function storyLines(run) {
  const L = S.trace.filter((t) => t.run === run), out = []; let m;
  for (const t of L) {
    const a = t.action, d = t.detail;
    if (a === "goal" && t.agent === "Planner" && run === 2 && (m = d.match(/\((\d+) days away\)/))) out.push(["plan", `Planned Summit 2027 backwards from 7 August, ${m[1]} days out, using last year's lead times.`]);
    else if (a === "reply received" && (m = d.match(/answered by (.+?) on (\S+): (\w+)/))) out.push(["mail", `${m[1]} replied on ${fmt(m[2], false)}${m[3] === "confirmed" ? " and said yes" : ""}.`]);
    else if (a === "promise kept") out.push(["good", "Last year's promise to a speaker: kept."]);
    else if (a === "no reply" && (m = d.match(/to (\S+): (\d+) days, limit (\d+)/))) out.push(["warn", `${nameOf(m[1])[0].toUpperCase() + nameOf(m[1]).slice(1)} has not replied in ${m[2]} days. The club's limit is ${m[3]}.`]);
    else if (a === "REPLAN") out.push(["plan", "Replanned the venue: a follow-up for tomorrow, and a fallback hall on hold."]);
    else if (a === "task updated" && /Renew the title sponsor: todo/.test(d)) out.push(["good", "Sponsor renewal unblocked: last year's report has gone out."]);
    else if (a === "task updated" && (m = d.match(/Close inherited: .+?: todo, (.+)$/))) out.push(["plan", `Last year's unsent report now has an owner: ${m[1].replace(/^.*\((\w+)\)$/, "$1")}.`]);
    else if (a === "task closed by reply") out.push(["good", "A reply settled a task, so Heir closed it."]);
  }
  if (!out.length) out.push(["calm", "Quiet day. Heir read what arrived and found nothing that needs you."]);
  return out;
}
function drawRun(fresh) {
  const today = S.meta.today, run = S.runs.length, ev = H.COMMITTEE.events[1];
  const qs = S.escalations.filter((e) => e.status === "open"), ds = S.drafts.filter((d) => d.status === "pending approval");
  const inh = S.ledger.filter((r) => ["commitment", "promise"].includes(r.kind)), open = inh.filter((r) => r.status === "open");
  const sentNoYou = S.outbox.filter((o) => !o.approved_by).length;
  const tasks = [...S.tasks].sort((a, b) => a.due.localeCompare(b.due)).filter((t) => t.status !== "done").slice(0, 6);
  const cards = qs.map((e) => `<div class="ph-card q" data-e="${e.id}"><span class="ph-tag">Only you can decide</span><b>${esc(QT[e.reason] || e.reason)}</b>
      <p>${esc(e.question.replace(/mail:(m\d+)/g, "email $1").replace(/\b(\d{4}-\d{2}-\d{2})\b/g, (x) => fmt(x)))}</p>
      <div class="ph-acts">${(ANS[e.reason] || [["Noted", "Noted"]]).map(([l], i) => `<button type="button" class="${i ? "" : "pri"}" data-a="${e.id}" data-i="${i}">${esc(l)}</button>`).join("")}</div></div>`).join("") +
    ds.map((d) => { const t = S.tasks.find((x) => x.id === d.task_ref); const who = t ? (t.owner.match(/\((\w+)\)/) || [])[1] : "you";
      return `<div class="ph-card m" data-d="${d.id}"><span class="ph-tag">Email ready · ${esc(who || "you")} sends it</span><b>${esc(d.subject)}</b><p class="ph-to">To ${esc(nameOf(d.recipient))}</p>
      <details><summary>Read it</summary><pre>${esc(d.body)}</pre></details><p class="ph-why">Why: ${esc(d.reason.replace(/mail:(m\d+)/g, "email $1").replace(/\b(\d{4}-\d{2}-\d{2})\b/g, (x) => fmt(x)))}</p>
      <div class="ph-acts"><button type="button" class="pri" data-ok="${d.id}">Approve and send</button><button type="button" data-hold="${d.id}">Hold</button></div></div>`; }).join("");
  const lines = storyLines(run);
  show(`<div class="pl-run">
    <div class="pl-day"><p class="pl-k">Run ${run} · ${fmt(today)}</p><h3>${runIdx === 0 ? "Good morning. Heir ran at 7:00." : "Next morning. Heir ran again."}</h3>
      <ul class="pl-story">${lines.map(([k, t]) => `<li class="${k}">${esc(t)}</li>`).join("")}</ul>
      <div class="pl-count"><b>${H.diffDays(ev.date, today)}</b><span>days to Summit 2027</span></div></div>
    <div class="pl-phone"><div class="ph"><div class="ph-notch"></div><div class="ph-top"><span>${fmt(today, false)} · 07:02</span><span>Heir · Meridian Club</span></div>
      <div class="ph-scr">${cards ? `<p class="ph-head">${qs.length + ds.length} thing${qs.length + ds.length === 1 ? "" : "s"} need${qs.length + ds.length === 1 ? "s" : ""} you</p>${cards}` : `<div class="ph-empty"><b>Nothing needs you.</b><span>Heir will message you when something does.</span></div>`}</div>
      <div class="ph-bot"><button type="button" class="pk-btn pri" id="plNext">${runIdx < DAYS.length - 1 ? "Sleep · next run →" : "See your year →"}</button>${runIdx >= 2 ? `<button type="button" class="pk-btn" id="plEnd">Finish</button>` : ""}</div></div></div>
    <div class="pl-board"><p class="pl-k">Your club</p>
      <div class="pl-stat"><b>${open.length}<small>/${inh.length}</small></b><span>inherited debts and promises still open</span></div>
      <div class="pl-stat"><b>${S.outbox.filter((o) => o.approved_by && o.approved_by !== "internal, sent by Heir").length}</b><span>emails sent, each after a tap from your team</span></div>
      <div class="pl-stat"><b>${sentNoYou}</b><span>sent without your team</span></div>
      <p class="pl-k" style="margin-top:14px">Coming up</p><ul class="pl-tasks">${tasks.map((t) => `<li class="${t.status}"><span>${fmt(t.due, false)}</span>${esc(t.title.replace(/^Close inherited: Quillstone: /, "Inherited: "))}<em>${esc(t.status === "todo" ? "" : t.status)}</em></li>`).join("")}</ul></div></div>`);
  const st = $("playStage");
  st.querySelectorAll("[data-ok]").forEach((b) => (b.onclick = () => act(b.closest(".ph-card"), () => { const d = S.drafts.find((x) => x.id === b.dataset.ok); const t = S.tasks.find((x) => x.id === d.task_ref); const w = t && (t.owner.match(/\((\w+)\)/) || [])[1]; H.approve(S, d.id, w || "Ishaan");
    const closes = t && t.title.startsWith("Close inherited"); toast(closes ? "Sent. A debt the old team left is paid." : `Sent to ${nameOf(d.recipient)}.`, true); if (closes) burst(); })));
  st.querySelectorAll("[data-hold]").forEach((b) => (b.onclick = () => act(b.closest(".ph-card"), () => { H.hold(S, b.dataset.hold, "Ishaan"); toast("Held. Nothing was sent."); })));
  st.querySelectorAll("[data-a]").forEach((b) => (b.onclick = () => act(b.closest(".ph-card"), () => { const e = S.escalations.find((x) => x.id === b.dataset.a); H.resolve(S, e.id, "Ishaan", ANS[e.reason][+b.dataset.i][1]); toast("Saved. Heir acts on it next run."); })));
  $("plNext").onclick = () => { if (runIdx >= DAYS.length - 1) return finish(); runIdx++; H.run(S, DAYS[runIdx]); drawRun(true); celebrate(); };
  if ($("plEnd")) $("plEnd").onclick = finish;
  if (fresh) celebrate();
}
function celebrate() {
  const L = S.trace.filter((t) => t.run === S.runs.length);
  if (L.some((t) => t.action === "promise kept") && !celebrated.p) { celebrated.p = 1; burst(); toast("Last year's promise: kept.", true); }
  else if (L.some((t) => t.action === "task updated" && /Renew the title sponsor: todo/.test(t.detail)) && !celebrated.r) { celebrated.r = 1; burst(); toast("Sponsor renewal unblocked.", true); }
}
function act(card, fn) { tapCount++; fn(); card.classList.add("gone"); setTimeout(() => drawRun(false), 380); }

// ---------------------------------------------------------------- 5. hand over: the year in review, and next year's handover written from the ledger
function finish() {
  phase = "end"; steps(4);
  const inh = S.ledger.filter((r) => ["commitment", "promise"].includes(r.kind)), closed = inh.filter((r) => r.status !== "open");
  const prom = S.ledger.find((r) => r.id === "L-015"), rep = S.ledger.find((r) => r.id === "L-005"), renew = S.tasks.find((t) => t.title === "Renew the title sponsor");
  const sentByTeam = S.outbox.filter((o) => o.approved_by && o.approved_by !== "internal, sent by Heir").length;
  const tile = (ok, big, label) => `<div class="pl-tile ${ok ? "ok" : "no"}"><b>${big}</b><span>${label}</span></div>`;
  show(`<div class="pl-end"><p class="pl-k">Your first weeks as head, in review</p><h3>${closed.length === inh.length ? "Nothing the old team owed was dropped." : "Some of what the old team owed is still open."}</h3>
    <div class="pl-tiles">
      ${tile(closed.length === inh.length, `${closed.length}/${inh.length}`, "inherited debts and promises closed")}
      ${tile(prom.status !== "open", prom.status !== "open" ? "Kept" : "Open", "last year's promise to a speaker")}
      ${tile(rep.status !== "open", rep.status !== "open" ? "Paid" : "Owed", "the sponsor report the doc called done")}
      ${tile(renew && renew.status !== "blocked", renew && renew.status !== "blocked" ? "Ready" : "Blocked", "this year's sponsor renewal")}
      ${tile(true, "0", "emails sent without your team")}
      ${tile(true, tapCount, `taps from you, across ${S.runs.length - 1} mornings`)}</div>
    <p class="pl-say">${prom.status === "open" ? "You held the invite, so the promise is still open. Heir will keep it on the plan." : "You did not have to remember any of it. You read, decided and tapped."} Next April you leave too. What does the next head get?</p>
    <button class="pk-btn pri" id="plHand" type="button">Write next year's handover →</button><div id="plDoc"></div>
    <button class="pk-btn" id="plAgain" type="button" style="margin-top:18px">Play again</button></div>`);
  $("plAgain").onclick = intro;
  $("plHand").onclick = () => { $("plHand").remove(); handoverDoc(); };
}
function handoverDoc() {
  const by = (k) => S.ledger.filter((r) => r.kind === k);
  const L = [];
  L.push("# Meridian Club handover, 2027-28 to 2028-29 (written by Heir from the ledger)");
  const open = S.ledger.filter((r) => ["commitment", "promise"].includes(r.kind) && r.status === "open");
  L.push("", "## Still open"); (open.length ? open : [{ title: "Nothing inherited is open." }]).forEach((r) => L.push(`- ${r.title}${r.owner ? ` · owner ${r.owner}` : ""}${r.due ? ` · due ${fmt(r.due)}` : ""}`));
  L.push("", "## Lead times we learned"); by("lead_time").forEach((r) => L.push(`- ${r.title}: ${r.detail} (${srcLabel(keysOf(r)[0])})`));
  L.push("", "## Lessons"); by("criterion").forEach((r) => L.push(`- ${r.title}`));
  L.push("", "## Policies"); by("policy").forEach((r) => L.push(`- ${r.title}${r.status === "superseded" ? " (replaced)" : ""}`));
  L.push("", "## Logins"); by("account").forEach((r) => L.push(`- ${r.title}: ${r.owner || "unknown"}`));
  L.push("", "## Decisions this year"); S.escalations.filter((e) => e.status === "resolved" && e.resolved_by === "Ishaan").forEach((e) => L.push(`- ${QT[e.reason] || e.reason} ${e.resolution}`));
  L.push("", "## People"); by("contact").forEach((r) => L.push(`- ${r.title}${r.counterparty && r.counterparty !== r.title ? `, ${r.counterparty}` : ""}: ${r.status}${r.owner ? ` (${r.owner})` : ""}`));
  $("plDoc").innerHTML = `<div class="pl-two"><div class="pl-doc small"><div class="pl-doc-h">What you got · 8 lines</div><pre>${esc(PILE.handover.trim())}</pre></div>
    <div class="pl-doc big"><div class="pl-doc-h">What the next head gets · ${L.length} lines, every one traceable</div><pre>${esc(L.join("\n"))}</pre></div></div>
    <p class="pl-final">The team leaves. <em>The ledger stays.</em></p>`;
  $("plDoc").scrollIntoView({ behavior: "smooth", block: "start" });
}

intro();
window.HeirPlay = { intro, desk, reveal, runStart, finish, pin: (k) => pins.add(k), state: () => S };
})();
