"use client";

import { DataTable, Empty, type Column } from "../primitives";
import { RunStatusBadge } from "../domain";
import { Icon } from "../icon";
import type { EnvironmentSummary } from "@/lib/repositories/test-run";

function formatDate(d: Date): string {
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const columns: Column<EnvironmentSummary>[] = [
  { key: "applicationUrl", header: "Application URL", render: (e) => <span className="inline-flex items-center gap-1.5"><Icon name="Globe" size={14} className="text-muted-foreground" /> {e.applicationUrl}</span> },
  { key: "repository", header: "Repository", mono: true, muted: true },
  { key: "runCount", header: "Runs", muted: true, sortable: true, sortValue: (e) => e.runCount },
  { key: "lastRunStatus", header: "Last run", render: (e) => <RunStatusBadge status={e.lastRunStatus} size="sm" /> },
  { key: "lastRunAt", header: "Last run at", muted: true, sortable: true, sortValue: (e) => e.lastRunAt.getTime(), render: (e) => formatDate(e.lastRunAt) },
];

export function EnvironmentsTable({ environments }: { environments: EnvironmentSummary[] }) {
  if (environments.length === 0) {
    return <Empty icon="Globe" title="No environments yet" description="Applications your QA runs target will appear here." />;
  }

  return <DataTable columns={columns} rows={environments} pageSize={10} totalLabel="environments" defaultSort={{ key: "lastRunAt", dir: "desc" }} />;
}
