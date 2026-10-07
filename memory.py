"""Heir's memory: one SQLite file that outlives every run and every team.

Tables
  ledger       what the committee owes, knows and promised, each row tied to evidence
  tasks        the plan for the current event, with owners and due dates
  drafts       outgoing messages; external ones wait for a human approval
  escalations  questions only a human can answer, with the answer once given
  seen         every source record already read, so no run starts from zero
  runs, trace  what each run did, step by step, for the audit trail and the dashboard
"""
import json
import sqlite3
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY, v TEXT);
CREATE TABLE IF NOT EXISTS ledger(
  id TEXT PRIMARY KEY, kind TEXT, title TEXT, detail TEXT, counterparty TEXT,
  contact_email TEXT, owner TEXT, due TEXT, status TEXT, tag TEXT,
  evidence TEXT, in_handover INTEGER DEFAULT 0, created_run INTEGER, updated_run INTEGER);
CREATE TABLE IF NOT EXISTS tasks(
  id TEXT PRIMARY KEY, event TEXT, title TEXT, owner TEXT, due TEXT, status TEXT,
  basis TEXT, ledger_ref TEXT, blocked_by TEXT, created_run INTEGER, updated_run INTEGER);
CREATE TABLE IF NOT EXISTS drafts(
  id TEXT PRIMARY KEY, kind TEXT, recipient TEXT, subject TEXT, body TEXT, reason TEXT,
  ledger_ref TEXT, task_ref TEXT, status TEXT, needs_approval INTEGER, approved_by TEXT,
  sent_on TEXT, awaiting_reply INTEGER DEFAULT 0, created_run INTEGER);
CREATE TABLE IF NOT EXISTS escalations(
  id TEXT PRIMARY KEY, to_role TEXT, question TEXT, reason TEXT, ledger_ref TEXT,
  status TEXT, resolution TEXT, resolved_by TEXT, created_run INTEGER);
CREATE TABLE IF NOT EXISTS seen(source TEXT PRIMARY KEY, run INTEGER);
CREATE TABLE IF NOT EXISTS runs(id INTEGER PRIMARY KEY, today TEXT, phase TEXT, summary TEXT);
CREATE TABLE IF NOT EXISTS trace(run INTEGER, seq INTEGER, agent TEXT, action TEXT, detail TEXT);
"""

PREFIX = {"ledger": "L", "tasks": "T", "drafts": "D", "escalations": "E"}


class Memory:
    def __init__(self, path: Path):
        self.db = sqlite3.connect(path)
        self.db.row_factory = sqlite3.Row
        self.db.executescript(SCHEMA)
        self.run_id = None
        self.series = 0
        self._seq = 0

    # ---- generic helpers -------------------------------------------------
    def next_id(self, table: str) -> str:
        """IDs run in series: 1-99 for the core story, 101+ for records from the later scenario mail."""
        series = getattr(self, "series", 0)
        n = sum(1 for (i,) in self.db.execute(f"SELECT id FROM {table}") if int(i[2:]) // 100 == series) + 1
        return f"{PREFIX[table]}-{series * 100 + n:03d}"

    def insert(self, table: str, **row) -> str:
        row.setdefault("id", self.next_id(table))
        cols = ",".join(row)
        self.db.execute(f"INSERT INTO {table}({cols}) VALUES({','.join('?' * len(row))})",
                        list(row.values()))
        self.db.commit()
        return row["id"]

    def update(self, table: str, rid: str, **vals) -> None:
        sets = ",".join(f"{k}=?" for k in vals)
        self.db.execute(f"UPDATE {table} SET {sets} WHERE id=?", [*vals.values(), rid])
        self.db.commit()

    def rows(self, table: str, where: str = "1=1", *args) -> list:
        return [dict(r) for r in self.db.execute(f"SELECT * FROM {table} WHERE {where}", args)]

    def one(self, table: str, where: str, *args):
        r = self.db.execute(f"SELECT * FROM {table} WHERE {where} LIMIT 1", args).fetchone()
        return dict(r) if r else None

    def meta(self, k: str, v=None):
        if v is None:
            r = self.db.execute("SELECT v FROM meta WHERE k=?", (k,)).fetchone()
            return r[0] if r else None
        self.db.execute("INSERT OR REPLACE INTO meta VALUES(?,?)", (k, str(v)))
        self.db.commit()

    # ---- runs and trace ----------------------------------------------------
    def start_run(self, today: str, phase: str) -> int:
        cur = self.db.execute("INSERT INTO runs(today, phase, summary) VALUES(?,?,?)", (today, phase, "{}"))
        self.db.commit()
        self.run_id, self._seq = cur.lastrowid, 0
        return self.run_id

    def finish_run(self, summary: dict) -> None:
        self.db.execute("UPDATE runs SET summary=? WHERE id=?", (json.dumps(summary), self.run_id))
        self.db.commit()

    def log(self, agent: str, action: str, detail: str = "") -> None:
        self._seq += 1
        self.db.execute("INSERT INTO trace VALUES(?,?,?,?,?)", (self.run_id, self._seq, agent, action, detail))
        self.db.commit()
        print(f"  [{agent:<10}] {action}" + (f"  {detail}" if detail else ""))

    def mark_seen(self, source: str) -> None:
        self.db.execute("INSERT OR IGNORE INTO seen VALUES(?,?)", (source, self.run_id))
        self.db.commit()

    def is_seen(self, source: str) -> bool:
        return self.db.execute("SELECT 1 FROM seen WHERE source=?", (source,)).fetchone() is not None

    def export(self) -> dict:
        out = {t: self.rows(t) for t in ("ledger", "tasks", "drafts", "escalations")}
        out["runs"] = [dict(r) for r in self.db.execute("SELECT * FROM runs ORDER BY id")]
        out["trace"] = [dict(r) for r in self.db.execute("SELECT * FROM trace ORDER BY run, seq")]
        return out
