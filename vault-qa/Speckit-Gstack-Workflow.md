---
type: workflow
status: active
tags: [workflow]
---

> Copy-paste-ready Speckit + gstack supplemental prompts for building QAForge per [[PRD]] v1.3 — the stage sequence and prompts, not the spec/plan themselves. Run these in order against `speckit.*`/gstack commands; see [[Project-Status]] for whether this has started.

# QAForge — Speckit + gstack Workflow

Feature:
QAForge MVP build — [[PRD]] v1.3, §6/§23 scope, staged per §25 Phases 1–5

Risk: **HIGH**
Architecture complexity (multi-agent orchestration + background worker), security (auth/authz, secrets, SSRF, prompt-injection, redaction), concurrency (worker + polling + idempotency), external dependencies (LLM provider, GitHub, secrets manager — none picked yet), AI/agentic reasoning with hallucination guardrails, and deployment (no target chosen) are all materially present. Migration risk is low — greenfield, no existing data — but schema/versioned-migration discipline (§25 Phase 1) still applies going forward.

Relevant Sources:
- [[PRD]] v1.3 — requirements, Decision Log (D1–D14), Open Questions (OQ1–OQ3)
- [[Home]], [[Project-Status]], [[Tech-Stack]], [[Local-Development]], [[Dev-Log]] — vault state (Tech-Stack/Local-Development current as of this draft; Project-Status/Dev-Log predate HEAD, see below)
- `frontend/package.json`, `frontend/src/mastra/index.ts`, `frontend/AGENTS.md`, `frontend/CLAUDE.md` — actual code-repo state
- Git history: `d7ffa25` "mastra init", `8fc40cb` "init", `148a2ff` "Initial commit"

Repository facts this workflow is grounded in (verified by inspection, not assumed from the vault):
- Git superproject root is `/Users/ajit/dev/QA` (branch `main`), containing `frontend/` and `vault-qa/` as one repo. HEAD `d7ffa25` "mastra init" (adds `frontend/src/mastra/index.ts`, a **blank** `Mastra` instance — `agents: {}, workflows: {}` — and installs `@mastra/core@^1.64.0`); before that, `8fc40cb` "init" (create-next-app scaffold + this vault); `148a2ff` root `LICENSE`.
- `frontend/` is the *only* application code: Next.js 16.3.4 App Router (`src/app/`), React 19.2.8, TypeScript 5, Tailwind 4, Geist/Geist Mono fonts, pnpm 11.15.1, `reactCompiler: true`. **PRD §13's `packages/{api,worker,ai,db,shared}` monorepo layout does not exist** — this is a real conflict between the PRD and the repo, not resolved here (see stage 6/8 below).
- `frontend/AGENTS.md` (imported by `frontend/CLAUDE.md`) is a real, regenerated-by-`next dev` convention: read `node_modules/next/dist/docs/` before touching routing/layouts/config/caching — Next 16 breaks training-data assumptions.
- No test framework, no CI, no database, no auth, no tRPC exist yet (matches [[Local-Development]]/[[Tech-Stack]]).
- **No `.specify/` directory exists anywhere in the repo** — Spec Kit has never been initialized here. This is a precondition, not a stage (see Execution Sequence, step 0).
- No `DESIGN.md` exists.
- [[Home]]'s own stated Current Priority: *"Record real architecture and technology decisions from PRD as ADRs — everything else is blocked on this."* — the vault itself is already flagging that the Decision Log (D1–D14) needs resolving before work proceeds, which is exactly what stages 4/5 below do.
- [[Project-Status]]/[[Dev-Log]] predate HEAD — they don't mention the `d7ffa25` Mastra scaffold or today's PRD edit. Flagged, not fixed here: that's vault-hygiene work (`workflow-repair` skill's job), out of scope for this note.

Meta-rule applied across judgment-heavy stages (clarify, eng-review, checklist, converge), not bolted onto all 19 — this is D4's own product discipline ("don't fabricate under uncertainty," §9.7) turned into a prompting instruction: **if a stage can't confirm something from the spec/plan/repo, it must flag the gap explicitly rather than guess a plausible-sounding answer.**

Included Stages:
1. `/office-hours`
2. `/speckit.constitution`
3. `/speckit.specify`
4. `/speckit.clarify`
5. `/plan-ceo-review`
6. `/speckit.plan`
7. `expert-system-design` (this repo's available skill for the master workflow's conceptual `system-design-expert` stage)
8. `/plan-eng-review`
9. `/plan-design-review`
10. `/speckit.tasks`
11. `/speckit.analyze`
12. `/speckit.checklist`
13. `/speckit.implement`
14. `/review`
15. `/qa-only`
16. `/speckit.converge`
17. `/ship`
18. `/retro`
19. `/learn`

