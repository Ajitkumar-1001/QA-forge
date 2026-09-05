
import dynamic from "next/dynamic";

const SettingsScreen = dynamic(() => import("@/components/qaforge/screens/workspace").then(mod => mod.SettingsScreen), {

});

export default function Page() {
  return <SettingsScreen />;
}
