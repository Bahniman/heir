"""Heir command line.

  python heir.py reset                         rebuild the mock committee world, wipe memory
  python heir.py run --today 2027-05-20        one scheduled run (n8n or Task Scheduler calls this)
  python heir.py approve D-003 --by Ishaan     a member approves a draft; it is sent at once
  python heir.py hold D-003 --by Ishaan        a member stops a draft
  python heir.py done T-001 --by Ishaan        a member closes a task done outside email
  python heir.py resolve E-001 --by Ishaan --note "owner: Kabir. Send it late with an apology"
  python heir.py correct L-015 --by Ishaan --note "Wrong: she withdrew"   a member says Heir got a record wrong
  python heir.py status                        what is open right now
  python heir.py demo                          the full scripted demo used in the recording
"""
import argparse
import gc
import json
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import mockdata  # noqa: E402
from agents import Supervisor  # noqa: E402
from memory import Memory  # noqa: E402
from tools import Toolbox  # noqa: E402

HERE = Path(__file__).parent
WORLD = HERE / "mock_world"
DB = HERE / "heir_memory.sqlite"
EXPORTS = HERE / "exports"


def load():
    cfg = json.loads((WORLD / "committee.json").read_text(encoding="utf-8"))
    return Memory(DB), Toolbox(WORLD), cfg


def snapshot(mem, label):
    EXPORTS.mkdir(exist_ok=True)
    data = mem.export()
    data["label"] = label
    n = len(list(EXPORTS.glob("step-*.json"))) + 1
    (EXPORTS / f"step-{n:02d}.json").write_text(json.dumps(data, indent=1), encoding="utf-8")


def cmd_reset(_):
    mockdata.build(WORLD)
    gc.collect()  # close any SQLite handle left over from an earlier run in this process (Windows locks the file)
    if DB.exists():
        DB.unlink()
    for f in EXPORTS.glob("step-*.json"):
        f.unlink()
    print("Mock committee world rebuilt; memory wiped.")


def cmd_run(a):
    mem, tools, cfg = load()
    s = Supervisor(mem, tools, cfg).run(date.fromisoformat(a.today))
    print("\nSUMMARY " + json.dumps(s))
    snapshot(mem, f"Run {mem.run_id} on {a.today}")


def cmd_approve(a):
    mem, tools, cfg = load()
    dr = mem.one("drafts", "id=?", a.id)
    if not dr or dr["status"] != "pending approval":
        sys.exit(f"{a.id} is not waiting for approval")
    today = date.fromisoformat(mem.meta("today"))
    # re-read the thread at the moment of approval: if the recipient wrote since the last run, do not send
    newer = [m for m in tools.mailbox(today) if m["from"] == dr["recipient"] and not mem.is_seen(m["source"])]
    if newer:
        mem.update("drafts", dr["id"], status="withdrawn")
        sys.exit(f"{a.id} withdrawn: {dr['recipient']} wrote on {newer[-1]['date']} after this was drafted. Read that first.")
    if getattr(a, "body", None):
        mem.update("drafts", dr["id"], body=a.body)
        dr["body"] = a.body
    tools.send_email(dr["id"], cfg["club_mailbox"], dr["recipient"], dr["subject"], dr["body"], today)
    mem.update("drafts", dr["id"], status="sent", approved_by=a.by, sent_on=today.isoformat(), awaiting_reply=1)
    if dr["task_ref"]:
        t = mem.one("tasks", "id=?", dr["task_ref"])
        closes = t["title"].startswith("Close inherited")
        mem.update("tasks", t["id"], status="done" if closes else "waiting")
        if closes and t["ledger_ref"]:
            mem.update("ledger", t["ledger_ref"], status="closed", tag="confirmed")
            mem.update("drafts", dr["id"], awaiting_reply=0)
            # anything blocked by this obligation is free again
            for b in mem.rows("tasks", "blocked_by=?", t["ledger_ref"]):
                mem.update("tasks", b["id"], status="todo", blocked_by=None, basis="unblocked: report sent")
    print(f"{a.id} approved by {a.by} and sent to {dr['recipient']}")
    snapshot(mem, f"{a.by} approves {a.id}")


