<div align="center"> QAForge </div>

<p align="center">
  <img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-green">
  <img alt="Next.js 16" src="https://img.shields.io/badge/Next.js-16.3-black?logo=next.js">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-blue?logo=typescript">
  <img alt="Mastra" src="https://img.shields.io/badge/agents-Mastra-6f42c1">
</p>

<p align="center"><b>An agent that doesn't just run your tests — it investigates why they failed.</b></p>

---

Give QAForge a URL, a GitHub repo, and a plain-English objective. It plans a test, drives a real browser through it, and when a step fails it doesn't stop at red: it correlates the failure against your source, forms competing root-cause hypotheses, tries to falsify each one, and reports the survivor with the evidence behind it — gated on human approval before anything writes back to your repo.

## Repository layout

```
frontend/    the implementation — Next.js UI + Mastra agent pipeline + CLI (`pnpm qaforge`)
LICENSE      MIT
```

Everything currently lives under `frontend/` — see **[`frontend/README.md`](frontend/README.md)** for the agent pipeline, safety model, and how to run it.

## Core principles

QAForge's constitution holds five non-negotiables, enforced in code, not just prompted for:

1. **Deterministic validation over LLM verdict** — an agent's structured output is evidence, never the final word; every terminal outcome (plannable, relevant, SUPPORTED/REJECTED) is decided by code evaluating that evidence.
2. **Untrusted content renders as data, never as markup** — DOM, console, network, and repository content are all presumed adversarial and rendered as literal text.
3. **Server-side ownership enforcement** — never inferred from client-supplied input alone.
4. **Credentials never touch plaintext storage** — a run tracks *whether* a credential was supplied, never the value.
5. **Repository access is read-only by default** — the only write QAForge ever makes is a human-approved GitHub issue.

## Status

Under active, test-first build. `frontend/README.md`'s Status section reflects what's actually wired versus still in progress.

## License

MIT — see [`LICENSE`](LICENSE).
