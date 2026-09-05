
import dynamic from "next/dynamic";

const EnvironmentsScreen = dynamic(() => import("@/components/qaforge/screens/workspace").then(mod => mod.EnvironmentsScreen), {

});

export default function Page() {
  return <EnvironmentsScreen />;
}
