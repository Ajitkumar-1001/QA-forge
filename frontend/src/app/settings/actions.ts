"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { getCallerId } from "@/lib/auth";
import { upsertGithubConnectionForCaller, deleteGithubConnectionForCaller } from "@/lib/repositories/github-connection";
import { verifyAndListGithubRepositories } from "@/lib/github-api";

// 007-github-connection: what a connection is requested to be scoped to (PRD D13), not
// something introspected from GitHub's API — research.md Decision 1 confirmed against
// GitHub's own docs that a fine-grained PAT's granted permissions can't be checked ahead of
// use, so this is honest, fixed, and documented, not a fabricated introspection result.
const REQUESTED_SCOPES = "contents:read,issues:write";

export interface ConnectGithubState {
  error: string | null;
}

/**
 * 007-github-connection: verifies the token against GitHub for real (research.md Decision 1)
 * before ever writing anything — a token that fails is never stored. The plaintext PAT lives
 * only in this function's own local scope, for the duration of these two calls, mirroring
 * every prior credential-handling action's (005, 007-cli-credential-parity) minimal-lifetime
 * discipline.
 */
export async function connectGithubAction(_prevState: ConnectGithubState, formData: FormData): Promise<ConnectGithubState> {
  const callerId = await getCallerId(await headers());
  if (!callerId) redirect("/sign-in");

  const pat = String(formData.get("pat") ?? "").trim();
  if (!pat) {
    return { error: "Paste a personal access token to connect." };
  }

  const verified = await verifyAndListGithubRepositories(pat);
  if (!verified.ok) {
    if (verified.reason === "INVALID_TOKEN") {
      return { error: "That token didn't work. Check it's still valid on GitHub and try again." };
    }
    return { error: "Couldn't reach GitHub. Try again in a moment." };
  }

  await upsertGithubConnectionForCaller(callerId, { pat, scopes: REQUESTED_SCOPES });
  // Neither mutation goes through Next's data cache (no fetch()/unstable_cache here) — an
  // action that touches only the DB + an external API carries only its return value by
  // default and the current route is NOT re-rendered (verified against Next's own bundled
  // docs, node_modules/next/dist/docs/.../server-actions.md). refresh() is the documented
  // way to refetch settings/page.tsx's RSC payload in the same round-trip so the connected
  // state actually shows up, instead of only updating useActionState's own local state.
  refresh();
  return { error: null };
}

export async function disconnectGithubAction(): Promise<void> {
  const callerId = await getCallerId(await headers());
  if (!callerId) redirect("/sign-in");

  await deleteGithubConnectionForCaller(callerId);
  refresh();
}
