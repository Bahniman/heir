"""The five Heir agents.

Supervisor  sets the goal for the run, decides which agents to dispatch, writes the digest
Scout       reads new records (mail, Drive, WhatsApp export, forwarded notes) into the ledger
Auditor     checks the ledger: overdue items, conflicts, duplicates, gaps in the handover doc, silence
Planner     plans the next event backwards from its date, and replans when a step stalls
Drafter     writes every outgoing message; external ones wait for a human approval
"""
import re
from datetime import date, timedelta

import llm

ROLE_ADDR = {"partnerships", "orders", "estate.office", "guesthouse", "student.affairs"}
# Mail behind the later scenarios. Their records are numbered from 101 so earlier IDs never move.
SERIOUS = {"m16", "m17", "m18"}
MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october",
          "november", "december"]


def series_of(ref) -> int:
    return 1 if re.fullmatch(r"[LTDE]-1\d\d", ref or "") else 0


def iso_of(text: str) -> str:
    dd, mo, y = text.lower().split()
    return f"{y}-{MONTHS.index(mo) + 1:02d}-{int(dd):02d}"
RESOURCES = [  # keyword in text -> resource name
    (("hall", "lc2", "venue"), "Venue booking"),
    (("rooms", "guest house", "group bookings"), "Guest house rooms"),
    (("standee", "banner", "artwork"), "Standees and banner printing"),
]
LEAD_PATTERNS = [(r"at least (\d+) days in advance", 1), (r"(\d+) weeks? notice", 7), (r"(\d+) days lead time", 1)]
PROMISE = re.compile(r"(we will keep you posted|we will get back to you|we will reach out)[^.]*", re.I)
# Text inside mail that tries to steer the agent. Mail is data: Heir logs it, asks a human, and acts on none of it.
INJECT = re.compile(r"(ignore (?:all |your |any )?(?:previous |prior |earlier )?instructions|note for the club'?s ai assistant"
                    r"|send [^.]*\b(?:logins?|passwords?)\b)", re.I)
EXCL = re.compile(r"(\w+) stays the exclusive (\w+) partner for (summit \d{4})[^.]*\. in return, we hold the first right "
                  r"to renew as title sponsor until (\d{1,2} \w+ \d{4})", re.I)
DUEBY = re.compile(r"the ([a-z ]+?) for (summit \d{4}) is due by (\d{1,2} \w+ \d{4})\.\s*([^.]*\.)?", re.I)
OFFER = re.compile(r"as an? (\w+) company[^.]*?would like to be the title sponsor of (summit \d{4}) at (inr [\d,]+)", re.I)
CLAIM = re.compile(r"(airfare|travel|flights?)[^.]*(will be|is) (reimbursed|covered|paid)", re.I)
STOP = {"the", "a", "an", "of", "on", "with", "and", "for", "to", "in", "before", "event", "within",
        "days", "two", "post", "naming", "figures", "photos", "media"}


def d(s: str) -> date:
    return date.fromisoformat(s)


def is_internal(addr: str, cfg: dict) -> bool:
    """A committee address: a member, past or present, or the club mailbox."""
    team = cfg["outgoing_team"] + cfg["incoming_team"]
    return addr == cfg["club_mailbox"] or any(m["email"] == addr for m in team)


def org_of(addr: str) -> str:
    local, domain = addr.split("@")
    if domain == "campus.example":  # campus offices are named by their mailbox
        return " ".join(p.capitalize() for p in re.split(r"[._]", local)).replace("Guesthouse", "Guest House")
    return domain.split(".")[0].capitalize()


def person_of(addr: str) -> str:
    local = addr.split("@")[0]
    return " ".join(p.capitalize() for p in re.split(r"[._]", local) if not p.isdigit())


def norm(name: str) -> str:
    return " ".join(p for p in re.sub(r"[^a-z ]", " ", name.lower()).split() if len(p) > 1)


def words(text: str) -> set:
    return {w for w in re.findall(r"[a-z0-9]+", text.lower()) if w not in STOP and len(w) > 2}


class Base:
    name = "agent"

    def __init__(self, mem, tools, cfg):
        self.mem, self.tools, self.cfg = mem, tools, cfg

    def log(self, action, detail=""):
        self.mem.log(self.name, action, detail)

    # shared lookups
    def event_for(self, day: date) -> dict:
        ev = [e for e in self.cfg["events"] if d(e["date"]) >= day]
        return ev[0] if ev else self.cfg["events"][-1]

    def member(self, addr: str):
        for m in self.cfg["outgoing_team"] + self.cfg["incoming_team"]:
            if m["email"] == addr:
                return m
        return None

    def role_holder(self, role: str):
        for m in self.cfg["incoming_team"]:
            if m["role"] == role:
                return m
        return None


