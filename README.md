# Heir: a committee agent that carries open commitments across tenures

[![tests](https://github.com/Bahniman/heir/actions/workflows/tests.yml/badge.svg)](https://github.com/Bahniman/heir/actions/workflows/tests.yml)

Team Ghost Protocol, Manakriti 3.0 Agent Challenge ("Agents on Campus"), AI Nexus Club, XLRI.

**Play it:** https://bahniman.github.io/heir/ (runs in the browser on a mock club's records).

Heir reads a club's own records (mailbox, Drive, a WhatsApp export, notes members forward), keeps one ledger of what the club owes, promised and learned, and acts on it after the people who made those promises have graduated. It plans each event backwards from its date, drafts every outgoing email for approval, and hands control back to a human whenever a decision is needed.

## Run it

Python 3.10 or later, standard library only. No install.

```
python heir.py demo                          # the full scripted demo: reset, 4 runs, human approvals
python heir.py reset                         # rebuild the mock world and wipe memory
python heir.py run --today 2027-05-20        # one scheduled run on a simulated date
python heir.py status                        # drafts and questions waiting for a human
python heir.py approve D-003 --by Ishaan     # approve a draft; it is sent to mock_world/outbox at once
python heir.py resolve E-002 --by Ishaan --note "owner: Kabir. Send it now with an apology"
python heir.py done T-001 --by Ishaan        # close a task done outside email
python heir.py correct L-015 --by Tara --note "Wrong: check the source"   # flag a record; its drafts are withdrawn
python heir.py correct L-005 --by Kabir --note "handled: sent from my mail" # close a debt handled outside Heir
python test_edge_cases.py                    # disputes, stale drafts, phishing mail
```

## The language model, and why it cannot invent entries

Set `GEMINI_API_KEY` (free tier is enough) and the Scout also sends each email to Gemini for structured extraction; the Drafter has it smooth the wording of drafts. Without a key Heir runs on its rule-based extractor alone, which is what the demo and the video use so every viewer sees the same run.

The model only proposes. `llm.check()` keeps an item only if its quote appears word for word in the source and its fields are well formed. Kept items enter the ledger tagged `reconfirm`, so a member confirms them before Heir treats them as fact, and each rejection is written to the trace with its reason. The rules still run first, so the model adds what they missed rather than replacing them.

```
python -m unittest test_model_gate -v
```

Six tests, no key needed. The integration test runs the full demo with a fake model that returns one real quote and one invented commitment per email: every invented item is rejected, model entries stay `reconfirm` unless a member's own mail confirms them, and all 26 rule-found entries are still there. The live reader on the demo page applies the same check in the browser, with Claude as the model for viewers signed in to claude.ai.

## Architecture

| Part | File | Role | Brief property |
|---|---|---|---|
| Supervisor | agents.py | Reads date and ledger, sets the run's goal (shadow before handover, run after), dispatches agents, writes the summary, stops | P1 planning, P4 multi-agent |
| Scout | agents.py | Reads new mail, Drive, WhatsApp export, forwarded notes into the ledger with evidence | P2 tools |
| Auditor | agents.py | Overdue debts, policy conflicts, repeat outreach, handover gaps and false "done" claims, silence past the reply limit; sends exit questions before handover; escalates | P5 escalation |
| Planner | agents.py | Plans the event backwards with learned lead times; replans on silence (follow-up, fallback, then the head) | P1 planning |
| Drafter | agents.py | Drafts outgoing emails into an approval queue | P2 tools |
| Memory | memory.py | SQLite: ledger, tasks, drafts, escalations, seen records, runs and trace | P3 memory |
| Tools | tools.py | Mailbox, Drive, captures, outbox, calendar .ics. Swap these functions for Gmail, Drive and Calendar APIs to deploy | P2 tools |
| Trigger | heir.py run | Called by n8n cron or Task Scheduler | P5 loop |

Hand-back rules: nothing external leaves without a member's approval; an inherited commitment with no owner, conflicting records, silence after a follow-up, access held outside the team, or a deadline that can no longer be met go to the committee head. Internal questions to outgoing members go out on their own.

## Mock data

`mockdata.py` builds `mock_world/`: a fictional club mailbox (14 emails with real dates, so each run sees only what had arrived by its simulated day), a thin handover doc, a speaker policy, an outreach tracker, a WhatsApp export and three forwarded notes. Every person and company in it is invented. The scenario is modelled on what the team saw organising Summit 2026.

## Interactive demo (the Round 1 demo link)

The demo page is a five-minute game. You play the new committee head of a mock club. One element is highlighted on every screen, and a "Next" strip above the phone names the action.
1. Take over: the 8-line handover the old team left.
2. Round 1, without Heir: two minutes to dig through their old files and pin what the club still owes. Fifteen items are hidden. The clock stands in for a busy first week; it is the problem, not the product.
3. Round 2, with Heir: your score against Heir's, which runs the real agents on the same files.
4. Set up on the phone: the invite email, the site opening in Safari, Add to Home Screen, the app icon, the notification prompt. Heir is an installable web app (PWA), not an app store app. Skippable.
5. Run the club: each morning starts on the lock screen with Heir's notification and the 7:00 email digest. The app has four tabs (Today, Ledger, Plan, Activity). Approving opens a sheet that re-checks the thread and counts down with Undo; a receipt then lists what changed, and a side panel shows the email arriving in the recipient's inbox. "Something's not right?" flags a record as wrong or already handled.
6. Forward something to Heir: a Claude model (fastest tier) reads a message it has never seen, using six tools on the live ledger (search, plan, add record, note record, ask the head, draft a reply). Code rejects any action whose quote is not in the message, drafts only go to addresses on record, and nothing sends without a tap. Needs the viewer signed in to claude.ai; elsewhere the four example messages replay steps Claude wrote ahead of time, labelled as such, through the same gates.
7. Hand over: a scorecard, then the handover Heir writes for next year's head.

"How it works" has five tabs: On your phone, Where the AI is, When things go wrong (each case marked Built or Planned), Inside the agents (the 30-step walkthrough), and Why Heir (mission, vision, roadmap, sources).

Scenarios in the mock world: an unsent sponsor report the handover called done, a promise to a speaker, an airfare claim against policy, lead times, logins only the advisor holds, a settlement of accounts nobody owned (next year's grant is held), last year's sponsor exclusivity that a rival offer would break, a phishing email aimed at the agent, and a reply that arrives before a follow-up is approved.

Build: `python web/build.py` composes `web/heir-demo.html` from `web/app2.html`, `web/game.js`, `web/ai.js`, `web/walk.js`, `web/wk.css` and `web/heir-engine.js` and `web/glass.js`, with the two design-system stylesheets in `web/vendor/`. It writes three copies: `web/heir-demo.html` (the artifact), `web/heir-demo-local.html` (offline fallback) and `index.html` (GitHub Pages, the only one with portfolio links).

## Checks

- `node web/parity_run.js web/out.json` then `python web/parity_check.py web/out.json` (after `python heir.py demo`): the browser engine must match the Python memory row for row. Last result: 0 mismatches across 117 trace lines.
- `node web/fuzz.js`: 300 random playthroughs (3,600 runs) with random approvals, holds, corrections and replies; no exceptions, nothing sent without approval, nothing sent on a disputed record, nothing sent to the phishing sender, no duplicate IDs.
- `python test_edge_cases.py`: 11 checks on disputes, stale drafts, the phishing email and closing a debt handled outside Heir.
- `python -m unittest test_model_gate -v`: 6 tests on the model quote check.
- Page: a test bot plays the whole demo by clicking only the highlighted element, on desktop, mobile and dark mode (46 steps, no errors).
