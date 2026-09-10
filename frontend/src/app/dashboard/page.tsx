import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCallerId } from "@/lib/auth";
import { listRunsForCaller } from "@/lib/repositories/test-run";
import { DashboardView } from "@/components/qaforge/run-history/dashboard-view";

// A-first (login-gate plan): proxy.ts already redirects a signed-out request before this
// ever runs; this second callerId resolution is the page's own authorization check, not a
// reliance on that middleware layer having done it — same pattern 004/005 already
// established for /runs and /runs/new. Dashboard now renders real data (listRunsForCaller,
// same Data Access Layer /runs already uses) instead of the qaforge.ts mock.
export default async function Page() {
  const callerId = await getCallerId(await headers());
  if (!callerId) redirect("/sign-in");

  const runs = await listRunsForCaller(callerId);

  return <DashboardView runs={runs} />;
}