# --------------------------------------------------------------------------
class Scout(Base):
    name = "Scout"

    def run(self, today: date) -> dict:
        n = {"mail": 0, "drive": 0, "whatsapp": 0, "captures": 0}
        mode = "gemini" if llm.available() else "rules (offline)"
        for m in self.tools.mailbox(today):
            if not self.mem.is_seen(m["source"]):
                self.mem.series = 1 if m["source"].split(":")[1] in SERIOUS else 0
                self.from_mail(m)
                self.mem.series = 0
                self.mem.mark_seen(m["source"])
                n["mail"] += 1
        for f in ("Handover_2026-27.md", "Speaker_Policy.md", "Outreach_Tracker.csv"):
            if not self.mem.is_seen(f"drive:{f}"):
                self.from_drive(f)
                self.mem.mark_seen(f"drive:{f}")
                n["drive"] += 1
        for w in self.tools.whatsapp(today):
            if not self.mem.is_seen(w["source"]):
                self.from_whatsapp(w)
                self.mem.mark_seen(w["source"])
                n["whatsapp"] += 1
        for c in self.tools.captures(today):
            if not self.mem.is_seen(c["source"]):
                self.from_capture(c)
                self.mem.mark_seen(c["source"])
                n["captures"] += 1
        self.log("read new records", f"{n['mail']} mails, {n['drive']} Drive files, "
                 f"{n['whatsapp']} WhatsApp lines, {n['captures']} forwarded notes; extractor: {mode}")
        return n

    # ---- ledger writes -----------------------------------------------------
    def add(self, kind, title, evidence, **kw):
        row = self.mem.one("ledger", "kind=? AND title=?", kind, title)
        if row:
            ev = row["evidence"] + " | " + evidence if evidence not in row["evidence"] else row["evidence"]
            self.mem.update("ledger", row["id"], evidence=ev, updated_run=self.mem.run_id,
                            **{k: v for k, v in kw.items() if v is not None})
            return row["id"]
        rid = self.mem.insert("ledger", kind=kind, title=title, evidence=evidence, status=kw.pop("status", "open"),
                              tag=kw.pop("tag", "historical"), created_run=self.mem.run_id,
                              updated_run=self.mem.run_id, **kw)
        self.log(f"ledger + {kind}", f"{rid} {title}")
        return rid

    def contact(self, addr, status, owner, evidence, when):
        name = org_of(addr) if addr.split("@")[0] in ROLE_ADDR else person_of(addr)
        key = norm(name)
        # one person may appear under two addresses: match on normalised name within the same organisation
        for r in self.mem.rows("ledger", "kind='contact'"):
            if r["counterparty"] == org_of(addr) and (norm(r["title"]) == key or
                                                      set(key.split()) == set(norm(r["title"]).split()) - {"k"} or
                                                      set(norm(r["title"]).split()) <= set(key.split())):
                owners = set(filter(None, (r["owner"] or "").split(", "))) | ({owner} if owner else set())
                detail = r["detail"] or ""
                if owner and r["owner"] and owner not in r["owner"].split(", "):
                    detail = f"Contacted by {r['owner']} and again by {owner} ({when}) at a second address. " + detail
                    self.log("duplicate outreach found", f"{r['title']}: {', '.join(sorted(owners))}")
                self.mem.update("ledger", r["id"], status=status, owner=", ".join(sorted(owners)), detail=detail,
                                evidence=r["evidence"] + " | " + evidence, updated_run=self.mem.run_id)
                return r["id"]
        return self.add("contact", name, evidence, counterparty=org_of(addr), contact_email=addr,
                        owner=owner, status=status, detail=f"Last contact {when}")

    # ---- sources -------------------------------------------------------------
    def from_mail(self, m):
        ev = f"{m['source']} ({m['date']})"
        outgoing = is_internal(m["from"], self.cfg)
        ext = m["to"] if outgoing else m["from"]
        body = m["body"]
        sender = self.member(m["from"])
        owner = sender["name"] if sender else None
        event = self.event_for(d(m["date"]))
        if is_internal(ext, self.cfg):
            return
        hit = None if outgoing else INJECT.search(body)
        if hit:
            self.log("untrusted instruction ignored", f"{m['source']} from {ext}: \"{hit.group(0)}\". "
                     "Mail is read as text, never as a command")
            Auditor(self.mem, self.tools, self.cfg).escalate(
                "Committee head", f"A mail from {ext} asks Heir to \"{hit.group(0)}\". Heir never follows instructions "
                "found inside mail and has sent nothing. Is this sender genuine?", "Suspicious instruction in mail", m["source"])
            return
        proposed = None
        if llm.available():
            proposed = llm.extract(f"From: {m['from']}\nTo: {m['to']}\nSubject: {m['subject']}\n\n{body}")
        low = body.lower()
        status = "contacted" if outgoing else "replied"
        if "panel for this year is final" in low:
            status = "declined by us"
        elif "thank you for confirming" in low or "yes, i would like to speak" in low:
            status = "confirmed"
        if ext.split("@")[0] not in ROLE_ADDR or not outgoing:
            self.contact(ext, status, owner if outgoing else None, ev, m["date"])
        if not outgoing:  # a reply closes the wait on anything we sent this person
            for dr in self.mem.rows("drafts", "status='sent' AND awaiting_reply=1 AND recipient=?", ext):
                self.mem.update("drafts", dr["id"], awaiting_reply=0)
                self.log("reply received", f"{dr['id']} answered by {person_of(ext)} on {m['date']}: {status}")
                if dr["task_ref"]:
                    self.mem.update("tasks", dr["task_ref"], status="done", updated_run=self.mem.run_id)
                ref = self.mem.one("ledger", "id=?", dr["ledger_ref"]) if dr["ledger_ref"] else None
                if ref and ref["kind"] == "promise" and status == "confirmed":
                    self.mem.update("ledger", ref["id"], status="closed", tag="confirmed",
                                    evidence=ref["evidence"] + " | kept: " + ev, updated_run=self.mem.run_id)
                    self.log("promise kept", f"{ref['id']} {ref['title']}: {person_of(ext)} confirmed for this year")
            # a draft written before this person wrote again is stale: pull it rather than talk past them
            for dr in self.mem.rows("drafts", "status='pending approval' AND recipient=?", ext):
                self.mem.update("drafts", dr["id"], status="withdrawn")
                self.log("draft withdrawn", f"{dr['id']} to {person_of(ext)}: they wrote on {m['date']} after it was "
                         "drafted; nothing goes out on a stale draft")

        # deliverables promised to a counterparty
        if "deliverables" in low and not outgoing:
            for line in re.findall(r"^\d+\.\s+(.+?)\.?$", body, re.M):
                due = d(event["date"])
                w = re.search(r"within (\d+) days of the event", line)
                if w:
                    due += timedelta(days=int(w.group(1)))
                    line = line[:w.start()].strip()
                self.add("commitment", f"{org_of(ext)}: {line}", ev, counterparty=org_of(ext), contact_email=ext,
                         due=due.isoformat(), detail=f"Agreed for {event['name']}")
        if outgoing and re.search(r"we confirm all|confirm (the|all) deliverables", low):
            for r in self.mem.rows("ledger", "kind='commitment' AND counterparty=?", org_of(ext)):
                self.mem.update("ledger", r["id"], tag="confirmed", owner=owner,
                                evidence=r["evidence"] + " | " + ev, updated_run=self.mem.run_id)
            self.log("commitments confirmed", f"{org_of(ext)} deliverables owned by {owner}")
        chase = re.search(r"still waiting for the ([a-z -]+report)", low)
        if chase:
            for r in self.mem.rows("ledger", "kind='commitment' AND counterparty=?", org_of(ext)):
                if "report" in r["title"].lower():
                    self.mem.update("ledger", r["id"], evidence=r["evidence"] + f" | chased by {org_of(ext)} {ev}",
                                    updated_run=self.mem.run_id)
                    self.log("counterparty chasing", f"{r['id']} {org_of(ext)} asked for the report on {m['date']}")
        # standing agreements, institutional deadlines, and offers that would break an agreement
        ex = None if outgoing else EXCL.search(body)
        if ex:
            ev2 = next(e for e in self.cfg["events"] if e["name"].lower() == ex.group(3).lower())
            self.add("restriction", f"{org_of(ext)} exclusivity: no other {ex.group(2).lower()} sponsor for {ev2['name']}", ev,
                     counterparty=org_of(ext), contact_email=ext, due=ev2["date"],
                     detail=f"{ex.group(2).lower()}|First right to renew until {ex.group(4)}", tag="confirmed")
        du = None if outgoing else DUEBY.search(body)
        if du:
            what, cons, evn = du.group(1).strip(), (du.group(4) or "").strip(), du.group(2)[0].upper() + du.group(2)[1:]
            self.add("commitment", f"{org_of(ext)}: {what} for {evn}", ev, counterparty=org_of(ext), contact_email=ext,
                     due=iso_of(du.group(3)), detail=f"Required for {evn}." + (f" {cons}" if cons else ""))
        of = None if outgoing else OFFER.search(body)
        if of:
            cat, evn = of.group(1).lower(), of.group(2)[0].upper() + of.group(2)[1:]
            for r in self.mem.rows("ledger", "kind='restriction' AND status='open'"):
                if (r["detail"] or "").startswith(cat + "|") and r["title"].endswith(evn):
                    self.log("conflict with a standing agreement", f"{m['source']} {org_of(ext)} offers {of.group(3).upper()} "
                             f"for {evn}; {r['id']} says no other {cat} sponsor")
                    Auditor(self.mem, self.tools, self.cfg).escalate(
                        "Committee head", f"{org_of(ext)} ({ext}) offers {of.group(3).upper()} to be title sponsor of {evn}. "
                        f"Last year's agreement ({r['evidence'].split(' ')[0]}) makes {r['counterparty']} the exclusive {cat} "
                        f"partner for {evn}. {r['detail'].split('|')[1]}. Accepting would break it. Decline, or ask "
                        f"{r['counterparty']} first?", "Contract conflict", r["id"])
        # lead times stated by a provider
        for pat, mult in LEAD_PATTERNS:
            lt = re.search(pat, low)
            if lt and not outgoing:
                res = next((name for keys, name in RESOURCES if any(k in low + m["subject"].lower() for k in keys)), "Unknown")
                self.add("lead_time", res, ev, counterparty=org_of(ext), contact_email=ext,
                         detail=f"{int(lt.group(1)) * mult} days", tag="historical")
        p = PROMISE.search(body)
        if p and outgoing:
            nxt = [e for e in self.cfg["events"] if d(e["date"]) > d(m["date"]) and e is not event]
            due = d(nxt[0]["date"]) - timedelta(days=75) if nxt else None
            self.add("promise", f"Keep {person_of(ext)} posted for future events", ev, counterparty=person_of(ext),
                     contact_email=ext, owner=owner, due=due.isoformat() if due else None,
                     detail=f'"{p.group(0)}"')
        c = CLAIM.search(body)
        if c and outgoing:
            self.add("claim", f"Told {person_of(ext)}: {c.group(0)}", ev, counterparty=person_of(ext),
                     contact_email=ext, owner=owner)
        if proposed is not None:
            self.from_model(proposed, body, ev, ext, owner, event)

    def from_model(self, items, body, ev, ext, owner, event):
        """Add what the language model found and the rules did not, after the quote check."""
        accepted, rejected = llm.check(items, body)
        for it, why in rejected:
            self.log("model item rejected", f"{ev}: {why}: {str(it.get('title', it))[:60]}")
        known = [r for r in self.mem.rows("ledger") if ev in (r["evidence"] or "")]
        kind_map = {"commitment": "commitment", "promise": "promise", "lead_time": "lead_time", "policy_claim": "claim"}
        added = 0
        for it in accepted:
            kind = kind_map[it["kind"]]
            if any(r["kind"] == kind and (words(r["title"]) & words(it["title"])) for r in known):
                continue  # the rules already have it
            due = None
            if it.get("days") and kind == "commitment":
                due = (d(event["date"]) + timedelta(days=it["days"])).isoformat()
            self.add(kind, it["title"].strip(), ev, counterparty=it.get("counterparty") or org_of(ext),
                     contact_email=ext, owner=owner, due=due, tag="reconfirm",
                     detail=f'Model-proposed, quote verified: "{it["quote"].strip()[:140]}"')
            added += 1
        self.log("model extraction", f"{ev}: {len(items)} proposed, {len(accepted)} passed the quote check, "
                 f"{added} new beyond the rules, {len(rejected)} rejected")

    def from_drive(self, name):
        ev = f"drive:{name}"
        if name.startswith("Handover"):
            text = self.tools.drive_text(name)
            self.mem.meta("handover_text", text)
            for line in text.splitlines():
                ll = line.lower()
                if "website and youtube" in ll:
                    for acct in ("Club website login", "YouTube channel login"):
                        self.add("account", acct, ev, owner="faculty advisor (stated, unconfirmed)", tag="reconfirm")
                m = re.search(r'sheet "([^"]+)"', line)
                if m and "login" in ll:
                    self.add("account", f'Club logins sheet "{m.group(1)}"', ev, tag="reconfirm",
                             detail="Referenced by the handover doc")
        elif name.startswith("Speaker_Policy"):
            for line in self.tools.drive_text(name).splitlines():
                if line.startswith("- "):
                    self.add("policy", line[2:].rstrip("."), ev, status="active", tag="confirmed")
        elif name.endswith(".csv"):
            for r in self.tools.drive_csv(name):
                self.contact(r["email"], r["status"], r["owner"], ev, r["last_contact"])

    def from_whatsapp(self, w):
        ev = f"{w['source']} ({w['date']}, {w['who']})"
        text = w["text"]
        for r in self.mem.rows("ledger", "kind='commitment' AND status='open'"):
            if r["counterparty"].lower() in text.lower() and (words(r["title"]) - words(r["counterparty"])) & words(text):
                self.mem.update("ledger", r["id"], status="closed", evidence=r["evidence"] + " | done: " + ev,
                                updated_run=self.mem.run_id)
                self.log("commitment closed", f"{r['id']} {r['title']} ({w['who']}, WhatsApp {w['date']})")
        if re.search(r"cold|already speak|replied", text, re.I):
            self.add("criterion", text[0].upper() + text[1:], ev, tag="historical", status="active",
                     detail="Member-reported")
        if "youtube login" in text.lower() or "sir has it" in text.lower():
            r = self.mem.one("ledger", "title='YouTube channel login'")
            if r:
                self.mem.update("ledger", r["id"], evidence=r["evidence"] + f' | "{text}" {ev}')

    def from_capture(self, c):
        ev = c["source"]
        text = c["text"]
        if text.startswith("Voice note") and "what worked" in text.lower():
            for s in re.split(r"(?<=\.)\s+", text.split(":", 1)[1].strip()):
                self.add("criterion", s.strip().rstrip("."), ev, tag="historical", status="active",
                         detail="Outgoing member, voice note")
        if text.startswith("Reply from"):
            who = text.split()[2]
            self.log("exit answer received", f"from {who}")
            if "never sent" in text:
                for r in self.mem.rows("ledger", "kind='commitment' AND status='open'"):
                    if "report" in r["title"].lower():
                        self.mem.update("ledger", r["id"], tag="confirmed",
                                        detail=r["detail"] + f". Confirmed unsent by {who}. " + text.split("sent.", 1)[1].strip(),
                                        evidence=r["evidence"] + " | " + ev, updated_run=self.mem.run_id)
            m = re.search(r"logins are held only by the ([a-z ]+)\.", text)
            if m:
                for r in self.mem.rows("ledger", "kind='account' AND title IN ('Club website login','YouTube channel login')"):
                    self.mem.update("ledger", r["id"], owner=m.group(1), tag="confirmed",
                                    detail=f"Only the {m.group(1)} holds it; no member has access",
                                    evidence=r["evidence"] + " | " + ev, updated_run=self.mem.run_id)
            for r in self.mem.rows("escalations", "status='open' AND to_role LIKE ?", f"%{who}%"):
                self.mem.update("escalations", r["id"], status="resolved", resolution=text, resolved_by=who)
            # replies close the matching exit-question drafts
            for r in self.mem.rows("drafts", "kind='exit question' AND recipient LIKE ?", f"{who.lower()}%"):
                self.mem.update("drafts", r["id"], awaiting_reply=0)


