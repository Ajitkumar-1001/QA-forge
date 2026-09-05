"use client";

import * as React from "react";
import { Alert, Badge, Button, Card, Empty, Separator } from "../primitives";
import { Tabs } from "../overlays";
import { ActionRiskBadge, ConfidenceMeter, EvidenceReference, RunStatusBadge, SeverityBadge } from "../domain";
import { useQAForge, LIVE_STATUSES } from "../provider";
import type { Finding } from "@/data/qaforge";

// Ported from the imported design project's app/screens/mobile.jsx.
// Mobile is a review/approve subset of the same app, not the full console (design.md).

function MobileHeader({ title, onBack, right }: { title: string; onBack?: () => void; right?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, height: 52, padding: "0 16px", borderBottom: "1px solid var(--border)", background: "var(--surface-1)", flexShrink: 0 }}>
      {onBack ? <Button variant="ghost" size="sm" icon="ChevronLeft" onClick={onBack} aria-label="Back" /> : null}
      <span style={{ fontSize: 16, fontWeight: 600 }}>{title}</span>
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>{right}</div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div style={{ display: "flex", gap: 12, justifyContent: "space-between", padding: "8px 0" }}>
      <span className="qf-tertiary" style={{ fontSize: 12 }}>{label}</span>
      <span style={{ fontSize: 13, textAlign: "right", fontFamily: mono ? "var(--font-mono)" : undefined }}>{value}</span>
    </div>
  );
}

function FindingDetail({ finding, onBack, onCreateIssue }: { finding: Finding; onBack: () => void; onCreateIssue: (f: Finding) => void }) {
  const f = finding;
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <MobileHeader title={f.id} onBack={onBack} right={<SeverityBadge severity={f.severity} />} />
      <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        <Card>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.3 }}>{f.title}</span>
            {f.description ? <span className="qf-muted" style={{ fontSize: 13 }}>{f.description}</span> : null}
            <Separator />
            <Row label="Repository" value={f.repository} mono />
            <Row label="Run" value={f.runId} mono />
            <Row label="Status" value={<Badge tone="neutral">{f.status}</Badge>} />
            {f.expected ? <Row label="Expected" value={f.expected} mono /> : null}
            {f.observed ? <Row label="Observed" value={f.observed} mono /> : null}
          </div>
        </Card>
        {typeof f.confidence === "number" ? <Card><ConfidenceMeter value={f.confidence} /></Card> : null}
        {f.cause ? (
          <Card>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span className="qf-label-caps">LIKELY ROOT CAUSE</span>
              <span style={{ fontSize: 13, lineHeight: 1.5 }}>{f.cause}</span>
              {f.affected ? <span className="qf-tertiary" style={{ fontSize: 12, fontFamily: "var(--font-mono)" }}>{f.affected}</span> : null}
            </div>
          </Card>
        ) : null}
        {f.evidence && f.evidence.length ? (
          <Card>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <span className="qf-label-caps">EVIDENCE CONSIDERED</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{f.evidence.map((e, i) => <EvidenceReference key={i} kind={e.kind} label={e.label} meta={e.meta} />)}</div>
            </div>
          </Card>
        ) : null}
      </div>
      <div style={{ display: "flex", gap: 8, padding: 16, borderTop: "1px solid var(--border)", background: "var(--surface-1)", flexShrink: 0 }}>
        <Button variant="primary" icon="Github" style={{ flex: 1, height: 40 }} onClick={() => onCreateIssue(f)}>Create GitHub Issue</Button>
        <Button variant="outline" icon="ExternalLink" style={{ height: 40 }} aria-label="Open run" />
      </div>
    </div>
  );
}

