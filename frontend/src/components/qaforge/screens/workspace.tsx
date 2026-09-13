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
// the real per-run Agent Trace already in run-detail-view.tsx). The original Workspace/
// Notifications tabs and Slack/Linear rows were removed for the same reason (no real backing
// table at the time) — 008-slack-linear-integrations later gave Slack and Linear real tables
// and real write paths, so they're back below, alongside GitHub. No client state lives in
// this component itself, so it stays a plain Server Component (each row below is its own
// "use client" leaf).
function SectionLabel({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <Icon name={icon} size={16} />
      {children}
    </span>
  );
}

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
        <Field label={<SectionLabel icon="Github">GitHub</SectionLabel>}>
          <GithubConnectionRow data={githubConnection} />
        </Field>
      </Card>
      <Card padding="large">
        <Field label={<SectionLabel icon="Bell">Slack</SectionLabel>}>
          <SlackConnectionRow data={slackConnection} githubConnected={githubConnection.connected} />
        </Field>
      </Card>
      <Card padding="large">
        <Field label={<SectionLabel icon="ListChecks">Linear</SectionLabel>}>
          <LinearConnectionRow data={linearConnection} githubConnected={githubConnection.connected} />
        </Field>
      </Card>
    </div>
  );
}