# --------------------------------------------------------------------------
class Auditor(Base):
    name = "Auditor"

    def run(self, today: date, phase: str) -> dict:
        out = {"overdue": [], "silent": [], "missing_from_handover": 0}
        ledger = self.mem.rows("ledger")
        handover = (self.mem.meta("handover_text") or "").lower()

        # 1. what the handover doc never mentions
        missing = []
        hwords = set(re.findall(r"[a-z0-9]+", handover))
        for r in ledger:
            if r["kind"] in ("commitment", "promise", "lead_time", "claim", "criterion", "restriction"):
                if r["kind"] == "lead_time":  # "book early" is not a lead time; the number of days is
                    days = int(r["detail"].split()[0])
                    inside = f"{days} days" in handover or (days % 7 == 0 and f"{days // 7} weeks" in handover)
                elif r["kind"] == "restriction":
                    inside = "exclusiv" in handover
                elif r["kind"] == "criterion":
                    inside = len({w for w in words(r["title"]) if len(w) >= 5} & hwords) >= 2
                else:
                    inside = bool(set(norm(r["counterparty"] or "").split()) & hwords)
                self.mem.update("ledger", r["id"], in_handover=int(inside))
                if not inside:
                    missing.append(r)
                # the doc mentions it and calls it done, but the records say it is still open
                if inside and r["status"] == "open" and r["kind"] == "commitment":
                    line = next((l for l in (self.mem.meta("handover_text") or "").splitlines() if r["counterparty"].lower() in l.lower()), "")
                    if re.search(r"\b(done|completed|delivered)\b", line.lower()) and "Handover says done" not in (r["detail"] or ""):
                        self.mem.update("ledger", r["id"], detail=(r["detail"] or "") + ". Handover says done; records say open")
                        self.log("handover contradicts records", f'{r["id"]}: doc says "{line.strip("- ").strip()}", '
                                                                  "no record that it was sent")
        out["missing_from_handover"] = len(missing)
        self.log("handover gap check", f"{len(missing)} of {sum(1 for r in ledger if r['kind'] in ('commitment','promise','lead_time','claim','criterion','restriction'))} "
                 "obligations, promises and lessons are not in the handover doc")

        # 2. files the handover doc points at but Drive does not have
        for r in self.mem.rows("ledger", "kind='account' AND title LIKE 'Club logins sheet%'"):
            target = r["title"].split('"')[1].lower()
            if not any(target in f.lower() for f in self.tools.drive_files()):
                self.mem.update("ledger", r["id"], status="missing", detail="Handover doc points to it; it is not in Drive")
                if not r["status"] == "missing":
                    self.log("broken reference", f'{r["id"]} sheet "{target}" named in handover is not in Drive')

        # 3. overdue commitments
        for r in self.mem.rows("ledger", "kind='commitment' AND status='open' AND due < ?", today.isoformat()):
            days = (today - d(r["due"])).days
            out["overdue"].append(r)
            self.log("overdue", f"{r['id']} {r['title']}: due {r['due']}, {days} days late")

        # 4. statements that contradict a written policy
        for c in self.mem.rows("ledger", "kind='claim' AND status='open'"):
            for p in self.mem.rows("ledger", "kind='policy'"):
                if "airfare" in c["title"].lower() and "airfare" in p["title"].lower() and "not covered" in p["title"].lower():
                    self.escalate("Committee head, cc faculty advisor",
                                  f"Policy says \"{p['title']}\", but {c['evidence'].split(' ')[0]} told a speaker "
                                  "airfare would be reimbursed. Which is current before we write to any speaker?",
                                  "Conflicting records", c["id"])

        # 5. contacts approached more than once with no reply
        for r in self.mem.rows("ledger", "kind='contact' AND owner LIKE '%,%'"):
            self.log("repeat outreach on record", f"{r['title']} ({r['counterparty']}): {r['owner']}, status {r['status']}")

        # 6. silence on messages that need a reply
        sla = self.cfg["reply_sla_days"]
        for dr in self.mem.rows("drafts", "status='sent' AND awaiting_reply=1 AND kind!='exit question'"):
            waited = (today - d(dr["sent_on"])).days
            if waited > sla:
                out["silent"].append(dr)
                self.log("no reply", f"{dr['id']} to {dr['recipient']}: {waited} days, limit {sla}")

        if phase == "shadow":
            self.exit_questions(today, out)
        else:
            self.handover_risks(today, out)
        return out

    def escalate(self, to_role, question, reason, ref):
        if self.mem.one("escalations", "ledger_ref=? AND reason=?", ref, reason):
            return
        was, self.mem.series = self.mem.series, series_of(ref)
        eid = self.mem.insert("escalations", to_role=to_role, question=question, reason=reason,
                              ledger_ref=ref, status="open", created_run=self.mem.run_id)
        self.mem.series = was
        self.log("ESCALATE", f"{eid} to {to_role}: {reason}")

    def exit_questions(self, today, out):
        """Before the handover: ask the people who are leaving, while they still answer."""
        sana = next(m for m in self.cfg["outgoing_team"] if m["role"] == "Logistics lead")
        asks = []
        for r in out["overdue"]:
            who = next((m for m in self.cfg["outgoing_team"] if m["name"] == r["owner"]), sana)
            asks.append((who, f"{r['title']} was due {r['due']} and I find no record that it was sent. "
                              "Was it sent? If not, where are the inputs?", r["id"]))
        unconfirmed = self.mem.rows("ledger", "kind='account' AND tag='reconfirm'")
        if unconfirmed:
            asks.append((sana, "Who holds these logins today: " + "; ".join(r["title"] for r in unconfirmed) +
                         "? The handover doc says to ask the faculty advisor, and the Access sheet it names is not in Drive.",
                         unconfirmed[0]["id"]))
        for who, q, ref in asks:
            if self.mem.one("drafts", "kind='exit question' AND ledger_ref=?", ref):
                continue
            self.mem.series = series_of(ref)
            did = self.mem.insert("drafts", kind="exit question", recipient=who["email"], subject="Before you hand over: one question",
                                  body=f"Hi {who['name']},\n\n{q}\n\nA one-line reply is enough. Heir, for Meridian Club",
                                  reason="Gap found before handover", ledger_ref=ref, status="sent", needs_approval=0,
                                  sent_on=today.isoformat(), awaiting_reply=1, created_run=self.mem.run_id)
            self.mem.series = 0
            self.tools.send_email(did, self.cfg["club_mailbox"], who["email"], "Before you hand over: one question",
                                  f"Hi {who['name']},\n\n{q}", today)
            self.log("exit question sent", f"{did} to {who['name']} (internal, no approval needed)")

    def handover_risks(self, today, out):
        """After the handover: anything inherited and unowned goes to the head."""
        incoming = {m["name"] for m in self.cfg["incoming_team"]}
        for r in out["overdue"]:
            if r["owner"] not in incoming:
                self.escalate("Committee head",
                              f"{r['title']} was owed to {r['counterparty']} by {r['due']} and was never sent "
                              f"({'owner ' + r['owner'] + ' has graduated' if r['owner'] else 'nobody on record owned it'}). "
                              + (f"{r['counterparty']} chased it. " if "chased" in r["evidence"] else
                                 re.sub(r"^Required for [^.]+\. ", "", r["detail"]) + " "
                                 if re.match(r"^Required for [^.]+\. .", r["detail"] or "") else "")
                              + "Who owns it now, and do we send it late?",
                              "Inherited commitment, no owner", r["id"])
        no_access = self.mem.rows("ledger", "kind='account' AND detail LIKE 'Only the%'")
        if no_access:
            self.escalate("Committee head",
                          "No current member can log in to: " + ", ".join(r["title"] for r in no_access) +
                          ". Only the faculty advisor holds them. Request delegated access before promotion starts?",
                          "Access held outside the team", no_access[0]["id"])