export function MobileReview({ onSwitchToDesktop }: { onSwitchToDesktop: () => void }) {
  const { runs, findings, approvals, go } = useQAForge();
  const [tab, setTab] = React.useState("approvals");
  const [openFinding, setOpenFinding] = React.useState<string | null>(null);
  const finding = openFinding ? findings.find((f) => f.id === openFinding) : null;
  const onCreateIssue = (f: Finding) => go("approval", { runId: f.runId });
  if (finding) return <FindingDetail finding={finding} onBack={() => setOpenFinding(null)} onCreateIssue={onCreateIssue} />;
  const waiting = runs.filter((r) => approvals[r.id]?.status === "PENDING");
  const open = findings.filter((f) => !["RESOLVED", "DISMISSED"].includes(f.status));
  const active = runs.filter((r) => LIVE_STATUSES.includes(r.status));
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <MobileHeader title="QAForge" right={<Badge tone="active">STAGING</Badge>} />
      <div style={{ padding: "12px 16px 0", flexShrink: 0 }}>
        <Tabs variant="enclosed" value={tab} onValueChange={setTab} items={[
          { value: "approvals", label: `Approvals ${waiting.length ? `· ${waiting.length}` : ""}` },
          { value: "findings", label: "Findings" },
          { value: "runs", label: "Runs" },
        ]} />
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        {tab === "approvals" ? (
          waiting.length === 0 ? <Empty icon="ShieldCheck" title="Nothing awaiting approval" description="QAForge will ask here before any consequential action." /> : waiting.map((r) => {
            const ap = approvals[r.id] || {};
            const f = findings.find((x) => x.id === ap.findingId) || findings.find((x) => x.runId === r.id) || findings[0];
            return (
              <Card key={r.id}>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Badge tone="warning" icon="Clock">APPROVAL PENDING</Badge><span className="qf-tertiary" style={{ fontSize: 12, fontFamily: "var(--font-mono)", marginLeft: "auto" }}>{r.id}</span></div>
                  <span style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.4 }}>QAForge requests approval to create a GitHub issue</span>
                  <span className="qf-muted" style={{ fontSize: 13, lineHeight: 1.5 }}>{f.id} · {f.title}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}><ActionRiskBadge risk="REVERSIBLE" /><span className="qf-tertiary" style={{ fontSize: 12, fontFamily: "var(--font-mono)" }}>{ap.repository || r.repository}</span><span className="qf-tertiary" style={{ fontSize: 12, marginLeft: "auto" }}>expires in {ap.expiresIn || "24h"}</span></div>
                  <Separator />
                  <div style={{ display: "flex", gap: 8 }}>
                    <Button size="sm" variant="primary" style={{ flex: 1, height: 36 }} onClick={() => onCreateIssue(f)}>Review request</Button>
                    <Button size="sm" variant="outline" style={{ height: 36 }} onClick={() => setOpenFinding(f.id)}>Evidence</Button>
                  </div>
                </div>
              </Card>
            );
          })
        ) : tab === "findings" ? open.map((f) => (
          <Card key={f.id} onClick={() => setOpenFinding(f.id)} interactive>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}><SeverityBadge severity={f.severity} /><span className="qf-tertiary" style={{ fontSize: 12, fontFamily: "var(--font-mono)", marginLeft: "auto" }}>{f.id}</span></div>
              <span style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.4 }}>{f.title}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Badge tone="neutral">{f.status}</Badge><span className="qf-tertiary" style={{ fontSize: 12, fontFamily: "var(--font-mono)" }}>{f.repository}</span><span className="qf-tertiary" style={{ fontSize: 12, marginLeft: "auto" }}>{f.confidence}%</span></div>
            </div>
          </Card>
        )) : (
          <>
            {active.length ? <Alert tone="info" title={`${active.length} run${active.length > 1 ? "s" : ""} in progress`} description="Full execution timelines and evidence are desktop-only." /> : null}
            {runs.slice(0, 8).map((r) => (
              <Card key={r.id}>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}><RunStatusBadge status={r.status} /><span className="qf-tertiary" style={{ fontSize: 12, fontFamily: "var(--font-mono)", marginLeft: "auto" }}>{r.id}</span></div>
                  <span style={{ fontSize: 14, lineHeight: 1.4 }}>{r.objective}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span className="qf-tertiary" style={{ fontSize: 12, fontFamily: "var(--font-mono)" }}>{r.repository}</span><span className="qf-tertiary" style={{ fontSize: 12, fontFamily: "var(--font-mono)", marginLeft: "auto" }}>{r.duration}</span></div>
                </div>
              </Card>
            ))}
          </>
        )}
      </div>
      <div style={{ padding: 12, borderTop: "1px solid var(--border)", background: "var(--surface-1)", flexShrink: 0 }}>
        <Button size="sm" variant="ghost" icon="Monitor" style={{ width: "100%" }} onClick={onSwitchToDesktop}>Open the full console</Button>
      </div>
    </div>
  );
}
