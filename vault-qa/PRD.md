---
type: prd
status: active
tags: [prd]
---

> Product requirements for QAForge. See [[Project-Status]] for current implementation state against this plan.

# QAForge — Product Requirements Document

**Version:** 1.3  
**Status:** MVP / Build-Ready — pending confirmation of Decision Log D1–D14  
**Product Type:** Autonomous Software QA & Debugging Agent  
**Primary Stack:** Next.js + TypeScript + tRPC + Mastra + Drizzle + PostgreSQL

---

## Decision Log & Open Questions

*Added during PRD review (2026-09-03). Every entry is **Recommendation**, not **Confirmed** — none has product-owner sign-off yet. Requirements elsewhere in this doc that depend on a Proposed decision are written as if it holds; treat it as the current default, not settled fact.*

### Decisions

| ID | Decision | Status |
|----|----------|--------|
| D1 | **Tenancy:** MVP is single-tenant — every row is scoped to `Project.userId`, ownership enforced server-side in the Application Service layer (never trusted from tRPC input alone). Team/org sharing deferred to V2 (§26). | Proposed — pending owner confirmation |
| D2 | **Secrets:** Test credentials and GitHub tokens live in an external secrets manager (vault/KMS-style reference); `credentialsReference` (§15) is a pointer, never a plaintext value or DB column. Provider unpicked (see OQ2). | Proposed — pending infra decision |
| D3 | **Trust boundary:** All browser-captured content (DOM, console, network bodies, redirect chains) is untrusted data — wrapped and labeled as data in every prompt that consumes it. No agent may expand its own tool scope based on content found there. | Proposed |
| D4 | **Inconclusive outcome:** When no hypothesis survives validation (§9.7), the Report records `result = INCONCLUSIVE` rather than surfacing the strongest rejected candidate. | Proposed |
| D5 | **API baseline:** `testRun.create` requires a client-supplied idempotency key (same key → same run, no duplicate investigation); all tRPC procedures share one error envelope; `project.list`/`testRun.list` are paginated (`limit`/`cursor`). | Proposed |
| D6 | **Orchestration:** Mastra (D6) over a custom state machine or LangGraph — chosen for TS-native fit with the tRPC/Next.js stack and built-in tracing/evals matching §21/§22. Not benchmarked against alternatives; revisit if Mastra can't express the falsification loop in §9.7. Every section that names Mastra as settled architecture (§8, §10, §12, §13, §14, §27) is tagged `(D6)` so the hedge doesn't get lost in transcription. | Proposed |
| D7 | **Execution model:** `testRun.create` persists the run as `PENDING` and hands it to a background worker process — a long-lived Node process consuming a Postgres-backed job table, separate from the Next.js/tRPC request handler — which then drives the Mastra workflow. The client polls `testRun.get`/`report.get` every 3s while the run is non-terminal (simplest MVP transport, no new infra); a WebSocket/SSE subscription is Post-MVP if polling proves too chatty. Chosen over holding the tRPC request open (exceeds serverless duration limits) and over a full queue product (BullMQ/Inngest) for MVP simplicity — revisit if worker-process reliability becomes a problem. | Proposed |
| D8 | **Authentication:** Auth.js (NextAuth) with the Drizzle Postgres adapter; database-backed sessions via an httpOnly, Secure, SameSite=Lax cookie (not JWT); sign-in via GitHub OAuth only for MVP (the product already requires a GitHub connection, so this avoids a second identity flow); no password storage. Session expiry 30 days, sliding on activity; logout invalidates the session row server-side. | Proposed |
| D9 | **Approval mechanism:** the `produceReport` step (§10, FAIL/INCONCLUSIVE branch only) is the last thing the Mastra workflow does — drafting the GitHub issue text and creating the `Approval` row (PENDING) is Application Service code that runs right after, not a further Mastra step. `approval.approve`/`approval.reject` later perform the GitHub write **inline**, synchronously within the tRPC procedure, also via the Application Service layer — never through the D7 background worker or as a Mastra tool invocation. Nothing here resumes a suspended Mastra workflow: the workflow already reached its terminal state before the `Approval` row exists. §11's "a human reviews the draft, then decides" describes waiting on that persisted `Approval` row — a normal PENDING-status wait, not a durable Mastra suspend/resume snapshot. Chosen for simplicity — no workflow-snapshot durability to build for MVP; revisit if a future version needs the *workflow itself* (not just the GitHub write) to pause mid-investigation for human input. | Proposed |
| D10 | **TestScenario credential intake:** the client submits the plaintext test credential over TLS directly to `testScenario.create`; the Application Service writes it to the secrets manager (D2) in the same request and stores only the returned reference in `credentialsReference`. The plaintext is never logged, never persisted in the application database, and never included in any trace. | Proposed |
| D11 | **SSRF defense:** the Application URL, and every redirect target it produces, is resolved and checked against a deny-list of private/link-local/loopback/cloud-metadata address ranges (RFC1918, `127.0.0.0/8`, `169.254.0.0/16`, `::1`, known metadata IPs) immediately before each Playwright navigation — re-checked on every redirect hop, not only the initial URL. A match ends the run as `ERROR`/`APP_UNREACHABLE`. | Proposed |
| D12 | **Redaction scope:** the D2/D3 redaction rule covers request and response **bodies**, not only the `Authorization`/`Cookie`/`Set-Cookie` header values in §9.4 — any body field matching a credential-like key (`password`, `token`, `secret`, `apiKey`, case-insensitive) is masked, and the literal value resolved from the run's `credentialsReference` is redacted wherever it appears in any captured header, body, or URL, before the value reaches Evidence persistence, any LLM prompt, or Mastra's own tool-call tracing (§22). | Proposed |
| D14 | **Concurrency cap:** max 5 concurrent (non-terminal) `TestRun`s per user; `testRun.create` beyond that returns `RATE_LIMITED` (§14, §20) rather than queuing or spawning unbounded. Resolves the former OQ5, which asked only "should there be a cap," not the number — same pattern as D13/OQ4. Distinct from D5's idempotency key, which handles same-scenario duplicate requests, not total account concurrency. | Proposed |
| D13 | **GitHub integration mechanism:** a fine-grained personal access token (PAT), not a GitHub App, for MVP. A PAT is a single string the user pastes in; a GitHub App needs an installation flow, webhook handling, and JWT-based app authentication — meaningfully more to build for no MVP-stage benefit. Permissions: `Contents: Read-only` + `Issues: Read and write`, matching §11. Resolves the former OQ4 (which asked only about scope precision, not the deeper App-vs-PAT choice this decision actually settles); revisit if multi-repo-per-org management makes a GitHub App worth the cost. | Proposed |

### Open Questions

| ID | Question | Why it matters |
|----|----------|-----------------|
| OQ1 | LLM provider(s) and version-pinning policy | Report reproducibility — the same input shouldn't silently produce a different root cause after a model swap. |
| OQ2 | Deployment target and hosting for the D7 background worker and D2's secrets manager | Blocks D2's provider choice and §25 Phase 1; also open in [[Project-Status]]. |
| OQ3 | Evaluation dataset construction, baseline targets, and measurement cadence for §21 | §21's ratios are currently decorative — no dataset means no way to know if a run is behaving well or badly. |

(OQ4 and OQ5 were resolved by D13 and D14 respectively and are no longer open.)

