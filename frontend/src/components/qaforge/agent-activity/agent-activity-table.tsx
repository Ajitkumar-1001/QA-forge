"use client";

import { useRouter } from "next/navigation";
import { Badge, DataTable, Empty, type Column } from "../primitives";
import type { AgentActivityEntry } from "@/lib/repositories/test-run";

// Columns limited to real, persisted fields only (AgentActivityEntry) — same discipline
// as RunSummaryTable: no severity/duration/tool-calls, since nothing produces them yet.

function formatDate(d: Date): string {
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const ROLE_LABEL: Record<AgentActivityEntry["role"], string> = {
  planner: "Test Planner",
  rootCause: "Root Cause",
  validator: "Validator",
};

const columns: Column<AgentActivityEntry>[] = [
  { key: "startedAt", header: "Time", muted: true, sortable: true, sortValue: (e) => e.startedAt.getTime(), render: (e) => formatDate(e.startedAt) },
  { key: "role", header: "Agent", render: (e) => <Badge tone="neutral" icon="Bot">{ROLE_LABEL[e.role] ?? e.role}</Badge> },
  { key: "objective", header: "Run", render: (e) => <span className="inline-block max-w-[360px] overflow-hidden align-middle text-ellipsis">{e.objective}</span> },
  { key: "modelId", header: "Model", mono: true, muted: true },
  { key: "responseId", header: "Response ID", mono: true, muted: true },
];

export function AgentActivityTable({ entries }: { entries: AgentActivityEntry[] }) {
  const router = useRouter();

  if (entries.length === 0) {
    return <Empty icon="Bot" title="No agent activity yet" description="Model calls made by QA runs will appear here." />;
  }

  return (
    <DataTable
      columns={columns}
      rows={entries}
      pageSize={10}
      onRowClick={(e) => router.push(`/runs/${e.runId}`)}
      totalLabel="calls"
      defaultSort={{ key: "startedAt", dir: "desc" }}
    />
  );
}