Skipped Optional Stages:
- `/plan-devex-review`: no developer-facing API/SDK/CLI/webhook surface — tRPC routers (§14) are internal-only, called by the Next.js frontend; the one external integration (GitHub) is consumed, not exposed to third-party developers.
- `/benchmark`: §20's execution limits (150k tokens, 10 min, 40 browser steps) are safety caps the PRD itself calls "not yet load-tested," not a throughput/latency SLA. Revisit once OQ2 (hosting) and real run data exist.
- `/land-and-deploy`: OQ2 (deployment target and hosting) is an open question — no target exists yet to deploy through.
- `/canary`: same reason as above — no production environment exists to watch post-rollout.

Note on `/qa-only` vs `/qa`: chosen over plain `/qa` because this feature's QA surface includes security-critical guardrails (SSRF deny-list D11, credential redaction D2/D3/D12, tool-scope enforcement §20) inside a non-deterministic LLM-driven system — QA should report failures against those for engineering triage, not silently auto-patch a security boundary.

---

## 1. /office-hours

### Why this stage
This is a genuinely new feature idea with no prior Spec Kit artifacts — the master workflow's default starting point — and several premature solution choices are already baked into the PRD's Decision Log before product intent has been challenged.

### Supplemental Prompt

Interrogate QAForge (`vault-qa/PRD.md` v1.3) before any specification work starts. Treat the PRD's own §1 Product Vision and §5 Problem Statement as the stated intent, not as settled fact — the Decision Log (D1–D14, all status `Proposed`) and Open Questions (OQ1–OQ3) sitting at the top of the same document are evidence that intent and solution got mixed together during drafting.

