import dynamic from "next/dynamic";

const RunsScreen = dynamic(() => import("@/components/qaforge/screens/runs").then(mod => mod.RunsScreen), {

});

export default function Page() {
  return <RunsScreen />;
}