# --------------------------------------------------------------------------
class Planner(Base):
    name = "Planner"
    # Generic event cycle. Any club names its own steps; these are Meridian Club's.
    TEMPLATE = [
        ("Lock theme and panel topics", "Committee head", -75, None),
        ("Speaker outreach, round 1", "Speakers lead", -70, None),
        ("Request the venue", "Logistics lead", None, "Venue booking"),
        ("Book guest house rooms", "Logistics lead", None, "Guest house rooms"),
        ("Order standees and banner", "Logistics lead", None, "Standees and banner printing"),
        ("Renew the title sponsor", "Sponsorship lead", -60, None),
        ("Confirm the final panel", "Speakers lead", -21, None),
        ("Send sponsor post-event report", "Sponsorship lead", 21, None),
    ]
    BUFFER = 5

    def run(self, today: date, audit: dict) -> dict:
        event = self.event_for(today)
        day0 = d(event["date"])
        self.log("goal", f"deliver {event['name']} on {event['date']} ({(day0 - today).days} days away) "
                         "with every inherited obligation closed")
        made = 0
        overdue_ids = {r["id"] for r in audit["overdue"]}
        for title, role, offset, resource in self.TEMPLATE:
            if resource:
                lt = self.mem.one("ledger", "kind='lead_time' AND title=? AND status!='disputed'", resource)
                if not lt:
                    continue
                days = int(lt["detail"].split()[0])
                due = day0 - timedelta(days=days + self.BUFFER)
                basis = f"{days}-day lead time from {lt['evidence'].split(' ')[0]} (2026), plus {self.BUFFER}-day buffer; reconfirm"
                ref = lt["id"]
            else:
                due = day0 + timedelta(days=offset)
                basis = "cycle template (no record), adjust if needed"
                ref = None
            blocked = None
            if title.startswith("Renew"):
                stuck = [i for i in overdue_ids if "report" in self.mem.one("ledger", "id=?", i)["title"].lower()]
                if stuck:
                    blocked = stuck[0]
                    basis = f"blocked: last year's report ({blocked}) is still owed to this sponsor"
            if title.startswith("Speaker outreach"):
                crit = self.mem.rows("ledger", "kind='criterion'")
                repeat = self.mem.rows("ledger", "kind='contact' AND owner LIKE '%,%'")
                basis = (f"{len(crit)} outreach lessons on record: warm intros and people who already speak at "
                         "similar conclaves; avoid cold DMs")
                if repeat:
                    basis += f". Do not cold-email {repeat[0]['title']} again (two members, no reply in 2026)"
            made += self.upsert(event, title, role, due, basis, ref, blocked, today)
        for p in self.mem.rows("ledger", "kind='promise' AND status='open'"):
            made += self.upsert(event, f"Honour promise: invite {p['counterparty']}", "Speakers lead",
                                d(p["due"]) if p["due"] else today, f"promise in {p['evidence'].split(' ')[0]}: {p['detail']}",
                                p["id"], None, today)
        for r in audit["overdue"]:
            esc = self.mem.one("escalations", "ledger_ref=? AND status='resolved'", r["id"])
            m = re.search(r"owner: (\w+)", esc["resolution"] or "") if esc else None
            owner = m.group(1) if m else None
            role = next((m["role"] for m in self.cfg["incoming_team"] if m["name"] == owner), "Unassigned")
            made += self.upsert(event, f"Close inherited: {r['title']}", role, today + timedelta(days=7),
                                f"overdue since {r['due']}; " + ("owner set by head" if esc else "waiting for head to name an owner"),
                                r["id"], None if esc else "head decision", today)
        # a decision on a contract conflict becomes a message
        for e in self.mem.rows("escalations", "reason='Contract conflict' AND status='resolved'"):
            r = self.mem.one("ledger", "id=?", e["ledger_ref"])
            who = re.match(r"^(\w+) \(", e["question"]).group(1)
            if re.match(r"(?i)decline", e["resolution"] or ""):
                made += self.upsert(event, f"Decline {who}'s offer", "Sponsorship lead", today + timedelta(days=2),
                                    f"decided by the head: {r['id']} stands", r["id"], None, today)
            else:
                made += self.upsert(event, f"Ask {r['counterparty']} about exclusivity", "Sponsorship lead",
                                    today + timedelta(days=2), f"decided by the head: ask before answering {who}", r["id"], None, today)
        # replan around silence: follow up once, line up a fallback, then escalate
        for dr in audit["silent"]:
            task = self.mem.one("tasks", "id=?", dr["task_ref"])
            if task["title"].startswith("Follow up:"):
                Auditor(self.mem, self.tools, self.cfg).escalate(
                    "Committee head", f"No reply to {dr['recipient']} even after a follow-up ({dr['id']}). "
                    "Call them, or switch to the fallback?", "Silent after follow-up", task["id"])
                continue
            if self.mem.one("tasks", "title=?", f"Follow up: {task['title']}"):
                continue
            self.log("REPLAN", f"{task['id']} '{task['title']}' stalled: no reply to {dr['id']} in "
                               f"{(today - d(dr['sent_on'])).days} days")
            made += self.upsert(event, f"Follow up: {task['title']}", task["owner"], today + timedelta(days=1),
                                f"no reply to {dr['id']} since {dr['sent_on']}", task["ledger_ref"], None, today)
            if "venue" in task["title"].lower():
                made += self.upsert(event, "Fallback: hold LH23 if LC2 is not confirmed", task["owner"],
                                    min(d(task["due"]), today + timedelta(days=5)),
                                    "replan after silence; same lead time applies", task["ledger_ref"], None, today)
        tasks = self.mem.rows("tasks", "event=? ORDER BY due", event["name"])
        for t in tasks:
            if t["status"] == "todo" and d(t["due"]) < today:
                Auditor(self.mem, self.tools, self.cfg).escalate(
                    "Committee head", f"{t['title']} was due {t['due']} and cannot be met as planned.",
                    "Deadline can no longer be met", t["id"])
        path = self.tools.write_calendar(event["name"], tasks)
        self.log("plan written", f"{len(tasks)} tasks ({made} new or changed) -> calendar/{path.name}")
        return {"event": event, "tasks": tasks}

    def upsert(self, event, title, role, due, basis, ref, blocked, today) -> int:
        holder = self.role_holder(role)
        owner = f"{role} ({holder['name']})" if holder else role
        status = "blocked" if blocked else "todo"
        row = self.mem.one("tasks", "event=? AND title=?", event["name"], title)
        if row:
            if row["status"] in ("done", "waiting"):
                return 0
            if (row["status"], row["owner"], row["basis"]) != (status, owner, basis):
                self.mem.update("tasks", row["id"], status=status, owner=owner, basis=basis, blocked_by=blocked,
                                updated_run=self.mem.run_id)
                self.log("task updated", f"{row['id']} {title}: {status}, {owner}")
                return 1
            return 0
        self.mem.series = series_of(ref)
        tid = self.mem.insert("tasks", event=event["name"], title=title, owner=owner, due=due.isoformat(),
                              status=status, basis=basis, ledger_ref=ref, blocked_by=blocked,
                              created_run=self.mem.run_id, updated_run=self.mem.run_id)
        self.mem.series = 0
        self.log("task", f"{tid} {due.isoformat()} [{owner}] {title}" + (" (blocked)" if blocked else ""))
        return 1


