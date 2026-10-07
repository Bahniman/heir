const H = require("./heir-engine.js");
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const pick = (a) => a[Math.floor(rnd() * a.length)];
const NOTES = {"Inherited commitment, no owner": ["owner: Kabir. Send it now with an apology","owner: Riya. Send it now","owner: Tara. Send it now"],
 "Conflicting records": ["Policy stands: airfare is not covered","Airfare is covered this year for keynote speakers"],
 "Access held outside the team": ["Request delegated access from the faculty advisor","Leave it with the faculty advisor"],
 "Deadline can no longer be met": ["Mark done","Move it a week"], "Silent after follow-up": ["Call them today","Switch to the fallback hall"]};
let errors = 0, runs = 0, stale = 0, problems = [];
for (let g = 0; g < 300; g++) {
  const S = H.createState(); let day = "2027-03-10"; const disputed = new Set(), sentBefore = new Set();
  try {
    for (let step = 0; step < 12; step++) {
      H.run(S, day); runs++;
      if (H.canInject(S, "estate_approves") && rnd() < .4) H.inject(S, "estate_approves");
      for (const d of S.drafts.filter(x => x.status === "pending approval")) { const r = rnd();
        if (r < .6) { try { H.approve(S, d.id, "Ishaan"); } catch (e) { if (!/withdrawn/.test(e.message)) throw e; stale++; } }
        else if (r < .7) H.hold(S, d.id, "Ishaan");
        else if (r < .8 && d.ledger_ref) { const h = rnd() < .5; H.correct(S, d.ledger_ref, "Tara", h ? "handled outside Heir" : "wrong fact"); if (!h) disputed.add(d.ledger_ref); } }
      for (const d of S.drafts.filter(x => x.status === "sent" && disputed.has(x.ledger_ref) && !sentBefore.has(x.id))) problems.push(`game ${g}: sent on a disputed record ${d.id}`);
      S.drafts.filter(x => x.status === "sent").forEach(x => sentBefore.add(x.id));
      for (const e of S.escalations.filter(x => x.status === "open")) if (rnd() < .6) H.resolve(S, e.id, "Ishaan", pick(NOTES[e.reason] || ["Noted"]));
      for (const t of S.tasks.filter(x => x.status === "todo")) if (rnd() < .3) H.done(S, t.id, "Tara");
      day = H.addDays(day, pick([1, 3, 7, 14, 21]));
      if (day > "2027-09-30") break;
    }
    const ids = ["ledger","tasks","drafts","escalations"].flatMap(t => S[t].map(r => r.id));
    if (new Set(ids).size !== ids.length) problems.push(`game ${g}: duplicate ids`);
    const rogue = S.drafts.filter(d => d.status === "sent" && d.needs_approval === 1 && !d.approved_by);
    if (rogue.length) problems.push(`game ${g}: sent without approval ${rogue.map(r=>r.id)}`);
    if (S.outbox.some(o => /mailhub/.test(o.to))) problems.push(`game ${g}: mailed the suspicious sender`);
    if (!S.trace.some(t => t.action === "untrusted instruction ignored") && S.meta.today >= "2027-05-24") problems.push(`game ${g}: suspicious mail not flagged`);
    if (S.outbox.some(o => !o.approved_by)) problems.push(`game ${g}: outbox entry without approver`);
    const dupTasks = S.tasks.map(t => t.title); if (new Set(dupTasks).size !== dupTasks.length) problems.push(`game ${g}: duplicate task titles`);
    if (S.trace.some(t => /undefined|NaN|null \(/.test(t.detail))) problems.push(`game ${g}: bad trace text: ` + S.trace.find(t => /undefined|NaN|null \(/.test(t.detail)).detail);
  } catch (e) { errors++; if (errors < 4) console.log("game", g, "day", day, e.stack.split("\n").slice(0,3).join(" | ")); }
}
console.log("games 300, runs", runs, "stale approvals stopped", stale, "exceptions", errors, "problems", problems.length);
[...new Set(problems.map(p => p.replace(/game \d+: /, "")))].slice(0, 8).forEach(p => console.log(" -", p));
