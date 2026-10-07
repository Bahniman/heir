const H = require("./heir-engine.js");
const S = H.createState(); H.run(S, "2027-03-10"); H.run(S, "2027-05-20");
S.drafts[2].status = "sent"; S.drafts[2].approved_by = null;   // planted defect
const rogue = S.drafts.filter(d => d.status === "sent" && d.needs_approval === 1 && !d.approved_by);
console.log("planted defect caught:", rogue.length === 1);
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const seen = {};
for (let g = 0; g < 300; g++) { const T = H.createState(); let day = "2027-03-10";
  for (let s = 0; s < 12 && day <= "2027-09-30"; s++) { H.run(T, day);
    for (const d of T.drafts.filter(x => x.status === "pending approval")) if (rnd() < .6) H.approve(T, d.id, "I");
    for (const e of T.escalations.filter(x => x.status === "open")) if (rnd() < .6) H.resolve(T, e.id, "I", e.reason.startsWith("Inherited") ? "owner: Kabir" : "Request access");
    if (H.canInject(T, "estate_approves") && rnd() < .4) H.inject(T, "estate_approves");
    day = H.addDays(day, [1,3,7,14][Math.floor(rnd()*4)]); }
  for (const t of T.trace) seen[t.action] = (seen[t.action] || 0) + 1;
  for (const e of T.escalations) seen["esc: " + e.reason] = (seen["esc: " + e.reason] || 0) + 1; }
console.log(Object.entries(seen).filter(([k]) => /REPLAN|reply|promise kept|closed by|esc:|unblock|task updated/.test(k)).map(([k,v]) => `${k}=${v}`).join("\n"));
