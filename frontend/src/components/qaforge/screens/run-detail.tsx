"use client";

import * as React from "react";
import { Icon } from "../icon";
import { Alert, Badge, Button, Card, Empty, Separator, Spinner } from "../primitives";
import { Resizable, Tabs } from "../overlays";
import {
  AgentInspector, AgentStatus, AgentTrace, ConfidenceMeter, ConsoleViewer, EvidenceTabs, ExecutionTimeline,
  FindingCard, NetworkTable, RunHeader, ScreenshotViewer, SourceViewer, type ExecutionStepDef,
} from "../domain";
import { useQAForge } from "../provider";
import { pipeline, source, trace, consoleEntries, network, steps as baseSteps, inspector as baseInspector, REASON_CODES, type Finding, type Run } from "@/data/qaforge";

// Ported from the imported design project's app/screens/run-detail.jsx.
// WORKFLOW §1: PLAN → EXECUTE → OBSERVE → DETECT → COLLECT → INVESTIGATE → HYPOTHESIS → VALIDATE → REPORT.
// The run stays INVESTIGATING for the whole loop; `stage` indexes the five-agent pipeline.

interface LiveFrame { at: number; doneUpTo: number; active?: number; failed?: number; stage: number; op?: string; done?: boolean; status: Run["status"] }

const LIVE_SCRIPT: LiveFrame[] = ([
  { at: 0, doneUpTo: 0, active: 1, stage: 0, op: "Starting browser session…" },
  { at: 1600, doneUpTo: 1, active: 2, stage: 0, op: "Entering credentials…" },
  { at: 3000, doneUpTo: 2, active: 3, stage: 0, op: "Submitting login…" },
  { at: 4400, doneUpTo: 3, active: 4, stage: 0, op: "Verifying session…" },
  { at: 5600, doneUpTo: 4, active: 5, stage: 0, op: "Navigating to dashboard…" },
  { at: 7000, doneUpTo: 4, failed: 5, stage: 1, op: "Collecting runtime evidence…" },
  { at: 9400, doneUpTo: 4, failed: 5, stage: 2, op: "Inspecting repository at 28fa91c…" },
  { at: 11800, doneUpTo: 4, failed: 5, stage: 3, op: "Forming root-cause hypotheses…" },
  { at: 14400, doneUpTo: 4, failed: 5, stage: 4, op: "Validating hypothesis against evidence…" },
  { at: 17000, doneUpTo: 4, failed: 5, stage: 5, done: true },
] as Omit<LiveFrame, "status">[]).map((s) => ({ ...s, status: s.done ? "FAILED" : "INVESTIGATING" }) as LiveFrame);

function useLiveRun(run: Run, frozen: boolean) {
  const [phase, setPhase] = React.useState(run.live ? 0 : LIVE_SCRIPT.length - 1);
  React.useEffect(() => {
    if (!run.live || frozen) return undefined;
    const timers = LIVE_SCRIPT.map((s, i) => setTimeout(() => setPhase(i), s.at));
    return () => timers.forEach(clearTimeout);
  }, [run.id, run.live, frozen]);
  return LIVE_SCRIPT[phase];
}

