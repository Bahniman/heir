"""Optional language-model layer.

With GEMINI_API_KEY set (free tier is enough), the Scout sends each email to
Gemini for structured extraction and the Drafter has it smooth the wording of a
draft. Without a key, Heir runs on its rule-based extractor and template drafts,
so the demo works offline. Every trace line records which path ran.

The model only proposes. check() accepts an item only when its quote appears
word for word in the source text and its fields are well formed; anything else
is rejected and logged. Accepted items enter the ledger tagged "reconfirm", so a
member confirms them before Heir treats them as fact.
"""
import json
import os
import re
import urllib.request

MODEL = os.environ.get("HEIR_GEMINI_MODEL", "gemini-2.5-flash")
URL = "https://generativelanguage.googleapis.com/v1beta/models/{m}:generateContent?key={k}"

EXTRACT_PROMPT = """You read one email from a student committee's mailbox.
Return JSON with a list "items". Each item has: kind (commitment | promise | lead_time |
policy_claim), title, counterparty, days (integer or null, for lead times and
"within N days" deadlines), quote (the exact sentence it came from).
Only include what the text states. Email:
"""


def available() -> bool:
    return bool(os.environ.get("GEMINI_API_KEY"))


def _call(prompt: str, as_json: bool) -> str:
    body = {"contents": [{"parts": [{"text": prompt}]}]}
    if as_json:
        body["generationConfig"] = {"responseMimeType": "application/json"}
    req = urllib.request.Request(URL.format(m=MODEL, k=os.environ["GEMINI_API_KEY"]),
                                 data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        data = json.load(r)
    return data["candidates"][0]["content"]["parts"][0]["text"]


def extract(mail_text: str):
    """Structured items from one email, or None if no model is configured or the call fails."""
    if not available():
        return None
    try:
        return json.loads(_call(EXTRACT_PROMPT + mail_text, as_json=True)).get("items", [])
    except Exception:
        return None


KINDS = {"commitment", "promise", "lead_time", "policy_claim"}


def _flat(s: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[‘’]", "'", re.sub(r"[“”]", '"', s or ""))).strip().lower()


def check(items, source: str):
    """Split model output into (accepted, rejected). Rejected items carry a reason."""
    accepted, rejected = [], []
    text = _flat(source)
    for it in items if isinstance(items, list) else []:
        if not isinstance(it, dict):
            rejected.append(({"raw": str(it)[:80]}, "not an object")); continue
        kind, title, quote, days = it.get("kind"), (it.get("title") or "").strip(), _flat(it.get("quote")), it.get("days")
        if kind not in KINDS:
            rejected.append((it, f"unknown kind {kind!r}"))
        elif not title:
            rejected.append((it, "no title"))
        elif len(quote) < 12 or quote.rstrip(".") not in text:
            rejected.append((it, "quote not found in the source"))
        elif days is not None and not (isinstance(days, int) and 0 < days < 400):
            rejected.append((it, f"bad days value {days!r}"))
        else:
            accepted.append(it)
    return accepted, rejected


def polish(draft: str, facts: str) -> str:
    """Smooth a template draft without changing any fact. Falls back to the template."""
    if not available():
        return draft
    try:
        return _call("Rewrite this email so it reads naturally. Keep every name, date, number and "
                     f"commitment exactly. Facts: {facts}\n\nDraft:\n{draft}", as_json=False).strip()
    except Exception:
        return draft
