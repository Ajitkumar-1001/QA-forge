import { Icon } from "../icon";
import { Card, PageHeader } from "../domain";
import { Field } from "../forms";
import { GithubConnectionRow, type GithubConnectionData } from "../settings/github-connection-row";

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
export function SettingsScreen({ githubConnection }: { githubConnection: GithubConnectionData }) {
  return (
    <div className="qf-page" style={{ maxWidth: 860 }}>
      <PageHeader title="Settings" description="GitHub connection for repository access." />
      <Card padding="large">
        <Field label={<span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><Icon name="Github" size={16} />GitHub</span>}>
          <GithubConnectionRow data={githubConnection} />
        </Field>
      </Card>
    </div>
  );
}
