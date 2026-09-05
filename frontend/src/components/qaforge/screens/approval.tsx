"use client";

import * as React from "react";
import { Icon } from "../icon";
import { Alert, Badge, Button, Card, Separator } from "../primitives";
import { Field, Textarea } from "../forms";
import { AlertDialog } from "../overlays";
import { ActionRiskBadge, ConfidenceMeter } from "../domain";
import { useQAForge, draftIssue } from "../provider";
import type { Approval } from "@/data/qaforge";

// Ported from the imported design project's app/screens/approval.jsx.
// WORKFLOW §5: the only screen in the product with an external write. A deliberate confirmation step.

const STATE_COPY: Record<string, { tone: "warning" | "success" | "neutral"; icon: string; label: string }> = {
  PENDING: { tone: "warning", icon: "Clock", label: "PENDING" },
  APPROVED: { tone: "success", icon: "Check", label: "APPROVED" },
  REJECTED: { tone: "neutral", icon: "X", label: "REJECTED" },
  EXPIRED: { tone: "neutral", icon: "Clock", label: "EXPIRED" },
};

function ApRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "108px minmax(0,1fr)", gap: 12, alignItems: "baseline", padding: "7px 0" }}>
      <span className="qf-label-caps" style={{ color: "var(--text-tertiary)" }}>{label}</span>
      <span style={{ fontSize: 13, color: "var(--text-primary)", minWidth: 0 }}>{children}</span>
    </div>
  );
}