---

# 1. Product Vision

QAForge is an autonomous software QA agent that can:

1. Receive an application URL.
2. Receive a GitHub repository.
3. Accept a natural-language test objective.
4. Generate an execution plan.
5. Interact with the web application.
6. Observe runtime behavior.
7. Detect failures.
8. Gather evidence.
9. Investigate the corresponding source code.
10. Generate and validate root-cause hypotheses.
11. Produce an evidence-backed QA report.
12. Optionally create a GitHub issue after human approval.

QAForge is not primarily a chatbot.

It is an **agentic software-testing execution system**.

---

# 2. Core Product Loop

```text
TEST OBJECTIVE
      ↓
PLAN
      ↓
EXECUTE
      ↓
OBSERVE
      ↓
DETECT FAILURE
      ↓
COLLECT EVIDENCE
      ↓
INVESTIGATE CODE
      ↓
FORM HYPOTHESIS
      ↓
VALIDATE
      ↓
REPORT
      ↓
HUMAN APPROVAL (FAIL/INCONCLUSIVE only)
      ↓
ACT
```

A PASS run stops at REPORT — there's no hypothesis, no root cause, and nothing to approve. HUMAN APPROVAL/ACT is the FAIL/INCONCLUSIVE branch only (§10, §11).

The fundamental design principle is:

> AI reasoning can investigate and recommend actions, but evidence and deterministic validation must support the final conclusion.

---

# 3. Example Use Case

User provides:

```text
Application:
https://example-app.vercel.app

Repository:
github.com/org/example-app

Test objective:

"Verify that an authenticated user can log in
and reach the dashboard."
```

QAForge executes:

```text
Open application

→ navigate /login

→ enter credentials

→ submit login

→ inspect network requests

→ inspect redirects

→ verify session

→ verify dashboard rendered
```

Suppose authentication succeeds but the user returns to `/login`.

QAForge produces:

```text
TEST RESULT
FAIL

Expected:
Successful authentication should navigate
the user to /dashboard.

Observed:
POST /api/auth/login → 200

Session cookie → created

Redirect → /dashboard

Middleware → redirects to /login

Root Cause Candidate:

Authentication middleware reads stale
session state immediately after login.

Confidence:
89%

Related source:

middleware.ts:41-63

Recommended action:

Inspect session-refresh lifecycle before
executing protected-route middleware.
```

---

# 4. Target Users

Primary users:

- Full-stack engineers
- Startup engineering teams
- AI engineers
- QA engineers
- Indie hackers
- Technical founders

Secondary users:

- DevOps engineers
- Platform teams
- Engineering managers

For MVP, every persona above operates inside their own single-tenant account (D1) — a project, its runs, and its reports are visible only to the user who owns them. Shared/team access across the personas listed here (e.g. an engineering manager viewing a platform team's runs) is Post-MVP (§26).

---

# 5. Problem Statement

Modern applications contain failures across multiple layers:

```text
Frontend
API
Authentication
Database
Middleware
Network
Infrastructure
Third-party APIs
```

Traditional QA systems frequently detect:

> "The test failed."

But they rarely explain:

> "Why did the application fail?"

Developers then manually inspect:

- browser console
- API traffic
- stack traces
- commits
- middleware
- application code
- deployment changes

QAForge combines runtime QA and source-code investigation into a single autonomous workflow.

---

# 6. MVP Scope

The MVP must solve one problem extremely well:

> Given an application, repository and user-defined test scenario, autonomously execute the scenario and produce an evidence-backed root-cause report when the workflow fails.

## MVP Inputs

```text
Application URL

GitHub repository

Test objective

Optional:
test credentials
```

## MVP Outputs

```text
PASS / FAIL

Executed steps

Screenshots

Console evidence

Network evidence

Observed behavior

Expected behavior

Relevant repository files

Root-cause hypotheses

Confidence scores

Recommended remediation

QA report
```

This is the core loop, not the whole MVP boundary — agent-trace visualization (§19), the evidence viewer (§18), and human-approved GitHub issue creation (§11) are also in scope for V1; §23's success criteria list is the authoritative MVP boundary, and §6/§25 should be read as staged build order toward it, not a smaller scope.

---

# 7. Explicit MVP Non-Goals

Do NOT initially build:

- autonomous code modification
- autonomous PR creation
- production deployment
- arbitrary shell execution
- complete repository-wide coding agent
- mobile testing
- load testing
- performance benchmarking
- security penetration testing
- fully autonomous destructive actions

These can become later versions.

---

# 8. Core Agent Architecture

QAForge should use specialized agents coordinated through Mastra (D6).

Not every box below needs to be an LLM-reasoning agent — see the note under §9.1 on which of these are agentic loops, single structured-output calls, or plain deterministic functions.

```text
                    QA SUPERVISOR
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
        ▼                 ▼                 ▼
   Test Planner     Browser Agent     Evidence Agent
                                            │
                                            ▼
                                     Repo Investigator
                                            │
                                            ▼
                                     Root Cause Agent
                                            │
                                            ▼
                                      Validator Agent
                                            │
                                            ▼
                                         REPORT
```

---

# 9. Agent Responsibilities

## 9.1 QA Supervisor

**The Supervisor is orchestration code, not a separate LLM-reasoning agent** — it's the Mastra workflow graph (§10) itself, not a second thing that also decides whether to continue. Written as a standalone "agent" with independent judgment, it and §10's workflow become two owners of one control-flow decision with no tiebreak rule; `qa-supervisor.ts` (§13) is the module implementing this workflow, not a prompted agent with its own reasoning loop.

Responsibilities (all deterministic, driven by workflow state — not an LLM call):

- route each step to the right downstream agent/tool
- maintain `TestRun`/`TestStep` state as steps complete
- enforce §20's execution limits (loop count, depth, duration, token budget) and end the run as `ERROR` when exceeded
- aggregate final results into the `Report`

**Which of §9.2–§9.7 are actually agentic**, so §20's execution limits have stated targets — the Browser Agent's tool-calling loop is bounded by "max browser steps"/"max retries per step"; the Repository Investigator's re-read loop is what "max agent loops" bounds (§10's `validateCause → investigateRepo` edge); the rest are single calls with no loop to bound:

| Agent | Kind |
|---|---|
| Test Planner (§9.2) | Single structured-output LLM call |
| Browser Execution Agent (§9.3) | Multi-step tool-calling loop — bounded by "max browser steps" / "max retries per step" |
| Evidence Collector (§9.4) | Deterministic function, no LLM call |
| Repository Investigator (§9.5) | Multi-step tool-calling loop — bounded by "max agent loops" |
| Root Cause Agent (§9.6) | Single structured-output LLM call |
| Validator (§9.7) | Single structured-output LLM call per hypothesis (code evaluates the result, §9.7) |

---

# 9.2 Test Planner Agent

Converts:

```text
"Test login and verify dashboard access."
```

into:

