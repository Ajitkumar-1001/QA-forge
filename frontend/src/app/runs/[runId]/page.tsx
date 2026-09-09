import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { getCallerId } from "@/lib/auth";
import { getRunForCaller } from "@/lib/repositories/test-run";
import { RunDetailView } from "@/components/qaforge/run-history/run-detail-view";

// 004-run-history-view: getRunForCaller (003, unchanged) already returns null identically
// for "doesn't exist" and "exists but not owned" — notFound() renders the same response
// either way (research.md #6, spec.md FR-004), never a distinguishable message.
export default async function Page(props: PageProps<"/runs/[runId]">) {
  const { runId } = await props.params;

  const callerId = await getCallerId(await headers());
  if (!callerId) redirect("/sign-in");

  const run = await getRunForCaller(callerId, runId);
  if (!run) notFound();

  return (
    <div className="qf-page">
      <RunDetailView run={run} />
    </div>
  );
}