export function ApprovalScreen({ runId }: { runId: string }) {
  const { runs, findings, approvals, go, approve, reject } = useQAForge();
  const [confirm, setConfirm] = React.useState(false);
  const [note, setNote] = React.useState("");
  const run = runs.find((r) => r.id === runId);
  const approval: Approval | undefined = run ? approvals[run.id] : undefined;
  const finding = run ? (findings.find((x) => x.id === approval?.findingId) || findings.find((x) => x.runId === run.id)) : undefined;
  if (!run || !finding) {
    return (
      <div className="qf-page">
        <Alert tone="destructive" title="Approval request not found" description="The run has no drafted action awaiting approval." actions={<Button size="sm" variant="outline" onClick={() => go("runs")}>Back to Runs</Button>} />
      </div>
    );
  }
  const state = approval?.status || "PENDING";
  const s = STATE_COPY[state] || STATE_COPY.PENDING;
  const draft = draftIssue(finding, run);
  const resolved = state !== "PENDING";
  return (
    <div className="qf-page" style={{ maxWidth: 1180 }}>
      <div className="qf-page-header">
        <div className="qf-page-header__text">
          <h1 className="qf-page-header__title">Approval Draft</h1>
          <p className="qf-page-header__description">QAForge drafted one action for {run.id}. Nothing is written to GitHub until you approve it.</p>
        </div>
        <div className="qf-page-header__actions"><Button variant="ghost" icon="ArrowLeft" onClick={() => go("run", { runId: run.id })}>Back to run</Button></div>
      </div>
      {state === "EXPIRED" ? <Alert tone="warning" title="Request expired" description="This approval request was created more than 24 hours ago and was not executed. Rerun the investigation to draft it again." actions={<Button size="sm" variant="outline" icon="RotateCcw" onClick={() => go("new-run")}>Rerun</Button>} /> : null}
      {state === "APPROVED" ? <Alert tone="success" title="Approved and created" description={`${approval?.issue} was created in ${approval?.repository} by ${approval?.decidedBy} at ${approval?.decided}.`} actions={<Button size="sm" variant="outline" icon="ExternalLink" onClick={() => window.open("https://github.com", "_blank")}>Open on GitHub</Button>} /> : null}
      {state === "REJECTED" ? <Alert tone="default" title="Request rejected" description="No issue was created. The finding stays open in QAForge." /> : null}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 340px", gap: 20, alignItems: "start" }}>
        <Card padding="none">
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
            <Icon name="Github" size={16} style={{ color: "var(--text-secondary)" }} />
            <span style={{ fontSize: 13, fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>{approval?.repository || finding.repository} · new issue</span>
            <Badge tone={s.tone} icon={s.icon} style={{ marginLeft: "auto" }}>{s.label}</Badge>
          </div>
          <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column", gap: 6 }}>
            <span className="qf-label-caps" style={{ color: "var(--text-tertiary)" }}>ISSUE TITLE</span>
            <span style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.35 }}>{draft.title}</span>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
              <Badge tone="error">{finding.severity}</Badge>
              <Badge>qaforge</Badge>
              <Badge>bug</Badge>
            </div>
          </div>
          <div style={{ padding: 16 }}>
            <span className="qf-label-caps" style={{ color: "var(--text-tertiary)" }}>ISSUE BODY</span>
            <pre style={{ margin: "8px 0 0", padding: 16, background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: 6, fontFamily: "var(--font-mono)", fontSize: 12.5, lineHeight: 1.6, color: "var(--text-secondary)", whiteSpace: "pre-wrap", overflowX: "auto" }}>{draft.body}</pre>
          </div>
        </Card>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Card title="Requested action" titleSize="sm" padding="compact">
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 500 }}>Create GitHub Issue</span>
              <ActionRiskBadge risk="REVERSIBLE" size="sm" />
            </div>
            <Separator />
            <ApRow label="TARGET"><code className="qf-mono">{approval?.repository || finding.repository}</code></ApRow>
            <ApRow label="RUN"><code className="qf-mono">{run.id}</code> · {run.environment}</ApRow>
            <ApRow label="FINDING"><code className="qf-mono">{finding.id}</code> · {finding.severity}</ApRow>
            <ApRow label="DRAFTED">{approval?.requested || "Today 14:34"}</ApRow>
            <Separator />
            <div style={{ marginTop: 4 }}><ConfidenceMeter value={finding.confidence} /></div>
          </Card>

          <Card title="Expiry" titleSize="sm" padding="compact">
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>
              <Icon name="Clock" size={14} style={{ color: state === "PENDING" ? "var(--warning)" : "var(--text-tertiary)", marginTop: 2, flexShrink: 0 }} />
              <span>{state === "PENDING"
                ? `This request expires ${approval?.expiresIn ? `in ${approval.expiresIn}` : "in 24h"} (${approval?.expires || "Tomorrow 14:34"}). An expired request is never executed — the report stays in QAForge.`
                : `Requests expire 24 hours after they are drafted. This one was resolved at ${approval?.decided || "the time of the decision"}.`}</span>
            </div>
          </Card>

          <Card title="Repository authority" titleSize="sm" padding="compact">
            <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Icon name="ShieldCheck" size={14} style={{ color: "var(--success)" }} /><span>Read access to <code className="qf-mono">{finding.repository}</code> at <code className="qf-mono">{run.commit}</code></span></div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Icon name="Github" size={14} style={{ color: "var(--blue-500)" }} /><span>Approving performs exactly one write: creating this issue.</span></div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Icon name="Ban" size={14} style={{ color: "var(--text-tertiary)" }} /><span>Pushing code and opening pull requests are denied in {run.environment}.</span></div>
              <Button variant="link" size="sm" onClick={() => go("policies")}>View {run.environment} policy</Button>
            </div>
          </Card>

          {resolved ? null : (
            <Card padding="compact">
              <Field label="Decision note" description="Attached to the QAForge audit log. Optional.">
                <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Assigning to the auth owner." />
              </Field>
              <Separator />
              <div style={{ display: "flex", gap: 8 }}>
                <Button variant="primary" icon="Github" style={{ flex: 1 }} onClick={() => setConfirm(true)}>Approve &amp; Create</Button>
                <Button variant="outline" icon="X" onClick={() => reject(run, finding)}>Reject</Button>
              </div>
            </Card>
          )}
        </div>
      </div>

      <AlertDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Create this issue in GitHub?"
        description={`QAForge will create one issue in ${approval?.repository || finding.repository} now. This is the only write it performs.`}
        confirmLabel="Create Issue"
        cancelLabel="Cancel"
        onConfirm={() => { setConfirm(false); approve(run, finding); }}
      />
    </div>
  );
}
