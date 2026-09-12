"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { getCallerId } from "@/lib/auth";
import { approveForCaller, rejectForCaller, writeLinearIssueForApproval } from "@/lib/repositories/approval";
import { linearNoticeForFailure } from "@/lib/linear-api";

export interface ApprovalActionState {
  error: string | null;
  // 008-slack-linear-integrations: set only when approveForCaller succeeded AND a Linear
  // connection exists (contracts/action-contract.md's approveApprovalAction table) — a
  // caller with no Linear connection, or one whose GitHub connection is currently suspended
  // (FR-019), gets neither field, identically to today's pre-Linear behavior.
  linearIssueUrl?: string;
  linearNotice?: { message: string; retryable: boolean };
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

  // 008-slack-linear-integrations: only after approveForCaller's own transaction has
  // already committed — never nested inside it (Decision Log #4). NO_LINEAR_CONNECTION and
  // NO_GITHUB_CONNECTION both mean "nothing to show" (contracts/action-contract.md) — the
  // GitHub result above is returned exactly as it is today, either way.
  const linearResult = await writeLinearIssueForApproval(callerId, runId);
  refresh();
  if (linearResult.ok) {
    return { error: null, linearIssueUrl: linearResult.linearIssueUrl };
  }
  if (linearResult.reason === "ISSUE_CREATION_FAILED") {
    return { error: null, linearNotice: linearNoticeForFailure(linearResult.underlyingReason) };
  }
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

/**
 * 008-slack-linear-integrations: reuses writeLinearIssueForApproval as-is — FR-010 [spec]'s
 * fast-path check (a) means a retry against an Approval that already has a linearIssueUrl
 * returns it immediately with no new Linear call, so this is safe to call unconditionally
 * from a "Retry" button without the UI needing to know which case it is.
 */
export async function retryLinearIssueAction(_prevState: ApprovalActionState, formData: FormData): Promise<ApprovalActionState> {
  const callerId = await getCallerId(await headers());
  if (!callerId) redirect("/sign-in");

  const runId = String(formData.get("runId") ?? "");
  if (!runId) return { error: "Missing run id." };

  const result = await writeLinearIssueForApproval(callerId, runId);
  refresh();
  if (result.ok) {
    return { error: null, linearIssueUrl: result.linearIssueUrl };
  }
  if (result.reason === "not_found_or_not_owned") {
    return { error: "Approval not found." };
  }
  if (result.reason === "NOT_APPROVED") {
    return { error: "This decision hasn't been approved yet." };
  }
  if (result.reason === "ISSUE_CREATION_FAILED") {
    return { error: null, linearNotice: linearNoticeForFailure(result.underlyingReason) };
  }
  // NO_LINEAR_CONNECTION / NO_GITHUB_CONNECTION: nothing to show, same as the inline case.
  return { error: null };
}
