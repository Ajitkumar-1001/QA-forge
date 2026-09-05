"use client";

import * as React from "react";
import { Icon } from "../icon";
import { Alert, Avatar, Badge, Button, DataTable, Progress, Separator, type Column } from "../primitives";
import { Combobox, Field, Input, Select, Switch } from "../forms";
import { AlertDialog, Dialog, DropdownMenu, Tabs, type MenuItemDef } from "../overlays";
import { ActionRiskBadge, AgentStatus, AgentTrace, Card, PageHeader } from "../domain";
import { useQAForge } from "../provider";
import { agents, environments, plans, repositories as initialRepositories, trace, type Environment, type Plan, type Repository } from "@/data/qaforge";

// Ported from the imported design project's app/screens/workspace.jsx.

export function TestPlansScreen() {
  const { go, toast } = useQAForge();
  const [openPlan, setOpenPlan] = React.useState<Plan | null>(null);
  return (
    <div className="qf-page">
      <PageHeader title="Test Plans" description="Reusable scenario sets. A run executes one plan against one environment." actions={<Button variant="primary" icon="Plus" onClick={() => toast({ title: "Test plan saved", description: "Untitled plan · 0 scenarios" })}>New Test Plan</Button>} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        {plans.map((p) => (
          <Card
            key={p.id}
            title={p.name}
            description={`${p.scenarios.length} scenarios · ${p.repository}`}
            actions={<DropdownMenu align="end" trigger={<Button variant="ghost" size="icon-sm" aria-label="Plan actions"><Icon name="Ellipsis" size={14} /></Button>} items={[
              { label: "Run now", icon: "Play", onSelect: () => go("new-run") },
              { label: "Edit scenarios", icon: "Pencil", onSelect: () => setOpenPlan(p) },
              { label: "Duplicate", icon: "Copy" },
              { type: "separator" },
              { label: "Archive plan", icon: "Archive", destructive: true },
            ]} />}
            footer={<><span className="qf-tertiary" style={{ fontSize: 12 }}>Last run {p.lastRun}</span><span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12 }}><span className="qf-tertiary">Pass rate</span><Progress value={p.passRate} tone={p.passRate === 100 ? "success" : p.passRate < 80 ? "warning" : "primary"} size="sm" style={{ width: 72 }} /><b className="qf-mono" style={{ fontWeight: 500 }}>{p.passRate}%</b></span></>}
          >
            {p.blocked ? <Badge tone="warning" icon="Ban">Blocked in production</Badge> : null}
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
              {p.scenarios.map((s) => {
                const failed = p.failed.includes(s);
                return <li key={s} style={{ display: "flex", alignItems: "center", gap: 8, color: failed ? "var(--text-primary)" : "var(--text-secondary)" }}><Icon name={failed ? "X" : "Check"} size={13} color={failed ? "var(--error)" : "var(--success)"} />{s}{failed ? <Badge size="sm" tone="error" style={{ marginLeft: "auto" }}>Failed</Badge> : null}</li>;
              })}
            </ul>
          </Card>
        ))}
      </div>
      <Dialog
        open={!!openPlan}
        onOpenChange={() => setOpenPlan(null)}
        title={openPlan ? `Edit ${openPlan.name}` : ""}
        description="Scenarios run in order. Each becomes a step group in the execution timeline."
        footer={<><Button variant="outline" onClick={() => setOpenPlan(null)}>Cancel</Button><Button variant="primary" onClick={() => { setOpenPlan(null); toast({ title: "Test plan saved", description: openPlan?.name }); }}>Save plan</Button></>}
      >
        {openPlan ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {openPlan.scenarios.map((s) => <Input key={s} defaultValue={s} size="sm" />)}
            <Button variant="ghost" size="sm" icon="Plus" style={{ alignSelf: "flex-start" }}>Add scenario</Button>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}

const REPO_STATUS: Record<Repository["status"], "success" | "error" | "neutral"> = { CONNECTED: "success", "SYNC FAILED": "error", DISCONNECTED: "neutral" };

