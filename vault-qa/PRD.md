---
type: prd
status: active
tags: [prd]
---

> Product requirements for QAForge. See [[Project-Status]] for current implementation state against this plan.

# QAForge — Product Requirements Document

**Version:** 1.1  
**Status:** MVP / Build-Ready — pending confirmation of Decision Log D1–D6  
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
| D6 | **Orchestration:** Mastra over a custom state machine or LangGraph — chosen for TS-native fit with the tRPC/Next.js stack and built-in tracing/evals matching §21/§22. Not benchmarked against alternatives; revisit if Mastra can't express the falsification loop in §9.7. | Proposed |

### Open Questions

| ID | Question | Why it matters |
|----|----------|-----------------|
| OQ1 | LLM provider(s) and version-pinning policy | Report reproducibility — the same input shouldn't silently produce a different root cause after a model swap. |
| OQ2 | Deployment target and environment/secrets hosting | Blocks D2's provider choice and §25 Phase 1; also open in [[Project-Status]]. |
| OQ3 | Evaluation dataset construction, baseline targets, and measurement cadence for §21 | §21's ratios are currently decorative — no dataset means no way to know if a run is behaving well or badly. |
| OQ4 | Minimum GitHub permission set, precisely | §11 proposes a GitHub App / fine-grained PAT with `Contents: Read-only` + `Issues: Read and write`; unconfirmed against the actual product's issue-creation flow. |
| OQ5 | Concurrency policy for duplicate/simultaneous runs of the same `TestScenario` | Affects cost and §14's idempotency design; §14's default (allow concurrent runs) is a Recommendation, not a decision. |

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
HUMAN APPROVAL
      ↓
ACT
```

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

QAForge should use specialized agents coordinated through Mastra.

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

The supervisor owns the workflow.

Responsibilities:

- understand user objective
- delegate tasks
- maintain test state
- determine whether additional investigation is required
- terminate runaway investigations
- aggregate final results

The supervisor should not directly perform every task.

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
    "Navigate to login",
    "Enter credentials",
    "Submit login",
    "Verify authentication response",
    "Verify dashboard navigation",
    "Verify protected dashboard content"
  ]
}
```

Each step should include:

- action
- expected outcome
- success criteria
- failure criteria

---

# 9.3 Browser Execution Agent

Responsible for interacting with the application.

Capabilities:

- navigate
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

**Redaction (D2/D3):** before any network evidence is persisted or shown to an LLM, `Authorization`, `Cookie`, and `Set-Cookie` header *values* are masked. Header *names and presence* are preserved — so "session cookie → created" (§3) remains an observable fact even though the cookie's value never enters storage, a trace, or a prompt.

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
  relevance: number;
  explanation: string;
};
```

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

**When nothing survives (D4):** if every hypothesis is rejected, or none reaches sufficient confidence, the Validator does not fall back to the strongest rejected candidate. The Report records `result = INCONCLUSIVE`: evidence was collected, no root cause was confirmed, and the report lists what was ruled out and why. Fabricating a plausible-sounding cause here would break the product's own principle in §27 ("prove why it happened").

---

# 10. Mastra Workflow

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
 │       investigateRepo
 │            │
 │            ▼
 │      createHypotheses
 │            │
 │            ▼
 │       validateCause
 │            │
 │            ▼
 │       produceReport
 │
 ▼
PASS REPORT
```

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
Generate GitHub issue
        ↓
   suspend workflow
        ↓
 Human reviews issue
        ↓
 APPROVE / REJECT
        ↓
 resume workflow
