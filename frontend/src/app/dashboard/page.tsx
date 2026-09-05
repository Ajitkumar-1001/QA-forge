
import dynamic from "next/dynamic";

const Dashboard = dynamic(() => import("@/components/qaforge/screens/dashboard").then(mod => mod.Dashboard), {

});

export default function Page() {
  return <Dashboard />;
}
