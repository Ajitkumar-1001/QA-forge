"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  draftIssue,
  initialApprovals,
  LIVE_STATUSES,
  runs as initialRuns,
  findings as initialFindings,
  type Approval,
  type Finding,
  type Run,
} from "@/data/qaforge";
import type { ToastDef } from "./overlays";

// Ported from the imported design project's app/app.jsx — the single place that owns run/finding/
// approval state and the mutations screens call (startRun, approve, reject, …). The original used
// hash-based client routing (`go('screen', params)`); here `go` maps the same calls onto real
// App Router routes so every screen's `go(...)` call is unchanged.

export type GoParams = { runId?: string };
export type Go = (screen: string, params?: GoParams) => void;

function pathFor(screen: string, params: GoParams = {}): string {
  switch (screen) {
    case "dashboard": return "/dashboard";
    case "new-run": return "/runs/new";
    case "run": return `/runs/${params.runId}`;
    case "approval": return `/runs/${params.runId}/approval`;
    default: return `/${screen}`;
  }
}

interface QAForgeState {
  runs: Run[];
  findings: Finding[];
  approvals: Record<string, Approval>;
  toasts: ToastDef[];
  go: Go;
  toast: (t: Omit<ToastDef, "id">) => void;
  dismissToast: (id: string | number) => void;
  startRun: (form: { objective: string; repository: string; environment: Run["environment"] }) => void;
  stopRun: (runId: string) => void;
  onRunStatus: (runId: string, status: Run["status"], done?: boolean) => void;
  review: (run: Run | string) => void;
  reviewFinding: (f: Finding) => void;
  approve: (run: Run, finding: Finding) => void;
  reject: (run: Run, finding: Finding) => void;
}

const QAForgeContext = React.createContext<QAForgeState | null>(null);

export function useQAForge(): QAForgeState {
  const ctx = React.useContext(QAForgeContext);
  if (!ctx) throw new Error("useQAForge must be used within <QAForgeProvider>");
  return ctx;
}

export function QAForgeProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [runs, setRuns] = React.useState<Run[]>(initialRuns);
  const [findings, setFindings] = React.useState<Finding[]>(initialFindings);
  const [approvals, setApprovals] = React.useState<Record<string, Approval>>(initialApprovals);
  const [toasts, setToasts] = React.useState<ToastDef[]>([]);
  const counter = React.useRef(219);

  const go = React.useCallback<Go>((screen, params) => {
    router.push(pathFor(screen, params));
    const page = document.querySelector<HTMLElement>(".qf-shell__page");
    if (page) page.scrollTop = 0;
  }, [router]);

  const toast = React.useCallback((t: Omit<ToastDef, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((ts) => [...ts, { id, ...t }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 4200);
  }, []);
  const dismissToast = React.useCallback((id: string | number) => setToasts((ts) => ts.filter((x) => x.id !== id)), []);

  const startRun = React.useCallback((form: { objective: string; repository: string; environment: Run["environment"] }) => {
    const id = `QF-${String(counter.current++).padStart(4, "0")}`;
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const run: Run = {
      id, objective: form.objective, plan: "Ad-hoc", repository: form.repository, branch: "main", commit: "28fa91c",
      environment: form.environment, status: "INVESTIGATING", findings: 0, duration: "—", triggeredBy: "Dana Okafor",
      started: hhmm, startedFull: `${hhmm}:${String(now.getSeconds()).padStart(2, "0")}`, elapsed: "00:00", startedAt: counter.current, live: true,
    };
    setRuns((rs) => [run, ...rs]);
    go("run", { runId: id });
  }, [go]);

  const onRunStatus = React.useCallback((runId: string, status: Run["status"], done?: boolean) => {
    setRuns((rs) => rs.map((r) => (r.id === runId && r.status !== "CANCELLED" ? { ...r, status, report: done ? "FAILED" : r.report, findings: done ? 1 : 0, duration: done ? "00:17" : r.duration, elapsed: done ? "00:17" : r.elapsed } : r)));
    if (done) {
      setFindings((fs) => (fs.some((f) => f.runId === runId) ? fs : [{ ...initialFindings[0], id: `F-0${413 + (counter.current - 219)}`, runId, created: "just now" }, ...fs]));
    }
  }, []);

  const stopRun = React.useCallback((runId: string) => {
    setRuns((rs) => rs.map((r) => (r.id === runId ? { ...r, status: "CANCELLED" } : r)));
    toast({ title: "Run cancelled", description: runId });
  }, [toast]);

  // The one hinge between the investigation UI and the approval UI.
  const review = React.useCallback((run: Run | string) => go("approval", { runId: typeof run === "string" ? run : run.id }), [go]);
  const reviewFinding = React.useCallback((f: Finding) => (f?.runId ? go("approval", { runId: f.runId }) : go("findings")), [go]);

  const approve = React.useCallback((run: Run, f: Finding) => {
    const repo = f.repository || run.repository;
    const issue = `${repo}#${400 + Math.floor(Math.random() * 40)}`;
    setApprovals((a) => ({ ...a, [run.id]: { status: "APPROVED", findingId: f.id, repository: repo, requested: a[run.id]?.requested || "Today 14:34", decidedBy: "Dana Okafor", decided: "just now", issue } }));
    setFindings((fs) => fs.map((x) => (x.id === f.id ? { ...x, status: "ISSUE CREATED" } : x)));
    toast({ tone: "success", title: "GitHub issue created", description: `${issue} · ${f.title}`, action: "Open" });
    go("run", { runId: run.id });
  }, [go, toast]);

  const reject = React.useCallback((run: Run, f: Finding) => {
    setApprovals((a) => ({ ...a, [run.id]: { status: "REJECTED", findingId: f.id, repository: f.repository || run.repository, decidedBy: "Dana Okafor", decided: "just now" } }));
    toast({ title: "Approval rejected", description: `No issue was created. ${f.id} stays open.` });
    go("run", { runId: run.id });
  }, [go, toast]);

  const value = React.useMemo<QAForgeState>(() => ({
    runs, findings, approvals, toasts, go, toast, dismissToast, startRun, stopRun, onRunStatus, review, reviewFinding, approve, reject,
  }), [runs, findings, approvals, toasts, go, toast, dismissToast, startRun, stopRun, onRunStatus, review, reviewFinding, approve, reject]);

  return <QAForgeContext.Provider value={value}>{children}</QAForgeContext.Provider>;
}

export { draftIssue, LIVE_STATUSES };
