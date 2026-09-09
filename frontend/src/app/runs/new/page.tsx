import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCallerId } from "@/lib/auth";
import { PageHeader } from "@/components/qaforge/domain";
import { RunLaunchForm } from "@/components/qaforge/run-history/run-launch-form";

// 005-run-launch-ui: same Data Access Layer auth pattern as 004's runs/page.tsx — a
// second, real authorization check here, not a reliance on /proxy.ts having already
// redirected a signed-out request (research.md #5, Constitution III).
export default async function Page() {
  const callerId = await getCallerId(await headers());
  if (!callerId) redirect("/sign-in");

  return (
    <div className="qf-page" style={{ maxWidth: 720 }}>
      <PageHeader title="New QA Run" description="Define the objective. QAForge plans the journey, executes it against the target, and investigates any failure." />
      <RunLaunchForm />
    </div>
  );
}
