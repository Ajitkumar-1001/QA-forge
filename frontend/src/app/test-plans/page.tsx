
import dynamic from "next/dynamic";

const TestPlansScreen = dynamic(() => import("@/components/qaforge/screens/workspace").then(mod => mod.TestPlansScreen), {

});

export default function Page() {
  return <TestPlansScreen />;
}
