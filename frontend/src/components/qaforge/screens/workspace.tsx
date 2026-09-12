import { Icon } from "../icon";
import { Card, PageHeader } from "../domain";
import { Field } from "../forms";
import { GithubConnectionRow, type GithubConnectionData } from "../settings/github-connection-row";
import { SlackConnectionRow, type SlackConnectionData } from "../settings/slack-connection-row";
import { LinearConnectionRow, type LinearConnectionData } from "../settings/linear-connection-row";

// Test Plans / Repositories / Environments / Agent Activity screens that used to live in
// this file were deleted: no PRD backing, no DB table for any of them (Test Plans/
// Repositories/Environments), or a duplicate of a concept already wired for real elsewhere
// (Repositories duplicated /settings' GithubConnection repo list; Agent Activity duplicated
// the real per-run Agent Trace already in run-detail-view.tsx). Workspace/Notifications
// tabs and the Slack/Linear integration rows removed for the same reason: no workspace-
// config or notification-prefs table exists, and Slack/Linear were never wired to anything
// real. GitHub (007-github-connection) is the only real integration, so it's the only
// section left — no client state remains, so this is a plain Server Component again
// (GithubConnectionRow is its own "use client" leaf).
export function SettingsScreen({
  githubConnection,
  slackConnection,
  linearConnection,
}: {
  githubConnection: GithubConnectionData;
  slackConnection: SlackConnectionData;
  linearConnection: LinearConnectionData;
}) {
  return (
    <div className="qf-page" style={{ maxWidth: 860 }}>
      <PageHeader title="Settings" description="GitHub connection for repository access. Slack and Linear both require GitHub connected first." />
      <Card padding="large">
        <Field label={<span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><Icon name="Github" size={16} />GitHub</span>}>
          <GithubConnectionRow data={githubConnection} />
        </Field>
      </Card>
      <Card padding="large">
        <Field label={<span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><Icon name="Bell" size={16} />Slack</span>}>
          <SlackConnectionRow data={slackConnection} githubConnected={githubConnection.connected} />
        </Field>
      </Card>
      <Card padding="large">
        <Field label={<span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><Icon name="ListChecks" size={16} />Linear</span>}>
          <LinearConnectionRow data={linearConnection} githubConnected={githubConnection.connected} />
        </Field>
      </Card>
    </div>
  );
}
