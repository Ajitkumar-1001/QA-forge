"use client";

import * as React from "react";
import { Icon } from "../icon";
import { Badge, Button, Separator } from "../primitives";
import { Field, Input, Select, Switch } from "../forms";
import { Tabs } from "../overlays";
import { Card, PageHeader } from "../domain";
import { useQAForge } from "../provider";
import { GithubConnectionRow, type GithubConnectionData } from "../settings/github-connection-row";

// Test Plans / Repositories / Environments / Agent Activity screens that used to live in
// this file were deleted: no PRD backing, no DB table for any of them (Test Plans/
// Repositories/Environments), or a duplicate of a concept already wired for real elsewhere
// (Repositories duplicated /settings' GithubConnection repo list; Agent Activity duplicated
// the real per-run Agent Trace already in run-detail-view.tsx). SettingsScreen is real
// (007-github-connection) and is the only one left.
export function SettingsScreen({ githubConnection }: { githubConnection: GithubConnectionData }) {
  const { toast } = useQAForge();
  const [tab, setTab] = React.useState("workspace");
  return (
    <div className="qf-page" style={{ maxWidth: 860 }}>
      <PageHeader title="Settings" description="Workspace, notifications and integrations." />
      <Tabs value={tab} onValueChange={setTab} items={[{ value: "workspace", label: "Workspace" }, { value: "notifications", label: "Notifications" }, { value: "integrations", label: "Integrations" }]} />
      {tab === "workspace" ? (
        <Card padding="large">
          <Field label="Workspace name" htmlFor="ws"><Input id="ws" defaultValue="qa-forge" /></Field>
          <Field label="Default environment"><Select defaultValue="STAGING" options={["LOCAL", "PREVIEW", "STAGING", "PRODUCTION"]} /></Field>
          <Field label="Default execution mode" description="Guided pauses before consequential actions."><Select defaultValue="Guided" options={["Guided", "Autonomous"]} /></Field>
          <Separator />
          <Field orientation="horizontal" label="Retain evidence for 90 days" description="Screenshots, console and network captures"><Switch defaultChecked /></Field>
          <Field orientation="horizontal" label="Redact credentials in logs"><Switch defaultChecked /></Field>
          <div style={{ display: "flex", justifyContent: "flex-end" }}><Button variant="primary" onClick={() => toast({ tone: "success", title: "Settings saved" })}>Save changes</Button></div>
        </Card>
      ) : tab === "notifications" ? (
        <Card padding="large">
          <Field orientation="horizontal" label="Approval requests" description="Email + Slack when a run is waiting"><Switch defaultChecked /></Field>
          <Field orientation="horizontal" label="Critical findings"><Switch defaultChecked /></Field>
          <Field orientation="horizontal" label="Run passed"><Switch /></Field>
          <Field orientation="horizontal" label="Weekly reliability digest"><Switch defaultChecked /></Field>
        </Card>
      ) : (
        <Card padding="large">
          <Field label={<span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><Icon name="Github" size={16} />GitHub</span>}><GithubConnectionRow data={githubConnection} /></Field>
          <Separator />
          <Field orientation="horizontal" label="Slack" description="#qa-alerts"><Badge tone="success" icon="Check">Connected</Badge></Field>
          <Field orientation="horizontal" label="Linear" description="Create issues in Linear instead of GitHub"><Button variant="outline" size="sm">Connect</Button></Field>
        </Card>
      )}
    </div>
  );
}
