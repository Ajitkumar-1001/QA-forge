
import dynamic from "next/dynamic";

const RunDetailScreen = dynamic(() => import("@/components/qaforge/screens/run-detail").then(mod => mod.RunDetailScreen), {

});

export default async function Page(props: PageProps<"/runs/[runId]">) {
  const { runId } = await props.params;
  return <RunDetailScreen runId={runId} />;
}
