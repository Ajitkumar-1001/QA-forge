import { redirect } from "next/navigation";

// The Repositories screen was a mock duplicate of data /settings already shows for real
// (the connected GithubConnection's live repo list, verifyAndListGithubRepositories) —
// deleted rather than wired a second time. Redirect instead of a bare 404 so an old
// bookmark or sidebar muscle-memory still lands somewhere useful.
export default function Page() {
  redirect("/settings");
}
