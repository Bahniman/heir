"""Tests for the language-model gate: the model proposes, code decides.

    python -m unittest test_model_gate -v

No API key needed. The integration test swaps in a fake model that returns one
item quoted from the mail and one invented item, then runs the full demo.
"""
import contextlib
import io
import re
import unittest
from unittest import mock

import heir
import llm


class CheckTests(unittest.TestCase):
    SRC = "Thank you. We confirm all three deliverables, including the post-event report within 21 days."

    def test_quote_in_source_is_accepted(self):
        ok, bad = llm.check([{"kind": "commitment", "title": "Post-event report", "days": 21,
                              "quote": "including the post-event report within 21 days"}], self.SRC)
        self.assertEqual((len(ok), len(bad)), (1, 0))

    def test_invented_quote_is_rejected(self):
        ok, bad = llm.check([{"kind": "commitment", "title": "Speaker fee",
                              "quote": "we will pay a speaker fee of INR 50,000"}], self.SRC)
        self.assertEqual(ok, [])
        self.assertEqual(bad[0][1], "quote not found in the source")

    def test_curly_quotes_and_spacing_still_match(self):
        ok, _ = llm.check([{"kind": "promise", "title": "Keep posted",
                            "quote": "we’ll  keep you\nposted"}], "Sure, we'll keep you posted.")
        self.assertEqual(len(ok), 1)

    def test_malformed_items_are_rejected(self):
        items = [{"kind": "gossip", "title": "x", "quote": self.SRC},
                 {"kind": "commitment", "title": "", "quote": self.SRC},
                 {"kind": "commitment", "title": "Report", "quote": self.SRC, "days": "21"},
                 {"kind": "commitment", "title": "Report", "quote": "within 21"},
                 "not a dict"]
        ok, bad = llm.check(items, self.SRC)
        self.assertEqual(len(ok), 0)
        self.assertEqual(len(bad), 5)


def fake_extract(text):
    body = text.split("\n\n", 1)[1]
    first = re.split(r"(?<=[.!?])\s", body.strip(), 1)[0]
    return [{"kind": "commitment", "title": "Model: " + first[:40], "quote": first, "days": None},
            {"kind": "commitment", "title": "Speaker fee agreed", "quote": "We agreed to pay a speaker fee of INR 50,000."}]


def run_demo():
    with contextlib.redirect_stdout(io.StringIO()):
        heir.cmd_demo(None)
    mem, _, _ = heir.load()
    out = {t: mem.rows(t) for t in ("ledger", "trace")}
    mem.db.close()
    return out


class DemoTests(unittest.TestCase):
    def test_offline_demo_is_unchanged(self):
        db = run_demo()
        self.assertEqual(len(db["ledger"]), 30)
        self.assertFalse([r for r in db["trace"] if r["action"].startswith("model ")])

    def test_model_path_adds_only_verified_items(self):
        with mock.patch.object(llm, "available", return_value=True), \
             mock.patch.object(llm, "extract", side_effect=fake_extract), \
             mock.patch.object(llm, "polish", side_effect=lambda draft, facts: draft):
            db = run_demo()
        ledger = db["ledger"]
        self.assertFalse(any("Speaker fee" in r["title"] for r in ledger), "invented item reached the ledger")
        model_rows = [r for r in ledger if r["detail"] and r["detail"].startswith("Model-proposed")]
        self.assertTrue(model_rows)
        # model items wait for a human; only later evidence (a member's confirming mail) upgrades one
        self.assertFalse([r for r in model_rows if r["tag"] == "historical"])
        self.assertGreater(sum(r["tag"] == "reconfirm" for r in model_rows), len(model_rows) // 2)
        rejected = [r for r in db["trace"] if r["action"] == "model item rejected"]
        summaries = [r for r in db["trace"] if r["action"] == "model extraction"]
        invented = [r for r in rejected if "Speaker fee" in r["detail"]]
        self.assertEqual(len(invented), len(summaries))  # one invented item per mail, every one caught
        # everything the rules found is still there
        self.assertEqual(len([r for r in ledger if not (r["detail"] or "").startswith("Model-proposed")]), 30)
        run_demo()  # leave the offline demo state behind


if __name__ == "__main__":
    unittest.main()
