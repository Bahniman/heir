(function () {
"use strict";
/* Step-by-step walkthrough. Every value shown comes from the same engine the free-play demo runs:
   each step replays the four runs up to its point and reads the resulting memory. */
const H = window.HeirEngine;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmt = (s, yr = true) => { if (!s) return ""; const d = new Date(s + "T00:00:00Z"); return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: yr ? "numeric" : undefined, timeZone: "UTC" }); };

// ---------------------------------------------------------------- replay the demo to a point
const cache = {};
function at(stage) {
  if (cache[stage]) return cache[stage];
  const S = H.createState();
  if (typeof stage === "string") {
    // part-way through run 1: the Scout has read mail up to this one (in date order), and Drive only if "+d"
    const [last, d] = stage.split("+");
    S.mail = S.mail.filter((m) => m.id <= last);
    for (const k of Object.keys(S.drive)) if (!d || k.startsWith("whatsapp")) S.drive[k] = "";
    S.captures = [];
    H.run(S, "2027-03-10");
    return (cache[stage] = S);
  }
  if (stage >= 1) H.run(S, "2027-03-10");
  if (stage >= 2) H.run(S, "2027-05-20");
  if (stage >= 2.5) {
    H.approve(S, "D-003", "Ishaan"); H.approve(S, "D-004", "Riya");
    H.resolve(S, "E-002", "Ishaan", "owner: Kabir. Send it now with an apology");
    H.resolve(S, "E-001", "Ishaan", "Policy stands: airfare is not covered. Say so plainly if asked");
    H.done(S, "T-001", "Ishaan");
  }
  if (stage >= 3) H.run(S, "2027-05-27");
  if (stage >= 3.5) H.approve(S, "D-005", "Kabir");
  if (stage >= 4) H.run(S, "2027-05-28");
  return (cache[stage] = S);
}
const L = (S, id) => S.ledger.find((r) => r.id === id);
const T = (S, id) => S.tasks.find((r) => r.id === id);
const Dr = (S, id) => S.drafts.find((r) => r.id === id);
const E = (S, id) => S.escalations.find((r) => r.id === id);
const trace = (S, run, pred) => S.trace.filter((t) => t.run === run && (!pred || pred(t)));

// ---------------------------------------------------------------- small views
const KINDS = { commitment: "debt owed", promise: "promise", account: "login", claim: "said to someone", lead_time: "lead time", criterion: "lesson", policy: "policy", contact: "contact" };
const PLURAL = { commitment: "debts owed", promise: "promises", account: "logins", claim: "things said to people", lead_time: "lead times", criterion: "lessons", policy: "policies", contact: "contacts" };
const TAGS = { historical: "historical", confirmed: "confirmed", reconfirm: "to reconfirm" };
function src(ev) {
  return ev.split(" | ").map((x) => x.trim()).map((x) => {
    let m;
    if ((m = x.match(/^mail:(m\d+) \((\S+)\)/))) return `email ${m[1]}, ${fmt(m[2])}`;
    if ((m = x.match(/^drive:(.+)$/))) return `Drive: ${m[1]}`;
    if ((m = x.match(/^done: whatsapp:(\d+) \((\S+), (\w+)\)/))) return `done per ${m[3]}'s chat line, ${fmt(m[2])}`;
    if ((m = x.match(/whatsapp:(\d+) \((\S+), (\w+)\)/))) return `chat line from ${m[3]}, ${fmt(m[2])}`;
    if ((m = x.match(/^capture:c\d+_(\S+?)_/))) return `note forwarded ${fmt(m[1])}`;
    if ((m = x.match(/^chased by (\w+) mail:(m\d+) \((\S+)\)/))) return `chased by ${m[1]}, email ${m[2]}`;
    if ((m = x.match(/^kept: mail:(\S+) \((\S+)\)/))) return `kept: reply of ${fmt(m[2])}`;
    return x;
  });
}
function ent(r, note) {
  if (!r) return "";
  const st = r.status === "open" ? "open" : r.status;
  return `<div class="wk-ent" data-k="${r.kind}">
    <div class="wk-ent-top"><span class="wk-id">${r.id}</span><span class="stamp">${KINDS[r.kind]}</span><span class="stamp s-${esc(st).replace(/\W/g, "")}">${esc(st)}</span></div>
    <b>${esc(r.title)}</b>
    <dl>${r.owner ? `<dt>Owner</dt><dd>${esc(r.owner)}</dd>` : ""}${r.due ? `<dt>Due</dt><dd>${fmt(r.due)}</dd>` : ""}${r.detail && r.kind !== "contact" ? `<dt>Detail</dt><dd>${esc(r.detail)}</dd>` : ""}
    <dt>Trust</dt><dd>${TAGS[r.tag] || r.tag}</dd><dt>Source</dt><dd class="mono">${src(r.evidence).map(esc).join("<br>")}</dd></dl>
    ${note ? `<p class="wk-note">${note}</p>` : ""}</div>`;
}
function mark(text, marks) {
  let h = esc(text);
  for (const m of marks || []) { const e = esc(m); h = h.split(e).join(`<mark>${e}</mark>`); }
  return h;
}
function mail(S, id, marks, label) {
  const m = S.mail.find((x) => x.id === id);
  if (!m) return "";
  return `<div class="wk-doc"><div class="wk-doc-h"><span>${label || "email " + esc(id)}</span><span>${fmt(m.date)}</span></div>
    <div class="wk-meta">From ${esc(m.from)}<br>To ${esc(m.to)}<br><b>${esc(m.subject)}</b></div><div class="wk-body">${mark(m.body, marks)}</div></div>`;
}
function file(S, name, marks, label) {
  return `<div class="wk-doc"><div class="wk-doc-h"><span>${label || "Drive / " + esc(name)}</span><span>file</span></div><div class="wk-body mono">${mark(S.drive[name], marks)}</div></div>`;
}
function cap(S, key, marks, label) {
  const c = S.captures.find((x) => x.source.includes(key));
  return `<div class="wk-doc"><div class="wk-doc-h"><span>${label}</span><span>${fmt(c.date)}</span></div><div class="wk-body">${mark(c.text, marks)}</div></div>`;
}
function draft(d, extra) {
  if (!d) return "";
  const st = d.status === "pending approval" ? "waiting for a member" : d.status === "sent" ? `sent${d.approved_by ? ", approved by " + d.approved_by : ""}` : d.status;
  return `<div class="wk-doc wk-mail"><div class="wk-doc-h"><span>${d.id} · ${d.kind === "exit question" ? "internal question" : "email to approve"}</span><span class="${d.status === "sent" ? "ok" : "warn"}">${esc(st)}</span></div>
    <div class="wk-meta">To ${esc(d.recipient)}<br><b>${esc(d.subject)}</b></div><div class="wk-body">${esc(d.body)}</div>
    ${d.reason ? `<p class="wk-why">Why Heir wrote it: ${esc(d.reason.replace(/mail:(m\d+)/g, "email $1"))}</p>` : ""}${extra || ""}</div>`;
}
function ask(e) {
  if (!e) return "";
  return `<div class="wk-ask"><div class="wk-doc-h"><span>${e.id} · question for the ${esc(e.to_role.toLowerCase())}</span><span class="${e.status === "open" ? "warn" : "ok"}">${e.status === "open" ? "waiting" : "answered"}</span></div>
    <p>${esc(e.question.replace(/mail:(m\d+)/g, "email $1").replace(/\b(\d{4}-\d{2}-\d{2})\b/g, (x) => fmt(x)))}</p>${e.resolution ? `<p class="wk-ans">${esc(e.resolved_by)}: "${esc(e.resolution)}"</p>` : ""}</div>`;
}
function logl(S, run, pred, max) {
  const rows = trace(S, run, pred).slice(0, max || 40);
  return `<div class="wk-log">${rows.map((t) => `<div><span>${t.agent}</span>${esc(t.action)} <i>${esc(t.detail.replace(/mail:(m\d+)/g, "email $1"))}</i></div>`).join("")}</div>`;
}
const rule = (h, lines) => `<h6>${h}</h6>${lines.map((l) => `<p>${l}</p>`).join("")}`;
const calc = (rows) => `<table class="wk-calc">${rows.map((r) => `<tr>${r.map((c, i) => `<td${i === r.length - 1 ? ' class="r"' : ""}>${c}</td>`).join("")}</tr>`).join("")}</table>`;