def cmd_correct(a):
    """A member says a ledger record is wrong, or was already handled outside Heir."""
    mem, _, _ = load()
    r = mem.one("ledger", "id=?", a.id)
    if not r:
        sys.exit(f"{a.id} is not in the ledger")
    handled = a.note.lower().startswith("handled")
    if handled:
        mem.update("ledger", a.id, status="closed", tag="confirmed", detail=f"{r['detail'] or ''}. Handled outside Heir, per {a.by}")
    else:
        mem.update("ledger", a.id, status="disputed", tag="disputed", detail=f"{r['detail'] or ''}. Disputed by {a.by}: {a.note}")
    for dr in mem.rows("drafts", "ledger_ref=? AND status='pending approval'", a.id):
        mem.update("drafts", dr["id"], status="withdrawn")
    for t in mem.rows("tasks", "ledger_ref=? AND status IN ('todo','blocked')", a.id):
        mem.update("tasks", t["id"], status="done" if handled else "paused")
    if handled:
        for b in mem.rows("tasks", "blocked_by=?", a.id):
            mem.update("tasks", b["id"], status="todo", blocked_by=None, basis="unblocked: handled outside Heir")
    print(f"{a.id} {'closed as handled' if handled else 'disputed'} by {a.by}; its pending drafts withdrawn, "
          f"its tasks {'closed' if handled else 'paused'}")
    snapshot(mem, f"{a.by} {'marks' if handled else 'disputes'} {a.id}")


def cmd_done(a):
    mem, _, _ = load()
    t = mem.one("tasks", "id=?", a.id)
    mem.update("tasks", a.id, status="done")
    print(f"{a.id} marked done by {a.by}: {t['title']}")
    snapshot(mem, f"{a.by} marks {a.id} done")


def cmd_hold(a):
    mem, _, _ = load()
    mem.update("drafts", a.id, status="held", approved_by=a.by)
    print(f"{a.id} held by {a.by}")


def cmd_resolve(a):
    mem, _, _ = load()
    mem.update("escalations", a.id, status="resolved", resolution=a.note, resolved_by=a.by)
    e = mem.one("escalations", "id=?", a.id)
    if e["reason"] == "Conflicting records":
        mem.update("ledger", e["ledger_ref"], status="superseded", detail=f"Superseded by policy, per {a.by}")
    print(f"{a.id} resolved by {a.by}: {a.note}")
    snapshot(mem, f"{a.by} answers {a.id}")


def cmd_status(_):
    mem, _, _ = load()
    for t in ("drafts", "escalations"):
        for r in mem.rows(t, "status IN ('pending approval','open')"):
            print(r["id"], r.get("subject") or r.get("question"))


def cmd_demo(_):
    """The sequence shown in the 2-minute recording."""
    cmd_reset(None)
    steps = [
        ("run", "2027-03-10"),                      # outgoing team, three weeks before handover
        ("run", "2027-05-20"),                      # new team, 79 days before Summit 2027
        ("approve", "promise", "Ishaan"),
        ("approve", "lc2", "Riya"),
        ("resolve", "Inherited commitment, no owner", "Ishaan", "owner: Kabir. Send it now with an apology"),
        ("resolve", "Conflicting records", "Ishaan", "Policy stands: airfare is not covered. Say so plainly if asked"),
        ("done", "Lock theme", "Ishaan"),
        ("run", "2027-05-27"),                      # a week later: one reply in, one silence
        ("approve", "apology", "Kabir"),
        ("run", "2027-05-28"),
    ]
    for s in steps:
        if s[0] == "run":
            cmd_run(argparse.Namespace(today=s[1]))
        else:
            mem, _, _ = load()
            if s[0] == "done":
                t = next(r for r in mem.rows("tasks") if r["title"].startswith(s[1]))
                print(f"\n> human: {s[2]} marks {t['id']} done")
                cmd_done(argparse.Namespace(id=t["id"], by=s[2]))
            elif s[0] == "approve":
                dr = next(r for r in mem.rows("drafts", "status='pending approval'")
                          if s[1] in (r["subject"] + r["reason"]).lower())
                print(f"\n> human: {s[2]} approves {dr['id']}")
                cmd_approve(argparse.Namespace(id=dr["id"], by=s[2]))
            else:
                e = mem.one("escalations", "reason=? AND status='open'", s[1])
                print(f"\n> human: {s[2]} answers {e['id']}")
                cmd_resolve(argparse.Namespace(id=e["id"], by=s[2], note=s[3]))


def main():
    p = argparse.ArgumentParser(description="Heir: a committee agent that carries open commitments across tenures")
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("reset")
    r = sub.add_parser("run"); r.add_argument("--today", required=True)
    for name in ("approve", "hold", "done"):
        x = sub.add_parser(name); x.add_argument("id"); x.add_argument("--by", required=True)
    x = sub.add_parser("resolve"); x.add_argument("id"); x.add_argument("--by", required=True); x.add_argument("--note", required=True)
    x = sub.add_parser("correct"); x.add_argument("id"); x.add_argument("--by", required=True); x.add_argument("--note", required=True)
    sub.choices["approve"].add_argument("--body", help="edited message text to send instead of the draft")
    sub.add_parser("status"); sub.add_parser("demo")
    a = p.parse_args()
    {"reset": cmd_reset, "run": cmd_run, "approve": cmd_approve, "hold": cmd_hold, "done": cmd_done,
     "resolve": cmd_resolve, "correct": cmd_correct, "status": cmd_status, "demo": cmd_demo}[a.cmd](a)


if __name__ == "__main__":
    main()
