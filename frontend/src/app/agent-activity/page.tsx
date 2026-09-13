import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCallerId } from "@/lib/auth";
import { listAgentActivityForCaller } from "@/lib/repositories/test-run";
import { PageHeader } from "@/components/qaforge/domain";
import { AgentActivityTable } from "@/components/qaforge/agent-activity/agent-activity-table";

// Cross-run agent history — real data, Data Access Layer pattern (same as runs/page.tsx),
// flattening the modelCalls every run already persists. No LLM agent involved in building
// this page: it's a deterministic read + flatten, same as the Runs list.
export default async function Page() {
  const callerId = await getCallerId(await headers());
  if (!callerId) redirect("/sign-in");

  const entries = await listAgentActivityForCaller(callerId);

  return (
    <div className="qf-page">
      <PageHeader title="Agent Activity" description="Every model call your QA agents made, across all runs, newest first." />
      <AgentActivityTable entries={entries} />
    </div>
  );
}
