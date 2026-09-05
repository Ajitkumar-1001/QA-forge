
import dynamic from "next/dynamic";

const FindingsScreen = dynamic(() => import("@/components/qaforge/screens/findings").then(mod => mod.FindingsScreen), {

});

export default function Page() {
  return <FindingsScreen />;
}
