import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCallerId } from "@/lib/auth";
import { listEnvironmentsForCaller } from "@/lib/repositories/test-run";
import { PageHeader } from "@/components/qaforge/domain";
import { EnvironmentsTable } from "@/components/qaforge/environments/environments-table";

// Applications you've run QA against, grouped from real project rows (applicationUrl +
// repository) — not a separate Environment entity. No url/credentials/browser/network/
// policy config here: nothing stores that yet (spec.md-equivalent: no real backing).
export default async function Page() {
  const callerId = await getCallerId(await headers());
  if (!callerId) redirect("/sign-in");

  const environments = await listEnvironmentsForCaller(callerId);

  return (
    <div className="qf-page">
      <PageHeader title="Environments" description="Applications your QA runs have targeted." />
      <EnvironmentsTable environments={environments} />
    </div>
  );
}
