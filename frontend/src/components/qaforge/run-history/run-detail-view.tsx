import { Badge, Card } from "../primitives";
import { RunStatusBadge } from "../domain";
import type { FullRun } from "@/lib/repositories/test-run";

// 004-run-history-view (spec.md FR-003/005/006/008): server-renderable (no "use client" —
// no interactive state needed; evidence is grouped into stacked sections, not a tabbed
// widget, so no client-side tab state is required either). ConsoleViewer/NetworkTable/
// SourceViewer are NOT reused here despite looking generic — each requires a mock-specific
// structured shape (ConsoleEntry/NetworkRequest/SourceFile) that real Evidence.content (a
// plain string) doesn't have and shouldn't be force-parsed into (research.md #7's
// principle, corrected: those three are mock-typed too, not safe primitives like
// Badge/Card). Evidence content renders as plain text via ordinary JSX interpolation,
// which is what Constitution Principle II actually requires anyway.
//
// Deliberately absent, per FR-006/007/008: no screenshot image, no live/in-progress
// indicator, no agent-trace timeline, no "rerun"/"create issue"/"approve" control — none of
// that data exists yet, and none of it is fabricated here.

const RESULT_TONE = { PASS: "success", FAIL: "error", INCONCLUSIVE: "warning" } as const;

function EvidenceGroup({ type, items }: { type: FullRun["evidence"][number]["type"]; items: FullRun["evidence"] }) {
  return (
    <Card title={type} titleSize="sm">
      <div className="flex flex-col gap-3">
        {items.map((item) => (
          <pre key={item.id} className="overflow-auto rounded-md border border-border bg-surface-1 p-3 font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap">
            {item.content}
          </pre>
        ))}
      </div>
    </Card>
  );
}

export function RunDetailView({ run }: { run: FullRun }) {
  const evidenceByType = new Map<string, FullRun["evidence"]>();
  for (const item of run.evidence) {
    const list = evidenceByType.get(item.type) ?? [];
    list.push(item);
    evidenceByType.set(item.type, list);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <RunStatusBadge status={run.status} />
        {run.completedAt ? (
          <span className="text-xs text-text-tertiary">
            {run.startedAt.toLocaleString()} → {run.completedAt.toLocaleString()}
          </span>
        ) : (
          <span className="text-xs text-text-tertiary">started {run.startedAt.toLocaleString()}</span>
        )}
      </div>

      {run.steps.length > 0 && (
        <Card title="Steps" titleSize="sm">
          <div className="flex flex-col gap-2">
            {run.steps.map((step) => (
              <div key={step.id} className="flex items-start justify-between gap-3 border-b border-border py-2 last:border-0">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm text-foreground">{step.action}</span>
                  <span className="text-xs text-text-tertiary">Expected: {step.expectedOutcome}</span>
                  {step.observed && <span className="text-xs text-text-tertiary">Observed: {step.observed}</span>}
                </div>
                <Badge tone={step.status === "PASSED" ? "success" : step.status === "FAILED" ? "error" : "neutral"} size="sm">
                  {step.status}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      {[...evidenceByType.entries()].map(([type, items]) => (
        <EvidenceGroup key={type} type={type as FullRun["evidence"][number]["type"]} items={items} />
      ))}

      {run.hypotheses.length > 0 && (
        <Card title="Hypotheses" titleSize="sm">
          <div className="flex flex-col gap-3">
            {run.hypotheses.map((h) => (
              <div key={h.id} className="flex items-start justify-between gap-3 border-b border-border pb-3 last:border-0 last:pb-0">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm text-foreground">{h.description}</span>
                  <span className="text-xs text-text-tertiary">confidence {h.confidence.toFixed(2)}</span>
                </div>
                <Badge tone={h.status === "SUPPORTED" ? "success" : h.status === "REJECTED" ? "error" : "neutral"} size="sm">
                  {h.status}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      {run.report && (
        <Card title="Report" titleSize="sm">
          <div className="flex flex-col gap-2">
            <Badge tone={RESULT_TONE[run.report.result]} solid>
              {run.report.result}
            </Badge>
            {run.report.confidence !== null && (
              <span className="text-xs text-text-tertiary">confidence {run.report.confidence.toFixed(2)}</span>
            )}
            {run.report.winningHypothesisId &&
              (() => {
                const winner = run.hypotheses.find((h) => h.id === run.report!.winningHypothesisId);
                return winner ? <span className="text-sm text-foreground">Root cause: {winner.description}</span> : null;
              })()}
          </div>
        </Card>
      )}
    </div>
  );
}
