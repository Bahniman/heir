const H = require("./heir-engine.js");
const S = H.createState();
const find = (pred) => S.drafts.find(pred).id;
H.run(S, "2027-03-10");
H.run(S, "2027-05-20");
H.approve(S, find(d => d.status==="pending approval" && /promise/i.test(d.subject+d.reason)), "Ishaan");
H.approve(S, find(d => d.status==="pending approval" && /lc2/i.test(d.subject+d.reason)), "Riya");
H.resolve(S, S.escalations.find(e=>e.reason==="Inherited commitment, no owner").id, "Ishaan", "owner: Kabir. Send it now with an apology");
H.resolve(S, S.escalations.find(e=>e.reason==="Conflicting records").id, "Ishaan", "Policy stands: airfare is not covered. Say so plainly if asked");
H.done(S, S.tasks.find(t=>t.title.startsWith("Lock theme")).id, "Ishaan");
H.run(S, "2027-05-27");
H.approve(S, find(d => d.status==="pending approval" && /apology/i.test(d.subject+d.reason)), "Kabir");
H.run(S, "2027-05-28");
require("fs").writeFileSync(process.argv[2], JSON.stringify({ledger:S.ledger,tasks:S.tasks,drafts:S.drafts,escalations:S.escalations,trace:S.trace}));