export function RepositoriesScreen() {
  const { toast } = useQAForge();
  const [repos, setRepos] = React.useState<Repository[]>(initialRepositories);
  const [confirm, setConfirm] = React.useState<Repository | null>(null);
  const [connect, setConnect] = React.useState(false);
  const columns: Column<Repository>[] = [
    { key: "name", header: "Repository", render: (r) => <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><Icon name="Github" size={14} style={{ color: "var(--text-tertiary)" }} /><code className="qf-mono" style={{ color: "var(--text-primary)" }}>{r.name}</code></span> },
    { key: "branch", header: "Default Branch", mono: true, muted: true, render: (r) => <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Icon name="GitBranch" size={13} />{r.branch}</span> },
    { key: "provider", header: "Provider", muted: true },
    { key: "lastRun", header: "Last QA Run", mono: true, muted: true },
    { key: "status", header: "Status", render: (r) => <Badge tone={REPO_STATUS[r.status]} size="sm" icon={r.status === "CONNECTED" ? "Check" : r.status === "SYNC FAILED" ? "CircleX" : undefined}>{r.status}</Badge> },
    { key: "environments", header: "Connected Environments", render: (r) => <span style={{ display: "inline-flex", gap: 4 }}>{r.environments.map((e) => <Badge key={e} size="sm" tone={e === "PRODUCTION" ? "error" : e === "STAGING" ? "active" : "neutral"}>{e}</Badge>)}</span> },
    { key: "actions", header: "", align: "right", render: (r) => <DropdownMenu align="end" trigger={<Button variant="ghost" size="icon-sm" aria-label="Repository actions"><Icon name="Ellipsis" size={14} /></Button>} items={[
      { label: "Configure", icon: "Settings" },
      { label: "Resync", icon: "RefreshCw", onSelect: () => toast({ tone: "success", title: "Repository synced", description: r.name }) },
      { type: "separator" },
      { label: "Disconnect", icon: "Unplug", destructive: true, onSelect: () => setConfirm(r) },
    ] as MenuItemDef[]} /> },
  ];
  return (
    <div className="qf-page">
      <PageHeader title="Repositories" description="Connected GitHub repositories the agent may read. Write actions are governed by policies." actions={<Button variant="primary" icon="Github" onClick={() => setConnect(true)}>Connect Repository</Button>} />
      <DataTable columns={columns} rows={repos} pageSize={10} totalLabel="repositories" />
      {repos.some((r) => r.status === "SYNC FAILED") ? (
        <Alert
          tone="destructive"
          title="qa-forge/docs sync failed"
          description="The GitHub App token expired. Runs cannot investigate this repository until it is reconnected."
          actions={<Button size="sm" variant="outline" icon="RefreshCw" onClick={() => { setRepos((rs) => rs.map((r) => (r.id === "r3" ? { ...r, status: "CONNECTED", lastRun: "—" } : r))); toast({ tone: "success", title: "Repository connected", description: "qa-forge/docs" }); }}>Reconnect</Button>}
        />
      ) : null}
      <AlertDialog
        open={!!confirm}
        onOpenChange={() => setConfirm(null)}
        tone="destructive"
        title="Disconnect repository?"
        description={confirm ? `Runs and findings for ${confirm.name} will be kept. New runs cannot be started until it is reconnected.` : ""}
        confirmLabel="Disconnect"
        onConfirm={() => { setRepos((rs) => rs.map((r) => (r.id === confirm?.id ? { ...r, status: "DISCONNECTED", environments: [] } : r))); setConfirm(null); }}
      />
      <Dialog
        open={connect}
        onOpenChange={setConnect}
        title="Connect repository"
        description="QAForge requests read access to code and pull requests. Issue creation is granted per environment policy."
        footer={<><Button variant="outline" onClick={() => setConnect(false)}>Cancel</Button><Button variant="primary" icon="Github" onClick={() => { setConnect(false); toast({ tone: "success", title: "Repository connected", description: "qa-forge/mobile" }); setRepos((rs) => [...rs, { id: `r${rs.length + 1}`, name: "qa-forge/mobile", branch: "main", provider: "GitHub", lastRun: "—", status: "CONNECTED", environments: ["PREVIEW"] }]); }}>Connect</Button></>}
      >
        <Field label="Repository"><Combobox icon="Github" defaultValue="mobile" options={[{ value: "mobile", label: "qa-forge/mobile", hint: "main" }, { value: "infra", label: "qa-forge/infra", hint: "main" }]} /></Field>
        <Field label="Environments to attach"><div style={{ display: "flex", gap: 6 }}><Badge tone="neutral">PREVIEW</Badge><Badge tone="active">STAGING</Badge></div></Field>
      </Dialog>
    </div>
  );
}