# --------------------------------------------------------------------------
class Drafter(Base):
    name = "Drafter"
    WINDOW = 45  # draft external messages this many days before they are due

    def run(self, today: date) -> int:
        made = 0
        for t in self.mem.rows("tasks", "status IN ('todo','blocked') ORDER BY due"):
            if self.mem.one("drafts", "task_ref=? AND status!='superseded'", t["id"]):
                continue
            draft = self.compose(t, today)
            if not draft:
                continue
            body = llm.polish(draft["body"], t["basis"])
            self.mem.series = series_of(t["id"])
            did = self.mem.insert("drafts", kind="external", recipient=draft["to"], subject=draft["subject"],
                                  body=body, reason=draft["reason"], ledger_ref=t["ledger_ref"], task_ref=t["id"],
                                  status="pending approval", needs_approval=1, created_run=self.mem.run_id)
            self.mem.series = 0
            self.log("draft for approval", f"{did} to {draft['to']}: {draft['subject']}")
            made += 1
        return made

    def compose(self, t, today):
        title = t["title"]
        due_soon = (d(t["due"]) - today).days <= self.WINDOW
        sign = f"\n\n{t['owner'].split('(')[-1].rstrip(')')}\nMeridian Club"
        if title.startswith("Honour promise"):
            p = self.mem.one("ledger", "id=?", t["ledger_ref"])
            ev = self.event_for(today)
            first = p["counterparty"].split()[0]
            return {"to": p["contact_email"], "subject": f"{ev['name']}: the slot we promised to keep you posted on",
                    "reason": f"Promise in {p['evidence'].split(' ')[0]}: {p['detail']}",
                    "body": f"Dear {first},\n\nLast August you offered to speak at Summit 2026 after the panel was "
                            f"full, and we said we would keep you posted. {ev['name']} is on "
                            f"{d(ev['date']).strftime('%d %B %Y')}. Would you like to join a panel this year?" + sign}
        if title == "Request the venue" and due_soon:
            lt = self.mem.one("ledger", "id=?", t["ledger_ref"])
            ev = self.event_for(today)
            return {"to": lt["contact_email"], "subject": f"Booking request: LC2 for {d(ev['date']).day} {d(ev['date']).strftime('%B')}",
                    "reason": f"Lead time {lt['detail']} ({lt['evidence'].split(' ')[0]}); due {t['due']}",
                    "body": f"Dear Sir,\n\nRequesting LC2 for {ev['name']} on {d(ev['date']).strftime('%d %B %Y')}, "
                            "7:30 AM to 6 PM. Sending this well inside the 30-day notice period." + sign}
        if title.startswith("Follow up:"):
            orig = self.mem.one("drafts", "task_ref IN (SELECT id FROM tasks WHERE title=?)", title.split(": ", 1)[1])
            return {"to": orig["recipient"], "subject": "Re: " + orig["subject"],
                    "reason": f"No reply to {orig['id']} since {orig['sent_on']}",
                    "body": f"Dear Sir,\n\nFollowing up on our request of {orig['sent_on']} ({orig['subject']}). "
                            "Could you confirm, or tell us if another hall is free?" + sign}
        if title.startswith("Close inherited") and t["status"] == "todo" and "settlement" in title.lower():
            r = self.mem.one("ledger", "id=?", t["ledger_ref"])
            return {"to": r["contact_email"], "subject": "Summit 2026 settlement of accounts, submitted late",
                    "reason": f"Inherited {r['id']}, owner set by the committee head",
                    "body": "Dear Student Affairs office,\n\nPlease find attached the settlement of accounts for Summit 2026. "
                            f"It was due on {d(r['due']).strftime('%d %B %Y')} and the outgoing team did not submit it. "
                            "We apologise for the delay, and ask that this year's grant be released once you have checked it." + sign}
        if title.startswith("Decline "):
            e = self.mem.one("escalations", "reason='Contract conflict' AND ledger_ref=?", t["ledger_ref"])
            to = re.search(r"\(([^)]+@[^)]+)\)", e["question"]).group(1)
            org = re.sub(r"'s offer$", "", title[8:])
            r = self.mem.one("ledger", "id=?", t["ledger_ref"])
            evn = r["title"].split(" for ")[-1]
            return {"to": to, "subject": f"Re: Title sponsorship for {evn}", "reason": f"Head's decision: {r['id']} (exclusivity) stands",
                    "body": f"Dear {org} team,\n\nThank you for the offer. {evn} already has an exclusive education partner, "
                            "so we cannot accept it this year. We would be glad to talk about our other events." + sign}
        if title.startswith("Ask ") and title.endswith("about exclusivity"):
            r = self.mem.one("ledger", "id=?", t["ledger_ref"])
            evn = r["title"].split(" for ")[-1]
            return {"to": r["contact_email"], "subject": f"{evn}: renewal and exclusivity", "reason": f"Head's decision on {r['id']}",
                    "body": f"Dear {r['counterparty']} team,\n\nWe would like to talk about renewing for {evn}. Your first right "
                            f"to renew runs until {r['detail'].split('until ')[1]}. Could we speak this week? Another education "
                            "company has also approached us." + sign}
        if title.startswith("Close inherited") and t["status"] == "todo":
            r = self.mem.one("ledger", "id=?", t["ledger_ref"])
            return {"to": r["contact_email"], "subject": "Summit 2026 post-event report, with our apology",
                    "reason": f"Inherited {r['id']}, owner set by the committee head",
                    "body": "Dear Quillstone team,\n\nWe owed you the Summit 2026 post-event report by "
                            f"{d(r['due']).strftime('%d %B %Y')} and did not send it. That is on us. The report "
                            "with attendance figures and photos is attached. We would value the chance to work "
                            "with you again on Summit 2027." + sign}
        return None


