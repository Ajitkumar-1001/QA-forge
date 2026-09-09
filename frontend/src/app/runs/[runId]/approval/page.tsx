import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCallerId } from "@/lib/auth";
import { ApprovalScreen } from "@/components/qaforge/screens/approval";

// A-first (login-gate plan, backstop fix): matches dashboard/runs/runs-new's own defense-in-
// depth doctrine — proxy.ts gates this route already, but doesn't fail closed if its own
// @/lib/auth import ever throws (e.g. DATABASE_URL unset); this page-level check does.
export default async function Page(props: PageProps<"/runs/[runId]/approval">) {
  const callerId = await getCallerId(await headers());
  if (!callerId) redirect("/sign-in");

  const { runId } = await props.params;
  return <ApprovalScreen runId={runId} />;
}
