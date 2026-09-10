import { PageHeader } from "../domain";
import { RunSummaryTable } from "./run-summary-table";
import type { RunSummary } from "@/lib/repositories/test-run";

const ACTIVE_STATUSES: ReadonlyArray<RunSummary["status"]> = ["PLANNING", "RUNNING", "INVESTIGATING"];

// Real wholesale replacement for the mock Dashboard (same precedent as ApprovalView/
// RunDetailView vs. their own mock screens) — not a prop-swap of the old one. The mock's
// Pass Rate chart, Critical Findings panel, Agent Activity panel, and Environment Health
// panel are all dropped rather than wired: Finding/Environment/AgentSummary have no real
// backing (RunSummary's own comment: "no environment/branch/commit/findings — those have
// no real backing"), so there's nothing real to show in their place. What's left is exactly
// what listRunsForCaller actually returns.
export function DashboardView({ runs }: { runs: RunSummary[] }) {
  const active = runs.filter((r) => ACTIVE_STATUSES.includes(r.status)).length;
  const passed = runs.filter((r) => r.status === "PASSED").length;
  const failed = runs.filter((r) => r.status === "FAILED").length;
  const errored = runs.filter((r) => r.status === "ERROR").length;

  return (
    <div className="qf-page">
      <PageHeader title="Overview" description="Your QA runs, most recent first." />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <Metric label="Active" value={active} />
        <Metric label="Passed" value={passed} />
        <Metric label="Failed" value={failed} />
        <Metric label="Error" value={errored} />
      </div>
      <RunSummaryTable runs={runs} />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="qf-metric">
      <span className="qf-metric__label">{label}</span>
      <span className="qf-metric__value">{value}</span>
    </div>
  );
}
