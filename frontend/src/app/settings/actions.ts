"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { getCallerId } from "@/lib/auth";
import { getGithubConnectionForCaller, upsertGithubConnectionForCaller, deleteGithubConnectionForCaller } from "@/lib/repositories/github-connection";
import { verifyAndListGithubRepositories } from "@/lib/github-api";
import { upsertSlackConnectionForCaller, deleteSlackConnectionForCaller } from "@/lib/repositories/slack-connection";
import { isValidSlackWebhookUrl } from "@/lib/slack-api";
import { upsertLinearConnectionForCaller, deleteLinearConnectionForCaller } from "@/lib/repositories/linear-connection";
import { verifyAndListLinearTeams } from "@/lib/linear-api";

const GITHUB_PREREQUISITE_ERROR = "Connect GitHub first — Slack and Linear both require it.";
const INVALID_LINEAR_KEY_ERROR = "That key didn't work. Check it's still valid in Linear and try again.";

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

export interface ConnectSlackState {
  error: string | null;
}

/**
 * 008-slack-linear-integrations: no live "verify" call at connect time — a Slack incoming
 * webhook has no endpoint of its own to check against (contracts/action-contract.md); the
 * scheme+hostname check (FR-003/FR-012) is the entire validation, done before any row is
 * touched. FR-017's GitHub-prerequisite gate checked first, before parsing webhookUrl at all.
 */
export async function connectSlackAction(_prevState: ConnectSlackState, formData: FormData): Promise<ConnectSlackState> {
  const callerId = await getCallerId(await headers());
  if (!callerId) redirect("/sign-in");

  const githubConnection = await getGithubConnectionForCaller(callerId);
  if (!githubConnection) {
    return { error: GITHUB_PREREQUISITE_ERROR };
  }

  const webhookUrl = String(formData.get("webhookUrl") ?? "").trim();
  if (!webhookUrl) {
    return { error: "Paste a Slack webhook URL to connect." };
  }

  if (!isValidSlackWebhookUrl(webhookUrl)) {
    return { error: "That doesn't look like a Slack webhook URL (must be https://hooks.slack.com/...)." };
  }

  await upsertSlackConnectionForCaller(callerId, { webhookUrl });
  refresh();
  return { error: null };
}

export async function disconnectSlackAction(): Promise<void> {
  const callerId = await getCallerId(await headers());
  if (!callerId) redirect("/sign-in");

  await deleteSlackConnectionForCaller(callerId);
  refresh();
}

export interface ListLinearTeamsState {
  error: string | null;
  teams: { id: string; name: string }[] | null;
}

/**
 * 008-slack-linear-integrations: read-only, step one of the two-step connect flow
 * (research.md Decision 7) — stores nothing. The row component holds apiKey in client
 * component state only long enough for the user to pick a team and submit
 * connectLinearAction; it is never written anywhere in between.
 */
export async function listLinearTeamsAction(_prevState: ListLinearTeamsState, formData: FormData): Promise<ListLinearTeamsState> {
  const callerId = await getCallerId(await headers());
  if (!callerId) redirect("/sign-in");

  const githubConnection = await getGithubConnectionForCaller(callerId);
  if (!githubConnection) {
    return { error: GITHUB_PREREQUISITE_ERROR, teams: null };
  }

  const apiKey = String(formData.get("apiKey") ?? "").trim();
  if (!apiKey) {
    return { error: "Paste a Linear API key to continue.", teams: null };
  }

  const verified = await verifyAndListLinearTeams(apiKey);
  if (!verified.ok) {
    if (verified.reason === "INVALID_KEY") {
      return { error: INVALID_LINEAR_KEY_ERROR, teams: null };
    }
    return { error: "Couldn't reach Linear. Try again in a moment.", teams: null };
  }

  return { error: null, teams: verified.teams };
}

export interface ConnectLinearState {
  error: string | null;
}

/**
 * 008-slack-linear-integrations: re-verifies the key AND confirms the submitted teamId is
 * genuinely among the teams that key can see (research.md Decision 7) — never trusts
 * whatever team list listLinearTeamsAction handed the client. Re-checks the GitHub
 * prerequisite here too, not only in listLinearTeamsAction, in case GitHub was disconnected
 * between the two steps.
 */
export async function connectLinearAction(_prevState: ConnectLinearState, formData: FormData): Promise<ConnectLinearState> {
  const callerId = await getCallerId(await headers());
  if (!callerId) redirect("/sign-in");

  const githubConnection = await getGithubConnectionForCaller(callerId);
  if (!githubConnection) {
    return { error: GITHUB_PREREQUISITE_ERROR };
  }

  const apiKey = String(formData.get("apiKey") ?? "").trim();
  const teamId = String(formData.get("teamId") ?? "").trim();
  if (!apiKey || !teamId) {
    return { error: "Something went wrong — try connecting again." };
  }

  const verified = await verifyAndListLinearTeams(apiKey);
  if (!verified.ok) {
    if (verified.reason === "INVALID_KEY") {
      return { error: INVALID_LINEAR_KEY_ERROR };
    }
    return { error: "Couldn't reach Linear. Try again in a moment." };
  }

  const team = verified.teams.find((t) => t.id === teamId);
  if (!team) {
    return { error: "That team isn't available with this key — try again." };
  }

  await upsertLinearConnectionForCaller(callerId, { apiKey, teamId: team.id, teamName: team.name });
  refresh();
  return { error: null };
}

export async function disconnectLinearAction(): Promise<void> {
  const callerId = await getCallerId(await headers());
  if (!callerId) redirect("/sign-in");

  await deleteLinearConnectionForCaller(callerId);
  refresh();
}