```

QAForge should never silently create external resources.

**GitHub token scope (Recommended implementation — not a product requirement, OQ4):** classic OAuth `repo` scope is NOT read-only — it grants full read/write access to code and metadata — so it's the wrong mechanism here. Use a GitHub App or a fine-grained personal access token instead, requesting `Contents: Read-only` (for the Repository Investigator) + `Issues: Read and write` (for this approval flow only); no broader permission is requested. Read-only-ness is enforced at two layers: the grant itself (`Contents: Read-only`) and the tool-authorization check in §20 — belt and suspenders, not either/or. The token is stored via the secrets mechanism in D2, never in the application database.

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
│          Application Services          │
│                                        │
│ Auth                                   │
│ Project Management                     │
│ Test Run Management                    │
│ GitHub Integration                     │
│ Authorization                          │
└───────────────────┬────────────────────┘
                    │
┌───────────────────▼────────────────────┐
│                 Mastra                 │
│                                        │
│ Agents                                 │
│ Workflows                              │
│ Memory                                 │
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

The **Auth** box in Application Services is where D1's ownership checks run — every read/mutation resolves the requesting user, loads the resource, and confirms `resource.userId === user.id` before the Mastra workflow ever starts. tRPC input validation (§14) checks shape, not ownership.

Repository tools stay read-only (§20) for investigation; the only write path is the human-approved GitHub issue creation in §11, which is a distinct, gated action — not a relaxation of the read-only rule.

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
      test-run.ts
      report.ts
      github.ts

  ai/
    mastra/

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

Example routers, with ownership and contract notes (D1, D5 — Proposed):

```text
project.create              — creates a Project owned by the caller
project.list(limit, cursor) — returns only the caller's projects, paginated
project.get(id)             — 403 unless project.userId === caller.id

testRun.create(scenarioId, idempotencyKey)
                             — requires idempotencyKey; same key + same
                               caller replays the existing TestRun instead
                               of starting a new investigation. 403 unless
                               the scenario's project is caller-owned.
testRun.get(id)              — 403 unless the run's project is caller-owned
testRun.list(projectId, limit, cursor)
                             — paginated; 403 unless project is caller-owned
testRun.cancel(id)           — 403 unless the run's project is caller-owned

report.get(id)               — 403 unless the parent run's project is
                                caller-owned

github.connect               — installs the GitHub App (or accepts a
                                fine-grained PAT) with the permissions
                                in §11
github.repositories          — lists repos visible to the connected token

approval.approve(id)         — 403 unless caller owns the pending approval's
                                project; triggers the GitHub write in §11
approval.reject(id)          — same ownership check
```

**Error envelope (Recommendation):** every procedure fails with one shape —
`{ code, message, retryable }`, where `code` is a fixed enum (`NOT_FOUND`,
`FORBIDDEN`, `VALIDATION`, `UPSTREAM_UNAVAILABLE`, `INTERNAL`) rather than
an ad hoc shape invented per procedure.

**Concurrency (Recommendation, OQ5):** MVP allows concurrent `TestRun`s
against the same `TestScenario` — each `testRun.create` call (with a new
idempotency key) starts an independent run. Serializing runs per scenario
is Post-MVP if cost or resource contention makes it necessary.

Do not put autonomous agent reasoning inside tRPC procedures.

Use:

```text
tRPC
 ↓
Application Service
 ↓
Mastra Workflow
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

status

PENDING
PLANNING
RUNNING
INVESTIGATING
PASSED
FAILED
ERROR

startedAt
completedAt
```

## TestStep

```text
id
runId

position

action

expected

observed

status

PENDING
RUNNING
PASSED
FAILED
SKIPPED   // not reached because an earlier step in the run failed
```

## Evidence

```text
id
runId
stepId

type

SCREENSHOT
CONSOLE
NETWORK
DOM
CODE
HTTP
TRACE

content   // Authorization/Cookie/Set-Cookie VALUES redacted before write,
          // per D2/D3 (§9.4) — names/presence preserved
metadata
createdAt
```

## Hypothesis

```text
id
runId

description

confidence

status

PROPOSED
VALIDATING
SUPPORTED
REJECTED
```

## Report

```text
id
runId
hypothesisId   // nullable FK to the winning Hypothesis; null iff
                // result = INCONCLUSIVE (D4) — this is what lets the
                // Evidence Viewer (§18) trace a conclusion back to the
                // record that produced it

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
│ Runs          │ Login Flow        FAIL        │
│ Reports       │ Signup Flow       PASS        │
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

