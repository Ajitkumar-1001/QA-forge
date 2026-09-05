
import dynamic from "next/dynamic";

const AgentActivityScreen = dynamic(() => import("@/components/qaforge/screens/workspace").then(mod => mod.AgentActivityScreen), {

});

export default function Page() {
  return <AgentActivityScreen />;
}
