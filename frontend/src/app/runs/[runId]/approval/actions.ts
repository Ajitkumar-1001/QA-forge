"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { getCallerId } from "@/lib/auth";
import { approveForCaller, rejectForCaller } from "@/lib/repositories/approval";

export interface ApprovalActionState {
  error: string | null;
}

function messageForReason(reason: "not_found_or_not_owned" | "INVALID_TRANSITION" | "NO_GITHUB_CONNECTION" | "ISSUE_CREATION_FAILED"): string {
  switch (reason) {
    case "not_found_or_not_owned":
      return "Approval not found.";
    case "INVALID_TRANSITION":
      return "This approval was already decided (or has expired).";
    case "NO_GITHUB_CONNECTION":
      return "Connect your GitHub account in Settings before approving.";
    case "ISSUE_CREATION_FAILED":
      return "Couldn't create the GitHub issue. Try again in a moment.";
  }
}

/**
 * D9/GitHub-Write-Path: the tRPC-era PRD names this `approval.approve(id)`; this codebase
 * has no tRPC router (confirmed unneeded after every prior feature), so it's a Server
 * Action keyed by runId instead of a separately-threaded approvalId — Approval is 1:1 with
 * TestRun (unique run_id), and the page itself is already keyed by runId, so there is no
 * separate id to plumb through the form. Same refresh()-after-mutation requirement as
 * settings/actions.ts (Next 16: an action touching only the DB/an external API doesn't
 * re-render the route on its own — verified against this repo's own bundled docs there).
 */
export async function approveApprovalAction(_prevState: ApprovalActionState, formData: FormData): Promise<ApprovalActionState> {
  const callerId = await getCallerId(await headers());
  if (!callerId) redirect("/sign-in");

  const runId = String(formData.get("runId") ?? "");
  if (!runId) return { error: "Missing run id." };

  const result = await approveForCaller(callerId, runId);
  if (!result.ok) {
    return { error: messageForReason(result.reason) };
  }
  refresh();
  return { error: null };
}

export async function rejectApprovalAction(_prevState: ApprovalActionState, formData: FormData): Promise<ApprovalActionState> {
  const callerId = await getCallerId(await headers());
  if (!callerId) redirect("/sign-in");

  const runId = String(formData.get("runId") ?? "");
  if (!runId) return { error: "Missing run id." };

  const result = await rejectForCaller(callerId, runId);
  if (!result.ok) {
    return { error: messageForReason(result.reason) };
  }
  refresh();
  return { error: null };
}
