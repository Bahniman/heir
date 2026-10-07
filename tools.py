"""Tools the agents call. Each one touches a real file or service.

In the demo the mailbox, Drive folder and outbox are local folders holding mock
records. In a deployment the same four functions are swapped for the Gmail,
Drive and Calendar APIs on the committee's own account; nothing above this
layer changes.
"""
import csv
import email
from email import policy
from email.message import EmailMessage
from email.utils import parsedate_to_datetime, format_datetime
from datetime import datetime, date, timezone, timedelta
from pathlib import Path

IST = timezone(timedelta(hours=5, minutes=30))


class Toolbox:
    def __init__(self, world: Path):
        self.world = world

    # ---- read ------------------------------------------------------------
    def mailbox(self, today: date) -> list:
        """Messages that had arrived by `today`, oldest first."""
        out = []
        for f in sorted((self.world / "mailbox").glob("*.eml")):
            msg = email.message_from_bytes(f.read_bytes(), policy=policy.default)
            sent = parsedate_to_datetime(msg["Date"]).date()
            if sent <= today:
                out.append({"source": f"mail:{f.stem}", "date": sent.isoformat(),
                            "from": msg["From"], "to": msg["To"], "subject": msg["Subject"],
                            "body": msg.get_body(("plain",)).get_content().strip()})
        return sorted(out, key=lambda m: m["date"])

    def drive_text(self, name: str) -> str:
        return (self.world / "drive" / name).read_text(encoding="utf-8")

    def drive_files(self) -> list:
        return sorted(p.name for p in (self.world / "drive").iterdir() if p.is_file())

    def drive_csv(self, name: str) -> list:
        with open(self.world / "drive" / name, encoding="utf-8") as fh:
            return list(csv.DictReader(fh))

    def captures(self, today: date) -> list:
        """Forwarded notes (voice-note transcripts, pasted DMs) that had arrived by `today`."""
        out = []
        for f in sorted((self.world / "captures").glob("*.txt")):
            day = f.stem.split("_")[1]
            if date.fromisoformat(day) <= today:
                out.append({"source": f"capture:{f.stem}", "date": day,
                            "text": f.read_text(encoding="utf-8")})
        return out

    def whatsapp(self, today: date) -> list:
        out = []
        for i, line in enumerate(self.drive_text("whatsapp_export_core_team.txt").splitlines()):
            if not line.startswith("["):
                continue
            stamp, rest = line[1:].split("]", 1)
            d = datetime.strptime(stamp.split(",")[0], "%d/%m/%y").date()
            if d <= today:
                who, text = rest.strip().split(":", 1)
                out.append({"source": f"whatsapp:{i}", "date": d.isoformat(), "who": who, "text": text.strip()})
        return out

    # ---- write -----------------------------------------------------------
    def send_email(self, did: str, sender: str, to: str, subject: str, body: str, on: date) -> Path:
        """Deliver to the outbox. Swapped for Gmail send in a deployment."""
        msg = EmailMessage()
        msg["Message-ID"] = f"<{did}@heir.mock>"
        msg["Date"] = format_datetime(datetime.combine(on, datetime.min.time(), IST).replace(hour=18))
        msg["From"], msg["To"], msg["Subject"] = sender, to, subject
        msg.set_content(body)
        path = self.world / "outbox" / f"{on.isoformat()}_{did}.eml"
        path.write_bytes(bytes(msg))
        return path

    def write_calendar(self, event: str, tasks: list) -> Path:
        """One .ics file per event plan; imports into Google Calendar as-is."""
        lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Heir//Committee plan//EN"]
        for t in tasks:
            d = t["due"].replace("-", "")
            lines += ["BEGIN:VEVENT", f"UID:{t['id']}@heir", f"DTSTART;VALUE=DATE:{d}",
                      f"SUMMARY:[{t['owner']}] {t['title']}", f"DESCRIPTION:Basis: {t['basis']}",
                      "END:VEVENT"]
        lines.append("END:VCALENDAR")
        path = self.world / "calendar" / f"{event.replace(' ', '_')}.ics"
        path.write_text("\r\n".join(lines) + "\r\n", encoding="utf-8")
        return path
