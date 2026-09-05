
import dynamic from "next/dynamic";

const RepositoriesScreen = dynamic(() => import("@/components/qaforge/screens/workspace").then(mod => mod.RepositoriesScreen), {

});

export default function Page() {
  return <RepositoriesScreen />;
}