Push on:
- **Problem and user**: is "autonomous root-cause QA + human-approved GitHub issue" the actual highest-value slice for the target users in §4, or is the value really in a narrower piece of it (e.g. just the evidence-backed FAIL/INCONCLUSIVE report, without the GitHub write path)?
- **Premature solution choices already in the Decision Log**: D6 (Mastra over LangGraph/custom state machine) and D13 (PAT over GitHub App) both read as engineering preferences stated as if settled, not user-driven requirements — flag these as candidates for `/speckit.clarify` and `/plan-eng-review` to actually test, not accept because they're already written down. Note also: the repo has already installed `@mastra/core` and scaffolded a blank `Mastra` instance (`frontend/src/mastra/index.ts`, commit `d7ffa25`) *before* D6 has product-owner sign-off — surface this as a signal worth naming explicitly, not silently treating as confirmation.
- **Scope pressure**: §6/§23 describe a full MVP (plan → execute → investigate → validate → report → approve → issue) as one unit; §25 stages it as five build phases. Is the five-phase build order also the right *shipping* order (i.e., is a Phase-1/2-only release a coherent, demoable product on its own), or does value only land at Phase 5?
- **Unknowns**: OQ1 (LLM provider/version-pinning), OQ2 (deployment target — blocks D2's secrets-manager choice and Phase 1 per §25), OQ3 (evaluation dataset) — confirm these are genuinely unknown right now, not just undocumented.

### Expected Handoff
A validated (or narrowed) problem statement and an explicit list of premature solution choices to re-open at `/speckit.clarify` and `/plan-eng-review` — not a technical design.

---

## 2. /speckit.constitution

### Why this stage
This is the first feature in a brand-new repository with no existing constitution, and the PRD's main body (not its Decision Log) already states several durable engineering principles that every later feature will need — establishing them once now is cheaper than re-deriving them per feature.

### Supplemental Prompt

Establish `vault-qa/PRD.md` v1.3's durable, project-level principles as the project constitution — **not** its feature-specific decisions. The dividing line: pull only from statements made in the PRD's main body as settled product philosophy, never from the Decision Log (D1–D14), every entry of which is explicitly marked `Proposed — pending confirmation` and therefore cannot ground a constitutional invariant yet.

Candidates to formalize, each with its PRD anchor:
- §2's core principle: *"AI reasoning can investigate and recommend actions, but evidence and deterministic validation must support the final conclusion"* — the basis for §9.2/§9.5/§9.7's "don't fabricate under uncertainty" behavior (empty result over best-guess) and §9.7's code-decides-not-LLM validation pattern.
- §18/§20's untrusted-content rendering rule: all captured content (DOM, console, network, source code) renders as literal escaped text, never `dangerouslySetInnerHTML` or equivalent — stated as a hard rule, not a recommendation.
- §12's authorization pattern: ownership is checked server-side in the Application Service layer on every read/mutation, never inferred from tRPC input alone.
- §20's secrets rule: credentials are never stored as plaintext, in the application database, in logs, traces, reports, or LLM-visible history.
- §20's repository-tools rule: repository access is read-only for investigation; the one external write is a separate, explicitly gated human-approval action.

Explicitly instruct the command to write nothing that depends on an unconfirmed D# (D1–D14) — those stay feature-level decisions for `/speckit.clarify` and `/plan-eng-review` to resolve, even after confirmation, unless a future feature independently elevates one to a durable principle.

### Expected Handoff
A project constitution covering deterministic-validation-over-LLM-verdict, untrusted-content handling, server-side authorization, secrets handling, and read-only-by-default tooling — which `/speckit.specify` and every later stage can cite instead of re-deriving.

---

## 3. /speckit.specify

### Why this stage
Turns validated intent (stage 1) and the now-established constitution (stage 2) into testable requirements — the first artifact that downstream stages can actually build against.

### Supplemental Prompt

Write the specification for QAForge's MVP using `vault-qa/PRD.md` v1.3 as the requirements source of truth, `/office-hours` findings as the validated problem framing, and the new project constitution for cross-cutting invariants. §23 (MVP Success Criteria) is the authoritative scope boundary — treat §6/§25 as staged build order toward it, not a smaller scope, exactly as the PRD itself instructs.

Mint `FR-`/`NFR-`/`SEC-` style requirement identifiers (none exist in the repo yet) and cross-reference each one back to its originating PRD section (e.g. `FR-012 (§9.2)`), so traceability runs both directions through every later stage.

For every requirement that depends on a Decision Log entry (D1–D14) or an Open Question (OQ1–OQ3), write it as the PRD does — as if the current default holds — but tag it with the D#/OQ# so `/speckit.clarify` has a complete, requirement-linked queue to resolve rather than having to re-derive dependencies from the PRD a second time.

Cover explicitly: the three-way PASS/FAIL/INCONCLUSIVE outcome model (§2, D4) and that INCONCLUSIVE is a first-class result, not a failure mode; the seven agent responsibilities and which are LLM calls vs. deterministic functions (§9.1's table); the eight `TestRun.status` values and the `ERROR` reason-code table (§20); the human-approval gate as the system's only external write (§11); and §7's explicit non-goals (no autonomous code modification, no autonomous PR creation, no production deployment, no arbitrary shell execution) as hard boundaries, not aspirational limits.

### Expected Handoff
An `FR-`/`NFR-`/`SEC-`-numbered specification, each requirement cross-referenced to its PRD section and (where applicable) its D#/OQ#, ready for `/speckit.clarify` to resolve the dependencies it's tagged with.

---

## 4. /speckit.clarify

### Why this stage
The PRD ships its own Decision Log of 14 Proposed (unconfirmed) decisions and 3 Open Questions sitting directly above the requirements they gate — this is the highest-value ambiguity-resolution work available for this feature, not a generic pass.

### Supplemental Prompt

Resolve, in priority order, every Decision Log entry (D1–D14) and Open Question (OQ1–OQ3) that `/speckit.specify` tagged onto a requirement. If uncertain whether a decision can be confirmed as written, flag it explicitly for product-owner sign-off rather than silently accepting the PRD's default — several of these read as engineering conveniences dressed as settled architecture.

Priority order, because these gate everything downstream:
1. **Architecture-gating**: D6 (Mastra orchestration), D7 (background-worker + polling execution model), D1 (single-tenant scope), D8 (Auth.js + GitHub OAuth). Note for D6 specifically: `@mastra/core` is already installed and `frontend/src/mastra/index.ts` already scaffolds a blank `Mastra` instance (commit `d7ffa25`) — record this as evidence toward confirming D6, but don't treat prior code as a substitute for the sign-off the PRD itself says is still pending.
2. **Security-critical**: D2 (secrets manager — blocked on OQ2), D3 (trust boundary / untrusted content), D11 (SSRF deny-list), D12 (redaction scope), D10 (credential intake path).
3. **Narrower/local**: D4 (INCONCLUSIVE handling), D5 (idempotency/pagination/error envelope), D9 (approval mechanism — inline vs. suspended workflow), D13 (PAT vs. GitHub App), D14 (concurrency cap).

Additionally resolve the **repository-layout conflict** this workflow found by inspection, not invented: PRD §13 proposes a `qaforge/apps/web` + `packages/{api,worker,ai,db,shared}` monorepo, but the actual repository has only `frontend/` (a single Next.js app) with `@mastra/core` already living inside it. This needs an explicit decision, not a silent default — hand it to `/speckit.plan` as a named open item rather than resolving it here (`/speckit.plan` is where "extend `frontend/` vs. restructure into the PRD's proposed monorepo" actually gets decided; see stage 6).

Also resolve OQ1 (LLM provider/version-pinning — needed before `/speckit.plan` can name a concrete model) and OQ2 (deployment target — blocks D2's provider choice and the Phase 1 build in §25).

### Expected Handoff
Every requirement's D#/OQ# tag resolved to Confirmed/Amended/Rejected (or explicitly still-open with an owner), plus the repository-layout question handed to `/speckit.plan` as a named decision — the behavioral and dependency source of truth `/plan-ceo-review` and `/speckit.plan` both build on.

---

## 5. /plan-ceo-review

### Why this stage
The MVP as specified is genuinely large (12-step product loop, five agent roles, background worker, full human-approval GitHub write path) — engineering design shouldn't start until scope has been challenged at the product level, and `/office-hours` already surfaced a scope-shape question this stage owns.

### Supplemental Prompt

Challenge the clarified specification for QAForge's MVP against §23's success criteria. Specifically answer the scope-shape question `/office-hours` raised rather than deciding it upstream: **should this run as one large feature workflow, or split into per-phase feature specs following §25's Phase 1–5 build order** (e.g. Phase 1+2 as a shippable "execute and report PASS/FAIL" slice before Phase 3's agentic investigation and Phase 5's GitHub write path)? Recommend one and say why.

Also press on:
- Is the full FAIL/INCONCLUSIVE → root-cause → GitHub-issue loop (§9–§11) the highest-value slice, or would a narrower "evidence-backed report, no GitHub write" MVP validate the core value faster, given D13/D9's write-path complexity is entirely in service of one final step?
- Is QAForge building infrastructure (five-agent orchestration, background worker, secrets manager integration) ahead of validated demand, given OQ2 (hosting) and OQ3 (evaluation dataset) are both still unresolved at this stage of the plan?
- Are §23's success criteria the right bar, or does shipping value sooner mean trimming to a subset of them for a first release?

### Expected Handoff
A confirmed (or trimmed/re-staged) scope decision — specifically whether `/speckit.plan` designs one MVP or a first-phase slice — for `/speckit.plan` to build against.

---

## 6. /speckit.plan

### Why this stage
Converts the clarified, scope-reviewed specification into an implementation architecture — the first stage that has to actually reconcile the PRD's proposed architecture (§8, §10, §12–§15) against what the repository currently contains.

### Supplemental Prompt

Design the technical plan for QAForge using the clarified specification and `/plan-ceo-review`'s scope decision as the source of truth, and PRD §8 (agent architecture), §10 (Mastra workflow graph), §12 (product architecture), §14 (tRPC contracts) and §15 (data model) as the proposed design — proposed, not yet built.

Resolve, as a named decision in the plan itself, the repository-layout conflict `/speckit.clarify` surfaced: **extend the existing `frontend/` Next.js app in place, or restructure into PRD §13's `packages/{api,worker,ai,db,shared}` monorepo layout.** Whichever is chosen, the plan must account for what's already real: `@mastra/core` is installed and `frontend/src/mastra/index.ts` is a blank, already-committed `Mastra` scaffold (`agents: {}, workflows: {}`) — the plan should say explicitly whether agents/workflows get registered into that existing instance or a new one, not leave it ambiguous.

Cover explicitly, per §9.1's table (which of the seven agent roles are LLM-reasoning loops vs. single structured-output calls vs. plain deterministic functions — the QA Supervisor is explicitly *not* a second reasoning agent, it's the Mastra workflow graph itself), §10's full state graph including the `investigateRepo` round-trip loop bound by §20's "max agent loops" (distinct from the Browser Agent's "max browser steps" bound), §14's ownership-check join chains, §15's schema (with Drizzle versioned migrations per §25 Phase 1 — `drizzle-kit generate` + an explicit `migrate` deploy step, never `push` against production), and §20's full guardrail set (SSRF re-checked per redirect hop, redaction before any value reaches persistence/prompt/trace, tool-scope enforcement, execution limits).

Name OQ1 (LLM provider) and OQ2 (deployment target/secrets-manager host) as explicit open architectural decisions this plan cannot finalize without — don't silently pick one to make the plan look complete.

Do not introduce a second orchestration framework or a parallel agent-runtime abstraction unless D6's confirmation from `/speckit.clarify` says otherwise.

### Expected Handoff
A technical plan with the repository-layout decision made explicit, every agent role classified per §9.1, the full Mastra state graph, the Drizzle-migration-based schema, and every §20 guardrail specified — ready for architecture review.

---

## 7. expert-system-design

### Why this stage
QAForge's architecture has real distributed-systems surface — a background worker driving a multi-agent LLM workflow against untrusted external content, with concurrency limits, retry semantics, and a human-approval gate — exactly the complexity this review exists to strengthen, and this session has the `expert-system-design` skill available to do it.

### Supplemental Prompt

Review and strengthen the technical plan `/speckit.plan` already produced — do not redesign from the specification directly. Focus on:
- **Concurrency/failure modes**: D7's background-worker execution model, the worker-restart claim logic and the 15-minute `ORCHESTRATOR_LOST` reconciliation sweep (§20) vs. the separate 24-hour `Approval` `EXPIRED` sweep (§15) — verify these two periodic jobs can't race or double-act on the same run.
- **Idempotency**: D5's `UNIQUE(scenarioId, idempotencyKey)` insert-or-return-existing pattern, and the duplicate-issue mitigation in `approval.approve` (§15's hidden HTML-comment marker search-before-create) — this is explicitly a mitigation, not a transactional guarantee (§15's own "Known limitation"); assess whether that gap is acceptable for MVP or needs a stronger guarantee.
- **AI/agent architecture**: the loop-budget-bounded `investigateRepo ↔ validateCause` round-trip (§10, §20's "max agent loops"), the deterministic-checks-not-LLM-verdict validation pattern (§9.7), and D3's untrusted-content-as-data rule applied identically to browser-captured content *and* repository file content (§9.5) — confirm the plan's prompt-construction design actually wraps and labels both, not just one.
- **Security**: D11's SSRF deny-list re-checked on every redirect hop, D12's redaction scope (headers + body fields + literal credential value, before persistence/prompt/trace).

### Expected Handoff
A strengthened plan with concrete architectural changes applied (not commentary) — the input `/plan-eng-review` challenges next.

---

## 8. /plan-eng-review

### Why this stage
Adversarial engineering review of a plan that's now been through one architecture pass — this is where the repository-layout decision and the still-Proposed technical decisions (D6, D7, D9, D13) get actually challenged, not just recorded.

### Supplemental Prompt

Adversarially review the plan `expert-system-design` strengthened. If uncertain whether something in the plan is actually justified by a requirement, flag it rather than assume it's fine.

Specifically challenge:
- The repository-layout decision (extend `frontend/` vs. restructure to PRD §13's monorepo) — is the chosen option minimal for what §23's success criteria actually require, or does it introduce packages (`packages/worker`, `packages/ai`) ahead of a concrete need?
- D6 (Mastra) and D13 (PAT) as re-surfaced by `/office-hours` — the plan should show these were actually tested against alternatives (LangGraph/custom state machine; GitHub App), not accepted because the Decision Log already leaned that way — and note that `@mastra/core` being pre-installed is not, by itself, sufficient justification.
- D9's inline-write approval mechanism — confirm there's genuinely no suspended-workflow state to manage (the plan should show the `TestRun` is already terminal before the `Approval` row exists, per §11) rather than asserting it.
- Data integrity: the `UNIQUE(scenarioId, idempotencyKey)` constraint enforced at the database (not just app-code-checked first), and the `Approval` marker-search-before-create pattern's known duplicate-issue window (§15) — is that gap acceptable to ship, or does it need the atomic-outbox strengthening the PRD itself flags as Post-MVP?
- Testing gaps: no test framework exists in the repo yet (`frontend/CLAUDE.md` confirms) — the plan must specify what gets stood up (unit/integration/E2E strategy) before `/speckit.tasks` can schedule test work, not leave it implicit.
- YAGNI: flag any component the plan adds that isn't required by a specific `FR-`/`NFR-`/`SEC-` requirement.

Produce concrete plan changes, not commentary — e.g. "add a `UNIQUE` constraint enforced at the DB layer for X," not "consider idempotency."

### Expected Handoff
A plan with every named engineering risk either resolved with a concrete change or explicitly deferred with a stated reason — ready for `/plan-design-review` and `/speckit.tasks`.

---

## 9. /plan-design-review

### Why this stage
UI is materially specified in the PRD (§16 Dashboard, §17 Test Run View with four distinct status-state mockups, §18 Evidence Viewer with a hard security-driven rendering rule, §19 Agent Trace) — this isn't a backend-only feature.

### Supplemental Prompt

Review the plan's UI/UX design against PRD §16–§19 as the requirements source of truth. Cover: the user journey across all four `TestRun` states (`PASSED`, `FAILED`, `INCONCLUSIVE`, `ERROR` — §17 shows distinct layouts for each, including the eight `ERROR` reason codes from §20's table); the "Review & Create GitHub Issue" CTA's permission/state boundaries (only appears for FAIL/INCONCLUSIVE, §11); the Evidence Viewer's non-negotiable literal-text rendering constraint (§18/§20 — captured content is untrusted per D3, so no `dangerouslySetInnerHTML` or equivalent, on the source-code panel exactly as much as the DOM/console/network panels); accessibility and responsive behavior (not specified in the PRD — flag as a gap for the reviewer to fill in, don't invent an answer); and consistency with §16's stated product register: *"should look like an engineering operations console rather than a chat application."*

Use the design brief below as **input to evaluate, not as the specification** — it is this workflow's own recommendation, not part of the PRD, and §16–§19 remain the authority wherever they conflict with it. The one grounded fact in it is the Geist/Geist Mono font pairing, which is already the repo's real typography choice ([[Tech-Stack]]).

> **Design brief (Recommendation — evaluate against §16–19, not a substitute for them):**
> A dense, dark, technical console aesthetic — Vercel/Linear/Datadog register, not consumer chat. Dark canvas/panel surfaces, low-contrast hairline dividers (dense grid, not card-shadow separation), off-white primary text, muted-slate secondary/metadata text. Status color-coding: green (PASSED), red (FAILED), amber (INCONCLUSIVE/RUNNING), orange (ERROR), one accent color for links/active-nav/primary-CTA. Geist Mono for IDs, timestamps, status pills, and every code/log panel; Geist Sans for UI chrome. Tight vertical rhythm, small type scale, minimally-rounded (2–4px) components — an ops tool, not a marketing surface. Dashboard: sidebar nav + dense run-list table with status pills. Test Run View: numbered step checklist + live per-agent activity panel + (on FAIL) a bordered root-cause callout with a confidence badge and a monospace `file:line` link. Evidence Viewer: synchronized multi-pane layout where every pane is a read-only monospace log/code viewer — never a rendered iframe or WYSIWYG preview, per the hard constraint above. Agent Trace: a vertical timestamped log, terminal-like.

### Expected Handoff
UI/UX findings and any plan changes needed for the four `TestRun` states and the Evidence Viewer's rendering constraint — input to `/speckit.tasks`' UI work breakdown.

---

## 10. /speckit.tasks

### Why this stage
Decomposes the reviewed plan (engineering- and design-approved) into implementable, dependency-ordered work.

### Supplemental Prompt

Decompose the reviewed plan into dependency-aware tasks, ordered by §25's Phase 1–5 build sequence (Foundation → Browser QA → Agentic Investigation → Observability → GitHub Write Path) unless `/plan-ceo-review` chose to scope this workflow to a subset of those phases — if so, only decompose the phases actually in scope.

Every task must map to at least one `FR-`/`NFR-`/`SEC-` requirement ID from `/speckit.specify`. Push toward implementable granularity — e.g. "Add `SSRF` deny-list check (D11) to the Playwright navigation wrapper, re-run on every redirect hop, covering RFC1918/loopback/link-local/metadata ranges, with a unit test per range," not "Implement browser safety."

Explicitly schedule, as their own tasks (not folded silently into feature tasks): the repository-layout change decided in `/speckit.plan` (extend `frontend/` vs. monorepo restructure); Drizzle schema + first versioned migration (§25 Phase 1); the test framework/CI setup `/plan-eng-review` flagged as currently absent; each §20 guardrail (SSRF, redaction, tool-scope enforcement, execution limits) as independently testable units; and the two periodic sweeps (`ORCHESTRATOR_LOST` at 15 min, `Approval` `EXPIRED` at 24h, §15/§20) as separate scheduled-job tasks, not assumed to fall out of the worker task.

### Expected Handoff
A dependency-ordered, requirement-traced task list, phase-tagged per §25, ready for `/speckit.analyze`'s consistency check.

---

## 11. /speckit.analyze

### Why this stage
With 14 Decision Log entries, a mid-review repository-layout decision, and requirement IDs threading through five prior artifacts, this feature has real traceability risk that a dedicated consistency pass should catch before implementation starts.

### Supplemental Prompt

Cross-check the specification, clarifications, plan, and task list for QAForge against each other. Specifically verify: every `FR-`/`NFR-`/`SEC-` requirement has at least one task behind it; every task traces back to a requirement (no orphan infrastructure work); every D#/OQ# that `/speckit.clarify` marked Confirmed or Amended is reflected consistently in the plan and tasks (a decision resolved in clarify but silently reverted to the PRD's original default in the plan is a bug, not a style choice); the repository-layout decision from `/speckit.plan` appears consistently across every task that touches file paths; the four `TestRun` states and eight `ERROR` reason codes (§17/§20) each have UI and backend task coverage; and the security requirements from §20 (SSRF, redaction, tool-scope, execution limits) and the AI-specific requirements (deterministic validation, untrusted-content wrapping) both appear in the task list, not just the plan.

Surface gaps — don't propose architecture to fix them.

### Expected Handoff
A gap list (missing tasks, dropped decisions, terminology drift) for `/speckit.checklist` and `/speckit.implement` to account for.

---

## 12. /speckit.checklist

### Why this stage
A security-sensitive, AI-agentic feature like this needs a quality gate that a reviewer can actually check against the spec/plan — a generic checklist would miss exactly the items that matter here.

### Supplemental Prompt

Generate a feature-specific quality checklist for QAForge, checkable against the specification and plan (not the task list). If a checklist item can't be verified against a concrete requirement or plan section, flag that as a gap rather than inventing a plausible-sounding item.

Require, at minimum, items covering: authorization semantics explicit for every tRPC mutation (§14's per-procedure ownership checks); SSRF re-verified on every redirect hop, not just initial navigation (D11); redaction covering headers, body fields, and the literal credential value, before persistence/prompt/trace (D12); untrusted-content wrapping applied identically to browser-captured and repository-file content (D3, §9.5); the INCONCLUSIVE outcome path never fabricating a root cause (D4, §9.7); confidence scores presented as estimates, not validated probabilities, until OQ3's evaluation dataset exists (§21); the `Evidence Viewer`'s literal-text-only rendering (§18); rollback/migration safety for the first Drizzle migration (§25 Phase 1); and state-transition legality for `TestRun.status` and `Approval.status` (illegal transitions explicitly rejected, not silently accepted).

### Expected Handoff
A checkable quality gate `/speckit.implement` and `/review` both validate against.

---

## 13. /speckit.implement

### Why this stage
Executes the approved, reviewed, gap-checked task list.

### Supplemental Prompt

Execute `/speckit.tasks`' task list in dependency order against the approved specification and reviewed plan. Follow `frontend/AGENTS.md`/`frontend/CLAUDE.md`'s Next.js 16 convention — read the relevant `node_modules/next/dist/docs/` guide before touching routing, layouts, config, or caching, since this version breaks training-data assumptions (e.g. `layout.tsx` already uses generated `LayoutProps` types). Respect `reactCompiler: true` — don't hand-write `useMemo`/`useCallback` workarounds it already handles. Register new Mastra agents/workflows into the existing `frontend/src/mastra/index.ts` instance (or its replacement, per the repository-layout decision) rather than creating a second entry point.

Maintain accurate task state as work proceeds. Run targeted validation incrementally per task, not only at the end. If implementation reveals a genuine blocker the plan didn't anticipate — e.g. the repository-layout decision proves insufficient once the worker process is actually built — surface it back toward `/plan-eng-review` rather than silently re-architecting in code. Do not implement anything from §7's explicit non-goals (autonomous code modification, autonomous PR creation, production deployment, arbitrary shell execution, mobile/load/performance/penetration testing) even if a task appears to gesture toward one.

### Expected Handoff
Working code matching the approved plan and tasks, with task state current — input to `/review`.

---

## 14. /review

### Why this stage
Adversarial code review against spec, plan, tasks, and this repository's actual conventions — before QA exercises behavior.

### Supplemental Prompt

Review the implementation against the approved specification, reviewed plan, task list, and `/speckit.checklist`'s quality gate. Prioritize by severity, with explicit attention to: authorization checks present on every mutation (not just reads); SSRF checks present on every navigation call site including redirect-follow logic, not only the initial URL; redaction happening inside the browser/network tool itself (§9.4), not only at the evidence-write boundary; the Validator's SUPPORTED/REJECTED decision made by code from structured LLM output, not by the LLM's own holistic judgment (§9.7); the `Repository Investigator`'s relevance-floor rule (empty result, not a weak guess, when nothing clears 0.4 relevance) actually implemented as written, not approximated; and the Evidence Viewer rendering captured content as literal text everywhere the plan/design-review said it must. Flag deviations from Next.js 16 conventions per `frontend/AGENTS.md` as a correctness issue, not a style nit, given the framework's stated training-data mismatch.

### Expected Handoff
Severity-ranked findings for `/qa-only` to validate behaviorally and for follow-up fixes before `/speckit.converge`.

---

## 15. /qa-only

### Why this stage
Validates real user-visible behavior — distinct from `/review`'s reading of the code — without letting an automated pass silently patch the security-critical guardrails this feature depends on.

### Supplemental Prompt

Derive QA scenarios from the specification's acceptance criteria and `/review`'s findings, covering: the full happy path (§3's login/dashboard example) ending in PASS; a FAIL run reaching a SUPPORTED hypothesis and a drafted, human-approvable GitHub issue (§11); an INCONCLUSIVE run where every hypothesis is REJECTED and the report says so without fabricating a cause (D4); each of the eight `ERROR` reason codes (§20's table) surfacing its correct user-facing message (§17); the SSRF deny-list actually blocking a private/loopback/metadata-range target end-to-end, including a redirect-chain case, not just the initial URL; a credential appearing in a request body being redacted from evidence, trace, and report; `testRun.cancel` transitioning non-terminal steps to `SKIPPED` with no report produced; and the concurrency cap (D14) returning `RATE_LIMITED` on a 6th concurrent run.

Report failures — including any of the guardrail scenarios above — as blockers for engineering triage rather than auto-fixing them; a security boundary that fails silently-patched QA is a worse outcome than one reported and fixed deliberately.

### Expected Handoff
Confirmed-passing and confirmed-failing scenarios, especially for the guardrail cases, feeding `/speckit.converge`.

---

## 16. /speckit.converge

### Why this stage
Compares the implementation against every upstream artifact — spec, plan, tasks, checklist, review, and QA findings — for a feature large enough that drift is likely.

### Supplemental Prompt

Compare the implementation against the specification's `FR-`/`NFR-`/`SEC-` requirements, the reviewed plan, the task list, `/speckit.checklist`'s gate, `/review`'s findings, and `/qa-only`'s results. If a requirement's completion status can't be confirmed from evidence, flag it rather than assume it's done. Specifically check §23's MVP success criteria list item by item (or the trimmed subset `/plan-ceo-review` may have chosen) — this is the PRD's own definition of "done," not a paraphrase of it. Surface incomplete D#/OQ# resolutions, weak error handling around the eight `ERROR` reason codes, missing observability against §22's list, and any TODOs left in guardrail code (SSRF, redaction, tool-scope). Don't reopen work `/review`/`/qa-only` already confirmed complete without new evidence.

### Expected Handoff
A convergence report against §23 (or the agreed subset) — the readiness input `/ship` consumes.

---

## 17. /ship

### Why this stage
Final gate before landing — verifies nothing upstream is being waved through.

### Supplemental Prompt

Verify QAForge is ready to land: only the intended changes are included; lint (`pnpm lint`) and typecheck (`npx tsc --noEmit` — no dedicated script exists yet per `frontend/CLAUDE.md`) pass; `/review` and `/qa-only` blockers are resolved, not deferred; the Drizzle migration (§25 Phase 1) is a committed, versioned file generated via `drizzle-kit generate`, never a `push` against a real database; no secrets, `.env` values, or debug artifacts are present in the diff; and `/speckit.converge`'s report shows no open item against §23. A failed check is a blocker — don't note it as "should be fine."

### Expected Handoff
A ship/no-ship verdict with any remaining blockers named explicitly.

---

## 18. /retro

### Why this stage
A workflow this large — 14 pending decisions, a mid-plan repository-layout conflict, security-critical guardrails — is worth reviewing for process learnings, not just shipped and forgotten.

### Supplemental Prompt

Review this workflow's actual process and outcome: which of the 14 Decision Log entries caused the most rework once challenged at `/speckit.clarify`/`/plan-eng-review` (D6 and D13 were flagged at `/office-hours` as premature — did that prediction hold?); whether the repository-layout conflict (PRD §13 vs. actual `frontend/`) should have been caught before this workflow ran, not during `/speckit.clarify`; which `/plan-eng-review` or `expert-system-design` findings were genuinely load-bearing vs. which were noise; and what `/qa-only`'s guardrail scenarios (SSRF, redaction, concurrency cap) revealed that `/review` missed, or vice versa. Every item must trace to something that actually happened in this run, not generic retrospective filler.

### Expected Handoff
Concrete, traceable lessons for `/learn` to route.

---

## 19. /learn

### Why this stage
This is the first feature built in a new repository — patterns confirmed here (repository-layout decision, the constitution's durable principles, how the Decision Log got resolved) are unusually likely to be durable rather than one-off.

### Supplemental Prompt

For each durable lesson from `/retro`, route it to where it actually belongs rather than leaving "update documentation" as the output: a confirmed architectural decision (e.g. the repository-layout call, or D6/D7/D8 once confirmed) belongs in an ADR — this repo has the `ruflo-adr` skill available and [[Home]] already names "record real architecture and technology decisions from the PRD as ADRs" as its current top priority, so route confirmed decisions there specifically; a reusable engineering rule (e.g. "SSRF checks must re-run per redirect hop," "redact before the value reaches any LLM prompt") belongs in `.claude/rules/` or the constitution from stage 2; a reusable workflow-shape lesson (e.g. how well the phase-scoped `/plan-ceo-review` split worked) belongs back in this skill's own guidance if it generalizes beyond this feature. Don't promote a one-off accident.

### Expected Handoff
Durable lessons landed in their correct destination (ADR, constitution/rules, or nowhere if not durable) — closing this workflow.

---

# Execution Sequence

0. `specify init`
   No `.specify/` directory exists in this repository yet — initialize Spec Kit before stage 3 can run.

1. `/office-hours`
   Interrogate the QAForge idea; re-open D6/D13 and the scope-shape question before anything is designed.

2. `/speckit.constitution`
   Establish durable principles from the PRD's body text only (never the Proposed Decision Log).

3. `/speckit.specify`
   Write `FR-`/`NFR-`/`SEC-` requirements from PRD §23, tagged with source D#/OQ# where dependent.

4. `/speckit.clarify`
   Resolve D1–D14/OQ1–OQ3 in priority order; hand the repository-layout conflict to `/speckit.plan`.

5. `/plan-ceo-review`
   Decide single-workflow vs. per-phase scoping; challenge the GitHub-write-path's necessity for a first release.

6. `/speckit.plan`
   Decide `frontend/`-extension vs. PRD §13 monorepo restructure; design the full architecture around it.

7. `expert-system-design`
   Strengthen concurrency, AI-agent, and security architecture in the plan.

8. `/plan-eng-review`
   Adversarially challenge D6/D13/D9, the layout decision, and testing-strategy gaps.

9. `/plan-design-review`
   Review the four `TestRun` states and the Evidence Viewer's literal-rendering constraint against §16–19.

10. `/speckit.tasks`
    Decompose into phase-tagged, requirement-traced tasks, including schema/CI/guardrail/sweep tasks explicitly.

11. `/speckit.analyze`
    Cross-check requirement/task/decision consistency.

12. `/speckit.checklist`
    Generate the security- and AI-specific quality gate.

13. `/speckit.implement`
    Execute tasks in order, following `frontend/AGENTS.md`'s Next.js 16 convention.

14. `/review`
    Adversarial code review against spec/plan/tasks/checklist.

15. `/qa-only`
    Validate behavior including guardrail scenarios; report failures, don't auto-patch them.

16. `/speckit.converge`
    Check completion against §23 item by item.

17. `/ship`
    Final land-readiness gate.

18. `/retro`
    Review what actually happened in this run.

19. `/learn`
    Route durable lessons to ADRs / constitution / rules.
