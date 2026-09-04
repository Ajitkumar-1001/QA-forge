---
type: runbook
status: active
tags: [runbook]
---

> Commands that exist in the repo. Pulled from `frontend/package.json` scripts and `frontend/README.md`. See [[Tech-Stack]] for the stack these run against.

## Setup
```bash
cd frontend
pnpm install
```

## Run the dev server
```bash
pnpm dev
```
Opens at http://localhost:3000. Edit `frontend/src/app/page.tsx` — it hot-reloads.

## Lint
```bash
pnpm lint
```

## Build / run production
```bash
pnpm build
pnpm start
```

## Not available
No test command, no CI, no deployment script, no database migrations — none exist in the repo yet.
