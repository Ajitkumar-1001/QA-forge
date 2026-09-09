"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, DataTable, Empty, type Column } from "../primitives";
import { Input, Select } from "../forms";
import { RunStatusBadge } from "../domain";
import { RUN_STATUS_VALUES } from "@/db/enums";
import type { RunSummary } from "@/lib/repositories/test-run";

// 004-run-history-view (spec.md FR-002): columns limited to real, persisted fields only —
// no environment/branch/commit/findings/triggeredBy, since nothing produces them.
// "use client" because DataTable's onRowClick needs a real function reference — a Server
// Component can pass this component plain `runs` data (serializable), but not a callback
// closure across the RSC boundary, so navigation is handled here, client-side, via
// useRouter() rather than an onOpen prop.
//
// Filtering (T012, US4, FR-009) is client-side over the already owner-scoped `runs` prop —
// no new server round-trip per filter change, and no filter can surface a row the initial
// fetch didn't already include. Only status/repository/search — no environment or severity
// control, since neither has real backing (research.md #7's mapping).

function formatDate(d: Date): string {
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const columns: Column<RunSummary>[] = [
  { key: "id", header: "Run ID", mono: true, width: 280 },
  { key: "objective", header: "Objective", render: (r) => <span className="inline-block max-w-[360px] overflow-hidden align-middle text-ellipsis">{r.objective}</span> },
  { key: "repository", header: "Repository", mono: true, muted: true },
  { key: "status", header: "Status", render: (r) => <RunStatusBadge status={r.status} size="sm" /> },
  { key: "startedAt", header: "Started", muted: true, sortable: true, sortValue: (r) => r.startedAt.getTime(), render: (r) => formatDate(r.startedAt) },
];

export function RunSummaryTable({ runs }: { runs: RunSummary[] }) {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [status, setStatus] = React.useState("all");
  const [repository, setRepository] = React.useState("all");

  if (runs.length === 0) {
    return <Empty title="No QA runs yet" description="Runs started from the qaforge CLI will appear here once they complete." />;
  }

  const repositories = [...new Set(runs.map((r) => r.repository))].sort();
  const query = q.toLowerCase();
  const filtered = runs.filter(
    (r) =>
      (!query || r.id.toLowerCase().includes(query) || r.objective.toLowerCase().includes(query)) &&
      (status === "all" || r.status === status) &&
      (repository === "all" || r.repository === repository),
  );
  const anyFilter = q !== "" || status !== "all" || repository !== "all";

  return (
    <DataTable
      columns={columns}
      rows={filtered}
      pageSize={10}
      onRowClick={(r) => router.push(`/runs/${r.id}`)}
      totalLabel="runs"
      emptyText="No QA runs match these filters."
      toolbar={
        <div className="flex flex-wrap items-center gap-2">
          <Input icon="Search" size="sm" className="w-[240px]" placeholder="Search runs…" value={q} onChange={(e) => setQ(e.target.value)} />
          <Select
            size="sm"
            className="w-auto min-w-[140px]"
            options={[{ value: "all", label: "Any status" }, ...RUN_STATUS_VALUES.map((s) => ({ value: s, label: s }))]}
            value={status}
            onValueChange={setStatus}
          />
          <Select
            size="sm"
            className="w-auto min-w-[140px]"
            options={[{ value: "all", label: "All repositories" }, ...repositories.map((r) => ({ value: r, label: r }))]}
            value={repository}
            onValueChange={setRepository}
          />
          {anyFilter ? (
            <Button
              variant="ghost"
              size="sm"
              icon="X"
              className="text-text-tertiary"
              onClick={() => {
                setQ("");
                setStatus("all");
                setRepository("all");
              }}
            >
              Reset
            </Button>
          ) : null}
          <span className="flex-1" />
          <Badge caseSensitive>{filtered.length} run{filtered.length === 1 ? "" : "s"}</Badge>
        </div>
      }
    />
  );
}
