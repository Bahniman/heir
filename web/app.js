(function(){
"use strict";
const H = window.HeirEngine;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmt = (s, yr = true) => { if (!s) return ""; const d = new Date(s + "T00:00:00Z"); return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: yr ? "numeric" : undefined, timeZone: "UTC" }); };
const STEPS = [
  { d: "2027-03-10", t: "Before the handover" },
  { d: "2027-05-20", t: "The new team takes over" },
  { d: "2027-05-27", t: "One week later" },
  { d: "2027-05-28", t: "The next day" },
];
const LEDE = {
  "2027-03-10": "Three weeks before the handover. Heir reads last year's mail, Drive folder, WhatsApp export and voice notes, and checks them against the handover doc while the outgoing team can still answer.",
  "2027-05-20": "The new team took over on 1 April. Summit 2027 is on 7 August. Heir plans the event and turns what it inherited into work.",
  "2027-05-27": "A week on. Heir reads what came back after your decisions and adjusts the plan.",
  "2027-05-28": "The next day. Heir picks up whatever your last decisions changed.",
};
const QTITLE = {
  "Inherited commitment, no owner": "Who owns last year's unsent sponsor report?",
  "Conflicting records": "Which airfare rule is right?",
  "Access held outside the team": "Who should hold the club's website and YouTube logins?",
  "Deadline can no longer be met": "A planned task is past its date",
  "Silent after follow-up": "Still no reply after a follow-up",
};
const ANSWERS = {
  "Inherited commitment, no owner": [["Kabir owns it. Send it now with an apology", "owner: Kabir. Send it now with an apology"], ["Riya owns it", "owner: Riya. Send it now with an apology"]],
  "Conflicting records": [["The policy stands: no airfare", "Policy stands: airfare is not covered. Say so plainly if asked"], ["Cover airfare this year", "Airfare is covered this year for confirmed speakers"]],
  "Access held outside the team": [["Ask the advisor for access", "Request delegated access from the faculty advisor"], ["Leave it with the advisor", "Leave access with the faculty advisor this year"]],
  "Deadline can no longer be met": [["It is done", "Mark done: handled outside Heir"], ["Move it a week", "Move it a week"]],
  "Silent after follow-up": [["We will call them", "Call the Estate Office today"], ["Switch to the fallback hall", "Switch to the fallback hall"]],
};
const KIND = { commitment: ["Owed to others", "debts"], promise: ["Promises", "promises"], account: ["Logins and access", "logins"], claim: ["Things said to people", "claims"],
  lead_time: ["Lead times", "lead times"], criterion: ["Lessons", "lessons"], policy: ["Policies", "policies"], contact: ["Contacts", "contacts"] };
const ORDER = ["commitment", "promise", "account", "claim", "lead_time", "criterion", "policy", "contact"];
const GAP = ["commitment", "promise", "lead_time", "claim", "criterion"];
let S, tab = "plan", logRun = 1, toastTimer, lastFigs = [];

function toast(m) { const t = $("toast"); t.textContent = m; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 3000); }
function nextDate() { const t = S.meta.today; const n = STEPS.map((s) => s.d).find((d) => d > t); return n || H.addDays(t, 7); }
function nameOf(addr) {
  const local = addr.split("@")[0];
  const known = { "estate.office": "the Estate Office", partnerships: "Quillstone", guesthouse: "the Guest House", orders: "PrintPoint" };
  if (known[local]) return known[local];
  return local.split(/[._]/).filter((p) => !/^\d+$/.test(p)).map((p) => p[0].toUpperCase() + p.slice(1)).join(" ");
}
const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const clean = (s) => s.replace(/mail:m(\d+)/g, "email m$1").replace(/ \(2026\)/g, "").replace(/ ?\((?:L|D|T|E)-\d+\)/g, "")
  .replace(/^Inherited L-\d+, owner set by the committee head$/, "Last year's sponsor report was never sent. The committee head named an owner.")
  .replace(/^No reply to D-\d+ since (\S+)$/, "No reply yet to the request sent on $1.").replace(/no reply to D-\d+ since/, "no reply to the request sent on")
  .replace(/^Lead time (\d+) days \((email m\d+)\); due (\S+)$/, "The Estate Office needs $1 days' notice ($2). Due $3.")
  .replace(/\b(\d{4}-\d{2}-\d{2})\b/g, (x) => fmt(x));

