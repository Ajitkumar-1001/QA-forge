import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCallerId } from "@/lib/auth";
import { listRunsForCaller } from "@/lib/repositories/test-run";
import { PageHeader } from "@/components/qaforge/domain";
import { RunSummaryTable } from "@/components/qaforge/run-history/run-summary-table";

// 004-run-history-view: real data, Data Access Layer pattern (research.md #1) — no
// tRPC/route handler. /proxy.ts already redirects a signed-out request before this ever
// runs; this second callerId resolution is the page's own authorization check, not a
// reliance on that middleware layer having done it (research.md #5, Constitution III).
export default async function Page() {
  const callerId = await getCallerId(await headers());
  if (!callerId) redirect("/sign-in");

  const runs = await listRunsForCaller(callerId);

  return (
    <div className="qf-page">
      <PageHeader title="Runs" description="Every QA run you've started, newest first." />
      <RunSummaryTable runs={runs} />
    </div>
  );
}
