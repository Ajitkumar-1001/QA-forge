import { Icon } from "../icon";
import { Alert, Badge, Card, Separator } from "../primitives";
import { ActionRiskBadge, ConfidenceMeter } from "../domain";
import { ApprovalActions } from "./approval-actions";
import type { Approval } from "@/db/schema";
import type { FullRun } from "@/lib/repositories/test-run";

const STATE_COPY: Record<Approval["status"], { tone: "warning" | "success" | "neutral"; icon: string; label: string }> = {
  PENDING: { tone: "warning", icon: "Clock", label: "PENDING" },
  APPROVED: { tone: "success", icon: "Check", label: "APPROVED" },
  REJECTED: { tone: "neutral", icon: "X", label: "REJECTED" },
  EXPIRED: { tone: "neutral", icon: "Clock", label: "EXPIRED" },
};

const APPROVAL_EXPIRY_MS = 24 * 60 * 60 * 1000;

function ApRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "108px minmax(0,1fr)", gap: 12, alignItems: "baseline", padding: "7px 0" }}>
      <span className="qf-label-caps" style={{ color: "var(--text-tertiary)" }}>{label}</span>
      <span style={{ fontSize: 13, color: "var(--text-primary)", minWidth: 0 }}>{children}</span>
    </div>
  );
}

// D9/GitHub-Write-Path: replaces the mock ApprovalScreen wholesale (same call
// screens/approval.tsx's own mock made vs. RunDetailView's precedent) — the mock's `Finding`
// concept (severity, repository, confidence as its own entity) has no real backing; the
// real draft is templated from the Report already attached to this run. Same primitives,
// same layout shape, so "keep the design as it is" holds visually even though the data
// underneath is entirely real now.
export function ApprovalView({ run, approval }: { run: FullRun; approval: Approval }) {
  const s = STATE_COPY[approval.status];
  const expiresAt = new Date(approval.createdAt.getTime() + APPROVAL_EXPIRY_MS);
  const winningHypothesis = run.report?.winningHypothesisId
    ? run.hypotheses.find((h) => h.id === run.report!.winningHypothesisId)
    : undefined;

  return (
    <div style={{ maxWidth: 1180 }}>
      <div className="qf-page-header">
        <div className="qf-page-header__text">
          <h1 className="qf-page-header__title">Approval Draft</h1>
          <p className="qf-page-header__description">QAForge drafted one action for {run.id}. Nothing is written to GitHub until you approve it.</p>
        </div>
      </div>

      {approval.status === "EXPIRED" ? (
        <Alert tone="warning" title="Request expired" description="This approval request was created more than 24 hours ago and was not executed. Rerun the investigation to draft it again." />
      ) : null}
      {approval.status === "APPROVED" ? (
        <Alert
          tone="success"
          title="Approved and created"
          description={`Issue created${approval.decidedAt ? ` at ${approval.decidedAt.toLocaleString()}` : ""}.`}
          actions={
            approval.githubIssueUrl ? (
              <a href={approval.githubIssueUrl} target="_blank" rel="noreferrer" className="text-xs underline">
                Open on GitHub
              </a>
            ) : undefined
          }
        />
      ) : null}
      {approval.status === "REJECTED" ? <Alert tone="default" title="Request rejected" description="No issue was created." /> : null}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 340px", gap: 20, alignItems: "start", marginTop: 16 }}>
        <Card padding="none">
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
            <Icon name="Github" size={16} style={{ color: "var(--text-secondary)" }} />
            <span style={{ fontSize: 13, fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>new issue</span>
            <Badge tone={s.tone} icon={s.icon} style={{ marginLeft: "auto" }}>{s.label}</Badge>
          </div>
          <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column", gap: 6 }}>
            <span className="qf-label-caps" style={{ color: "var(--text-tertiary)" }}>ISSUE TITLE</span>
            <span style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.35 }}>{approval.draftTitle}</span>
          </div>
          <div style={{ padding: 16 }}>
            <span className="qf-label-caps" style={{ color: "var(--text-tertiary)" }}>ISSUE BODY</span>
            <pre style={{ margin: "8px 0 0", padding: 16, background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: 6, fontFamily: "var(--font-mono)", fontSize: 12.5, lineHeight: 1.6, color: "var(--text-secondary)", whiteSpace: "pre-wrap", overflowX: "auto" }}>
              {approval.draftBody}
            </pre>
          </div>
        </Card>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Card title="Requested action" titleSize="sm" padding="compact">
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 500 }}>Create GitHub Issue</span>
              <ActionRiskBadge risk="REVERSIBLE" size="sm" />
            </div>
            <Separator />
            <ApRow label="RUN"><code className="qf-mono">{run.id}</code></ApRow>
            <ApRow label="DRAFTED">{approval.createdAt.toLocaleString()}</ApRow>
            {run.report?.confidence != null ? (
              <>
                <Separator />
                <div style={{ marginTop: 4 }}>
                  {/* Report.confidence is a 0-1 float (mastra/types.ts); ConfidenceMeter
                      expects a 0-100 percentage (domain.tsx: Math.round(value), clamped to
                      [0,100]) — passing the raw fraction renders as "1%" for 0.85. */}
                  <ConfidenceMeter value={run.report.confidence * 100} />
                </div>
              </>
            ) : null}
            {winningHypothesis ? <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 8 }}>{winningHypothesis.description}</p> : null}
          </Card>

          <Card title="Expiry" titleSize="sm" padding="compact">
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>
              <Icon name="Clock" size={14} style={{ color: approval.status === "PENDING" ? "var(--warning)" : "var(--text-tertiary)", marginTop: 2, flexShrink: 0 }} />
              <span>
                {approval.status === "PENDING"
                  ? `This request expires at ${expiresAt.toLocaleString()}. An expired request is never executed — the report stays in QAForge.`
                  : `Requests expire 24 hours after they are drafted.${approval.decidedAt ? ` This one was resolved at ${approval.decidedAt.toLocaleString()}.` : ""}`}
              </span>
            </div>
          </Card>

          <Card title="Repository authority" titleSize="sm" padding="compact">
            <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Icon name="Github" size={14} style={{ color: "var(--blue-500)" }} />
                <span>Approving performs exactly one write: creating this issue.</span>
              </div>
            </div>
          </Card>

          {approval.status === "PENDING" ? (
            <Card padding="compact">
              <ApprovalActions runId={run.id} />
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
