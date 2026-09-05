# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Before writing any code

This is Next.js 16.3.4 with breaking changes from what your training data knows. Per `AGENTS.md`, read the relevant guide under `node_modules/next/dist/docs/` before touching routing, layouts, config, or caching — e.g. `layout.tsx` already uses the generated `LayoutProps<"/">` type instead of a hand-written props interface.

## Commands

```bash
npx tsc --noEmit  # typecheck (no dedicated package.json script exists)
```

`dev`/`build`/`start`/`lint` are the standard `pnpm <script>` invocations listed in `package.json`.

No test framework is configured — there are no test files or test script.

Package manager is pnpm (`packageManager: pnpm@11.15.1`); don't use npm/yarn lockfiles.

## Architecture

`next.config.ts` enables `reactCompiler: true` (paired with the `babel-plugin-react-compiler` devDependency), so avoid manual `useMemo`/`useCallback` workarounds the compiler already handles.

`src/mastra/index.ts` holds a blank `Mastra` instance (empty `agents`/`workflows`) — not yet wired into `src/app`.