# --------------------------------------------------------------------------
class Supervisor(Base):
    name = "Supervisor"

    def run(self, today: date) -> dict:
        phase = "shadow" if today < d(self.cfg["handover_date"]) else "run"
        rid = self.mem.start_run(today.isoformat(), phase)
        self.mem.meta("today", today.isoformat())
        prior = self.mem.db.execute("SELECT COUNT(*) FROM runs").fetchone()[0] - 1
        known = self.mem.db.execute("SELECT COUNT(*) FROM ledger").fetchone()[0]
        print(f"\nHEIR run {rid}  {today.isoformat()}  phase: {phase.upper()}")
        self.log("wake", f"scheduled run; memory holds {known} ledger entries from {prior} earlier runs")
        if phase == "shadow":
            self.log("goal", "capture what this team owes, knows and promised before it hands over on "
                             + self.cfg["handover_date"])
            plan = ["Scout", "Auditor (exit questions)"]
        else:
            ev = Base.event_for(self, today)
            self.log("goal", f"run {ev['name']} for the new team; nothing inherited gets dropped")
            plan = ["Scout", "Auditor", "Planner", "Drafter"]
        decided = self.mem.rows("escalations", "status='resolved' AND resolved_by NOT IN ('Aditi','Sana','Neel')")
        approved = self.mem.rows("drafts", "status='sent' AND needs_approval=1")
        if decided or approved:
            self.log("recall", f"{len(decided)} decisions by the head and {len(approved)} approved messages since "
                               "the last run carry into this one")
        self.log("dispatch", " -> ".join(plan))

        scout = Scout(self.mem, self.tools, self.cfg).run(today)
        audit = Auditor(self.mem, self.tools, self.cfg).run(today, phase)
        plan_out, drafts = None, 0
        if phase == "run":
            plan_out = Planner(self.mem, self.tools, self.cfg).run(today, audit)
            drafts = Drafter(self.mem, self.tools, self.cfg).run(today)

        pend = self.mem.rows("drafts", "status='pending approval'")
        esc = self.mem.rows("escalations", "status='open'")
        summary = {
            "phase": phase, "read": scout,
            "ledger": self.mem.db.execute("SELECT COUNT(*) FROM ledger").fetchone()[0],
            "open_commitments": len(self.mem.rows("ledger", "kind IN ('commitment','promise') AND status='open'")),
            "missing_from_handover": audit["missing_from_handover"],
            "overdue": len(audit["overdue"]), "tasks": len(plan_out["tasks"]) if plan_out else 0,
            "new_drafts": drafts, "awaiting_approval": len(pend), "open_escalations": len(esc),
        }
        self.mem.finish_run(summary)
        self.log("hand back", f"{len(pend)} messages wait for approval, {len(esc)} questions wait for a human; "
                              "stopping until the next trigger")
        return summary
