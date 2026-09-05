"use client";

import * as React from "react";
import { Badge, Button } from "../primitives";
import { Input, Select } from "../forms";
import { Sheet } from "../overlays";
import { FindingCard, FindingTable, PageHeader } from "../domain";
import { useQAForge } from "../provider";
import type { Finding } from "@/data/qaforge";

// Ported from the imported design project's app/screens/findings.jsx.

export function FindingsScreen() {
  const { go, findings, reviewFinding } = useQAForge();
  const [sev, setSev] = React.useState("all");
  const [status, setStatus] = React.useState("all");
  const [q, setQ] = React.useState("");
  const [open, setOpen] = React.useState<Finding | null>(null);
  const rows = findings.filter((f) => (sev === "all" || f.severity === sev) && (status === "all" || f.status === status) && (!q || f.title.toLowerCase().includes(q.toLowerCase())));
  const openCount = findings.filter((f) => f.status === "OPEN").length;
  const toolbar = (
    <div className="qf-run-filters" style={{ width: "100%" }}>
      <Input icon="Search" size="sm" className="qf-run-filters__search" placeholder="Search findings…" value={q} onChange={(e) => setQ(e.target.value)} />
      <Select size="sm" value={sev} onValueChange={setSev} options={[{ value: "all", label: "Any severity" }, "CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"]} />
      <Select size="sm" value={status} onValueChange={setStatus} options={[{ value: "all", label: "Any status" }, "OPEN", "ACKNOWLEDGED", "ISSUE CREATED", "FIX IN PROGRESS", "RESOLVED", "DISMISSED"]} />
      <span className="qf-run-filters__spacer" />
      <span className="qf-tertiary" style={{ fontSize: 12 }}>{openCount} open · {findings.filter((f) => f.severity === "CRITICAL" && f.status !== "RESOLVED").length} critical</span>
    </div>
  );
  return (
    <div className="qf-page" style={{ position: "relative" }}>
      <PageHeader title="Findings" badge={<Badge tone="error">{openCount} open</Badge>} description="Every finding links to the run, the evidence and a confidence band. Lifecycle: OPEN → ACKNOWLEDGED → ISSUE CREATED → FIX IN PROGRESS → RESOLVED / DISMISSED." />
      <FindingTable findings={rows} toolbar={toolbar} onOpen={(f) => setOpen(f)} selectedId={open?.id} />
      <Sheet
        open={!!open}
        onOpenChange={() => setOpen(null)}
        width={520}
        title={open?.id || ""}
        description={open ? `${open.repository} · run ${open.runId}` : ""}
        footer={<><Button variant="outline" onClick={() => open && go("run", { runId: open.runId })}>Open run</Button><Button variant="primary" icon="Github" onClick={() => open && reviewFinding(open)}>Create Issue</Button></>}
      >
        {open ? <FindingCard finding={{ ...open, evidence: open.evidence || [{ kind: "trace", label: `run ${open.runId}` }] }} compact onCreateIssue={() => reviewFinding(open)} onInspectEvidence={() => go("run", { runId: open.runId })} /> : null}
      </Sheet>
    </div>
  );
}