### Repository restrictions

Repository tools are read-only for investigation. The only write path in
the whole system is the human-approved GitHub issue creation in §11 — a
separate, gated action, not an exception to this rule.

### Untrusted content (D3)

Browser-captured content (DOM text, console output, network bodies,
redirect chains) is untrusted — it comes from arbitrary third-party pages,
which is exactly the surface a prompt-injection attempt would use. Every
prompt that includes captured content MUST wrap and label it as data, not
instructions, and no agent may expand its own tool scope, target new
domains, or escalate permissions based on content found there. This
applies even to a page QAForge is deliberately testing for bugs — a
compromised or XSS'd target page is an expected adversarial input, not an
edge case.

### Secrets (D2)

Test credentials and GitHub tokens are never stored as plaintext, in the
application database, in logs, traces, reports, or LLM-visible history.
They live in an external secrets manager; `TestScenario.credentialsReference`
(§15) and the GitHub token (§11) are pointers only. Captured network
evidence has `Authorization`/`Cookie`/`Set-Cookie` header values masked
before persistence — names and presence are preserved (§9.4).

### Tool authorization

Every tool declares:

```text
required permission
resource scope
risk level
```

### Execution limits

Enforce, with MVP defaults below (Recommendation — not yet load-tested;
revisit once real run data exists):

```text
max browser steps           40 per run
max retries per step        2
max agent loops             5   (investigation round-trips)
max investigation depth     3   (repo file-traversal hops)
max token budget            150k tokens per run
max execution duration      10 minutes per run
```

Exceeding any limit ends the run as `TestRun.status = ERROR` with a
`LIMIT_EXCEEDED` reason (§ error mapping below), not a silent partial
report.

### Error mapping

| Condition | `TestRun.status` | Reason code | Retryable? |
|---|---|---|---|
| Application URL unreachable | `ERROR` | `APP_UNREACHABLE` | Yes |
| Repository not found / inaccessible | `ERROR` | `REPO_ACCESS_DENIED` | No — needs re-auth or corrected URL |
| Browser crash mid-run | `ERROR` | `BROWSER_CRASHED` | Yes |
| Execution limit exceeded (above) | `ERROR` | `LIMIT_EXCEEDED` | No — scenario likely needs redesign |
| Upstream (LLM/GitHub) unavailable | `ERROR` | `UPSTREAM_UNAVAILABLE` | Yes |

Each reason code maps to a user-visible message in the Test Run view
(§17) and is operator-visible in the trace (§19).

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
- collect runtime evidence with credentials/cookie values redacted (D2/D3)
- inspect relevant repository code without write access (§20)
- generate at least two competing hypotheses
- validate those hypotheses by attempting to falsify each one (§9.7)
- return an evidence-backed root-cause report linked to its winning
  hypothesis (`Report.hypothesisId`, §15)
- persist the full run
- visualize the agent trace

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
```

This creates a highly visual five-minute demonstration.

---

# 25. Development Phases

## Phase 1 — Foundation

Build:

```text
Next.js application

Authentication

Ownership checks (D1) in the Application Service layer

Secrets manager integration (D2)

PostgreSQL

Drizzle

tRPC

Project management

Run persistence
```

## Phase 2 — Browser QA

Build:

```text
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
Mastra supervisor

repository agent

root-cause agent

validator agent

workflow orchestration
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

## Phase 5 — GitHub Integration

Build:

```text
repository connection

code search

file inspection

GitHub issue generation

human approval
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

> **An autonomous software QA and debugging system that executes real application workflows, captures runtime evidence, investigates repository code, validates competing root-cause hypotheses, and produces evidence-backed engineering reports through an observable Mastra agent workflow.**

The defining product principle is:

```text
DON'T JUST FIND THE BUG.

PROVE WHY IT HAPPENED.
```