// ---------------------------------------------------------------- the steps
const CH = ["Set up once", "Read", "Check the handover", "Ask the leavers", "Plan", "You decide", "Follow through", "Close the loop", "In members' hands"];
const RUNLAB = { m03: "Run 1 · 10 Mar 2027 · the Scout reading email m03", m04: "Run 1 · the Scout reading email m04", m10: "Run 1 · the Scout reading emails m05 to m10", m12: "Run 1 · the Scout reading emails m11 and m12", "m13+d": "Run 1 · the Scout reading the rest of the mail and Drive", 0: "Before any run", 1: "Run 1 · 10 Mar 2027 · three weeks before handover", 2: "Run 2 · 20 May 2027 · new team in charge",
  2.5: "Between runs · members respond", 3: "Run 3 · 27 May 2027 · a week later", 3.5: "Between runs · a member approves", 4: "Run 4 · 28 May 2027 · the next day" };

const STEPS = [
  { ch: 0, stage: 0, ag: ["Member"], t: "Connect the club's own accounts, once",
    b: "A club gives Heir read access to its shared mailbox and Drive folder, uploads a chat export, and lists who holds which role this year and next. It sets the next event date and the handover date. Heir lives on the club's account, so it stays when members graduate.",
    i: (S) => { const c = H.COMMITTEE; return `<div class="wk-cfg"><div><span>Club mailbox</span><b>${c.club_mailbox}</b><em>read only</em></div>
      <div><span>Drive folder</span><b>${Object.keys(S.drive).length} files</b><em>${Object.keys(S.drive).map(esc).join(", ")}</em></div>
      <div><span>Outgoing team 2026-27</span><b>${c.outgoing_team.map((m) => m.name).join(", ")}</b><em>${c.outgoing_team.map((m) => m.role).join(", ")}</em></div>
      <div><span>Incoming team 2027-28</span><b>${c.incoming_team.map((m) => m.name).join(", ")}</b><em>${c.incoming_team.map((m) => m.role).join(", ")}</em></div>
      <div><span>Events</span><b>${c.events.map((e) => `${e.name}, ${fmt(e.date)}`).join(" · ")}</b></div>
      <div><span>Handover date</span><b>${fmt(c.handover_date)}</b></div><div><span>Reply limit</span><b>${c.reply_sla_days} days</b><em>then Heir follows up</em></div></div>`; },
    r: rule("Nothing here belongs to one club", ["Another club changes the roster, the dates and its event template. Heir learns the rest (lead times, contacts, debts) from that club's own records.", "The mock club in this demo is invented. Every person and company in it is fictional."]),
    o: () => `<h6>The club's event template</h6><p class="wk-small">Written once by the club: the usual steps, who owns each, and a default timing. Where last year's mail gives a real lead time, Heir uses that instead.</p>
      ${calc([["Step", "Role", "Timing"]].concat(H.TEMPLATE.map(([t, r, off, res]) => [esc(t), esc(r), res ? `from records: "${esc(res)}"` : `${off > 0 ? off + " days after" : -off + " days before"} event`])))}` },

  { ch: 0, stage: 1, ag: ["Trigger", "Supervisor"], t: "A schedule wakes it up",
    b: "Every morning a scheduler (n8n, or Windows Task Scheduler) runs one command. Heir starts each run from its saved memory, not from zero. The Supervisor compares today with the handover date and picks the goal for this run.",
    i: () => `<div class="wk-term"><div class="g"># n8n cron, 07:00 every day</div><div>$ python heir.py run --today 2027-03-10</div></div>`,
    r: rule("Before handover: shadow. After: run.", ["10 Mar 2027 is before the 1 Apr handover, so this run only captures and checks: Scout, then Auditor.", "After 1 Apr the same command also plans and drafts: Scout, Auditor, Planner, Drafter."]),
    o: (S) => `<h6>What the Supervisor logged</h6>${logl(S, 1, (t) => t.agent === "Supervisor" && t.action !== "hand back")}` },

  { ch: 1, stage: "m03", ag: ["Scout"], t: "A sponsor email becomes three debts", hi: ["L-003", "L-004", "L-005"],
    b: "The Scout reads every email in last year's mailbox in date order. This one is the sponsor confirming what the club agreed to deliver. Each numbered deliverable becomes its own entry with a due date.",
    i: (S) => mail(S, "m03", ["Quillstone logo on the stage banner.", "Two social media posts naming Quillstone before the event.", "A post-event report with attendance figures and photos", "within 21 days of the event"]),
    r: rule("Numbered list under \"deliverables\" → one debt per line", ["Due date: the event date, or \"within N days of the event\" counted from it.", calc([["Event date", "8 Aug 2026"], ["+ within 21 days", "+21"], ["Report due", "<b>29 Aug 2026</b>"]])]),
    o: (S) => ent(L(S, "L-005")) + `<div class="wk-mini">${["L-003", "L-004"].map((id) => `<div data-k="commitment"><span>${id}</span>${esc(L(S, id).title)} · due ${fmt(L(S, id).due)}</div>`).join("")}</div>` },

  { ch: 1, stage: "m04", ag: ["Scout"], t: "A member's reply sets the owner", hi: ["L-005"],
    b: "Two weeks later Aditi replied for the club. Once a member confirms in writing, the debts move from \"historical\" to \"confirmed\" and Aditi becomes their owner.",
    i: (S) => mail(S, "m04", ["We confirm all three deliverables"]),
    r: rule("Three levels of trust on every entry", ["<b>historical</b>: seen in old records only.", "<b>confirmed</b>: a member said so in writing.", "<b>to reconfirm</b>: stated but unproven, or proposed by a language model. Heir asks before relying on it."]),
    o: (S) => ent(L(S, "L-005"), "Owner Aditi graduates in March. Watch what happens to this debt.") },

  { ch: 1, stage: "m10", ag: ["Scout"], t: "Office replies teach it lead times", hi: ["L-007", "L-009", "L-013"],
    b: "Campus offices and vendors state their notice periods once, in passing. Heir keeps them so next year's team does not learn them by missing a deadline.",
    i: (S) => mail(S, "m06", ["at least 30 days in advance"]) + mail(S, "m08", ["3 weeks notice"]),
    r: rule("Notice phrases → lead times", ["\"at least N days in advance\", \"N weeks notice\", \"N days lead time\".", "The resource is matched from the words around it: hall, rooms, banner."]),
    o: (S) => ent(L(S, "L-007")) + ent(L(S, "L-009")) + ent(L(S, "L-013")) },

  { ch: 1, stage: "m12", ag: ["Scout"], t: "A polite line becomes a promise", hi: ["L-015"],
    b: "A speaker offered to join after the panel was full. Neel wrote back that the club would keep her posted. Nobody would put that in a handover doc. Heir keeps it as a promise the club owes her.",
    i: (S) => mail(S, "m11", []) + mail(S, "m12", ["we will keep you posted for future events"]),
    r: rule("Promise phrases in mail the club sent → promise", ["\"we will keep you posted\", \"we will get back to you\", \"we will reach out\".", calc([["Next event", "7 Aug 2027"], ["− 75 days, while the panel is open", "−75"], ["Promise due", "<b>24 May 2027</b>"]])]),
    o: (S) => ent(L(S, "L-015")) },

  { ch: 1, stage: "m13+d", ag: ["Scout"], t: "What was said, next to what is allowed", hi: ["L-011", "L-019"],
    b: "Neel told one speaker the club would reimburse airfare. The club's own speaker policy in Drive says airfare is not covered. Heir keeps both: one as a claim made to a person, one as a policy.",
    i: (S) => mail(S, "m09", ["Your airfare will be reimbursed by the club"]) + file(S, "Speaker_Policy.md", ["Airfare: not covered by the club."]),
    r: rule("Claims and policies are kept apart", ["A claim is something a member told an outsider. A policy is a club rule from Drive.", "The Auditor compares them on every run."]),
    o: (S) => ent(L(S, "L-011")) + ent(L(S, "L-019")) },

  { ch: 1, stage: "m13+d", ag: ["Scout"], t: "Same person, two addresses, two members", hi: ["L-001"],
    b: "Neel and Sana both cold-emailed the same speaker a week apart, at two different addresses. Neither got a reply. Heir matches contacts by name and organisation, so the new team will not write a third time.",
    i: (S) => mail(S, "m01", []) + mail(S, "m02", []),
    r: rule("Contacts match on name and organisation, not only the address", ["\"Ravi Iyer\" at Fintrail and \"Ravi K. Iyer\" at Fintrail are one person.", "Both senders are kept as owners, with last contact and status."]),
    o: (S) => ent(L(S, "L-001")) },

  { ch: 1, stage: 1, ag: ["Scout"], t: "Chats and forwarded notes count too", hi: ["L-003", "L-004", "L-024"],
    b: "Members finish work in chat, not in email. Aditi's chat lines prove two deliverables happened, so Heir closes them with those lines as evidence. A voice note Neel forwarded after the event becomes outreach lessons.",
    i: (S) => file(S, "whatsapp_export_core_team.txt", ["banner printed with the Quillstone logo", "posted both Quillstone posts on LinkedIn and Instagram", "cold LinkedIn DMs are not working, almost nobody replies"], "Chat export, core team") + cap(S, "c01", ["people who already speak at conclaves of similar standing, warm intros from alumni"], "Voice note forwarded by Neel"),
    r: rule("A member's own words close or teach", ["A chat line saying a deliverable happened closes it, and the line is kept as proof.", "Lessons are stored as member-reported. Calls and DMs reach Heir only if a member forwards a note."]),
    o: (S) => ent(L(S, "L-003")) + ent(L(S, "L-024")) },

  { ch: 1, stage: 1, ag: ["Scout"], t: "One ledger, and every line can be traced",
    b: "After one read the club has a memory it never had: 29 entries, each with an owner where one exists, a due date where one exists, and the exact source. Where a language model is switched on, it can suggest more, but it cannot write to the ledger on its own.",
    i: (S) => { const t = trace(S, 1, (x) => x.action === "read new records")[0]; return `<div class="wk-term"><div>${esc(t.detail.replace("; extractor: rules (offline)", ""))}</div></div>
      <div class="wk-kinds">${Object.entries(S.ledger.reduce((a, r) => (a[r.kind] = (a[r.kind] || 0) + 1, a), {})).sort((a, b) => b[1] - a[1]).map(([k, n]) => `<div><b>${n}</b><span>${n > 1 ? PLURAL[k] : KINDS[k]}</span></div>`).join("")}</div>`; },
    r: rule("The model is checked by code", ["Rules run first. A model may then propose extra entries from messy text.", "Code keeps a proposal only if its quote appears word for word in the source, and tags it \"to reconfirm\" until a member confirms it.", "Try it in the Reader below."]),
    o: (S) => `<h6>Club memory after run 1</h6><div class="wk-mini">${S.ledger.map((r) => `<div data-k="${r.kind}"><span>${r.id}</span>${esc(r.title)}</div>`).join("")}</div>` },

  { ch: 2, stage: 1, ag: ["Auditor"], t: "Hold the handover doc against the ledger",
    b: "The outgoing team wrote an eight-line handover doc. The Auditor checks every debt, promise, lead time, claim and lesson in the ledger against it.",
    i: (S) => file(S, "Handover_2026-27.md", ["All deliverables done."], "The handover doc the leavers wrote"),
    r: rule("Is each item in the doc?", ["Debts, promises and claims: is the other party named?", "Lead times: is the number of days there?", "Lessons: do two of its key words appear?"]),
    o: (S) => { const g = S.ledger.filter((r) => ["commitment", "promise", "lead_time", "claim", "criterion"].includes(r.kind));
      return `<div class="wk-big"><b>${g.filter((r) => !r.in_handover).length}/${g.length}</b><span>missing from the handover doc</span></div><div class="wk-mini">${g.map((r) => `<div class="${r.in_handover ? "in" : "out"}"><span>${r.in_handover ? "in doc" : "missing"}</span>${esc(r.title)}</div>`).join("")}</div>`; } },

  { ch: 2, stage: 1, ag: ["Auditor"], t: "\"All deliverables done.\" It was not.", hi: ["L-005"],
    b: "The doc says the sponsor got everything. The ledger has no record that the report was ever sent, and the sponsor chased it in August. So the Auditor flags a contradiction and counts how late it is.",
    i: (S) => file(S, "Handover_2026-27.md", ["Sponsor: Quillstone (title sponsor). All deliverables done."], "Handover doc") + mail(S, "m13", ["We are still waiting for the post-event report."]),
    r: rule("A \"done\" with no proof is a contradiction", [calc([["Report due", "29 Aug 2026"], ["Today", "10 Mar 2027"], ["Late by", "<b>193 days</b>"]])]),
    o: (S) => ent(L(S, "L-005")) + logl(S, 1, (t) => ["handover contradicts records", "overdue"].includes(t.action)) },

  { ch: 2, stage: 1, ag: ["Auditor", "Member"], t: "When records disagree, it asks", hi: ["L-011", "L-019"],
    b: "A claim says airfare is reimbursed. The policy says it is not. Either could be current. Heir does not pick one. It sends the question to the committee head, copying the faculty advisor, before anyone writes to a speaker.",
    i: (S) => ent(L(S, "L-011")) + ent(L(S, "L-019")),
    r: rule("Escalate, don't guess", ["Conflicting records, a debt with no owner, access held outside the team, and silence after a follow-up all go to a human."]),
    o: (S) => ask(E(S, "E-001")) },

  { ch: 3, stage: 1, ag: ["Auditor"], t: "Ask the people leaving, while they still answer",
    b: "Gaps found before the handover become one short question to the person who knows. These go to members inside the club, so they need no approval.",
    i: (S) => ent(L(S, "L-005")) + ent(L(S, "L-016")),
    r: rule("Internal questions go out on their own", ["An overdue debt goes to its owner. Logins nobody can confirm go to the logistics lead.", "Anything addressed outside the club always waits for approval."]),
    o: (S) => draft(Dr(S, "D-001")) + draft(Dr(S, "D-002")) },

  { ch: 3, stage: 2, ag: ["Scout"], t: "Their answers come back as records", hi: ["L-017", "L-018"],
    b: "Aditi and Sana replied before leaving. On the next run the Scout reads the replies like any other record, so the answers stay with the club after they graduate.",
    i: (S) => cap(S, "c02", ["The Quillstone post-event report was never sent", "Photos are in Drive/Photos"], "Reply from Aditi") + cap(S, "c03", ["held only by the faculty advisor"], "Reply from Sana"),
    r: rule("Answers update the entries they are about", ["The logins now say who really holds them. That turns into a question for the new head in run 2."]),
    o: (S) => ent(L(S, "L-017")) },

  { ch: 4, stage: 2, ag: ["Supervisor", "Planner"], t: "New team, new goal: run the next event",
    b: "The handover happened on 1 April. On 20 May the same daily command finds the date is past the handover, so the Supervisor switches goal: deliver the next event with nothing inherited dropped.",
    i: () => `<div class="wk-term"><div>$ python heir.py run --today 2027-05-20</div></div>`,
    r: rule("Phase: run", ["Scout → Auditor → Planner → Drafter, then hand back to the members."]),
    o: (S) => logl(S, 2, (t) => (t.agent === "Supervisor" && t.action !== "hand back") || (t.agent === "Planner" && t.action === "goal")) },

  { ch: 4, stage: 2, ag: ["Planner"], t: "Plan backwards from the event date",
    b: "The Planner starts at 7 August and works back. Where last year's mail gave a lead time, it uses that plus a five-day buffer. Where there is no record, it uses the club's template and marks the task \"adjust if needed\".",
    i: (S) => calc([["Task", "Event", "Lead time", "Buffer", "Due"]].concat([["T-003", "L-007"], ["T-004", "L-009"], ["T-005", "L-013"]].map(([t, l]) => { const tk = T(S, t), lt = L(S, l);
      return [esc(tk.title), "7 Aug", `−${parseInt(lt.detail, 10)} (${src(lt.evidence)[0].split(",")[0]})`, `−${H.BUFFER}`, `<b>${fmt(tk.due, false)}</b>`]; }))),
    r: rule("due = event date − lead time − buffer", ["The plan is written to a calendar file and a task sheet, each task with an owner from this year's roster."]),
    o: (S) => timeline(S) },

  { ch: 4, stage: 2, ag: ["Planner", "Auditor"], t: "What it inherited becomes work", hi: ["L-015", "L-005"],
    b: "Last year's promise becomes a task for this year's speakers lead. The unpaid report blocks this year's sponsor renewal: asking the same sponsor for money while owing it a report would cost the club. The report has no owner, because Aditi has graduated, so the head is asked.",
    i: (S) => ent(L(S, "L-015")) + ent(L(S, "L-005")),
    r: rule("Debts come before new asks", ["An open promise → a task with the promise as the reason.", "An overdue debt to a sponsor → the renewal is blocked until it is paid.", "A debt whose owner has left → question to the head."]),
    o: (S) => taskRows(S, ["T-009", "T-006", "T-010"]) + ask(E(S, "E-002")) + ask(E(S, "E-003")) },

  { ch: 5, stage: 2, ag: ["Drafter", "Member"], t: "It drafts. A member sends.",
    b: "For tasks due in the next 45 days the Drafter writes the email and says why it wrote it. Nothing leaves the club until a member presses approve. In the free-play demo below, you are that member.",
    i: (S) => taskRows(S, ["T-009", "T-003"]),
    r: rule("Draft only what is due soon, and say why", [`Tasks due within ${H.WINDOW} days get a draft. Each draft cites the record behind it.`]),
    o: (S) => draft(Dr(S, "D-003"), `<div class="wk-btns"><span class="pk-btn pri" aria-hidden="true">Approve and send</span><span class="pk-btn" aria-hidden="true">Hold</span></div>`) + draft(Dr(S, "D-004")) },

  { ch: 5, stage: 2.5, ag: ["Member"], t: "Members decide, in a few taps",
    b: "Between runs the members do three things and nothing else: approve or hold an email, answer the head's questions, and mark work done that happened outside Heir. Each decision is saved and the next run builds on it.",
    i: (S) => S.human.map((h) => { let m, x = h.text; if ((m = x.match(/^(\w+) approves (D-\d+)$/))) x = `${m[1]} approved ${m[2]}: "${Dr(S, m[2]).subject}"`; else if ((m = x.match(/^(\w+) answers (E-\d+)$/))) x = `${m[1]} answered ${m[2]}: "${E(S, m[2]).resolution}"`; else if ((m = x.match(/^(\w+) marks (T-\d+) done$/))) x = `${m[1]} marked ${m[2]} done: "${T(S, m[2]).title}"`; return `<div class="wk-act">${esc(x)}</div>`; }).join(""),
    r: rule("Decisions are memory too", ["The head named Kabir as the new owner of last year's report. The airfare question is settled: the policy stands."]),
    o: (S) => ask(E(S, "E-002")) + draft(Dr(S, "D-003")) },

  { ch: 6, stage: 3, ag: ["Scout"], t: "A reply closes last year's promise", hi: ["L-015"],
    b: "The speaker answered three days after the invite went out. On the next run the Scout links the reply to the email it answers, closes the task, and closes the promise the old team made.",
    i: (S) => mail(S, "r-D-003", ["Yes, I would like to speak"], "Reply to D-003"),
    r: rule("A reply settles what it answers", ["A reply from an address the club is waiting on settles that draft's task. A yes on a promise closes the promise."]),
    o: (S) => ent(L(S, "L-015")) + logl(S, 3, (t) => ["reply received", "promise kept"].includes(t.action)) },

  { ch: 6, stage: 3, ag: ["Auditor", "Planner", "Drafter"], t: "Silence past the limit triggers a replan",
    b: "The Estate Office has not answered the hall request in seven days. The club's limit is four. The Planner adds a follow-up for tomorrow and a fallback hall, and the Drafter writes the follow-up for approval.",
    i: (S) => draft(Dr(S, "D-004")) + calc([["Sent", "20 May"], ["Today", "27 May"], ["Waited", "<b>7 days</b>"], ["Limit", "4 days"]]),
    r: rule("Silence has a rule", ["Past the limit: follow up and line up a fallback.", "Silent after the follow-up too: ask the head whether to call or switch."]),
    o: (S) => taskRows(S, ["T-011", "T-012"]) + draft(Dr(S, "D-006")) },

  { ch: 6, stage: 3, ag: ["Planner", "Drafter"], t: "The head's answer becomes the next email", hi: ["L-005"],
    b: "The head said Kabir owns last year's report and should send it with an apology. The blocked task is unblocked with Kabir as owner, and the Drafter writes the apology for him to approve.",
    i: (S) => ask(E(S, "E-002")),
    r: rule("An answer is an instruction", ["Owner and wording come from the head's reply, not from a guess."]),
    o: (S) => draft(Dr(S, "D-005")) },

  { ch: 7, stage: 4, ag: ["Member", "Planner"], t: "Debt paid, renewal unblocked", hi: ["L-005"],
    b: "Kabir approved the apology on 27 May, and sending it closed the inherited debt. On the next morning's run the Planner marks the sponsor renewal ready to start. A debt the old team left behind is paid, and nobody had to remember it.",
    i: (S) => draft(Dr(S, "D-005")),
    r: rule("Closed only with evidence", ["A debt closes when its email is sent or a member confirms it, never because a doc says \"done\"."]),
    o: (S) => ent(L(S, "L-005")) + taskRows(S, ["T-006"]) },

  { ch: 7, stage: 4, ag: [], t: "What the members did, and what Heir did",
    b: "Over four runs Heir read, checked, planned, drafted and chased. The members approved emails and answered questions. That is the whole job for a member.",
    i: (S) => { const sent = S.outbox; const ext = sent.filter((o) => o.approved_by !== "internal, sent by Heir");
      return `<div class="wk-kinds"><div><b>${S.ledger.length}</b><span>entries in club memory</span></div><div><b>${S.tasks.length}</b><span>tasks planned</span></div><div><b>${sent.length - ext.length}</b><span>internal questions sent by Heir</span></div><div><b>${ext.length}</b><span>outside emails, each approved by a member</span></div><div><b>${S.escalations.filter((e) => e.status !== "open").length}</b><span>questions the head answered</span></div><div><b>${S.ledger.filter((r) => (r.kind === "commitment" || r.kind === "promise") && r.status === "open").length}</b><span>inherited debts or promises still open</span></div></div>`; },
    r: rule("How it would run at a real club", ["Scheduler: n8n or Task Scheduler, once a day.", "Tools: Gmail, Drive and Sheets APIs on the club account; the ledger as SQLite or a Google Sheet; the plan as a calendar file.", "Approvals: a link in an email to the member who owns the task."]),
    o: () => `<h6>Known limits</h6><p>Calls and DMs reach Heir only if a member forwards a note.</p><p>Messy text needs the model, and a member's confirmation.</p><p>It has not yet run on a real club mailbox. That is the pilot we are asking for.</p>` },

  // ---------------------------------------------------------------- chapter 9: in members' hands
  { ch: 8, stage: 2, ag: ["Trigger", "Supervisor"], t: "Where it runs", full: (S) => useWhere(S),
    b: "Heir is not an app members install. It runs as a small scheduled service on the club's own Google account. The ledger is a Google Sheet that belongs to the club, so it stays when every member graduates. Members reach it only through email, a link and a forward address." },
  { ch: 8, stage: 2, ag: ["Drafter", "Member"], t: "Each morning: one digest, only if something needs you", full: (S) => useDigest(S),
    b: "After each run, Heir emails the people who have something to do. The speakers lead gets her draft. The head gets the questions only he can answer. Nobody else is disturbed. Every item links to one page." },
  { ch: 8, stage: 2, ag: ["Member"], t: "One tap: read it, see why, approve", full: (S) => useApprove(S),
    b: "The link opens the draft on the phone, with the reason Heir wrote it and the exact line it came from. The member approves, edits or holds. Approving sends it from the club mailbox and writes the decision to the ledger." },
  { ch: 8, stage: 2, ag: ["Member"], t: "The head's page: the whole club at a glance", full: (S) => useDash(S),
    b: "The committee head, and only the head, gets a dashboard: the countdown to the event, what needs a decision, the plan with owners, and the ledger with a source behind every line. When the head changes next year, the page passes to the new head with everything on it." },
  { ch: 8, stage: 2, ag: ["Scout", "Member"], t: "After a call or a DM: forward it", full: (S) => useForward(S),
    b: "Heir cannot read personal chats or calls, and should not. So a member forwards a note, a screenshot or a voice-note transcript to the club's Heir address. Heir replies with what it filed, marked to reconfirm, and the member can correct it in one reply." },
];

