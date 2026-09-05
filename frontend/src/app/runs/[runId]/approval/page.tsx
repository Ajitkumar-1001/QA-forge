import { ApprovalScreen } from "@/components/qaforge/screens/approval";

export default async function Page(props: PageProps<"/runs/[runId]/approval">) {
  const { runId } = await props.params;
  return <ApprovalScreen runId={runId} />;
}
