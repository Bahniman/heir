"""Edge cases: a member disputes a record, a reply lands before approval, a mail tries to steer the agent.

Run:  python test_edge_cases.py
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import heir  # noqa: E402

ok = 0


def check(cond, label):
    global ok
    if not cond:
        sys.exit(f"FAIL: {label}")
    ok += 1
    print(f"ok   {label}")


def ns(**kw):
    return argparse.Namespace(**kw)


# 1. a member says Heir got the promise wrong
heir.cmd_reset(None)
heir.cmd_run(ns(today="2027-03-10"))
heir.cmd_run(ns(today="2027-05-20"))
mem, _, _ = heir.load()
promise = mem.one("ledger", "kind='promise'")
draft = mem.one("drafts", "ledger_ref=? AND status='pending approval'", promise["id"])
check(draft is not None, "a draft exists for the inherited promise")
heir.cmd_correct(ns(id=promise["id"], by="Tara", note="Wrong: she joined a rival club, do not invite"))
mem, _, _ = heir.load()
check(mem.one("ledger", "id=?", promise["id"])["status"] == "disputed", "record is marked disputed")
check(mem.one("drafts", "id=?", draft["id"])["status"] == "withdrawn", "its draft is withdrawn")
check(all(t["status"] == "paused" for t in mem.rows("tasks", "ledger_ref=?", promise["id"])), "its tasks are paused")
heir.cmd_run(ns(today="2027-05-27"))
mem, _, _ = heir.load()
again = mem.rows("drafts", "ledger_ref=? AND status='pending approval'", promise["id"])
check(not again, "Heir does not redraft on a disputed record")

# 2. the suspicious mail
check(mem.one("escalations", "reason='Suspicious instruction in mail'") is not None, "suspicious mail goes to the head")
check(not any("mailhub" in p.name for p in (heir.WORLD / "outbox").glob("*")), "nothing was sent to the suspicious sender")
check(not mem.rows("ledger", "contact_email LIKE '%mailhub%'"), "nothing from the suspicious mail entered the ledger")

# 3. a reply arrives between the morning run and the tap on approve
mem.db.close()  # Windows will not delete an open SQLite file
heir.cmd_reset(None)
heir.cmd_run(ns(today="2027-03-10"))
heir.cmd_run(ns(today="2027-05-20"))
mem, _, _ = heir.load()
draft = next(r for r in mem.rows("drafts", "status='pending approval'") if "promise" in (r["subject"] + r["reason"]).lower())
mem.meta("today", "2027-05-24")  # Meera's own mail (dated 23 May) is in the mailbox but no run has read it yet
try:
    heir.cmd_approve(ns(id=draft["id"], by="Ishaan", body=None))
    sent = True
except SystemExit as e:
    sent = False
    print("     ", e)
mem, _, _ = heir.load()
check(not sent and mem.one("drafts", "id=?", draft["id"])["status"] == "withdrawn", "stale draft is withdrawn, not sent")

# 4. "handled outside Heir" closes the debt and frees what it blocked
mem.db.close()  # Windows will not delete an open SQLite file
heir.cmd_reset(None)
for day in ("2027-03-10", "2027-05-20"):
    heir.cmd_run(ns(today=day))
mem, _, _ = heir.load()
debt = mem.one("ledger", "kind='commitment' AND title LIKE '%report%'")
heir.cmd_correct(ns(id=debt["id"], by="Kabir", note="handled: sent from my own mail on 18 May"))
mem, _, _ = heir.load()
check(mem.one("ledger", "id=?", debt["id"])["status"] == "closed", "debt closed as handled")
check(not mem.rows("tasks", "blocked_by=?", debt["id"]), "sponsor renewal is no longer blocked")

print(f"\n{ok} checks passed")