// §4: this exact order, five rows, no Supervisor row.
function AgentActivityPanel({ stage, cancelled }: { stage: number; cancelled: boolean }) {
  return (
    <Card title="Agent Activity" titleSize="sm" padding="none">
      <div style={{ display: "flex", flexDirection: "column" }}>
        {pipeline.map((p, i) => {
          const state = cancelled && i >= stage ? "cancelled" : i < stage ? "done" : i === stage ? "active" : "waiting";
          const failedRow = state === "done" && p.state === "failed";
          const color = state === "waiting" || state === "cancelled" ? "var(--text-disabled)" : state === "active" ? "var(--blue-500)" : failedRow ? "var(--error)" : "var(--success)";
          return (
            <div key={p.id} style={{ display: "grid", gridTemplateColumns: "20px minmax(0,1fr) auto", gap: 10, alignItems: "start", padding: "10px 12px", borderTop: i ? "1px solid var(--border-subtle)" : "none" }}>
              <Icon name={p.icon} size={16} style={{ color, marginTop: 1 }} />
              <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: state === "waiting" || state === "cancelled" ? "var(--text-tertiary)" : "var(--text-primary)" }}>{p.name}</span>
                <span style={{ fontSize: 12, color: "var(--text-tertiary)", lineHeight: 1.4 }}>
                  {state === "waiting" ? "waiting" : state === "cancelled" ? "not started" : state === "active" ? p.op : p.result}
                </span>
              </div>
              {state === "active" ? <AgentStatus status="ACTIVE" size="sm" /> : state === "done" ? <Icon name={failedRow ? "CircleX" : "Check"} size={14} style={{ color, marginTop: 2 }} /> : <Icon name="Circle" size={13} style={{ color: "var(--text-disabled)", marginTop: 2 }} />}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function Strip({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: "12px 24px 0" }}>{children}</div>;
}

// REPORT — the branch point. PASS terminates; FAIL and INCONCLUSIVE route to HUMAN APPROVAL; ERROR has no report.
function ReportStrip({ run, status, finding, approval, onReview, onOpenTrace }: {
  run: Run;
  status: string;
  finding?: Finding;
  approval?: { status: string; expiresIn?: string; expires?: string; decidedBy?: string; decided?: string; issue?: string };
  onReview: () => void;
  onOpenTrace: () => void;
}) {
  if (status === "PASSED") return <Strip><Alert tone="success" title="All steps passed." description="No investigation triggered. Nothing to approve." /></Strip>;
  if (status === "CANCELLED") return <Strip><Alert tone="default" title="Run cancelled" description="Cancelled by Dana Okafor before the journey completed. No report was generated." /></Strip>;
  if (status === "ERROR") {
    const r = (run.reason && REASON_CODES[run.reason]) || REASON_CODES.APP_UNREACHABLE;
    return <Strip><Alert tone="destructive" title="Run ended in error — no report" description={`${run.reason}: ${r.text} ${r.detail} — ${r.retryable ? "This error is retryable." : "This error is not retryable; the objective must change."}`} /></Strip>;
  }
  if (status !== "FAILED" || !finding) return null;
  const inconclusive = run.report === "INCONCLUSIVE";
  const ap = approval || ({} as NonNullable<typeof approval>);
  return (
    <Strip>
      <Card padding="compact">
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 20, alignItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span className="qf-label-caps">REPORT</span>
              <Badge tone={inconclusive ? "warning" : "error"} icon={inconclusive ? "TriangleAlert" : "CircleX"}>{inconclusive ? "INCONCLUSIVE" : "ROOT CAUSE CONFIRMED"}</Badge>
              {ap.status === "PENDING" ? <Badge tone="warning" icon="Clock">APPROVAL PENDING</Badge> : null}
              {ap.status === "APPROVED" ? <Badge tone="success" icon="Check">APPROVED</Badge> : null}
              {ap.status === "REJECTED" ? <Badge tone="neutral" icon="X">REJECTED</Badge> : null}
            </div>
            {inconclusive ? (
              <span style={{ fontSize: 14, lineHeight: 1.5 }}>No root cause confirmed. {run.hypothesesRejected || 3} hypotheses investigated, all rejected — see Agent Trace.</span>
            ) : (
              <span style={{ fontSize: 14, lineHeight: 1.5 }}>{finding.cause}</span>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", fontSize: 12, color: "var(--text-tertiary)" }}>
              {finding.affected ? <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Icon name="FileCode" size={13} />Related source <code className="qf-mono">{finding.affected}</code></span> : null}
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Icon name="Bug" size={13} /><code className="qf-mono">{finding.id}</code> · {finding.severity}</span>
              {ap.status === "PENDING" ? <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--warning)" }}><Icon name="Clock" size={13} />Expires in {ap.expiresIn} ({ap.expires})</span> : null}
              {ap.status === "APPROVED" ? <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Icon name="User" size={13} />Approved by {ap.decidedBy} · {ap.decided}</span> : null}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ width: 168 }}><ConfidenceMeter value={finding.confidence} /></div>
            {ap.status === "APPROVED" && ap.issue ? (
              <Button variant="outline" icon="ExternalLink" onClick={() => window.open("https://github.com", "_blank")}>{ap.issue}</Button>
            ) : ap.status === "REJECTED" ? (
              <Button variant="outline" icon="FileText" onClick={onReview}>View report</Button>
            ) : (
              <Button variant="primary" icon="Github" onClick={onReview}>{ap.status === "PENDING" ? "Review Approval Request" : "Review & Create GitHub Issue"}</Button>
            )}
          </div>
        </div>
        {inconclusive ? <><Separator /><Button variant="link" size="sm" icon="Activity" onClick={onOpenTrace}>Open Agent Trace</Button></> : null}
      </Card>
    </Strip>
  );
}

export function RunDetailScreen({ runId }: { runId: string }) {
  const { runs, findings, approvals, go, stopRun, review, onRunStatus } = useQAForge();
  const run = runs.find((r) => r.id === runId);
  if (!run) return <div className="qf-page"><Alert tone="destructive" title="Run not found" description={`No run matches ${runId}.`} actions={<Button size="sm" variant="outline" onClick={() => go("runs")}>Back to Runs</Button>} /></div>;
  return <RunDetail key={run.id} run={run} findings={findings} approvals={approvals} go={go} onStop={stopRun} onReview={review} onStatus={onRunStatus} />;
}

function RunDetail({ run, findings, approvals, go, onStop, onReview, onStatus }: {
  run: Run;
  findings: ReturnType<typeof useQAForge>["findings"];
  approvals: ReturnType<typeof useQAForge>["approvals"];
  go: ReturnType<typeof useQAForge>["go"];
  onStop: (runId: string) => void;
  onReview: (run: Run) => void;
  onStatus: (runId: string, status: Run["status"], done?: boolean) => void;
}) {
  const isLive = !!run.live;
  const cancelled = run.status === "CANCELLED";
  const live = useLiveRun(run, cancelled);
  const [tab, setTab] = React.useState("findings");
  const [shot, setShot] = React.useState(5);
  const [view, setView] = React.useState("split");
  const status = cancelled ? "CANCELLED" : isLive ? live.status : run.status;
  const inProgress = status === "INVESTIGATING" || status === "QUEUED";
  React.useEffect(() => { if (isLive && !cancelled) onStatus(run.id, live.status, live.done); }, [live, isLive, cancelled, onStatus, run.id]);
  const errored = status === "ERROR";
  const passed = status === "PASSED";
  const showEvidence = !errored && !passed && (!isLive || live.done || live.failed !== undefined);
  const stage = cancelled ? 0 : isLive ? live.stage : errored || passed ? 0 : 5;
  const stepsList: ExecutionStepDef[] = baseSteps.map((s, i) => {
    const n = i + 1;
    if (errored) return { ...s, state: n === 1 ? "failed" : "skipped", defaultOpen: false, duration: n === 1 ? "0.4s" : undefined, detail: n === 1 ? [{ key: "Reason", value: run.reason }, { key: "Detail", value: run.reason ? REASON_CODES[run.reason].detail : undefined }] : undefined };
    if (passed) return { ...s, state: "passed", defaultOpen: false, detail: n === 5 ? [{ key: "Expected", value: "/dashboard" }, { key: "Observed", value: "/dashboard" }] : s.detail };
    if (cancelled) return { ...s, state: n <= 2 ? "passed" : "skipped", defaultOpen: false };
    if (!isLive) return s;
    return { ...s, state: n <= live.doneUpTo ? "passed" : n === live.failed ? "failed" : n === live.active ? "active" : "pending", defaultOpen: n === live.failed && !!live.done };
  });
  const runFindings = findings.filter((f) => f.runId === run.id && (run.id !== "QF-0218" || showEvidence));
  const primaryFinding = runFindings[0];
  const approval = approvals[run.id];
  const inspector = isLive && !live.done
    ? { agent: pipeline[Math.min(live.stage, 4)].name, status: "ACTIVE", objective: live.op, evidence: live.stage >= 2 ? baseInspector.evidence.slice(0, live.stage) : [], hypothesis: live.stage >= 3 ? baseInspector.hypothesis : undefined, confidence: live.stage >= 4 ? 82 : live.stage === 3 ? 61 : undefined, tools: live.stage >= 2 ? baseInspector.tools.slice(0, live.stage) : [] }
    : cancelled ? { agent: "Browser Agent", status: "IDLE", objective: "Run cancelled by Dana Okafor. No further actions will be taken.", evidence: [], tools: [] }
    : errored ? { agent: "Browser Agent", status: "FAILED", objective: `Execution stopped before the first step. ${run.reason ? REASON_CODES[run.reason].text : ""}`, evidence: [], tools: [] }
    : passed ? { agent: "Validator", status: "COMPLETE", objective: "All planned steps passed. No investigation was triggered and no findings were raised.", evidence: baseInspector.evidence.slice(3), tools: [], confidence: 100 }
    : run.report === "INCONCLUSIVE" ? { agent: "Validator", status: "COMPLETE", objective: "Three hypotheses were formed and all three were rejected against the collected evidence. The failure is reported without a confirmed root cause.", evidence: baseInspector.evidence, hypothesis: "No surviving hypothesis.", confidence: 38, tools: baseInspector.tools.slice(0, 3) }
    : { ...baseInspector, agent: "Validator", status: "COMPLETE", hypothesis: primaryFinding ? primaryFinding.cause : baseInspector.hypothesis, confidence: primaryFinding ? primaryFinding.confidence : 89 };
  const header: Run = { ...run, status, elapsed: isLive && !live.done ? `00:${String(Math.round(live.at / 1000)).padStart(2, "0")}` : run.elapsed || "01:42" };
  const workspace = (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px 0" }}>
        <Tabs variant="enclosed" value={view} onValueChange={setView} items={[{ value: "split", label: "Timeline + Browser" }, { value: "timeline", label: "Timeline" }, { value: "browser", label: "Browser" }]} />
        {isLive && !live.done && !cancelled ? <Spinner label={live.op} /> : <span className="qf-tertiary" style={{ fontSize: 12 }}>{stepsList.filter((s) => s.state === "passed").length} of {stepsList.length} steps passed</span>}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 16, display: "grid", gridTemplateColumns: view === "split" ? "minmax(300px, 1fr) minmax(300px, 1.05fr)" : "1fr", gap: 20, alignItems: "start" }}>
        {view !== "browser" ? <ExecutionTimeline steps={stepsList} /> : null}
        {view !== "timeline" ? <ScreenshotViewer url={`staging.qaforge.dev${shot === 4 && !errored ? "/dashboard" : "/login"}`} step={shot} captured={`14:32:${String(17 + shot).padStart(2, "0")}`} hasPrev={shot > 1} hasNext={shot < 5} onPrev={() => setShot((s) => Math.max(1, s - 1))} onNext={() => setShot((s) => Math.min(5, s + 1))} /> : null}
      </div>
    </div>
  );
  const evidence = (
    <EvidenceTabs
      value={tab}
      onValueChange={setTab}
      counts={showEvidence ? { findings: runFindings.length, screenshots: 5, console: consoleEntries.length, network: network.length, source: 1, trace: trace.length } : { findings: 0 }}
      panels={{
        findings: (
          <div style={{ padding: 16, display: "grid", gridTemplateColumns: "minmax(0, 620px)", gap: 12 }}>
            {passed ? <Empty icon="ShieldCheck" title="No findings" description="All steps passed. No investigation triggered." />
              : errored ? <Empty icon="TriangleAlert" title="No report" description={`The run ended with ${run.reason} before any step executed. There is nothing to investigate or approve.`} />
              : !showEvidence ? <Spinner label="No findings yet — evidence is collected when a step fails." />
              : runFindings.length === 0 ? <Empty icon="ShieldCheck" title="No findings" description="No anomalies were observed in the runtime evidence." />
              : runFindings.map((f) => <FindingCard key={f.id} finding={f} onCreateIssue={() => onReview(run)} onInspectEvidence={() => setTab("network")} onEvidenceClick={(e) => setTab(e.tab || "network")} />)}
          </div>
        ),
        screenshots: <div style={{ padding: 16, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>{[1, 2, 3, 4, 5].map((n) => <ScreenshotViewer key={n} url={`staging.qaforge.dev${n === 4 ? "/dashboard" : "/login"}`} step={n} captured={`14:32:${String(17 + n).padStart(2, "0")}`} hasPrev={false} hasNext={false} />)}</div>,
        console: <ConsoleViewer entries={showEvidence ? consoleEntries : []} highlightIndex={3} height={320} />,
        network: <div style={{ padding: 16 }}><NetworkTable requests={showEvidence ? network : []} /></div>,
        source: <div style={{ padding: 16, maxWidth: 820 }}>{showEvidence ? <SourceViewer {...source} /> : <Spinner label="Repository Investigator has not started." />}</div>,
        trace: <div style={{ padding: 0 }}><AgentTrace events={isLive && !live.done ? trace.slice(0, Math.max(1, live.doneUpTo + live.stage * 2)) : trace} /></div>,
      }}
    />
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <RunHeader run={header} onStop={() => onStop(run.id)} onRerun={() => go("new-run")} />
      {inProgress && isLive && !live.done ? null : <ReportStrip run={run} status={status} finding={primaryFinding} approval={approval} onReview={() => onReview(run)} onOpenTrace={() => setTab("trace")} />}
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", paddingTop: 12 }}>
        <Resizable
          direction="vertical"
          defaultSize={58}
          minSize={30}
          maxSize={80}
          showGrip={false}
          first={
            <Resizable
              defaultSize={66}
              minSize={40}
              maxSize={78}
              first={workspace}
              second={
                <div style={{ height: "100%", overflow: "auto", display: "flex", flexDirection: "column" }}>
                  <div style={{ padding: 12 }}><AgentActivityPanel stage={stage} cancelled={cancelled || errored} /></div>
                  <AgentInspector {...inspector} style={{ borderLeft: "none", borderTop: "1px solid var(--border)", flex: 1, minHeight: 0 }} />
                </div>
              }
              style={{ height: "100%" }}
            />
          }
          second={<div style={{ height: "100%", overflow: "auto", borderTop: "1px solid var(--border)" }}>{evidence}</div>}
        />
      </div>
    </div>
  );
}