// ---------------------------------------------------------------- the agent log, retold in plain sentences
function story(runId) {
  const L = S.trace.filter((t) => t.run === runId);
  const sec = { read: [], found: [], did: [], ask: [] };
  const added = {}; let tasks = 0, drafts = 0;
  const earlier = S.trace.filter((t) => t.run < runId);
  const seenBefore = (action, key) => earlier.some((t) => t.action === action && t.detail.startsWith(key));
  const SING = { mails: "email", "forwarded notes": "forwarded note", "WhatsApp lines": "WhatsApp line", "Drive files": "Drive file" };
  for (const t of L) {
    const a = t.action, d = t.detail; let m;
    if (a === "read new records") {
      const parts = d.split(";")[0].split(", ").filter((p) => !p.startsWith("0 "))
        .map((p) => p.replace(/^1 (mails|forwarded notes|WhatsApp lines|Drive files)$/, (x, w) => "1 " + SING[w]).replace(/ mails$/, " emails"));
      sec.read.unshift([parts.length ? "Read " + parts.join(", ") + "." : "Nothing new had arrived since the last run.", "Scout"]);
    } else if ((m = a.match(/^ledger \+ (\w+)/))) added[m[1]] = (added[m[1]] || 0) + 1;
    else if (a === "recall" && (m = d.match(/^(\d+) decisions .+? and (\d+) approved/))) sec.read.push([`Remembered ${m[1]} decision${m[1] === "1" ? "" : "s"} and ${m[2]} approved email${m[2] === "1" ? "" : "s"} from earlier runs.`, "Supervisor"]);
    else if (a === "reply received" && (m = d.match(/^D-\d+ answered by (.+?) on (\S+): (.+)$/))) sec.read.push([`${m[1]} replied on ${fmt(m[2], false)}${m[3] === "confirmed" ? " and said yes" : ""}.`, "Scout"]);
    else if (a === "exit answer received") sec.read.push([`${d.replace("from ", "")} answered Heir's question before leaving.`, "Scout"]);
    else if (a === "duplicate outreach found" && (m = d.match(/^(.+?): (.+)$/))) sec.found.push([`${m[1]} was emailed twice last year, by ${m[2].replace(", ", " and ")}, at two different addresses.`, "Scout"]);
    else if (a === "counterparty chasing" && (m = d.match(/^L-\d+ (\w+) asked for the report on (\S+)$/))) sec.found.push([`${m[1]} chased the post-event report on ${fmt(m[2])}.`, "Scout"]);
    else if (a === "handover contradicts records" && (m = d.match(/doc says "(.+?)", no record/))) sec.found.push([`The handover doc says "${m[1]}" The mailbox shows the sponsor report was never sent.`, "Auditor"]);
    else if (a === "handover gap check" && (m = d.match(/^(\d+) of (\d+)/)) && !seenBefore(a, m[1] + " of " + m[2])) sec.found.push([`${m[1]} of the ${m[2]} debts, promises and lessons Heir found are missing from the handover doc.`, "Auditor"]);
    else if (a === "broken reference") sec.found.push(["The handover doc points to an \"Access\" sheet for club logins. It is not in Drive.", "Auditor"]);
    else if (a === "overdue" && (m = d.match(/^(L-\d+) (.+?): due (\S+), (\d+) days late$/)) && !seenBefore(a, m[1])) sec.found.push([`${m[2].replace(/^(\w+): A /, "$1's ")} was due ${fmt(m[3])}. It is ${m[4]} days late.`, "Auditor"]);
    else if (a === "no reply" && (m = d.match(/^(D-\d+) to (\S+): (\d+) days, limit (\d+)$/)) && !seenBefore(a, m[1])) sec.found.push([`${cap1(nameOf(m[2]))} has not replied in ${m[3]} days. Heir waits ${m[4]}.`, "Auditor"]);
    else if (a === "exit question sent" && (m = d.match(/^D-\d+ to (\w+)/))) sec.did.push([`Emailed ${m[1]} a question before the handover. It is internal mail, so it needs no approval.`, "Auditor"]);
    else if (a === "commitment closed" && (m = d.match(/^L-\d+ \w+: (.+?) \((\w+), WhatsApp/))) sec.did.push([`Marked "${m[1]}" as done, from ${m[2]}'s WhatsApp message.`, "Scout"]);
    else if (a === "promise kept" && (m = d.match(/: (.+) confirmed for this year$/))) sec.did.push([`Closed last year's promise: ${m[1]} is confirmed for Summit 2027.`, "Scout"]);
    else if (a === "task closed by reply" && (m = d.match(/^T-\d+ (.+)$/))) sec.did.push([`Closed "${m[1]}" because the reply settled it.`, "Scout"]);
    else if (a === "goal" && t.agent === "Planner" && (m = d.match(/on (\S+) \((\d+) days away\)/))) sec.did.push([`Planned Summit 2027 backwards from ${fmt(m[1])}, ${m[2]} days away, using lead times from last year's mail.`, "Planner"]);
    else if (a === "task") tasks++;
    else if (a === "task updated" && (m = d.match(/^T-\d+ (.+?): (\w+), (.+)$/))) sec.did.push([`"${m[1]}" is now ${m[2] === "todo" ? "ready to start" : m[2]}, owned by ${m[3].replace(/^.*\((\w+)\)$/, "$1")}.`, "Planner"]);
    else if (a === "REPLAN" && (m = d.match(/'(.+?)' stalled: no reply to D-\d+ in (\d+) days/))) sec.did.push([`Replanned "${m[1]}" after ${m[2]} days of silence: added a follow-up${/venue/i.test(m[1]) ? " and a fallback hall" : ""}.`, "Planner"]);
    else if (a === "draft for approval") drafts++;
    else if (a === "ESCALATE" && (m = d.match(/^E-\d+ to .+?: (.+)$/))) sec.ask.push([QTITLE[m[1]] || m[1], "Auditor"]);
  }
  const kinds = ORDER.filter((k) => added[k]).map((k) => `${added[k]} ${added[k] === 1 ? KIND[k][1].replace(/s$/, "") : KIND[k][1]}`);
  if (kinds.length) sec.read.push([`Added ${Object.values(added).reduce((x, y) => x + y, 0)} entries to the club's memory: ${kinds.join(", ")}.`, "Scout"]);
  if (tasks) sec.did.push([`Added ${tasks} task${tasks > 1 ? "s" : ""} to the plan, each with an owner and a date.`, "Planner"]);
  if (drafts) sec.ask.unshift([`Drafted ${drafts} email${drafts > 1 ? "s" : ""} for you to approve.`, "Drafter"]);
  return sec;
}

const said = (x) => {
  let m;
  if ((m = x.match(/^(\w+) (approves|holds) (D-\d+)$/))) { const d = S.drafts.find((r) => r.id === m[3]); return `${m[1]} ${m[2] === "approves" ? "approved" : "held"} the email to ${nameOf(d.recipient)} ("${d.subject}")`; }
  if ((m = x.match(/^(\w+) answers (E-\d+)$/))) { const e = S.escalations.find((r) => r.id === m[2]); return `${m[1]} answered "${QTITLE[e.reason] || e.reason}": ${e.resolution.replace(/^owner: (\w+)\. /, "$1 owns it. ")}`; }
  if ((m = x.match(/^(\w+) marks (T-\d+) done$/))) { const k = S.tasks.find((r) => r.id === m[2]); return `${m[1]} marked "${k.title}" as done`; }
  return x.replace(/^Mail arrives: /, "You sent in a reply: ");
};

// ---------------------------------------------------------------- render
function render(changed) {
  const run = S.runs[S.runs.length - 1], today = S.meta.today;
  const idx = STEPS.findIndex((s) => s.d === today);
  $("dots").innerHTML = STEPS.map((s) => `<b class="${s.d === today ? "cur" : s.d < today ? "done" : ""}"></b>`).join("");
  $("whenlab").textContent = `Run ${run.id} · ${fmt(today)}${idx >= 0 ? ` · step ${idx + 1} of ${STEPS.length}` : ""}`;
  $("whentitle").textContent = idx >= 0 ? STEPS[idx].t : "On your own from here";
  $("lede").textContent = LEDE[today] || `Heir ran on ${fmt(today)} and read whatever had arrived since the last run.`;
  const figs = [
    [S.ledger.length, "things in the club's memory"],
    [`${S.ledger.filter((r) => GAP.includes(r.kind) && !r.in_handover).length}/${S.ledger.filter((r) => GAP.includes(r.kind)).length}`, "missing from the handover doc"],
    [S.ledger.filter((r) => (r.kind === "commitment" || r.kind === "promise") && r.status === "open").length, "debts and promises still open"],
    [S.tasks.filter((t) => t.status !== "done").length, "tasks still to do"],
  ];
  $("figs").innerHTML = figs.map(([n, l], i) => `<div class="fig ${changed && lastFigs[i] !== String(n) ? "flash" : ""}"><b>${n}</b><span>${l}</span></div>`).join("");
  lastFigs = figs.map((f) => String(f[0]));
  const st = story(run.id);
  const block = (title, color, items) => items.length ? `<div class="blk"><h4><i style="--k:${color}"></i>${title}</h4><ul>${items.map(([t, who]) => `<li><span>${esc(t)}</span><span class="who">${who}</span></li>`).join("")}</ul></div>` : "";
  const moves = run.id > 1 ? S.human.filter((x) => x.after === run.id - 1) : [];
  $("story").innerHTML = block("What you did before this run", "var(--cont)", moves.map((x) => [said(x.text).replace(/\.?$/, "."), "You"])) +
    block("Read", "var(--blue)", st.read) + block("Found", "var(--pink)", st.found) + block("Did", "var(--yellow)", st.did) + block("Needs you", "var(--ink)", st.ask);
  renderTurn(); renderPanel();
}

function renderTurn() {
  const qs = S.escalations.filter((e) => e.status === "open"), ds = S.drafts.filter((d) => d.status === "pending approval");
  $("turnnum").textContent = qs.length + ds.length;
  $("turnnum").className = "num" + (qs.length + ds.length ? "" : " zero");
  let h = "";
  for (const e of qs) {
    h += `<div class="dec q"><span class="stamp kind">Question</span><h4>${esc(QTITLE[e.reason] || e.reason)}</h4><p>${esc(clean(e.question))}</p>
      <div class="acts">${(ANSWERS[e.reason] || [["Noted", "Noted"]]).map(([l], i) => `<button class="pk-btn ${i ? "" : "pri"}" type="button" data-ans="${e.id}" data-i="${i}">${esc(l)}</button>`).join("")}</div></div>`;
  }
  for (const d of ds) {
    h += `<div class="dec m"><span class="stamp kind">Email to approve</span><h4>To ${esc(nameOf(d.recipient))}: ${esc(d.subject)}</h4><p class="why">Why Heir wrote it: ${esc(clean(d.reason))}</p>
      <details><summary>Read the email</summary><div class="mail">${esc(d.body)}</div></details>
      <div class="acts"><button class="pk-btn pri" type="button" data-ok="${d.id}">Approve and send</button><button class="pk-btn" type="button" data-hold="${d.id}">Hold</button></div></div>`;
  }
  if (!h) h = `<div class="calm">Nothing needs you right now. Run Heir again to move the clock forward.</div>`;
  $("queue").innerHTML = h;
  const nd = nextDate(), stepNext = STEPS.find((s) => s.d === nd);
  const left = qs.length + ds.length;
  let nx = `<button class="pk-btn go" id="runbtn" type="button"><span>Run Heir on ${fmt(nd)}</span><span aria-hidden="true">→</span></button>`;
  nx += `<p>${stepNext ? `Next: ${esc(stepNext.t.toLowerCase())}. ` : ""}${left ? "You can run now and decide later; anything open carries over." : "Each run reads what arrived, checks it, updates the plan and drafts what is needed."}</p>`;
  if (H.canInject(S, "estate_approves")) nx += `<button class="pk-btn" id="inj" type="button">Make the Estate Office reply: LC2 approved</button>`;
  nx += `<div class="pick"><label for="pick">Or run on a date</label><input type="date" id="pick" min="${H.addDays(S.meta.today, 1)}" max="2027-09-30"><button class="pk-btn" style="min-height:40px;padding:0 14px" id="runpick" type="button">Run</button></div>`;
  $("after").innerHTML = nx;
  $("queue").querySelectorAll("[data-ok]").forEach((b) => b.onclick = () => { const d = S.drafts.find((x) => x.id === b.dataset.ok); act(() => H.approve(S, d.id, ownerOf(d)), `Sent to ${nameOf(d.recipient)}.`); });
  $("queue").querySelectorAll("[data-hold]").forEach((b) => b.onclick = () => act(() => H.hold(S, b.dataset.hold, "Ishaan"), "Held. Nothing was sent."));
  $("queue").querySelectorAll("[data-ans]").forEach((b) => b.onclick = () => { const e = S.escalations.find((x) => x.id === b.dataset.ans); act(() => H.resolve(S, e.id, "Ishaan", ANSWERS[e.reason][+b.dataset.i][1]), "Answer saved. Heir uses it next run."); });
  $("runbtn").onclick = () => doRun(nd);
  $("runpick").onclick = () => { const v = $("pick").value; if (!v) { toast("Choose a date first."); return; } doRun(v); };
  if ($("inj")) $("inj").onclick = () => act(() => H.inject(S, "estate_approves"), "The Estate Office replied. Heir reads it next run.");
}
function ownerOf(d) { const t = d.task_ref && S.tasks.find((x) => x.id === d.task_ref); const m = t && t.owner.match(/\((\w+)\)/); return m ? m[1] : "Ishaan"; }

function stamp(r) {
  if (r.kind === "commitment" && r.status === "open" && r.due && r.due < S.meta.today) return `<span class="stamp bad">Overdue</span>`;
  const map = { open: ["Open", "wait"], closed: ["Done", "good"], missing: ["Missing", "bad"], superseded: ["Replaced", "wait"], active: ["In force", "wait"],
    confirmed: ["Confirmed", "good"], "no reply": ["No reply", "wait"], replied: ["Replied", "wait"], contacted: ["Contacted", "wait"], declined: ["Declined", "wait"], "declined by us": ["Turned away", "wait"] };
  const [l, c] = map[r.status] || [r.status, "wait"];
  return `<span class="stamp ${c}">${esc(l)}</span>`;
}

function renderPanel() {
  document.querySelectorAll(".tabsrow[role=tablist] button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tab === tab)));
  const p = $("panel"), today = S.meta.today;
  if (tab === "plan") {
    const T = [...S.tasks].sort((a, b) => a.due.localeCompare(b.due));
    p.innerHTML = T.length ? `<div class="grp"><h5>Summit 2027 · 7 Aug 2027</h5>${T.map((t) => {
      const late = t.status === "todo" && t.due < today;
      const st = late ? `<span class="stamp bad">Late</span>` : { todo: `<span class="stamp wait">To do</span>`, waiting: `<span class="stamp wait">Waiting for reply</span>`, done: `<span class="stamp good">Done</span>`, blocked: `<span class="stamp bad">Blocked</span>` }[t.status];
      return `<div class="ent"><div><b>${esc(t.title)}</b><div class="sub">${fmt(t.due)} · ${esc(t.owner)}</div><div class="sub">${esc(clean(t.basis))}</div>
        ${t.status === "todo" ? `<button class="pk-btn" style="min-height:36px;padding:0 12px;font-size:13.5px;margin-top:8px" type="button" data-done="${t.id}">Mark done</button>` : ""}</div><div class="stamps">${st}</div></div>`;
    }).join("")}</div>`
      : `<p class="empty">No plan yet. Heir starts planning after the handover on 1 April 2027. Until then it only reads, and asks the outgoing team.</p>`;
    p.querySelectorAll("[data-done]").forEach((b) => b.onclick = () => act(() => H.done(S, b.dataset.done, "Ishaan"), "Marked done."));
  } else if (tab === "mem") {
    p.innerHTML = `<div class="grp">${ORDER.filter((k) => S.ledger.some((r) => r.kind === k)).map((k) => `<h5>${KIND[k][0]} · ${S.ledger.filter((r) => r.kind === k).length}</h5>` +
      S.ledger.filter((r) => r.kind === k).map((r) => `<div class="ent"><div><b>${esc(r.title)}</b>
        ${r.owner || r.detail || r.due ? `<div class="sub">${esc([r.due && "Due " + fmt(r.due), r.owner && "Owner: " + r.owner, r.detail && clean(r.detail)].filter(Boolean).join(" · "))}</div>` : ""}
        <details><summary>Where this came from</summary><div class="ev">${r.evidence.split(" | ").map((e) => esc(clean(e))).join("<br>")}</div></details></div>
        <div class="stamps">${stamp(r)}${GAP.includes(r.kind) && !r.in_handover ? `<span class="stamp gap">Not in handover doc</span>` : ""}</div></div>`).join("")).join("")}</div>`;
  } else if (tab === "out") {
    p.innerHTML = S.outbox.length ? `<div class="grp"><h5>Sent from the club mailbox</h5>${[...S.outbox].reverse().map((o) => `<div class="ent"><div><b>${esc(o.subject)}</b><div class="sub">To ${esc(nameOf(o.to))} on ${fmt(o.date)} · ${o.approved_by.startsWith("internal") ? "internal, sent by Heir" : "approved by " + esc(o.approved_by)}</div>
      <details><summary>Read it</summary><div class="mail">${esc(o.body)}</div></details></div></div>`).join("")}</div>` : `<p class="empty">Nothing has left the club yet.</p>`;
  } else if (tab === "log") {
    logRun = Math.min(logRun, S.runs.length);
    const lines = S.trace.filter((t) => t.run === logRun).map((t) => ({ ...t }));
    for (const x of S.human.filter((h) => h.after === logRun)) lines.push({ agent: "You", action: x.text, detail: "" });
    p.innerHTML = `<p class="empty" style="margin-bottom:10px">Every step each agent took, as logged. The summary above is written from this.</p>
      <div class="tabsrow" style="margin:0 0 10px;padding:0;border:0">${S.runs.map((r) => `<button type="button" aria-pressed="${r.id === logRun}" data-run="${r.id}">Run ${r.id} · ${fmt(r.today, false)}</button>`).join("")}</div>` +
      lines.map((t) => `<div class="ln"><span class="who">${t.agent}</span><div><b>${esc(t.action)}</b> <span>${esc(t.detail)}</span></div></div>`).join("");
    p.querySelectorAll("[data-run]").forEach((b) => b.onclick = () => { logRun = +b.dataset.run; renderPanel(); });
  } else {
    const mails = [...S.mail].sort((a, b) => a.date.localeCompare(b.date));
    p.innerHTML = `<div class="grp"><h5>Club mailbox · ${mails.filter((m) => m.date <= today).length} arrived so far</h5>${mails.map((m) => `<div class="ent" style="${m.date > today ? "opacity:.6" : ""}"><div><b>${esc(m.subject)}</b><div class="sub">${fmt(m.date)} · from ${esc(m.from)}${m.date > today ? " · arrives later" : ""}</div>
      <details><summary>Read it</summary><div class="mail">${esc(m.body)}</div></details></div></div>`).join("")}
      <h5>Drive folder</h5>${Object.entries(S.drive).map(([n, t]) => `<div class="ent"><div><b>${esc(n)}</b><details><summary>Open</summary><div class="mail">${esc(t)}</div></details></div></div>`).join("")}
      <h5>Notes members forwarded</h5>${S.captures.map((c) => `<div class="ent" style="${c.date > today ? "opacity:.6" : ""}"><div><div class="sub">${fmt(c.date)}</div>${esc(c.text)}</div></div>`).join("")}</div>`;
  }
}

function doRun(day) {
  if (day <= S.meta.today) { toast("Pick a date after " + fmt(S.meta.today) + "."); return; }
  if (day > "2027-09-30") { toast("The demo runs until 30 Sep 2027. Start over to replay it."); return; }
  H.run(S, day); logRun = S.runs.length; render(true);
  if (window.HeirGoTo) window.HeirGoTo("#demo");
  toast(`Run ${S.runs.length} done.`);
}
function act(fn, msg) { fn(); renderTurn(); renderPanel(); toast(msg); }
function start() { S = H.createState(); H.run(S, STEPS[0].d); logRun = 1; lastFigs = []; render(false); }

$("restart").onclick = () => { start(); toast("Started over at run 1."); };
document.querySelectorAll(".tabsrow[role=tablist] button").forEach((b) => b.onclick = () => { tab = b.dataset.tab; renderPanel(); });

// ---------------------------------------------------------------- the reader: Scout's rules beside a model, with the quote check
// Same patterns as agents.py, and the same gate as llm.check(): a model item survives only if its quote is in the text.
const SAMPLES = [
  ["WhatsApp line", "Bhai Estate office approved LC2 this time only, next year they want the hall request 30 days before or they won't process it. Also Rhea told Quillstone we'd send them a 2-page report after the event, not sure anyone did it"],
  ["Voice note", "Quick one after the Lumaro call. Meera can't make it this year, I told her we will keep you posted for the next edition, so someone please invite her around June."],
  ["Sponsor email", "Dear Meridian Club team, as agreed on our call, Corvane will sponsor the networking dinner. In return, please share the attendee list within 10 days of the event and put our logo on the backdrop. Regards, Ananya"],
];
const R_LEAD = [[/at least (\d+) days in advance/, 1], [/(\d+) weeks? notice/, 7], [/(\d+) days lead time/, 1]];
const R_PROMISE = /(we will keep you posted|we will get back to you|we will reach out)[^.]*/i;
const R_CLAIM = /(airfare|travel|flights?)[^.]*(will be|is) (reimbursed|covered|paid)/i;
const KINDS = { commitment: "Owed to someone", promise: "Promise", lead_time: "Lead time", policy_claim: "Said to someone" };
function ruleRead(text) {
  const low = text.toLowerCase(), out = [];
  const p = text.match(R_PROMISE); if (p) out.push(["promise", p[0]]);
  const c = text.match(R_CLAIM); if (c) out.push(["policy_claim", c[0]]);
  R_LEAD.forEach(([re, mult]) => { const m = low.match(re); if (m) out.push(["lead_time", `${+m[1] * mult} days (${m[0]})`]); });
  if (low.includes("deliverables")) (text.match(/^\d+\.\s+(.+?)\.?$/gm) || []).forEach((l) => out.push(["commitment", l.replace(/^\d+\.\s+/, "")]));
  const w = low.match(/still waiting for the ([a-z -]+report)/); if (w) out.push(["commitment", "Counterparty is chasing the " + w[1]]);
  return out;
}
const flat = (s) => String(s || "").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim().toLowerCase();
function quoteCheck(items, source) {
  const text = flat(source), ok = [], bad = [];
  (Array.isArray(items) ? items : []).forEach((it) => {
    if (!it || typeof it !== "object") return bad.push([{ title: String(it).slice(0, 60) }, "not an object"]);
    const q = flat(it.quote).replace(/\.$/, "");
    if (!KINDS[it.kind]) bad.push([it, `unknown kind "${it.kind}"`]);
    else if (!String(it.title || "").trim()) bad.push([it, "no title"]);
    else if (q.length < 12 || !text.includes(q)) bad.push([it, "quote not found in your text"]);
    else if (it.days != null && !(Number.isInteger(it.days) && it.days > 0 && it.days < 400)) bad.push([it, "bad days value"]);
    else ok.push(it);
  });
  return [ok, bad];
}
const READ_PROMPT = `You read one message from a student committee's records: an email, a chat line or a voice-note transcript.
Return JSON {"items": [...]}. Each item has: kind (commitment | promise | lead_time | policy_claim), title (short and plain),
counterparty (person or organisation, or null), days (integer or null: a lead time in days, or a deadline "within N days"),
quote (the exact words from the message, copied character for character). Only include what the message states.
If nothing qualifies, return {"items": []}. Message:
`;
let sampler = null, samplerAsked = null, reading = false;
// the claude.ai viewer may attach window.claude after this script runs, so ask lazily and remember the answer
function getSampler() {
  if (sampler || samplerAsked) return samplerAsked || Promise.resolve(sampler);
  if (!(window.claude && typeof window.claude.use === "function")) return Promise.resolve(null);
  samplerAsked = window.claude.use("sample").then((s) => (sampler = s)).catch(() => null);
  return samplerAsked;
}
window.addEventListener("load", () => setTimeout(getSampler, 400));
function pickSample(i) {
  $("rdText").value = SAMPLES[i][1];
  document.querySelectorAll("#rdChips button").forEach((b, j) => b.setAttribute("aria-pressed", String(i === j)));
}
$("rdChips").innerHTML = SAMPLES.map(([n], i) => `<button type="button" aria-pressed="false" data-i="${i}">${esc(n)}</button>`).join("");
document.querySelectorAll("#rdChips button").forEach((b) => b.onclick = () => pickSample(+b.dataset.i));
pickSample(0);
$("rdText").addEventListener("input", () => document.querySelectorAll("#rdChips button").forEach((b) => b.setAttribute("aria-pressed", "false")));
const rdItem = (kind, title, extra) => `<div class="rd-it"><b>${esc(KINDS[kind] || kind)}:</b> ${esc(title)}${extra || ""}</div>`;
async function readIt() {
  if (reading) return;
  const text = $("rdText").value.trim();
  if (!text) { toast("Paste a message first."); return; }
  const rules = ruleRead(text);
  $("rdRules").innerHTML = rules.length ? rules.map(([k, s]) => rdItem(k, s)).join("")
    : `<p class="empty">Nothing. None of the phrasings the rules know appear here.</p>`;
  reading = true; $("rdGo").disabled = true;
  if (!sampler && window.claude) $("rdModel").innerHTML = `<p class="empty">Connecting to the model...</p>`;
  const s = await getSampler();
  reading = false; $("rdGo").disabled = false;
  if (!s) {
    $("rdModel").innerHTML = `<p class="empty">The model reader is off in this view. Open the page signed in to claude.ai to run it; the rules column works for everyone.</p>`;
    return;
  }
  reading = true; $("rdGo").disabled = true;
  $("rdModel").innerHTML = `<p class="empty">Reading...</p>`;
  try {
    const res = await sampler.json(READ_PROMPT + text, { modelTier: "quick" });
    const [ok, bad] = quoteCheck(res && res.items, text);
    $("rdModel").innerHTML = (ok.map((it) => rdItem(it.kind, it.title + (it.counterparty ? ` (${it.counterparty})` : "") + (it.days ? `, ${it.days} days` : ""),
      ` <span class="stamp wait">To reconfirm</span><div class="q">"${esc(it.quote)}"</div>`)).join("")
      + bad.map(([it, why]) => `<div class="rd-it"><b>Rejected:</b> ${esc(it.title || "untitled")}<div class="why">${esc(why)}</div></div>`).join(""))
      || `<p class="empty">The model found nothing to keep.</p>`;
  } catch (e) {
    const code = e && e.code;
    $("rdModel").innerHTML = `<p class="empty">${code === "not_granted" ? "Permission was not given, so only the rules ran." : code === "rate_limited" ? "Too many reads just now. Try again in a minute." : "The model could not be reached. The rules column still stands."}</p>`;
  } finally { reading = false; $("rdGo").disabled = false; }
}
$("rdGo").onclick = readIt;
// ---------------------------------------------------------------- page behaviour, ported from the portfolio
const root = document.documentElement;
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const topBar = $("topbar"), prog = $("prog"), floatBtn = $("float"), ring = $("ring"), floatLabel = $("floatLabel"), hero = $("hero");

// theme: light by default, the viewer's choice remembered on this device, applied instantly
function setTheme(name) {
  root.dataset.theme = name;
  try { localStorage.setItem("heir-theme", name); } catch (e) { /* storage blocked: the choice lasts this visit */ }
  $("themebtn").setAttribute("aria-label", name === "dark" ? "Switch to light theme" : "Switch to dark theme");
}
setTheme(root.dataset.theme === "dark" ? "dark" : "light");
$("themebtn").onclick = () => setTheme(root.dataset.theme === "dark" ? "light" : "dark");

// smooth wheel scrolling (Lenis), asleep at rest, idle time kept out of its clock
let lenis = null, loopOn = false, idle = 0, lastFrame = 0, scrollTime = 0;
function loop(t) {
  if (!lenis) { loopOn = false; return; }
  if (lastFrame) scrollTime += Math.min(64, Math.max(0, t - lastFrame));
  lastFrame = t; lenis.raf(scrollTime);
  if (lenis.isScrolling) idle = 0; else idle++;
  if (idle < 3) requestAnimationFrame(loop); else { loopOn = false; lastFrame = 0; }
}
function wake() { if (!loopOn && lenis) { loopOn = true; idle = 0; requestAnimationFrame(loop); } }
if (!reduce && window.Lenis) {
  try { lenis = new window.Lenis({ lerp: 0.07, smoothWheel: true, syncTouch: false, autoRaf: false, anchors: false }); lenis.on("virtual-scroll", wake); } catch (e) { lenis = null; }
}
// land a section's heading about 40px under the top bar
function goTo(target, immediate) {
  let y = 0;
  if (target) {
    const pad = parseFloat(getComputedStyle(target).paddingTop) || 0;
    y = target.getBoundingClientRect().top + window.scrollY + pad - topBar.offsetHeight - 40;
  }
  if (lenis) { lenis.resize(); lenis.scrollTo(Math.max(0, y), { duration: 1.1, lerp: 0, easing: (k) => 1 - Math.pow(1 - k, 3), immediate: !!immediate }); wake(); }
  else window.scrollTo({ top: Math.max(0, y), behavior: reduce || immediate ? "auto" : "smooth" });
}
function visit(id, push) {
  const el = id && id !== "#hero" ? document.getElementById(id.slice(1)) : null;
  if (id && id !== "#hero" && !el) return;
  if (push) { try { const url = location.pathname + location.search + (el ? id : ""); if (location.pathname + location.search + location.hash !== url) history.pushState(null, "", url); } catch (e) { /* sandboxed history */ } }
  const focus = el || document.querySelector(".brand");
  if (el) el.setAttribute("tabindex", "-1");
  if (focus) focus.focus({ preventScroll: true });
  goTo(el || 0);
}
try { if ("scrollRestoration" in history) history.scrollRestoration = "manual"; } catch (e) { /* ignore */ }
document.querySelectorAll("a[data-go]").forEach((a) => a.addEventListener("click", (e) => {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault(); visit(a.getAttribute("href"), true);
}));
floatBtn.addEventListener("click", () => visit("#hero", true));
window.addEventListener("popstate", () => visit(location.hash, false));

// phone menu: closes on a pick, a click outside, or Escape
const menuBtn = $("menuBtn"), mnav = $("mnav");
function setMenu(open) { mnav.hidden = !open; menuBtn.setAttribute("aria-expanded", String(open)); menuBtn.setAttribute("aria-label", open ? "Close section menu" : "Open section menu"); }
menuBtn.addEventListener("click", (e) => { e.stopPropagation(); setMenu(mnav.hidden); });
mnav.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => setMenu(false)));
document.addEventListener("click", (e) => { if (!mnav.hidden && !mnav.contains(e.target)) setMenu(false); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !mnav.hidden) { setMenu(false); menuBtn.focus(); } });

