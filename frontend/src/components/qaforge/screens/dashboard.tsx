"use client";

import * as React from "react";
import { Icon } from "../icon";
import { Badge, Button, Card, Chart, Progress } from "../primitives";
import { Table } from "../primitives";
import { PageHeader, AgentStatus, RunStatusBadge, SeverityBadge, ConfidenceMeter } from "../domain";
import { useQAForge, LIVE_STATUSES } from "../provider";
import { agents, environments, passRate, plans, runsPerDay } from "@/data/qaforge";

// Ported from the imported design project's app/screens/dashboard.jsx.

function Metric({ label, value, delta, tone, icon }: { label: string; value: React.ReactNode; delta?: string; tone?: "up" | "down" | "warn"; icon: string }) {
  return (
    <div className="qf-metric">
      <span className="qf-metric__label">{label}<Icon name={icon} size={14} /></span>
      <span className="qf-metric__value">{value}</span>
      {delta ? <span className={`qf-metric__delta ${tone ? `qf-metric__delta--${tone}` : ""}`.trim()}>{delta}</span> : null}
    </div>
  );
}

export function Dashboard() {
  const { go, runs, findings, approvals } = useQAForge();
  const active = runs.filter((r) => LIVE_STATUSES.includes(r.status)).length;
  const pending = Object.values(approvals).filter((a) => a.status === "PENDING").length;
  const openCritical = findings.filter((f) => f.severity === "CRITICAL" && !["RESOLVED", "DISMISSED"].includes(f.status)).length;
  const recent = runs.slice(0, 6);
  const critical = findings.filter((f) => ["CRITICAL", "HIGH"].includes(f.severity) && !["RESOLVED", "DISMISSED"].includes(f.status)).slice(0, 4);
  return (
    <div className="qf-page">
      <PageHeader title="Overview" description="QA activity across qa-forge/web and qa-forge/api." actions={<Button variant="primary" icon="Play" onClick={() => go("new-run")}>New QA Run</Button>} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <Metric label="Active Runs" value={active} delta={pending ? `${pending} awaiting approval` : "no approvals pending"} tone={pending ? "warn" : undefined} icon="Activity" />
        <Metric label="Pass Rate" value="93.1%" delta="−3.9% vs yesterday" tone="down" icon="ShieldCheck" />
        <Metric label="Open Critical Findings" value={openCritical} delta="1 issue created" icon="Bug" />
        <Metric label="Avg. Run Duration" value="4m 02s" delta="−18s over 7 days" tone="up" icon="Clock" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 16, alignItems: "start" }}>
        <Card title="Recent Runs" padding="none" actions={<Button variant="ghost" size="sm" iconRight="ChevronRight" onClick={() => go("runs")}>All runs</Button>}>
          <div style={{ paddingTop: 12 }}>
            <Table
              flush
              compact
              rows={recent}
              onRowClick={(r) => go("run", { runId: r.id })}
              columns={[
                { key: "id", header: "Run", mono: true, width: 96 },
                { key: "objective", header: "Objective", render: (r) => <span style={{ display: "inline-block", maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", verticalAlign: "middle" }}>{r.objective}</span> },
                { key: "environment", header: "Env", render: (r) => <Badge size="sm" tone={r.environment === "STAGING" ? "active" : r.environment === "PRODUCTION" ? "error" : "neutral"}>{r.environment}</Badge> },
                { key: "status", header: "Status", render: (r) => <RunStatusBadge status={r.status} size="sm" /> },
                { key: "duration", header: "Duration", align: "right", mono: true, muted: true },
              ]}
            />
          </div>
        </Card>
        <Card title="Reliability" description="Pass rate and run volume, last 7 days">
          <Chart type="line" height={80} data={passRate} series={[{ data: passRate.map((d) => d.value) }]} max={100} legend={[{ label: "Pass rate %", color: "var(--chart-1)" }]} />
          <div className="qf-separator qf-separator--h" role="separator" />
          <Chart type="bar" height={56} data={runsPerDay} legend={[{ label: "Runs per day", color: "var(--chart-1)" }, { label: "Weekend", color: "var(--chart-4)" }]} />
          <div className="qf-separator qf-separator--h" role="separator" />
          <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
            {plans.slice(0, 3).map((p) => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ flex: 1, color: "var(--text-secondary)" }}>{p.name}</span>
                <Progress value={p.passRate} tone={p.passRate === 100 ? "success" : p.passRate < 80 ? "warning" : "primary"} size="sm" style={{ width: 90 }} />
                <span className="qf-mono" style={{ width: 36, textAlign: "right" }}>{p.passRate}%</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, alignItems: "start" }}>
        <Card title="Critical Findings" padding="none" actions={<Button variant="ghost" size="sm" iconRight="ChevronRight" onClick={() => go("findings")}>All</Button>}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {critical.map((f, i) => (
              <button key={f.id} type="button" onClick={() => go("run", { runId: f.runId })} style={{ all: "unset", cursor: "pointer", display: "flex", flexDirection: "column", gap: 6, padding: "12px 16px", borderTop: i ? "1px solid var(--border-subtle)" : 0 }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <SeverityBadge severity={f.severity} size="sm" />
                  <span className="qf-mono qf-tertiary" style={{ fontSize: 11 }}>{f.runId}</span>
                  <span style={{ marginLeft: "auto" }}><ConfidenceMeter inline value={f.confidence} segments={8} showBand={false} /></span>
                </div>
                <span style={{ fontSize: 13, lineHeight: 1.4 }}>{f.title}</span>
              </button>
            ))}
          </div>
        </Card>
        <Card title="Agent Activity" padding="none" actions={<Button variant="ghost" size="sm" iconRight="ChevronRight" onClick={() => go("agent-activity")}>Details</Button>}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {agents.slice(0, 5).map((a, i) => (
              <div key={a.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 16px", borderTop: i ? "1px solid var(--border-subtle)" : 0, fontSize: 13 }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontWeight: 500 }}>{a.name}</span>
                  <span style={{ display: "block", color: "var(--text-tertiary)", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.task}</span>
                </span>
                <AgentStatus status={a.status} size="sm" />
              </div>
            ))}
          </div>
        </Card>
        <Card title="Environment Health" padding="none">
          <div style={{ display: "flex", flexDirection: "column" }}>
            {environments.map((e, i) => (
              <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderTop: i ? "1px solid var(--border-subtle)" : 0, fontSize: 13 }}>
                <Badge size="sm" tone={e.id === "PRODUCTION" ? "error" : e.id === "STAGING" ? "active" : "neutral"} solid={e.id === "PRODUCTION"}>{e.id}</Badge>
                <span className="qf-mono qf-muted" style={{ flex: 1, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.url}</span>
                <Badge size="sm" tone={e.id === "PRODUCTION" ? "warning" : "success"} icon={e.id === "PRODUCTION" ? "Hand" : "Check"}>{e.id === "PRODUCTION" ? "Restricted" : "Reachable"}</Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