function taskRows(S, ids) {
  return `<div class="wk-tasks">${ids.map((id) => T(S, id)).filter(Boolean).map((t) => `<div class="wk-task ${t.status}"><span class="wk-id">${t.id}</span><b>${esc(t.title)}</b><span class="stamp">${esc(t.status)}</span><em>${fmt(t.due)} · ${esc(t.owner)}</em><small>${esc(t.basis.replace(/mail:(m\d+)/g, "email $1"))}</small></div>`).join("")}</div>`;
}
function timeline(S) {
  const ev = "2027-08-07", a = "2027-05-20", span = H.diffDays(ev, a);
  const ts = S.tasks.filter((t) => t.due >= a && t.due <= ev && !t.title.startsWith("Close inherited")).sort((x, y) => (x.due < y.due ? -1 : 1));
  return `<h6>The plan, ${span} days out</h6><div class="wk-tl">${ts.map((t, i) => `<div class="wk-tl-row ${t.status}"><span class="lab">${esc(t.title)}</span><span class="bar"><i style="left:${(H.diffDays(t.due, a) / span) * 100}%"></i></span><span class="d">${fmt(t.due, false)}</span></div>`).join("")}
    <div class="wk-tl-row ev"><span class="lab"><b>Event</b></span><span class="bar"><i style="left:100%"></i></span><span class="d">7 Aug</span></div></div>`;
}


