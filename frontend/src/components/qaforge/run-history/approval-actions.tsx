"use client";

import * as React from "react";
import { useActionState } from "react";
import { Button } from "../primitives";
import { AlertDialog } from "../overlays";
import { approveApprovalAction, rejectApprovalAction, retryLinearIssueAction, type ApprovalActionState } from "@/app/runs/[runId]/approval/actions";

const initialState: ApprovalActionState = { error: null };

// D9/GitHub-Write-Path: renders only for a still-PENDING (and not lazily-expired) approval —
// ApprovalView decides that, matching RunDetailView/SettingsScreen's own split of "the
// server component decides what state we're in" vs "the client component only drives one
// action from here."
export function ApprovalActions({ runId }: { runId: string }) {
  const [approveState, approveAction, approvePending] = useActionState(approveApprovalAction, initialState);
  const [rejectState, rejectAction, rejectPending] = useActionState(rejectApprovalAction, initialState);
  const [confirm, setConfirm] = React.useState(false);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Button
          variant="primary"
          icon="Github"
          style={{ flex: 1 }}
          onClick={() => setConfirm(true)}
          loading={approvePending}
          disabled={approvePending || rejectPending}
        >
          Approve &amp; Create
        </Button>
        <form action={rejectAction}>
          <input type="hidden" name="runId" value={runId} />
          <Button type="submit" variant="outline" icon="X" loading={rejectPending} disabled={approvePending || rejectPending}>
            Reject
          </Button>
        </form>
      </div>
      {approveState.error ? <span className="text-xs text-destructive" role="alert">{approveState.error}</span> : null}
      {rejectState.error ? <span className="text-xs text-destructive" role="alert">{rejectState.error}</span> : null}

      <form action={approveAction} id="approve-form">
        <input type="hidden" name="runId" value={runId} />
      </form>
      <AlertDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Create this issue in GitHub?"
        description="QAForge will create one issue now. This is the only write it performs."
        confirmLabel="Create Issue"
        cancelLabel="Cancel"
        onConfirm={() => {
          setConfirm(false);
          (document.getElementById("approve-form") as HTMLFormElement).requestSubmit();
        }}
      />
    </div>
  );
}

/**
 * 008-slack-linear-integrations: renders only for an already-APPROVED decision whose Linear
 * write failed (approval-view.tsx decides that, same "server component decides the state"
 * split as ApprovalActions above). retryLinearIssueAction is safe to call unconditionally —
 * FR-010 [spec]'s stored-linearIssueUrl fast-path means a retry after a fixed connection
 * just succeeds, and a retry with the same broken connection just fails the same way again.
 */
export function RetryLinearButton({ runId }: { runId: string }) {
  const [state, retryAction, pending] = useActionState(retryLinearIssueAction, initialState);

  return (
    <form action={retryAction} className="flex flex-col gap-1">
      <input type="hidden" name="runId" value={runId} />
      <Button type="submit" variant="outline" size="sm" icon="RefreshCw" loading={pending} disabled={pending}>
        Retry Linear
      </Button>
      {state.error ? <span className="text-xs text-destructive" role="alert">{state.error}</span> : null}
    </form>
  );
}
