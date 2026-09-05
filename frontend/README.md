# QAForge

<p align="center">
  <img alt="Next.js 16" src="https://img.shields.io/badge/Next.js-16.3-black?logo=next.js">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-blue?logo=typescript">
  <img alt="Mastra" src="https://img.shields.io/badge/agents-Mastra-6f42c1">
  <img alt="Playwright" src="https://img.shields.io/badge/browser-Playwright-2EAD33?logo=playwright">
  <img alt="Vitest" src="https://img.shields.io/badge/tests-Vitest-729B1B?logo=vitest">
  <img alt="pnpm" src="https://img.shields.io/badge/pnpm-11-F69220?logo=pnpm">
</p>

<p align="center"><b>An agent that doesn't just run your tests — it investigates why they failed.</b></p>

---

## What is QAForge?

Point QAForge at a URL, a GitHub repo, and a plain-English objective — *"Verify login → dashboard flow"* — and it plans a test, drives a real browser through it, and if a step fails, doesn't just report red. It correlates the failure against your source, forms multiple competing root-cause hypotheses, tries to falsify each one, and reports the survivor with the evidence and file/line behind it. A confirmed root cause becomes a drafted GitHub issue, gated on human approval before anything is written back to your repo.

```
OBJECTIVE → PLAN → EXECUTE → OBSERVE
    │
    └── on failure ──▶ COLLECT EVIDENCE → INVESTIGATE CODE → HYPOTHESIZE → VALIDATE ──┐
                              ▲                                                        │
                              └──────────────── repeat until SUPPORTED or budget out ──┘
                                                          │
                                                          ▼
                                          REPORT ──▶ [FAIL/INCONCLUSIVE] ──▶ HUMAN APPROVAL ──▶ ACT
```

PASS is terminal — a clean checklist, no investigation triggered. FAIL *and* INCONCLUSIVE both route to a human before anything leaves the sandbox; INCONCLUSIVE means every hypothesis was rejected, not that the run gets to skip review.

## The agent pipeline

Five roles hand off in a strict line — no free-for-all multi-agent chat, no "supervisor" agent reasoning about routing. The workflow graph *is* the supervisor.

| Agent | Model | Job |
|---|---|---|
| **Test Planner** | `claude-sonnet-5` | Objective → ordered steps, each with a deterministic success/failure criterion (URL match, ARIA role presence, HTTP status, console pattern). Returns `plannable: false` with a reason instead of guessing when the objective can't be reduced to one. |
| **Browser Execution** | `claude-sonnet-5` | Runs one step at a time against Playwright's `click`/`fill`/`submit`/`wait` tools, resolving every target from the page's accessibility snapshot — never a guessed selector. |
| **Root Cause** | `claude-opus-5` | On failure, proposes **at least two** competing hypotheses, each with supporting *and* contradicting evidence and an honest confidence — never inflated to make one explanation look certain. |
| **Validator** | `claude-opus-5` | Tries to falsify each hypothesis: a structured predicate the code evaluates directly wherever the assertion reduces to one, a semantic judgment only when it can't. Confidence must clear **0.7** to be SUPPORTED. |

Planner and Browser Execution are pinned to the faster tier — fast, low-latency tool selection. Root Cause and Validator get the slower tier reserved for the deep, competing-hypothesis reasoning that actually needs it (see `src/mastra/llm.ts`).

Every structured agent call is defensively re-validated against its Zod schema (`generateValidated`) and retried once with the specific validation failure appended before failing closed as `LLM_PROVIDER_ERROR` — a resolved promise is not by itself proof the object is valid.

## Safety by construction

- **SSRF-hardened navigation** — every target hostname is resolved and rejected unless every address classifies as `unicast` (via `ipaddr.js`), catching loopback, link-local, cloud-metadata, and private ranges in one rule instead of a hand-maintained CIDR list. Enforced twice: once inline (`navigate.tool.ts`) and once at a proxy layer (`ssrf-proxy.ts`).
- **Credentials never touch a Run object** — `Run.hasCredential` is a boolean; the actual secret flows straight from env to the login step and is redacted from every piece of evidence (headers, bodies, URLs) before that evidence exists, not after.
- **Read-only everywhere but one write** — the repository investigator only clones and greps. The *only* write QAForge ever makes is the GitHub issue it creates after a human clicks **Approve** on a drafted issue body.

## Project layout

```
src/
├── cli/run.ts                          # `pnpm qaforge` entrypoint
├── app/                                 # Next.js UI (Dashboard / Test Run View / Evidence Viewer / Agent Trace)
└── mastra/
    ├── agents/                          # test-planner, browser-execution, root-cause, validator
    ├── workflows/
    │   ├── qa-investigation.workflow.ts  # top-level dountil loop
    │   └── investigation-round.step.ts   # investigate → hypothesize → validate, per round
    ├── tools/
    │   ├── browser/                     # navigate (SSRF-checked), actions, evidence capture
    │   └── repository/                  # clone + grep, relevance-floored candidate files
    ├── schemas/                         # Zod contracts: test plan, hypothesis, validation, step criteria
    ├── llm.ts                           # per-role model pinning + generateValidated
    └── types.ts                        # Run / Step / Evidence domain types
tests/
├── unit/                                # pure logic, dependency-injected fakes
└── integration/                         # workflow.test.ts against a real fixture HTTP server
```

`WORKFLOW.md` is the source of truth for screen sequencing and the exact demo script; this README covers the engine underneath it.

## Prompt design

Every agent's system prompt follows the same discipline, not just prose that "sounds right":

- **Instructions constrain the failure mode, not just describe the task** — Root Cause is told explicitly to never propose only one hypothesis and never inflate confidence; Validator is told to never assert a structured predicate itself, only propose it for code to decide. Each line closes a specific way the agent could otherwise cut corners.
- **Structured output is the contract, prose is the scratch space** — every agent returns through a Zod schema (`schemas/`), validated and repaired once before the caller ever sees it (`generateValidated`), so a prompt only has to get the *reasoning* right; the shape is enforced in code.
- **Explicit short-circuits over confident guessing** — the planner's `plannable: false`, the repository investigator's relevance floor (0.4), the validator's confidence bar (0.7) — each is a place the prompt is told to say "no result" rather than manufacture one.

## Getting started

```bash
pnpm install
```

Required environment variable:

| Variable | Required | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | yes | Powers every agent call. |
| `GITHUB_TOKEN` | no | Consumed via `GIT_ASKPASS` by the repository investigator for private repos. |
| `QAFORGE_CREDENTIAL` | no | JSON string, consumed once by the login step; never logged, never stored on the `Run` object. |

### Run an investigation

```bash
pnpm qaforge --url https://staging.example.com --repo owner/repo --objective "Verify login → dashboard flow" [--format json] [--max-steps 20]
```

### Run the UI

```bash
pnpm dev      # http://localhost:3000
```

## Development

```bash
npx tsc --noEmit     # typecheck
pnpm lint            # eslint
pnpm test            # vitest run
pnpm test:watch      # vitest watch mode
pnpm test:coverage   # vitest + coverage
pnpm build           # production build
```

## Status

QAForge is built test-first and incrementally — some files are intentionally partial (marked `PARTIAL FILE` in-source) until their wiring task lands, and the CLI/workflow graph are still being connected end to end. The pipeline, schemas, and safety layers described above are the target architecture, verified as they land by the tests in `tests/`.
