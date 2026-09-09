"use client";

import * as React from "react";
import { useActionState } from "react";
import { Button } from "../primitives";
import { AlertDialog } from "../overlays";
import { approveApprovalAction, rejectApprovalAction, type ApprovalActionState } from "@/app/runs/[runId]/approval/actions";

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