// one scroll handler per frame: progress line, bar rule, back-to-top pill, current section in the nav
const navLinks = [...document.querySelectorAll(".nav a")];
const LABELS = { hero: "Top", play: "Play", walk: "Steps", use: "Members", demo: "Play it", read: "Reader", gap: "Gap", others: "Others", how: "How", weak: "Weak spots" };
const secs = ["hero", "play", "walk", "use", "demo", "read", "gap", "others", "how", "weak"].map((id) => document.getElementById(id));
let ticking = false;
function update() {
  ticking = false;
  const y = window.scrollY, vh = window.innerHeight, max = document.documentElement.scrollHeight - vh;
  const heroEnd = hero.offsetTop + hero.offsetHeight * 0.6, mark = y + vh * 0.35;
  let cur = null; secs.forEach((sct) => { if (sct && sct.offsetTop <= mark) cur = sct; });
  const pr = max > 0 ? Math.min(1, Math.max(0, y / max)) : 0;
  prog.style.transform = `scaleX(${pr})`;
  topBar.classList.toggle("scrolled", y > 8);
  floatBtn.classList.toggle("show", y > heroEnd);
  ring.style.strokeDashoffset = String(100 - pr * 100);
  if (cur) floatLabel.textContent = LABELS[cur.id] || "Top";
  navLinks.forEach((a) => { const on = cur && a.getAttribute("href") === "#" + cur.id; a.classList.toggle("on", !!on); if (on) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current"); });
}
const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
window.addEventListener("scroll", onScroll, { passive: true });
window.addEventListener("resize", onScroll, { passive: true });

// sections rise in just before they scroll into view; everything stays visible without the script
if ("IntersectionObserver" in window && !reduce) {
  const io = new IntersectionObserver((entries) => entries.forEach((en) => {
    if (en.isIntersecting && en.boundingClientRect.top > 0) { en.target.classList.add("play"); io.unobserve(en.target); }
    else if (en.isIntersecting) io.unobserve(en.target);
  }), { rootMargin: "0px 0px 12% 0px", threshold: 0 });
  document.querySelectorAll(".reveal").forEach((el) => { if (el.getBoundingClientRect().top > window.innerHeight) io.observe(el); });
}

// figures in the ticket strip count up once, when first seen
function countUp(el) {
  const end = +el.dataset.count;
  if (reduce || !end) return;
  let t0 = null;
  const step = (t) => { if (t0 === null) t0 = t; const k = Math.min(1, (t - t0) / 1100); el.textContent = String(Math.round(end * (1 - Math.pow(1 - k, 3)))); if (k < 1) requestAnimationFrame(step); };
  el.textContent = "0"; requestAnimationFrame(step);
}
if ("IntersectionObserver" in window) {
  const cio = new IntersectionObserver((entries) => entries.forEach((en) => { if (en.isIntersecting) { countUp(en.target); cio.unobserve(en.target); } }), { threshold: 0.6 });
  document.querySelectorAll("[data-count]").forEach((el) => cio.observe(el));
}

// hero entrance; cards drop their animation once played so later transforms are free
function loaded() {
  document.body.classList.add("loaded");
  document.querySelectorAll(".doc,.ledger,.pk-sticker").forEach((c) => c.addEventListener("animationend", () => c.classList.add("settled"), { once: true }));
}
window.HeirGoTo = (id) => visit(id, false);
start();
update();
root.classList.add("js");
requestAnimationFrame(() => requestAnimationFrame(loaded));
})();