export function EnvironmentsScreen() {
  const { go } = useQAForge();
  return (
    <div className="qf-page">
      <PageHeader title="Environments" description="Where runs execute. Production carries the strictest policy and a read-only session." />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {environments.map((e: Environment) => {
          const prod = e.id === "PRODUCTION";
          return (
            <Card
              key={e.id}
              className={prod ? "qf-finding--critical" : ""}
              title={<span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><Badge tone={prod ? "error" : e.id === "STAGING" ? "active" : "neutral"} solid={prod} icon={prod ? "TriangleAlert" : undefined}>{e.id}</Badge></span>}
              description={<code className="qf-mono">{e.url}</code>}
              actions={<><ActionRiskBadge risk={e.policy} size="sm" /><Button variant="ghost" size="icon-sm" aria-label="Configure"><Icon name="Settings" size={14} /></Button></>}
            >
              {prod ? <Alert tone="warning" title="Production runs are restricted" description="Form submission requires approval. Data deletion and code pushes are denied." /> : null}
              <div style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: "6px 12px", fontSize: 13 }}>
                {([["Repository", e.repository], ["Branch mapping", e.branch], ["Test credentials", e.credentials], ["Browser permissions", e.browser], ["Network restrictions", e.network]] as const).map(([k, v]) => (
                  <React.Fragment key={k}>
                    <span className="qf-tertiary">{k}</span>
                    <span className={k === "Test credentials" || k === "Branch mapping" ? "qf-mono" : ""} style={{ color: "var(--text-primary)" }}>{v}{k === "Test credentials" ? <span className="qf-tertiary" style={{ fontFamily: "var(--font-sans)", fontSize: 12 }}> · reference only, secrets never displayed</span> : null}</span>
                  </React.Fragment>
                ))}
              </div>
              <Button variant="link" size="sm" onClick={() => go("policies")} style={{ alignSelf: "flex-start" }}>View allowed tool actions</Button>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

export function AgentActivityScreen() {
  const { go } = useQAForge();
  return (
    <div className="qf-page">
      <PageHeader title="Agent Activity" description="What every agent is doing right now, and the provenance of the current run." />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {agents.map((a) => (
          <Card key={a.name} padding="compact" interactive onClick={() => go("run", { runId: a.run })} title={<span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><Avatar variant="agent" size="sm" name={a.name} />{a.name}</span>} titleSize="sm" actions={<AgentStatus status={a.status} size="sm" />}>
            <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{a.task}</span>
            <span className="qf-tertiary" style={{ fontSize: 12, display: "flex", gap: 12 }}><span>run <code className="qf-mono">{a.run}</code></span><span>{a.tools} tool calls</span></span>
          </Card>
        ))}
      </div>
      <Card title="Trace · QF-0218" description="Execution provenance, oldest first" padding="none" actions={<Button variant="ghost" size="sm" iconRight="ChevronRight" onClick={() => go("run", { runId: "QF-0218" })}>Open run</Button>}>
        <div style={{ paddingTop: 8 }}><AgentTrace events={trace} /></div>
      </Card>
    </div>
  );
}

export function SettingsScreen() {
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
          <Field orientation="horizontal" label={<span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><Icon name="Github" size={16} />GitHub App</span>} description="qa-forge · 3 repositories"><Badge tone="success" icon="Check">Connected</Badge></Field>
          <Field orientation="horizontal" label="Slack" description="#qa-alerts"><Badge tone="success" icon="Check">Connected</Badge></Field>
          <Field orientation="horizontal" label="Linear" description="Create issues in Linear instead of GitHub"><Button variant="outline" size="sm">Connect</Button></Field>
        </Card>
      )}
    </div>
  );
}
