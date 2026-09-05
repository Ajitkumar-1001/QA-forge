"use client";

import * as React from "react";
import { Badge, Button, Empty } from "../primitives";
import { PageHeader, RunTable, RunFilters, type RunFiltersValue } from "../domain";
import { useQAForge } from "../provider";

// Ported from the imported design project's app/screens/runs.jsx.

export function RunsScreen() {
  const { go, runs } = useQAForge();
  const [filters, setFilters] = React.useState<RunFiltersValue>({});
  const q = (filters.q || "").toLowerCase();
  const rows = runs.filter((r) =>
    (!q || r.id.toLowerCase().includes(q) || r.objective.toLowerCase().includes(q)) &&
    (!filters.repository || filters.repository === "all" || r.repository === filters.repository) &&
    (!filters.environment || filters.environment === "all" || r.environment === filters.environment) &&
    (!filters.status || filters.status === "all" || r.status === filters.status.replace(" ", "_")) &&
    (!filters.severity || filters.severity === "all" || (filters.severity === "CRITICAL" ? r.criticalFindings : r.findings)),
  );
  return (
    <div className="qf-page">
      <PageHeader title="Runs" badge={<Badge caseSensitive>{runs.length}</Badge>} description="Every autonomous QA run, newest first. Click a run to open its console." actions={<Button variant="primary" icon="Play" onClick={() => go("new-run")}>New QA Run</Button>} />
      {runs.length === 0 ? (
        <Empty title="No QA runs yet" description="Start your first autonomous QA run by selecting a repository, environment and test objective." actions={<Button variant="primary" icon="Play" onClick={() => go("new-run")}>Start QA Run</Button>} />
      ) : (
        <RunTable runs={rows} pageSize={10} onOpen={(r) => go("run", { runId: r.id })} toolbar={<RunFilters value={filters} onChange={setFilters} repositories={["qa-forge/web", "qa-forge/api", "qa-forge/docs"]} />} />
      )}
    </div>
  );
}
