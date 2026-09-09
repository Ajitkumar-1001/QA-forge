import { headers } from "next/headers";
import { redirect } from "next/navigation";
import dynamic from "next/dynamic";
import { getCallerId } from "@/lib/auth";

const Dashboard = dynamic(() => import("@/components/qaforge/screens/dashboard").then(mod => mod.Dashboard), {

});

// A-first (login-gate plan): proxy.ts already redirects a signed-out request before this
// ever runs; this second callerId resolution is the page's own authorization check, not a
// reliance on that middleware layer having done it — same pattern 004/005 already
// established for /runs and /runs/new. Dashboard itself still renders mock content (out of
// scope for this change, tracked separately) — only the gate is real here.
export default async function Page() {
  const callerId = await getCallerId(await headers());
  if (!callerId) redirect("/sign-in");

  return <Dashboard />;
}
