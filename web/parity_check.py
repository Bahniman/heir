import json, sqlite3, sys
js = json.load(open(sys.argv[1], encoding="utf-8"))
db = sqlite3.connect("heir_memory.sqlite"); db.row_factory = sqlite3.Row
fields = {"ledger": ["id","kind","title","status","tag","owner","due","in_handover","counterparty","detail"],
          "tasks": ["id","title","owner","due","status","basis","blocked_by"],
          "drafts": ["id","kind","recipient","subject","body","status","approved_by","sent_on","awaiting_reply"],
          "escalations": ["id","reason","status","question","resolution"]}
bad = 0
for t, fs in fields.items():
    py = {r["id"]: dict(r) for r in db.execute(f"select * from {t}")}
    jj = {r["id"]: r for r in js[t]}
    if set(py) != set(jj): print(t, "ID MISMATCH", sorted(set(py) ^ set(jj))); bad += 1
    for i in sorted(set(py) & set(jj)):
        for f in fs:
            a, b = py[i].get(f), jj[i].get(f)
            if (a or None) != (b or None) and str(a) != str(b):
                bad += 1; print(t, i, f, "| py:", repr(a)[:110], "| js:", repr(b)[:110])
    print(t, len(py), "py rows,", len(jj), "js rows")
pt = [(r["run"], r["agent"], r["action"], r["detail"]) for r in db.execute("select * from trace order by run, seq")]
jt = [(r["run"], r["agent"], r["action"], r["detail"]) for r in js["trace"]]
diff = [(a, b) for a, b in zip(pt, jt) if a != b]
print("trace lines py/js:", len(pt), len(jt), "| differing:", len(diff))
for a, b in diff[:6]: print("  py:", a, "\n  js:", b)
print("MISMATCHES:", bad)
sys.exit(1 if bad or diff or len(pt) != len(jt) else 0)  # non-zero so CI fails on any drift