// ---------------------------------------------------------------- the member-facing surfaces (planned interface, filled from live engine state)
const PLANNED = `<p class="us-note">Planned interface. The agents, ledger and approvals behind it are the working prototype; these screens show how members would see them.</p>`;
const first = (o) => (o.split("(").pop() || "").replace(")", "");
function useWhere(S) {
  const c = H.COMMITTEE;
  return `<div class="us-where">
    <div class="us-box us-club"><h6>The club's own Google account</h6><ul>
      <li><b>Gmail</b> ${esc(c.club_mailbox)}<em>read, and send only after approval</em></li>
      <li><b>Drive folder</b> handover docs, policies, trackers<em>read only</em></li>
      <li><b>Google Sheet</b> the ledger, plan and decisions<em>owned by the club</em></li>
      <li><b>Calendar</b> event plan as a calendar file<em>written by Heir</em></li></ul></div>
    <div class="us-arrow"><span>reads</span><i></i><span>writes</span></div>
    <div class="us-box us-heir"><h6>Heir, a scheduled service</h6>
      <div class="us-cron">07:00 every day, and when new mail lands</div>
      <div class="us-flow"><b>Supervisor</b><span>→</span><b>Scout</b><b>Auditor</b><b>Planner</b><b>Drafter</b></div>
      <ul><li>Runs on an n8n workflow or Google Apps Script, free tier</li><li>Optional model (Gemini free tier) for messy text, checked by code</li><li>Each run starts from the ledger, not from zero</li></ul></div>
    <div class="us-arrow"><span>asks</span><i></i><span>answers</span></div>
    <div class="us-box us-people"><h6>Members, no app store</h6><ul>
      <li><b>Digest email</b> only to whoever has something to do</li>
      <li><b>Heir web app</b> the same list, added to the home screen for push notifications</li>
      <li><b>Approval link</b> opens a confirm screen; a click alone never sends</li>
      <li><b>Head's dashboard</b> sign in with the club account</li>
      <li><b>Forward address</b> heir.meridian@campus.example, for notes and screenshots</li></ul></div>
  </div>
  <div class="us-access"><div><b>Who sees what</b> Members see their own tasks and drafts. The head sees everything. The faculty advisor can be copied on questions.</div>
  <div><b>Handover</b> The new head is added on the roster; the ledger, plan and history are already there.</div>
  <div><b>Cost</b> Free tiers only. No paid compute.</div></div>${PLANNED}`;
}
function mailItem(icon, title, sub, btn) { return `<div class="us-item"><i>${icon}</i><div><b>${esc(title)}</b><span>${esc(sub)}</span></div>${btn ? `<a class="us-b">${btn}</a>` : ""}</div>`; }
function useDigest(S) {
  const pend = S.drafts.filter((d) => d.status === "pending approval"), qs = S.escalations.filter((e) => e.status === "open");
  const ev = H.COMMITTEE.events[1], days = H.diffDays(ev.date, S.meta.today);
  const t9 = S.tasks.find((t) => t.title.startsWith("Honour")), d3 = pend.find((d) => d.task_ref === t9.id);
  return `<div class="us-two">
  <div class="dv-desk"><div class="dv-bar"><i></i><i></i><i></i><span>Inbox · Ishaan (committee head)</span></div>
    <div class="us-mail"><div class="us-mh"><span class="us-av">H</span><div><b>Heir for ${esc(H.COMMITTEE.club.replace(" (mock)", ""))}</b><em>to Ishaan · ${fmt(S.meta.today)}, 07:02</em></div></div>
    <h4>${pend.length} emails to approve, ${qs.length} questions for you</h4>
    <p class="us-sum">${esc(ev.name)} is in ${days} days. Since the last run Heir read 2 replies from the outgoing team and planned ${S.tasks.length} tasks.</p>
    <h5>Questions only you can answer</h5>
    ${qs.map((e) => mailItem("?", { "Inherited commitment, no owner": "Who owns last year's unsent sponsor report?", "Conflicting records": "Which airfare rule is right?", "Access held outside the team": "Who should hold the website and YouTube logins?" }[e.reason] || e.reason, e.reason, "Answer")).join("")}
    <h5>Waiting for your team</h5>
    ${pend.map((d) => mailItem("✉", d.subject, "Draft for " + first(S.tasks.find((t) => t.id === d.task_ref).owner) + " to approve", "")).join("")}
    <p class="us-foot">You get this because you are the committee head on the roster. Reply STOP to pause Heir for the club.</p></div></div>
  <div class="dv-phone"><div class="dv-notch"></div><div class="dv-scr">
    <div class="us-lock">${fmt(S.meta.today, false)} · 07:02</div>
    <div class="us-push"><b>Heir · ${esc(H.COMMITTEE.club.replace(" (mock)", ""))}</b><span>Tara, 1 email is ready for you: ${esc(d3.subject)}</span><em>Tap to review</em></div>
    <div class="us-push dim"><b>Heir</b><span>Task due ${fmt(S.tasks.find((t) => t.title.startsWith("Speaker outreach")).due, false)}: Speaker outreach, round 1. 5 lessons on record from last year.</span></div>
  </div></div></div>${PLANNED}`;
}
function useApprove(S) {
  const d = S.drafts.find((x) => x.id === "D-003"), p = S.ledger.find((r) => r.id === d.ledger_ref);
  const phone = (inner) => `<div class="dv-phone"><div class="dv-notch"></div><div class="dv-scr">${inner}</div></div>`;
  const head = `<div class="us-ph"><span class="us-av s">H</span><b>Heir</b><em>${esc(H.COMMITTEE.club.replace(" (mock)", ""))}</em></div>`;
  return `<div class="us-three">
  ${phone(`${head}<div class="us-tag">Ready for you, Tara</div><h4>${esc(d.subject)}</h4><div class="us-to">To ${esc(d.recipient)}</div>
    <div class="us-body">${esc(d.body)}</div>
    <div class="us-why"><b>Why Heir wrote this</b>Neel promised last August: <mark>"we will keep you posted for future events"</mark> (email m12, 6 Aug 2026). The promise is due ${fmt(p.due)}.</div>
    <div class="us-btns"><a class="pri">Approve and send</a><a>Edit</a><a>Hold</a></div>`)}
  <div class="us-mid"><span>tap</span><i></i></div>
  ${phone(`${head}<div class="us-done"><div class="us-check">✓</div><h4>Sent from the club mailbox</h4><p>${esc(d.recipient)}<br>${fmt(S.meta.today)}</p>
    <ul><li><b>Ledger</b> ${p.id} promise: waiting for her reply</li><li><b>Plan</b> "Honour promise" moved to waiting</li><li><b>Next run</b> a reply will close the promise; silence past ${H.COMMITTEE.reply_sla_days} days brings a follow-up</li></ul>
    <div class="us-btns"><a>Undo within 30 s</a></div></div>`)}
  </div>${PLANNED}`;
}
function useDash(S) {
  const ev = H.COMMITTEE.events[1], days = H.diffDays(ev.date, S.meta.today);
  const qs = S.escalations.filter((e) => e.status === "open"), pend = S.drafts.filter((d) => d.status === "pending approval");
  const tasks = [...S.tasks].sort((a, b) => a.due.localeCompare(b.due)).slice(0, 7);
  const open = S.ledger.filter((r) => ["commitment", "promise"].includes(r.kind) && r.status === "open");
  return `<div class="dv-desk wide"><div class="dv-bar"><i></i><i></i><i></i><span>Heir · ${esc(H.COMMITTEE.club)} · signed in as Ishaan, committee head</span></div>
  <div class="us-dash"><nav><b>Heir</b><a class="on">Today</a><a>Plan</a><a>Ledger · ${S.ledger.length}</a><a>Approvals · ${pend.length}</a><a>Questions · ${qs.length}</a><a>Sources</a><a>Roster and handover</a></nav>
  <main><div class="us-kpis"><div><b>${days}</b><span>days to ${esc(ev.name)}</span></div><div><b>${qs.length}</b><span>questions for you</span></div><div><b>${pend.length}</b><span>drafts with your team</span></div><div><b>${open.length}</b><span>inherited debts and promises open</span></div></div>
  <div class="us-cols"><section><h5>Needs your decision</h5>${qs.map((e) => `<div class="us-q"><b>${esc({ "Inherited commitment, no owner": "Who owns last year's unsent sponsor report?", "Conflicting records": "Which airfare rule is right?", "Access held outside the team": "Who should hold the website and YouTube logins?" }[e.reason] || e.reason)}</b><span>${esc(e.reason)}</span></div>`).join("")}
  <h5>Inherited from last year</h5>${open.map((r) => `<div class="us-q l"><b>${esc(r.title)}</b><span>${r.id} · ${esc(r.owner || "no owner")} · due ${fmt(r.due)}</span></div>`).join("")}</section>
  <section><h5>Plan, by due date</h5><table>${tasks.map((t) => `<tr class="${t.status}"><td>${fmt(t.due, false)}</td><td>${esc(t.title)}</td><td>${esc(first(t.owner))}</td><td><span>${esc(t.status)}</span></td></tr>`).join("")}</table></section></div></main></div></div>${PLANNED}`;
}
function useForward(S) {
  const note = "Quick one after the Lumaro call. Meera can't make it this year, I told her we will keep you posted for the next edition, so someone please invite her around June.";
  const P = /(we will keep you posted|we will get back to you|we will reach out)[^.]*/i, m = note.match(P);
  const phone = (inner) => `<div class="dv-phone"><div class="dv-notch"></div><div class="dv-scr">${inner}</div></div>`;
  return `<div class="us-three">
  ${phone(`<div class="us-ph"><b>New message</b><em>Fwd</em></div><div class="us-to">To heir.meridian@campus.example (the club's Heir address)</div><div class="us-to">From Tara</div>
    <div class="us-body"><b>Voice note, transcribed</b><br>${esc(note)}</div><div class="us-btns"><a class="pri">Send</a></div>`)}
  <div class="us-mid"><span>seconds later</span><i></i></div>
  ${phone(`<div class="us-ph"><span class="us-av s">H</span><b>Heir</b><em>reply</em></div><div class="us-tag">Filed 1 entry, to reconfirm</div>
    <div class="us-ent"><b>Promise: keep Meera posted for the next edition</b><span>Owner Tara · source: your note, ${fmt(S.meta.today)}</span><q>${esc(m ? m[0] : "")}</q></div>
    <p class="us-small">Kept because the quoted words are in your note. Reply "wrong" to remove it, or "confirm" to mark it confirmed.</p>
    <div class="us-btns"><a class="pri">Confirm</a><a>Wrong</a></div>`)}
  </div>${PLANNED}`;
}

// ---------------------------------------------------------------- render
const AG = ["Trigger", "Supervisor", "Scout", "Auditor", "Planner", "Drafter", "Member"];
let cur = 0, timer = null;
function render(dir) {
  const st = STEPS[cur], S = at(st.stage);
  $("wkCh").innerHTML = CH.map((c, i) => { const first = STEPS.findIndex((x) => x.ch === i); return `<button type="button" data-ch="${first}" aria-pressed="${st.ch === i}"><span>${i + 1}</span>${c}</button>`; }).join("");
  $("wkRail").innerHTML = AG.map((a) => `<div class="${st.ag.includes(a) ? "on" : ""}"><i></i>${a === "Member" ? "Members" : a}</div>`).join("<b></b>");
  $("wkWhen").textContent = `Step ${cur + 1} of ${STEPS.length} · ${RUNLAB[st.stage]}`;
  $("wkT").textContent = st.t;
  $("wkB").textContent = st.b;
  const full = !!st.full;
  document.querySelector(".wk-grid").hidden = full; $("wkFull").hidden = !full;
  if (full) $("wkFull").innerHTML = st.full(S);
  else { $("wkIn").innerHTML = st.i(S); $("wkRule").innerHTML = typeof st.r === "function" ? st.r(S) : st.r; $("wkOut").innerHTML = st.o(S); }
  const hi = new Set(st.hi || []);
  $("wkMem").innerHTML = `<span class="lab">Club memory · ${S.ledger.length} entries</span>` + (S.ledger.length ? S.ledger.map((r) => `<i data-k="${r.kind}" class="${hi.has(r.id) ? "hi" : ""} ${r.status === "closed" ? "cl" : ""}" title="${r.id} ${esc(r.title)}">${r.id.slice(2)}</i>`).join("") : `<em>empty until the first run</em>`);
  $("wkPrev").disabled = cur === 0; $("wkNext").textContent = cur === STEPS.length - 1 ? "Start again" : "Next step →";
  $("wkBar").style.transform = `scaleX(${(cur + 1) / STEPS.length})`;
  const stage = $("wkStage"); stage.classList.remove("in-l", "in-r"); void stage.offsetWidth; stage.classList.add(dir < 0 ? "in-l" : "in-r");
}
function go(i, dir) { cur = (i + STEPS.length) % STEPS.length; render(dir ?? 1); }
function play(on) {
  clearInterval(timer); timer = null;
  $("wkPlay").setAttribute("aria-pressed", on ? "true" : "false"); $("wkPlay").textContent = on ? "Pause" : "Autoplay";
  if (on) timer = setInterval(() => { if (cur === STEPS.length - 1) return play(false); go(cur + 1, 1); }, 9000);
}
function init() {
  if (!$("wk")) return;
  $("wkNext").onclick = () => { play(false); go(cur === STEPS.length - 1 ? 0 : cur + 1, 1); };
  $("wkPrev").onclick = () => { play(false); go(cur - 1, -1); };
  $("wkPlay").onclick = () => play(!timer);
  $("wkCh").onclick = (e) => { const b = e.target.closest("button[data-ch]"); if (b) { play(false); go(+b.dataset.ch, +b.dataset.ch < cur ? -1 : 1); } };
  $("wk").addEventListener("keydown", (e) => { if (e.key === "ArrowRight") { play(false); go(cur + 1, 1); } if (e.key === "ArrowLeft" && cur > 0) { play(false); go(cur - 1, -1); } });
  window.HeirWalk = { go: (i) => go(i, 1), count: STEPS.length };
  // standalone "In members' hands" section: same surfaces, as tabs, approval is clickable
  const use = $("useStage");
  if (use) {
    const S2 = at(2), TABS = [["where", "Where it runs", useWhere], ["digest", "Morning digest", useDigest], ["approve", "Approve on the phone", useApprove], ["dash", "Head's dashboard", useDash], ["fwd", "Forward a note", useForward]];
    let cur = "approve";
    const draw = () => {
      $("useTabs").innerHTML = TABS.map(([k, l]) => `<button type="button" data-u="${k}" aria-pressed="${k === cur}">${l}</button>`).join("");
      use.innerHTML = TABS.find((x) => x[0] === cur)[2](S2);
      use.querySelectorAll(".us-btns a").forEach((a) => { a.setAttribute("role", "button"); a.tabIndex = 0; });
      if (cur === "approve") {
        const phones = use.querySelectorAll(".dv-phone"), mid = use.querySelector(".us-mid");
        phones[1].style.opacity = .25; mid.style.opacity = .4;
        const btns = phones[0].querySelectorAll(".us-btns a");
        btns[0].onclick = () => { phones[1].style.opacity = 1; mid.style.opacity = 1; phones[1].animate([{ transform: "translateY(16px)", opacity: .3 }, { transform: "none", opacity: 1 }], { duration: 450, easing: "ease-out" }); };
        btns[2].onclick = () => { phones[1].style.opacity = .25; };
      }
      if (cur === "fwd") {
        const phones = use.querySelectorAll(".dv-phone"), mid = use.querySelector(".us-mid");
        phones[1].style.opacity = .25; mid.style.opacity = .4;
        phones[0].querySelector(".us-btns a").onclick = () => { phones[1].style.opacity = 1; mid.style.opacity = 1; phones[1].animate([{ transform: "translateY(16px)", opacity: .3 }, { transform: "none", opacity: 1 }], { duration: 450, easing: "ease-out" }); };
      }
      $("useTabs").querySelectorAll("button").forEach((b) => (b.onclick = () => { cur = b.dataset.u; draw(); }));
    };
    draw();
  }
  render(1);
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
