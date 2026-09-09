import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { getCallerId } from "@/lib/auth";
import { getRunForCaller } from "@/lib/repositories/test-run";
import { getApprovalForCaller } from "@/lib/repositories/approval";
import { ApprovalView } from "@/components/qaforge/run-history/approval-view";

// D9/GitHub-Write-Path: no Approval row exists for a run that never produced a
// FAIL/INCONCLUSIVE report (createApprovalDraftForCaller's own PASS no-op, or a run that
// hasn't reached a terminal report at all) — notFound() here, same "doesn't exist and
// exists-but-not-owned render identically" doctrine getRunForCaller's own callers already
// follow (004's research.md #6), not a distinguishable message either way.
export default async function Page(props: PageProps<"/runs/[runId]/approval">) {
  const { runId } = await props.params;

  const callerId = await getCallerId(await headers());
  if (!callerId) redirect("/sign-in");

  const run = await getRunForCaller(callerId, runId);
  if (!run) notFound();

  const approval = await getApprovalForCaller(callerId, runId);
  if (!approval) notFound();

  return (
    <div className="qf-page">
      <ApprovalView run={run} approval={approval} />
    </div>
  );
}
