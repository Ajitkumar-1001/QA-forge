import { headers } from "next/headers";
import { redirect } from "next/navigation";
import dynamic from "next/dynamic";
import { getCallerId } from "@/lib/auth";

const AgentActivityScreen = dynamic(() => import("@/components/qaforge/screens/workspace").then(mod => mod.AgentActivityScreen), {

});

// A-first (login-gate plan, backstop fix): matches dashboard/runs/runs-new's own defense-in-
// depth doctrine — proxy.ts gates this route already, but doesn't fail closed if its own
// @/lib/auth import ever throws (e.g. DATABASE_URL unset); this page-level check does.
export default async function Page() {
  const callerId = await getCallerId(await headers());
  if (!callerId) redirect("/sign-in");

  return <AgentActivityScreen />;
}
