import { headers } from "next/headers";
import { redirect } from "next/navigation";
import dynamic from "next/dynamic";
import { getCallerId } from "@/lib/auth";
import { getGithubConnectionForCaller } from "@/lib/repositories/github-connection";
import { getSlackConnectionForCaller } from "@/lib/repositories/slack-connection";
import { decrypt } from "@/lib/crypto";
import { verifyAndListGithubRepositories } from "@/lib/github-api";
import type { GithubConnectionData } from "@/components/qaforge/settings/github-connection-row";
import type { SlackConnectionData } from "@/components/qaforge/settings/slack-connection-row";

const SettingsScreen = dynamic(() => import("@/components/qaforge/screens/workspace").then(mod => mod.SettingsScreen), {

});

// A-first (login-gate plan, backstop fix): matches dashboard/runs/runs-new's own defense-in-
// depth doctrine — proxy.ts gates this route already, but doesn't fail closed if its own
// @/lib/auth import ever throws (e.g. DATABASE_URL unset); this page-level check does.
//
// 007-github-connection: fetches the real connection + a live repository list on every
// render (research.md Decision 6) — never cached, so a revoked token surfaces as a
// repository-list error on the very next view, not a silently-stale list. The decrypted PAT
// lives only in this function's local scope, for the one call that needs it.
export default async function Page() {
  const callerId = await getCallerId(await headers());
  if (!callerId) redirect("/sign-in");

  const connection = await getGithubConnectionForCaller(callerId);
  let githubConnection: GithubConnectionData = { connected: false };
  if (connection) {
    const pat = decrypt(connection.patReference);
    const verified = await verifyAndListGithubRepositories(pat);
    githubConnection = { connected: true, repositories: verified.ok ? verified.repositories : null };
  }

  // 008-slack-linear-integrations: fetched alongside GitHub's, plain repository call —
  // matches this page's own existing pattern, not github-connection-service.ts's Safely-
  // wrapped/audit-logged variant (that wrapper has no callers anywhere in src/ today; this
  // page never used it for GitHub either, so Slack/Linear don't introduce an inconsistency).
  const slackConnectionRow = await getSlackConnectionForCaller(callerId);
  const slackConnection: SlackConnectionData = { connected: slackConnectionRow !== null };

  return <SettingsScreen githubConnection={githubConnection} slackConnection={slackConnection} />;
}
