# QAForge — App Workflow

The sequenced user/system flow behind QAForge, distilled from `../vault-qa/PRD.md` so `/design` can build screens and a demo in the exact order they actually happen — not a guessed generic flow. `DESIGN.md` covers *what things look like* (tokens, palette); this covers *what happens when*. Read both before building a screen.

---

## 1. End-to-end loop (PRD §2)

```
TEST OBJECTIVE → PLAN → EXECUTE → OBSERVE → DETECT FAILURE → COLLECT EVIDENCE
    → INVESTIGATE CODE → FORM HYPOTHESIS → VALIDATE → REPORT
    → [FAIL/INCONCLUSIVE only] HUMAN APPROVAL → ACT
```

**Branch point at REPORT is the one thing every screen must get right:**
- **PASS** → loop stops at REPORT. No hypothesis, no root cause, nothing to approve. The Test Run View shows a clean checklist and nothing else.
- **FAIL or INCONCLUSIVE** → REPORT continues into HUMAN APPROVAL → ACT. Both statuses get an approval draft — INCONCLUSIVE is not a dead end, it's still routed to a human (PRD §15).

## 2. Screen sequence (which screen, when)

| Step in the loop | Screen | What the user sees |
|---|---|---|
| User starts a run | **New Run** (not yet in `DESIGN.md` — see §5 below) | Form: application URL, GitHub repo, natural-language objective |
| PLAN → EXECUTE → OBSERVE | **Test Run View**, status `INVESTIGATING` (running) | Step checklist filling in ✓/✗ live, Agent Activity panel updating |
| DETECT FAILURE → COLLECT EVIDENCE → INVESTIGATE CODE → FORM HYPOTHESIS → VALIDATE | **Test Run View**, still `INVESTIGATING` | Agent Activity rows advance in order (§4); user can jump to **Evidence Viewer** or **Agent Trace** from here without leaving the run |
| REPORT (PASS) | **Test Run View**, status `PASSED` | Checklist all ✓, "All steps passed. No investigation triggered." — terminal, nothing else to do |
| REPORT (FAIL, root cause confirmed) | **Test Run View**, status `FAILED` | Confidence score, root-cause text, `Related source: file.ts:41-63`, one CTA: **Review & Create GitHub Issue** |
| REPORT (FAIL, D4 — no hypothesis survived) | **Test Run View**, status `FAILED (Report: INCONCLUSIVE)` | "No root cause confirmed. N hypotheses investigated, all rejected — see Agent Trace." Same CTA. |
| REPORT (system/infra failure) | **Test Run View**, status `ERROR` | One §20 reason code (e.g. `APP_UNREACHABLE`) + retryable/not-retryable note. No CTA — there's no report to approve. |
| HUMAN APPROVAL | **Approval Draft** (not yet in `DESIGN.md` — see §5 below) | The drafted GitHub issue body, APPROVE / REJECT |
| ACT | Back on **Test Run View** | Approval resolved; a link to the created GitHub issue replaces the CTA |

The CTA **"Review & Create GitHub Issue"** is the single hinge between the investigation UI and the approval UI — it's the only button in the whole product that leads to an external write (PRD §12).

## 3. The exact demo script (PRD §24 — build/rehearse in this order)

This is the concrete walkthrough `/design` should build as a clickable prototype, and what a live demo follows step for step:

1. **New Run** screen: enter a URL with a known auth bug, the repo, objective "Verify login → dashboard flow." Submit.
2. **Test Run View** opens at `INVESTIGATING`. Steps 1–4 tick ✓ live (open login, enter credentials, submit, verify session). Step 5 ("Navigate dashboard") ticks ✗.
3. Agent Activity panel advances top to bottom (§4's order) as it happens — this is the visual heart of the demo, leave it on screen long enough to read.
4. Status flips to `FAILED`. Root cause appears: confidence 0.89, "Authentication middleware reads stale session state immediately after login," `middleware.ts:41-63`.
5. Click into **Agent Trace** to show the timestamped log backing that conclusion (three hypotheses formed, two rejected, one confirmed) — this is what makes the conclusion legible, not a black box.
6. Back on Test Run View, click **Review & Create GitHub Issue** → **Approval Draft** screen shows the drafted issue.
7. Click **Approve** → issue is created; the screen shows a link to the real created GitHub issue.

Nine PRD-listed beats (discover → capture redirect → verify auth API → find middleware → generate hypotheses → reject wrong ones → identify root cause → produce report → draft+approve issue) map onto steps 2–7 above. PRD calls this "a highly visual five-minute demonstration" — pacing matters as much as content; don't rush past the Agent Activity panel or Agent Trace, they're the proof, not decoration.

## 4. Agent pipeline → Agent Activity panel (PRD §8–9)

Order of the rows in the Test Run View's Agent Activity panel, top to bottom — **this exact order, not alphabetical or arbitrary**:

```
Browser Agent → Evidence Agent → Repository Investigator → Root Cause Agent → Validator
```

**The QA Supervisor is not a row.** PRD §9.1 is explicit that the Supervisor is the orchestration/workflow graph itself, not a reasoning agent with its own visible activity — it's the thing routing between the five rows above, not a sixth row. Adding a "Supervisor" activity row is a common misread of §8's diagram; don't.

Each row's states, in order: `waiting` → `● investigating` (or `running`) → `✓ <one-line result>` (e.g. "✓ 14 artifacts collected", "✓ 7 relevant files"). Only one row is typically active at once, reflecting the pipeline's linear handoff (§8: Browser → Evidence → Repo Investigator → Root Cause → Validator → Report).

## 5. Gap: two screens PRD requires that `DESIGN.md` doesn't cover yet

`DESIGN.md` only specifies Dashboard / Test Run View / Evidence Viewer / Agent Trace. Two more screens are load-bearing per this workflow and need their own component pass before `/design` builds the full prototype:

- **New Run** — the intake form (URL, repo, objective) that starts §1's loop. PRD doesn't give it a mockup (only the §3 example use case names the three inputs) — treat it as a plain form, styled per `DESIGN.md`'s tokens, not a new pattern.
- **Approval Draft** — the human-in-the-loop screen (PRD §11): drafted GitHub issue body, APPROVE/REJECT, and the 24h-expiry note (PENDING → APPROVED/REJECTED/EXPIRED). This is the only screen with a genuine external-write side effect in the whole product — it should look and feel more deliberate than everything else (a confirmation step, not a one-click action).

## 6. What NOT to build into the flow

- No suspended/resumable workflow state on approval — §11 is explicit: APPROVE writes to GitHub inline; there's nothing to "resume." Don't design a spinner/pending-workflow state after Approve beyond the write itself completing.
- No mid-run editing of the objective or steps — PRD's Test Planner (§9.2) either returns a plan or `{plannable: false}` up front; there's no "edit step 3" affordance mid-execution.
- Repository access is read-only everywhere except the one approved issue-creation write (§12) — no UI should imply QAForge can push code, open PRs, or modify the repo under test.