```json
{
  "objective": "Verify authenticated dashboard access",
  "steps": [
    {
      "action": "Navigate to login",
      "expectedOutcome": "Login form renders",
      "successCriteria": { "kind": "url", "match": "/login" },
      "failureCriteria": { "kind": "httpStatus", "notIn": [200] }
    },
    {
      "action": "Enter credentials and submit",
      "expectedOutcome": "Authentication succeeds",
      "successCriteria": { "kind": "httpStatus", "path": "/api/auth/login", "in": [200] },
      "failureCriteria": { "kind": "httpStatus", "path": "/api/auth/login", "notIn": [200] }
    },
    {
      "action": "Verify dashboard navigation",
      "expectedOutcome": "Redirected to /dashboard and stays there",
      "successCriteria": { "kind": "url", "match": "/dashboard" },
      "failureCriteria": { "kind": "url", "match": "/login" }
    }
  ]
}
```

`successCriteria`/`failureCriteria` use a closed `StepCriterion` type — a deterministic assertion, not free-text an LLM judges at evaluation time (per §2's principle that "evidence and deterministic validation must support the final conclusion"):

```ts
type StepCriterion =
  | { kind: 'url'; match: string }
  | { kind: 'selector'; present: string } | { kind: 'selector'; absent: string }
  | { kind: 'httpStatus'; path?: string; in?: number[]; notIn?: number[] }
  | { kind: 'consoleAbsent'; pattern: string };
```

§10's `success?` branch evaluates a step's `successCriteria`/`failureCriteria` against captured evidence (§9.4), never an LLM's holistic read of the page.

**Unplannable objective:** if the natural-language objective cannot be decomposed into steps with concrete `StepCriterion` values (too vague, contradictory, or requires an action outside §9.3's capabilities), the Test Planner returns `{ plannable: false, reason: string }` instead of a best-guess plan — the same "don't fabricate under uncertainty" discipline D4 requires of the Validator, applied one stage earlier. A `TestRun` for an unplannable objective ends immediately as `ERROR`/`OBJECTIVE_NOT_PLANNABLE` (added to §20's error-mapping table).

---

# 9.3 Browser Execution Agent

Responsible for interacting with the application.

Capabilities:

- navigate — every navigation (initial and each redirect hop) passes the
  SSRF deny-list check in §20 first (D11); a denied address ends the run
  `ERROR`/`APP_UNREACHABLE` rather than connecting
- click
- type
- submit
- wait
- inspect URL
- inspect DOM
- inspect page text
- capture screenshots
- inspect browser console
- inspect network requests

Recommended execution technology:

```text
Playwright
```

Browser execution should be deterministic whenever possible.

**Resolution strategy (Recommendation):** each plan step resolves to a Playwright action via accessibility-tree role/name matching first (e.g. `getByRole('button', { name: 'Log in' })`) — it's more stable across UI redesigns than CSS selectors and doesn't require a vision model call per step. On resolution failure, retry up to §20's "max retries per step" using the same strategy; if still unresolved, fail the step `FAILED` with `observed = "ELEMENT_NOT_FOUND"` rather than falling back to an unspecified alternate strategy mid-run.

---

# 9.4 Evidence Collector Agent

When a failure occurs, capture:

```text
Screenshot

Current URL

DOM state

Console errors

Network requests

HTTP status codes

Redirect chain

Relevant response bodies

Timing information

Failed test step
```

All investigation must be tied to stored evidence.

**Redaction (D2/D3/D12):** `Authorization`/`Cookie`/`Set-Cookie` header *values*, request/response body fields matching a credential-like key, and the literal value resolved from the run's `credentialsReference` are all masked. Header *names and presence* are preserved — so "session cookie → created" (§3) remains an observable fact even though the cookie's value never enters storage, a trace, or a prompt.

**Redaction happens inside the browser/network tool itself**, before the value is returned to the agent runtime or reaches any tracer — not only at the point evidence is written to the `Evidence` table. This includes the live "inspect network requests" capability above: whatever it returns is already masked, so Mastra's own tool-call tracing (D6, §22) never captures a raw credential either.

---

# 9.5 Repository Investigator Agent

Receives runtime evidence.

It searches the repository for relevant implementation paths.

Example:

```text
runtime failure:

/dashboard → /login
```

Possible investigation:

```text
middleware.ts
auth.ts
session.ts
login route
dashboard layout
protected-route helper
```

Outputs:

```ts
type CodeEvidence = {
  file: string;
  lines?: string;
  relevance: number;   // relevance < 0.4 (Recommendation) must not be
                         // returned — omit the file rather than pad
                         // the list with a weak guess
  explanation: string;
};
```

If nothing in the repository clears the relevance floor, the Investigator returns an empty `CodeEvidence[]`, not a best-guess file — the same "don't fabricate under uncertainty" discipline D4 requires of the Validator (§9.7) and §9.2 requires of the Test Planner, applied here too. A run whose Root Cause Agent receives zero `CodeEvidence` may still produce hypotheses from runtime evidence alone; it just can't cite source code for them.

**File content is untrusted (D3):** the contents of any file this agent reads are fed into the Root Cause Agent's prompt exactly the way browser-captured content is (§20) — a comment or string literal crafted to redirect investigation is a realistic prompt-injection vector in a tool whose job is testing arbitrary repositories. D3's wrap-as-data rule applies to file content identically to DOM/console/network content.

---

# 9.6 Root Cause Agent

Generates multiple competing hypotheses.

Example:

```text
H1:
Session state has not propagated before navigation.

H2:
Middleware validates the wrong cookie.

H3:
Dashboard authorization logic incorrectly rejects the user.
```

Each hypothesis requires:

```text
supporting evidence

contradicting evidence

confidence

required validation
```

Persisted as: one `Hypothesis` row plus one `HypothesisEvidence` row per cited piece of evidence, `role` set to `SUPPORTING` or `CONTRADICTING` (§15) — not a free-text description of what's supporting or contradicting, so §18's Evidence Viewer and §21's Evidence Grounding Rate have an actual join to read.

---

# 9.7 Validation Agent

Attempts to falsify hypotheses.

This is critical.

QAForge should not simply generate plausible explanations.

Example:

```text
Hypothesis:

Login API failed.

Validation:

POST /api/auth/login = 200

Result:

Hypothesis rejected.
```

Final root cause should represent the strongest surviving explanation.

**Evaluation is deterministic, not an LLM's holistic verdict (§2's principle, applied here):** the Validator LLM call produces structured checks, and *code* — not the LLM — decides SUPPORTED/REJECTED from them:

```ts
type ValidationResult = {
  hypothesisId: string;
  checks: { evidenceId: string; assertion: string; passed: boolean }[];
};
```

`status = REJECTED` iff any check fails. `status = SUPPORTED` iff every check passes AND `confidence >= 0.70` (§15 — Recommendation, not load-tested). Otherwise the hypothesis stays `VALIDATING` and does not count as surviving.

**When nothing survives (D4):** if every hypothesis is rejected, or none reaches sufficient confidence, the Validator does not fall back to the strongest rejected candidate. The Report records `result = INCONCLUSIVE`: evidence was collected, no root cause was confirmed, and the report lists what was ruled out and why. Fabricating a plausible-sounding cause here would break the product's own principle in §27 ("prove why it happened").

---

# 10. Mastra Workflow (D6)

Conceptual workflow:

```text
createRun

   ↓

understandObjective

   ↓

generateTestPlan

   ↓

executeStep

   ↓

success?
 ┌─────┴─────┐
YES          NO
 │            │
 ▼            ▼
nextStep   collectEvidence
 │            │
 │            ▼
 │       investigateRepo ◄──────────┐
 │            │                     │
 │            ▼                     │ hypothesis not SUPPORTED (REJECTED,
 │      createHypotheses            │ or still VALIDATING per §9.7) and
 │            │                     │ loop budget remains (§20 max agent
 │            │                     │ loops) — round-trips back to
 │            ▼                     │ investigateRepo ONLY, for more
 │       validateCause ── NO ───────┘ CodeEvidence; never re-invokes
 │            │                       Browser Agent against the live
 │        YES (SUPPORTED) OR          application
 │        loop budget exhausted
 │            ▼
 │       produceReport
 │       result = FAIL or INCONCLUSIVE ONLY — this
 │       path (collectEvidence onward) never produces
 │       PASS; PASS never generates a hypothesis, §2/§15
 │            ▼
 │       §11 human approval
 │       (Approval row created, §15)
 ▼
PASS REPORT ── reached only via the YES/nextStep path on
               the left once every step has succeeded;
               produceReport is never on this path
```

A round-trip may request additional repository files; it may not re-run browser steps — evidence collection against the live application happens once per run. `produceReport` is reached either when a hypothesis is `SUPPORTED`, or the loop budget (§20) is exhausted with none `SUPPORTED` — at which point the Report records `INCONCLUSIVE` (D4), never a silent retry-forever.

Repeated browser steps should use controlled looping.

The workflow must enforce:

```text
maximum actions

maximum investigation depth

maximum agent iterations

timeout limits

token/cost limits
```

---

# 11. Human-in-the-Loop

Actions modifying external systems must require approval.

For MVP:

```text
FAIL/INCONCLUSIVE report produced (TestRun already terminal, §15)
        ↓
   draft GitHub issue, create Approval row (PENDING)
        ↓
 Human reviews the draft
        ↓
 APPROVE / REJECT / [24h elapses → EXPIRED, §15]
        ↓
 APPROVE → GitHub write happens inline (D9) — nothing to "resume":
 there is no suspended workflow, only a pending row awaiting a
 human decision on an already-finished run
```

QAForge should never silently create external resources.

**GitHub token scope (D13):** classic OAuth `repo` scope is NOT read-only — it grants full read/write access to code and metadata — so it's the wrong mechanism here. D13 settles this as a fine-grained personal access token (not a GitHub App, and not an open either/or), requesting `Contents: Read-only` (for the Repository Investigator) + `Issues: Read and write` (for this approval flow only); no broader permission is requested. Read-only-ness is enforced at two layers: the grant itself (`Contents: Read-only`) and the tool-authorization check in §20 — belt and suspenders, not either/or. The token is stored via the secrets mechanism in D2, never in the application database.

---

# 12. Product Architecture

```text
┌────────────────────────────────────────┐
│               Next.js                  │
│                                        │
│  Dashboard                             │
│  Test Runs                             │
│  Evidence Viewer                       │
│  Agent Trace                           │
│  Reports                               │
└───────────────────┬────────────────────┘
                    │
                   tRPC
                    │
┌───────────────────▼────────────────────┐
│          Application Services          │──► GitHub directly (D9, D13):
│                                        │    github.connect/repositories,
│ Identity & Authorization (D1, D8)      │    and approval.approve's inline
│ Project & Scenario Management          │    issue-creation write — none
│ Test Run Management                    │    of these three go through
│ GitHub Integration (D13)               │    the worker or Mastra below
└───────────────────┬────────────────────┘
                    │  testRun.create hands off here (D7);
                    │  tRPC returns immediately, does not block
┌───────────────────▼────────────────────┐
│        Background Worker (D7)          │
│  picks up PENDING TestRuns, drives the │
│  workflow below, writes progress the   │
│  client polls for                      │
└───────────────────┬────────────────────┘
                    │
┌───────────────────▼────────────────────┐
│              Mastra (D6)               │
│                                        │
│ Agents                                 │
│ Workflows                              │
│ Tools                                  │
│ Tracing                                │
│ Evals                                  │
└───────────┬────────────────┬───────────┘
            │                │
            ▼                ▼
       Playwright          GitHub
            │
            ▼
        Application

                    +

             PostgreSQL
             Drizzle ORM
                    +
           Secrets Manager (D2)
```

**Identity & Authorization** does two distinct jobs, named separately so neither is silently skipped: *authentication* (D8) resolves the incoming request to a `caller` — an Auth.js session cookie is validated and turned into a `userId` — before anything else runs; *authorization* (D1) then confirms the resource's owning `Project.userId === caller.id` — directly for `Project` itself, or by walking the join chain §14/§15 spell out per entity (e.g. `Approval.runId → TestRun.scenarioId → TestScenario.projectId → Project.userId`) for everything nested under a project. tRPC input validation (§14) checks shape; this layer checks who and against what. `testRun.create` additionally hands off to the D7 background worker rather than executing the Mastra workflow inline.

Repository tools stay read-only (§20) for investigation; the only write path is the human-approved GitHub issue creation in §11 (D9, performed inline — no Mastra workflow suspension), which is a distinct, gated action — not a relaxation of the read-only rule.

---

# 13. Suggested Repository Structure

```text
qaforge/

apps/
  web/
    app/
    components/
    server/

packages/

  api/
    routers/
      project.ts
      test-scenario.ts
      test-run.ts
      evidence.ts
      report.ts
      github.ts        // github.connect/repositories AND approval.ts's
                        // inline issue-creation write (D9) both live
                        // here — neither is under ai/mastra/
      approval.ts

  worker/              // D7 — the long-lived process that picks up
                        // PENDING TestRuns and drives the Mastra workflow;
                        // separate deployable from apps/web

  ai/
    mastra/            // provisional pending D6

      agents/
        qa-supervisor.ts
        test-planner.ts
        browser-agent.ts
        evidence-agent.ts
        repo-investigator.ts
        root-cause-agent.ts
        validator-agent.ts

      workflows/
        qa-run.workflow.ts

      tools/
        browser/
        github/
        repository/
        evidence/

      schemas/

      evals/

  db/
    schema/
    queries/

  shared/
    types/
    schemas/
```

---

# 14. tRPC Responsibilities

tRPC handles the application control plane.

Example routers, with ownership and contract notes (D1, D5, D6-D14 — Proposed):

```text
project.create              — creates a Project owned by the caller. If
                               Project.repository is set, 403 unless the
                               caller's GithubConnection (D13) covers it
project.list(limit, cursor) — returns only the caller's projects, paginated
project.get(id)             — 403 unless project.userId === caller.id

testScenario.create(projectId, name, objective, credential?)
                             — 403 unless project is caller-owned. See
                               D10 for the credential-intake path
testScenario.update(id, ...) — same ownership check
testScenario.list(projectId) — 403 unless project is caller-owned
testScenario.get(id)         — 403 unless the parent project is
                                caller-owned

testRun.create(scenarioId, idempotencyKey)
                             — requires idempotencyKey; UNIQUE(scenarioId,
                               idempotencyKey) — same key replays the
                               existing TestRun for that scenario; the same
                               key reused against a *different* scenario is
                               simply a different row, no collision. 403
                               unless the scenario's project is caller-
                               owned. Persists status=PENDING and hands off
                               to the D7 background worker; returns
                               immediately (does not block on the run)
testRun.get(id)              — 403 unless the run's project is caller-owned
testRun.list(projectId, limit, cursor)
                             — paginated; 403 unless project is caller-owned
testRun.cancel(id)           — 403 unless the run's project is caller-owned.
                               Signals the D7 worker via `workflowId`;
                               non-terminal TestSteps transition to
                               SKIPPED, TestRun.status becomes CANCELLED.
                               No Report is produced for a cancelled run

evidence.list(runId, type?, limit, cursor)
                             — paginated; 403 unless the run's project is
                               caller-owned
evidence.get(id)             — 403 unless the parent run's project is
                                caller-owned. SCREENSHOT content is served
                                via a short-lived signed URL gated by this
                                same check, never a public/static link

report.get(id)               — 403 unless the parent run's project is
                                caller-owned

github.connect(pat)          — writes a GithubConnection (D13) scoped to
                                caller.id; validates the PAT's permissions
                                match D13 before storing the reference (D2)
github.disconnect            — revokes/deletes the caller's GithubConnection
github.repositories          — lists repos visible to the caller's own
                                GithubConnection only

approval.approve(id)         — 403 unless caller owns the pending approval's
                                project. Guarded PENDING → APPROVED
                                transition (D9, inline GitHub write): if
                                already APPROVED, returns the existing
                                `githubIssueUrl` instead of writing a
                                second issue; if already REJECTED or
                                EXPIRED, returns a VALIDATION error.
                                Before creating, always searches the
                                target repo for the marker described
                                under §15's Approval entity — narrows
                                (does not eliminate; see the known
                                limitation there) the
                                write-succeeded-but-persist-failed window. If the
                                GitHub write itself fails after both
                                guards, the Approval stays PENDING (not
                                silently lost) and the call returns
                                ISSUE_CREATION_FAILED
approval.reject(id)           — same ownership check; PENDING → REJECTED
```

**Error envelope (Recommendation):** every procedure fails with one shape —
`{ code, message, retryable }`, where `code` is a fixed enum: `NOT_FOUND`,
`FORBIDDEN`, `VALIDATION`, `UPSTREAM_ERROR`, `RATE_LIMITED`,
`ISSUE_CREATION_FAILED`, `INTERNAL`. (Named `UPSTREAM_ERROR` here,
deliberately distinct from §20's `UPSTREAM_UNAVAILABLE` reason code — this
one means "the synchronous tRPC call itself failed," §20's means "the
async run's terminal outcome was an unavailable upstream"; same word would
otherwise silently conflate a request-level failure with a run-level one.
Named emitters: `github.repositories`/`github.connect` return it when the
GitHub API itself is unreachable during that synchronous call; `report.get`
returns it if a downstream read dependency is down.)

**Concurrency (D5, D14):** same-scenario duplicate runs are handled by the
idempotency key above — a new key always starts an independent run.
Total concurrent runs per caller is the separate axis D14 caps at 5;
`testRun.create` beyond that cap returns `RATE_LIMITED` (envelope above).

Do not put autonomous agent reasoning inside tRPC procedures.

Use:

```text
tRPC
 ↓
Application Service
 ↓
Background Worker (D7)
 ↓
Mastra Workflow (D6)
```

---

# 15. Core Data Model

## User

```text
id
email
name
createdAt
```

## Session / Account (D8)

Auth.js's standard adapter tables — not redesigned here, just named so the schema is complete:

```text
Session: id, userId, sessionToken, expiresAt
Account:  id, userId, provider ("github"), providerAccountId, accessToken (D2: secrets-manager reference, not plaintext)
```

`Account.accessToken` here is the *sign-in* OAuth token (identity only); it is unrelated to `GithubConnection` below, which is a separate, higher-privilege PAT used for repository investigation and issue creation (D13). Conflating the two would grant the Repository Investigator whatever scope the user's login token has, which is narrower than — and the wrong mechanism for — D13's `Contents: Read-only` + `Issues: Read and write`.

## GithubConnection (D13)

```text
id
userId          // one connection per user; a project's repository must
                 // be covered by its owner's connection (checked at
                 // project.create, see §14)
patReference     // pointer into the secrets manager (D2), never plaintext
scopes           // Contents: Read-only, Issues: Read and write
createdAt
```

## Project

```text
id
userId
name
applicationUrl
repository
createdAt
```

## TestScenario

```text
id
projectId
name
objective
credentialsReference   // pointer into the secrets manager (D2), never a
                        // plaintext value
createdAt
```

## TestRun

```text
id
scenarioId
idempotencyKey   // UNIQUE(scenarioId, idempotencyKey) — D5. Scenario-
                  // scoped is sufficient: D1 means a scenario has exactly
                  // one owning user, so this needs no separate userId
                  // column to enforce "same key + same caller."
errorReason      // nullable; populated only when status = ERROR, one of
                  // the reason codes in §20's error-mapping table
workflowId       // opaque id of the D7 background worker's job, used to
                  // locate and signal the in-flight execution on cancel

status

PENDING
PLANNING
RUNNING
INVESTIGATING
PASSED
FAILED
CANCELLED        // set by testRun.cancel (§14) — a user action, not a
                  // system failure; distinct from ERROR
ERROR

startedAt
completedAt
```

`Report.result = INCONCLUSIVE` (D4) maps to `TestRun.status = FAILED` — `Report.result` is the one place the three-way PASS/FAIL/INCONCLUSIVE distinction lives; `TestRun.status` only needs to distinguish "the run finished and something needs a human's attention" (FAILED) from "the run finished clean" (PASSED) from "the run didn't finish" (ERROR/CANCELLED).

## TestStep

```text
id
runId

position

action

expected
successCriteria   // §9.2 StepCriterion — what makes this step PASSED
failureCriteria   // §9.2 StepCriterion — what makes this step FAILED

observed

status

PENDING
RUNNING
PASSED
FAILED     // covers both an app-behavior failure (criteria evaluated,
            // didn't match) and an infra failure (timed out / element
            // not found after retries) — the distinguishing detail is
            // in the step's linked Evidence and, for a run-ending
            // infra failure, TestRun.errorReason; not a separate enum
SKIPPED    // not reached because an earlier step failed, OR the run was
            // cancelled (§14 testRun.cancel) while this step was
            // PENDING/RUNNING — `observed` is set to "cancelled by
            // user" in the latter case
```

## Evidence

```text
id
runId
stepId     // nullable — CODE evidence from the Repository Investigator
            // (§9.5) isn't produced by any one TestStep

type

SCREENSHOT
CONSOLE
NETWORK
DOM
CODE
HTTP
TRACE

content    // header VALUES (Authorization/Cookie/Set-Cookie) and body
            // fields matching a credential-like key are redacted before
            // write, per D2/D3/D12 (§9.4) — header names/presence
            // preserved. SCREENSHOT content is a reference (object-
            // storage key), not inline binary — Recommendation, not yet
            // sized/bounded (fold into OQ2's infra decision)
metadata
createdAt
```

## Hypothesis

```text
id
runId

description

confidence   // 0.0-1.0. SUPPORTED requires confidence >= 0.70
              // (Recommendation — not load-tested) AND every check in
              // the linked HypothesisEvidence passing (§9.7)

status

PROPOSED
VALIDATING
SUPPORTED
REJECTED
```

## HypothesisEvidence

Join table — makes §9.6's "supporting evidence / contradicting evidence" a queryable fact instead of free text, and gives §21's Evidence Grounding Rate and §23's "evidence-backed report" something to assert against.

```text
hypothesisId
evidenceId
role   // SUPPORTING, CONTRADICTING
```

## Report

```text
id
runId
hypothesisId   // nullable FK to the winning Hypothesis. Null when
                // result = PASS (no hypotheses are ever generated on a
                // pass, §10) or result = INCONCLUSIVE (D4, none
                // survived validation); non-null only when result =
                // FAIL — this is what lets the Evidence Viewer (§18)
                // trace a conclusion back to the record that produced it

result

PASS
FAIL
INCONCLUSIVE   // D4: no hypothesis survived validation

summary
rootCause
recommendation
confidence
createdAt
```

## Retention (Recommendation)

No entity above has bespoke retention — all rows for a `Project` are deleted when the owning `Project` is deleted (cascade), including `TestScenario.credentialsReference` (which additionally deletes the referenced secret from the secrets manager, D2, not just the pointer row). No separate time-based expiry in MVP; add one if storage cost or the eventual OQ3 evaluation dataset needs runs to outlive their project.

**Concurrent identical `testRun.create` calls (D5):** the `UNIQUE(scenarioId, idempotencyKey)` constraint is enforced at the database, not just checked in application code first — an insert-or-return-existing (`ON CONFLICT DO NOTHING` + re-select) pattern, so two simultaneous requests with the same key can't both create a row before either one's application-level check runs.

## Approval (D9)

The record `approval.approve(id)`/`approval.reject(id)` (§14) operate on — the one gate on the system's only external write.

```text
id
runId
status         // PENDING, APPROVED, REJECTED, EXPIRED
draftTitle     // GitHub issue title/body drafted from the Report,
draftBody      // shown to the human for review before any write happens
githubIssueUrl // set only after APPROVED and the GitHub write succeeds
createdAt
decidedAt
decidedBy      // userId
```

Created only for `result = FAIL` or `result = INCONCLUSIVE` reports (a PASS report has nothing to file an issue about). Ownership join: `Approval.runId → TestRun.scenarioId → TestScenario.projectId → Project.userId` (D1).

**Expiry is on `Approval`, not `TestRun`:** a `PENDING` `Approval` untouched for 24h transitions to `EXPIRED` via a separate periodic sweep from the one that catches `ORCHESTRATOR_LOST` (§20) — different entity, different interval (24h vs. 15min), same "periodic sweep" pattern — this never changes `TestRun.status`, which is already terminal (`FAILED`) the moment the `Report` was produced, well before the `Approval` row exists. `approval.approve`/`reject` (§14) on an `EXPIRED` row return a `VALIDATION` error, same as calling it on an already-`REJECTED` one; re-running the scenario produces a fresh `TestRun` and a fresh `Approval`.

**Duplicate-issue safety on write (§14's `approval.approve` calls into this on every invocation, not only known retries):** the drafted issue body carries a hidden HTML-comment marker (e.g. `<!-- qaforge-approval:{id} -->`). Before creating an issue, `approval.approve` always searches the target repo's issues for that marker first; a match is treated as already-completed — the found issue's URL is persisted and `APPROVED` is set — rather than creating a second issue. This closes the common case: the GitHub write succeeded but the local `PENDING → APPROVED` persist step failed or timed out afterward.

**Known limitation (Recommendation, not eliminated):** this is a search-before-create mitigation, not a transactional guarantee. Two narrow windows can still produce a duplicate issue: the marker is stripped or edited out of the issue body by a human before a retry's search runs, or GitHub's search index hasn't caught up yet (eventual consistency) when the retry searches moments after creation. Both are accepted as low-probability MVP gaps rather than solved — a stronger guarantee (e.g. persisting the created issue number as part of an atomic outbox-style write) is Post-MVP if duplicate issues become a real problem in practice.

---

# 16. UI

The product should look like an engineering operations console rather than a chat application.

## Dashboard

```text
┌───────────────────────────────────────────────┐
│ QAForge                         SYSTEM ONLINE │
├───────────────┬───────────────────────────────┤
│ Dashboard     │ TEST RUNS                     │
│ Projects      │                               │
│ Runs          │ Login Flow        FAILED      │
│ Reports       │ Signup Flow       PASSED      │
│ Agent Traces  │ Checkout Flow     RUNNING     │
│ Settings      │                               │
└───────────────┴───────────────────────────────┘
```

---

# 17. Test Run View

```text
TEST RUN #QF-187

Objective

Verify login → dashboard flow

STATUS

INVESTIGATING

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Open login                   ✓

2. Enter credentials            ✓

3. Submit                       ✓

4. Verify session               ✓

5. Navigate dashboard           ✗


AGENT ACTIVITY

Browser Agent
✓ execution complete

Evidence Agent
✓ 14 artifacts collected

Repository Agent
✓ 7 relevant files

Root Cause Agent
● investigating

Validator
waiting
```

**PASSED:**

```text
TEST RUN #QF-188        STATUS: PASSED

1. Open login                   ✓
2. Enter credentials            ✓
3. Submit                       ✓
4. Verify session               ✓
5. Navigate dashboard           ✓

All steps passed. No investigation triggered.
```

**FAILED** (root cause confirmed — the §3 example):

```text
TEST RUN #QF-187        STATUS: FAILED

1-4. ✓   5. Navigate dashboard  ✗

ROOT CAUSE (confidence 0.89)
Authentication middleware reads stale session state
immediately after login.
Related source: middleware.ts:41-63

[ Review & Create GitHub Issue ]   ← opens the Approval draft (§11)
```

**INCONCLUSIVE** (D4 — no hypothesis survived):

```text
TEST RUN #QF-190        STATUS: FAILED (Report: INCONCLUSIVE)

5. Navigate dashboard           ✗

No root cause confirmed. 3 hypotheses investigated, all
rejected — see Agent Trace (§19) for what was ruled out
and why.

[ Review & Create GitHub Issue ]   ← Approval is created for
                                       INCONCLUSIVE too (§15), not
                                       only FAILED
```

**ERROR** (one per §20 reason code — example shown, same layout for the other seven):

```text
TEST RUN #QF-191        STATUS: ERROR

⚠ APP_UNREACHABLE
The application URL could not be reached. Retryable — check
the URL and try again.
```

---

# 18. Evidence Viewer

Provide synchronized visibility into:

```text
Screenshot

Browser state

Network request

Console

Relevant source code

Agent reasoning summary
```

A developer should be able to understand why QAForge reached its conclusion.

**Rendering (D3):** all captured content shown here — DOM snippets, console output, network bodies and headers, AND the "Relevant source code" panel's file content — is untrusted (§20) and renders as literal escaped text, monospace, never `dangerouslySetInnerHTML` or equivalent. A compromised/XSS'd target page or a maliciously-crafted source comment is expected adversarial input to this viewer, not an edge case; rendering either as HTML would be a stored-XSS hole in QAForge's own authenticated origin.

---

# 19. Agent Trace

Example:

```text
14:42:04

Supervisor
Started test execution

14:42:07

Browser Agent
POST /api/auth/login → 200

14:42:08

Browser Agent
Navigated /dashboard

14:42:08

Browser Agent
Redirected → /login

14:42:09

Evidence Agent
Captured redirect chain

14:42:14

Repository Agent
Identified middleware.ts

14:42:18

Root Cause Agent
Created three hypotheses

14:42:24

Validator
Rejected H2

14:42:27

Validator
Rejected H3

14:42:32

Root Cause Agent
H1 confidence → 0.89
```

This trace is a major product feature.

---

# 20. Safety and Guardrails

QAForge must enforce:

### Authorization (D1)

Single-tenant for MVP: every resource is scoped to the owning
`Project.userId`. Ownership is checked server-side in the Application
Service layer (§12) on every read and mutation — never inferred from tRPC
input alone. See §14 for the per-procedure ownership rule.

### Browser restrictions

Only interact with explicitly configured application domains.

**SSRF (D11):** the Application URL, and every redirect target it produces, is resolved and checked against a deny-list of private/link-local/loopback/cloud-metadata address ranges (`RFC1918`, `127.0.0.0/8`, `169.254.0.0/16`, `::1`, known metadata IPs) immediately before each Playwright navigation. A match ends the run as `ERROR`/`APP_UNREACHABLE` rather than navigating. This check re-runs on every redirect hop, not only the initial URL — a redirect chain or DNS rebinding can resolve to an internal target even when the original hostname is public.

### Repository restrictions

Repository tools are read-only for investigation. The only write path in
the whole system is the human-approved GitHub issue creation in §11 — a
separate, gated action, not an exception to this rule.

### Untrusted content (D3)

Browser-captured content (DOM text, console output, network bodies,
redirect chains) **and repository file content returned by the
Repository Investigator (§9.5)** are both untrusted — the former comes
from arbitrary third-party pages, the latter from arbitrary (possibly
contributor-supplied) repositories; both are exactly the surface a
prompt-injection attempt would use. Every prompt that includes either
kind of captured content MUST wrap and label it as data, not
instructions, and no agent may expand its own tool scope, target new
domains/repos, or escalate permissions based on content found there. This
applies even to a page or file QAForge is deliberately testing for bugs —
a compromised or XSS'd target page, or a maliciously-crafted source
comment, is expected adversarial input, not an edge case. The Evidence
Viewer's rendering rule (§18) — literal escaped text, never raw HTML —
applies identically to the "Relevant source code" panel and to
DOM/console/network panels; there's no carve-out for source code being
"our own" content.

### Secrets (D2, D12)

Test credentials and GitHub tokens are never stored as plaintext, in the
application database, in logs, traces, reports, or LLM-visible history.
They live in an external secrets manager; `TestScenario.credentialsReference`
(§15) and the GitHub token (§11) are pointers only. Redaction (D12) covers
more than headers: `Authorization`/`Cookie`/`Set-Cookie` header *values*
are masked (names/presence preserved, §9.4), request/response *body*
fields matching a credential-like key are masked, and the literal value
resolved from `credentialsReference` is redacted wherever it appears —
header, body, or URL — before it reaches persistence, an LLM prompt, or
Mastra's own tool-call tracing (D6, §22).

### Tool authorization

Every tool declares:

```text
required permission
resource scope
risk level   ∈ { LOW, MEDIUM, HIGH }
```

**Enforcement (Recommendation):** before each tool invocation *within the Mastra workflow* (§10) — this Tool Authorization section governs agent tools only, not the separate, inline `approval.approve` write in §11/D9 — the D7 worker checks the invoking agent's declared permission set against the tool's required permission and resource scope. A mismatch raises `TOOL_SCOPE_VIOLATION` and ends the run as `ERROR` — not a retry, since a scope mismatch means the plan asked for something outside what the agent should be able to do, not a transient failure. Any future `HIGH`-risk tool with a side effect beyond read-only investigation would additionally require a human-approval gate before use, the same principle §11 already applies to the one external write MVP has today — but that write itself runs outside this per-tool-invocation path entirely (D9).

### Execution limits

Enforce, with MVP defaults below (Recommendation — not yet load-tested;
revisit once real run data exists):

```text
max browser steps           40 per run — governs the Browser Agent's own
                              loop (retries count toward this cap); NOT
                              bounded by "max agent loops" below (§9.1)
max retries per step        2
max agent loops             5   (investigation round-trips — bounds only
                              the Repository Investigator's re-read loop,
                              §10's validateCause→investigateRepo edge;
                              the Browser Agent is bounded by "max browser
                              steps" above instead, not this one)
max investigation depth     3   (repo file-traversal hops WITHIN one
                              investigateRepo call — e.g. following an
                              import from file A to B to C; a distinct
                              axis from "max agent loops" above, which
                              counts separate investigateRepo round-trips,
                              not hops inside one of them)
max token budget            150k tokens per run — sum of input+output
                              across every agent call in the run, including
                              evidence text inserted into prompts
max execution duration      10 minutes per run — covers only the TestRun
                              itself, up to and including whichever
                              terminal node it reaches (`produceReport`
                              on the FAIL/INCONCLUSIVE branch, or PASS
                              REPORT directly on the PASS branch, §10).
                              There is no suspension to exclude: D9 means
                              the run is already terminal (FAILED) before
                              any Approval exists, so this limit has
                              nothing to do with how long a human takes to
                              approve — see Approval.status EXPIRED (§15)
                              for that separate clock
max concurrent runs/user    5  (D14) — testRun.create beyond this cap
                              returns RATE_LIMITED (§14) rather than
                              queuing or spawning unbounded
```

Exceeding any limit ends the run as `TestRun.status = ERROR` with a
`LIMIT_EXCEEDED` reason (§ error mapping below), not a silent partial
report.

### Error mapping

| Condition | `TestRun.status` | Reason code | Retryable? |
|---|---|---|---|
| Application URL unreachable, or resolves to a denied address (D11) | `ERROR` | `APP_UNREACHABLE` | Yes |
| Repository not found / inaccessible | `ERROR` | `REPO_ACCESS_DENIED` | No — needs re-auth or corrected URL |
| Browser crash mid-run | `ERROR` | `BROWSER_CRASHED` | Yes |
| Execution limit exceeded (above) | `ERROR` | `LIMIT_EXCEEDED` | No — scenario likely needs redesign |
| Upstream (LLM/GitHub) unavailable | `ERROR` | `UPSTREAM_UNAVAILABLE` | Yes |
| Objective can't be decomposed into a plan (§9.2) | `ERROR` | `OBJECTIVE_NOT_PLANNABLE` | No — rewrite the objective |
| Tool call outside declared scope (above) | `ERROR` | `TOOL_SCOPE_VIOLATION` | No |
| D7 worker process terminated mid-run (deploy, OOM, crash) | `ERROR` | `ORCHESTRATOR_LOST` | Yes |

This table is specifically TestRun-terminal reasons — a stale `Approval` (past its own 24h clock, §15) does not appear here, because it doesn't change `TestRun.status`; see the Approval entity in §15 for that.

Each reason code maps to a user-visible message in the Test Run view
(§17) and is operator-visible in the trace (§19).

**Reconciliation sweep (Recommendation):** a periodic job marks any `TestRun` with no state transition in 15 minutes as `ERROR`/`ORCHESTRATOR_LOST` — the mechanism that catches BLOCKER-class "stuck non-terminal forever" cases like the D7 worker itself dying, as distinct from the application, repo, or browser failing. A second, separate sweep marks any `Approval` still `PENDING` 24h after `createdAt` as `EXPIRED` (§15) — this is an `Approval`-only transition and never touches the already-terminal `TestRun`.

**Worker restart (Recommendation):** on startup, a worker process claims any `RUNNING`/`INVESTIGATING`/`PLANNING` `TestRun` whose `workflowId` has no active owner and resumes it from its last persisted `TestStep` — it does not wait for the 15-minute sweep, which exists to catch the case where *no* worker instance is alive to claim it (all workers down, not just one restarting).

---

# 21. Evaluation Framework

QAForge should be evaluated on more than whether its report sounds good.

## Test Completion Rate

```text
completed runs / initiated runs
```

## Bug Detection Accuracy

```text
correctly detected failures /
known failures
```

## Root Cause Accuracy

```text
correct root cause /
investigated failures
```

## Evidence Grounding Rate

Percentage of claims backed by recorded evidence.

## False Positive Rate

Valid workflows incorrectly marked as broken.

## Agent Efficiency

```text
tool calls per run

tokens per investigation

browser actions per scenario
```

## Confidence Calibration (Recommendation)

Reported confidence scores (e.g. "89%," §3) are LLM-generated and not
assumed to be statistically meaningful until measured. Once an evaluation
dataset exists (OQ3), track calibration against actual root-cause
correctness (e.g. Brier score or a reliability diagram). Until then,
product copy should present confidence as an estimate, not a validated
probability.

**Open (OQ3):** none of the ratios above have a baseline target, a dataset
to measure against, or a run cadence yet — they're defined but not yet
actionable. Constructing that dataset (a set of applications with known,
labeled bugs) is a prerequisite for this section to do its job.

## Prompt-Injection Resistance (Recommendation)

D3's untrusted-content rule (§20) is a MUST with no metric anywhere in
this framework — closing that gap: the same labeled-application dataset
(OQ3) should include at least one application whose pages/repository
content carry a planted injection payload (e.g. a console message or
source comment instructing the agent to expand scope or ignore prior
instructions). **Injection resistance rate** = runs where the payload
had zero effect on tool scope, target domain/repo, or the reported root
cause ÷ total injection-bearing runs. Target 100% before this metric is
considered anything other than a red flag — a single successful
injection is a security incident, not a tunable threshold.

---

# 22. Observability

Every run should expose:

```text
workflow ID

agent executions

tool invocations

latency

token consumption

LLM model

errors

retries

browser actions

evidence generated
```

The agent system itself must be debuggable.

---

# 23. MVP Success Criteria

QAForge V1 is successful when it can:

- connect an application and a GitHub repository the caller owns access to (D1)
- accept a natural-language QA objective
- generate a test plan conforming to the schema in §9.2 — every step has
  an action, expected outcome, success criteria, and failure criteria
- execute the journey through Playwright
- recognize `PASS`, `FAIL`, or `INCONCLUSIVE` (§9.7, D4) — never fabricate
  a root cause when no hypothesis survives validation
- collect runtime evidence with credentials redacted from headers and
  bodies alike (D2/D3/D12)
- inspect relevant repository code without write access (§20), treating
  file content as untrusted input (D3, §9.5)
- generate at least two competing hypotheses
- validate those hypotheses by attempting to falsify each one (§9.7)
- return an evidence-backed root-cause report — every claim traceable via
  `HypothesisEvidence` (§15), not just a non-null FK
- generate a draft GitHub issue from a FAIL/INCONCLUSIVE report, hold it
  as a `PENDING` Approval awaiting human review, and create the issue
  only after explicit APPROVE
  (§11, D9) — REJECT ends the flow with no GitHub write
- persist the full run
- visualize the agent trace (§19) and browse the underlying evidence
  (§18) for any step

---

# 24. Recommended MVP Demo

Use an application containing a deliberately reproducible authentication bug.

Scenario:

```text
Login succeeds

↓

Session created

↓

Navigation occurs

↓

Middleware rejects session

↓

User returns to login
```

QAForge must:

```text
1. Discover the failure.

2. Capture the redirect.

3. Verify that authentication API succeeded.

4. Find middleware/auth implementation.

5. Generate multiple hypotheses.

6. Reject incorrect hypotheses.

7. Identify the likely root cause.

8. Produce a report.

9. Draft a GitHub issue from the report and hold it for human review
   (§11); demo approves it and shows the created issue — exercising the
   one external-write path this system has, not just the investigation.
```

This creates a highly visual five-minute demonstration.

---

# 25. Development Phases

## Phase 1 — Foundation

Build:

```text
Next.js application

Authentication (D8)

Ownership checks (D1) in the Application Service layer

Secrets manager integration (D2)

PostgreSQL

Drizzle, with versioned committed migrations (drizzle-kit generate +
  migrate as an explicit deploy step — never drizzle-kit push against
  production)

CI: lint, typecheck, unit tests, and a migration dry-run against a
  disposable database on every PR; merge auto-deploys to preview/staging,
  promotion to production is a separate explicit step

tRPC

Project & TestScenario management, with credential intake (D10)

Run persistence
```

## Phase 2 — Browser QA

Build:

```text
Background worker process (D7) and the polling transport for live status

SSRF address-range check (D11)

Playwright integration

test planning

browser execution

screenshots

network capture

console capture

PASS / FAIL
```

## Phase 3 — Agentic Investigation

Build:

```text
GitHub connection (D13) — moved ahead of the rest of Phase 5, since the
  repository agent below can't resolve a token without it

workflow orchestration (§10) — the Mastra workflow graph itself; no
  separate "supervisor agent" (§9.1)

repository agent, with code search and file inspection

root-cause agent

validator agent
```

## Phase 4 — Observability

Build:

```text
agent traces

evidence viewer

run timeline

tool-call inspection

cost/token metrics
```

## Phase 5 — GitHub Write Path

Build (repository connection itself moved to Phase 3, above):

```text
Approval entity and state machine (D9)

GitHub issue generation

human approval UI (§17's FAILED and INCONCLUSIVE mockups, §11)
```

---

# 26. Future Roadmap

## V2 — QA Engineer

Add:

```text
Team/org sharing (deferred from D1 — projects, runs and reports
  visible to a team, not just their owner)

PRD → test generation

automatic regression suites

Deeper GitHub integration (auto-labeling, dedup against existing
  issues, linking to fix PRs) — MVP already creates a single issue
  per human-approved run (§11); this is beyond that

scheduled runs

CI integration

visual regression
```

## V3 — Debugging Engineer

Add:

```text
sandboxed code modifications

automated fix generation

test execution

browser re-validation

patch comparison
```

## V4 — Autonomous Software Reliability Agent

```text
detect bug
   ↓
investigate
   ↓
fix
   ↓
run unit tests
   ↓
run integration tests
   ↓
rerun browser scenario
   ↓
validate fix
   ↓
generate PR
   ↓
human approval
```

---

# 27. Final Product Definition

QAForge is:

> **An autonomous software QA and debugging system that executes real application workflows, captures runtime evidence, investigates repository code, validates competing root-cause hypotheses, and produces evidence-backed engineering reports through an observable agent workflow (Mastra, pending D6 confirmation).**

The defining product principle is:

```text
DON'T JUST FIND THE BUG.

PROVE WHY IT HAPPENED.
```