"use client";

import * as React from "react";
import { Icon } from "./icon";
import { Badge, Button, Card, DataTable, type Column, Progress, Avatar, Separator, Empty, Spinner, ToggleGroup as ToggleGroupLevels } from "./primitives";
import { Input, Select, type SelectOption } from "./forms";
import { Tabs as EvidenceTabsBase } from "./overlays";
import { AlertDialog, DropdownMenu, type AlertDialogProps, type MenuItemDef } from "./overlays";
import type { ConsoleEntry, Finding, NetworkRequest, Run, SourceFile, TraceEvent } from "@/data/qaforge";
import { cn } from "cn";

// Ported from the imported design project's component bundle (components/{agents,approvals,evidence,
// findings,runs,shell}/**). These are QAForge-specific compositions built on the primitives in
// ./primitives, ./forms and ./overlays — internals now render Tailwind utilities against the
// shadcn/globals.css tokens instead of qf-* classes, same convention as primitives.tsx.

// Shared "micro label" style (11px/500/uppercase/0.04em tracking) used across findings/agents/approvals.
const LABEL_CLS = "text-[11px] font-medium uppercase tracking-[0.04em] text-text-tertiary";

// ---------------------------------------------------------------------------
// shell/PageHeader
// ---------------------------------------------------------------------------

export function PageHeader({ title, description, badge, actions, compact = false, className = "" }: {
  title: React.ReactNode;
  description?: React.ReactNode;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className={cn("flex items-center gap-2.5 font-semibold tracking-tight text-foreground", compact ? "text-xl leading-snug" : "text-2xl leading-tight")}>
          {title}
          {badge}
        </h1>
        {description ? <p className="text-sm leading-normal text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// findings/ConfidenceMeter
// ---------------------------------------------------------------------------

export function confidenceBand(v: number) {
  return v < 50 ? "weak" : v < 70 ? "moderate" : v < 85 ? "strong" : "high";
}

export function ConfidenceMeter({ value = 0, label = "Confidence", segments = 20, inline = false, showBand = true, className = "" }: {
  value?: number;
  label?: string;
  segments?: number;
  inline?: boolean;
  showBand?: boolean;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const on = Math.round((pct / 100) * segments);
  const meter = (
    <div className={cn("flex h-1.5 gap-0.5", inline && "w-[72px] shrink-0")} role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      {Array.from({ length: segments }, (_, i) => <span key={i} className={cn("flex-1 rounded-[1px] bg-secondary", i < on && "bg-primary")} />)}
    </div>
  );
  const val = (
    <span className="inline-flex items-baseline gap-1.5 tabular-nums">
      <span className={cn("font-semibold text-foreground", inline ? "text-[13px] font-medium" : "text-sm")}>{pct}%</span>
      {showBand ? <span className="text-xs lowercase text-text-tertiary">{confidenceBand(pct)}</span> : null}
    </span>
  );
  if (inline) return <span className={cn("flex flex-row items-center gap-2.5", className)}>{meter}{val}</span>;
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <div className="flex items-center justify-between gap-3">
        <span className={LABEL_CLS}>{label}</span>
        {val}
      </div>
      {meter}
    </div>
  );
}

// ---------------------------------------------------------------------------
// findings/SeverityBadge, runs/RunStatusBadge, approvals/ActionRiskBadge, agents/AgentStatus
// ---------------------------------------------------------------------------

type Badge_Tone = "neutral" | "active" | "success" | "warning" | "error";

const SEVERITY: Record<string, { tone: Badge_Tone; icon: string; solid?: boolean }> = {
  INFO: { tone: "active", icon: "Info" },
  LOW: { tone: "neutral", icon: "ArrowDown" },
  MEDIUM: { tone: "warning", icon: "TriangleAlert" },
  HIGH: { tone: "error", icon: "TriangleAlert" },
  CRITICAL: { tone: "error", icon: "OctagonAlert", solid: true },
};

export function SeverityBadge({ severity = "INFO", size = "md", showIcon = true, className = "" }: { severity?: string; size?: "sm" | "md"; showIcon?: boolean; className?: string }) {
  const s = SEVERITY[String(severity).toUpperCase()] || SEVERITY.INFO;
  return <Badge tone={s.tone} solid={!!s.solid} size={size} icon={showIcon ? s.icon : undefined} className={className}>{String(severity).toUpperCase()}</Badge>;
}

export const RUN_STATUS: Record<string, { tone: Badge_Tone; icon?: string; pulse?: boolean; label: string }> = {
  QUEUED: { tone: "neutral", icon: "Clock", label: "Queued" },
  PLANNING: { tone: "active", pulse: true, label: "Planning" },
  RUNNING: { tone: "active", pulse: true, label: "Running" },
  INVESTIGATING: { tone: "active", pulse: true, label: "Investigating" },
  VALIDATING: { tone: "active", pulse: true, label: "Validating" },
  WAITING_APPROVAL: { tone: "warning", icon: "Hand", label: "Waiting approval" },
  PASSED: { tone: "success", icon: "Check", label: "Passed" },
  FAILED: { tone: "error", icon: "CircleX", label: "Failed" },
  BLOCKED: { tone: "warning", icon: "Ban", label: "Blocked" },
  CANCELLED: { tone: "neutral", icon: "Square", label: "Cancelled" },
  // ERROR is a system/infra outcome (§20), added here rather than monkey-patched at runtime.
  ERROR: { tone: "error", icon: "TriangleAlert", label: "Error" },
};

export function RunStatusBadge({ status = "QUEUED", solid = false, size = "md", className = "" }: { status?: string; solid?: boolean; size?: "sm" | "md"; className?: string }) {
  const key = String(status).toUpperCase().replace(/\s+/g, "_");
  const s = RUN_STATUS[key] || RUN_STATUS.QUEUED;
  return <Badge tone={s.tone} solid={solid} size={size} icon={s.icon} dot={!!s.pulse} pulse={!!s.pulse} className={className}>{key.replace("_", " ")}</Badge>;
}

const ACTION_RISK: Record<string, { tone: Badge_Tone; icon: string; solid?: boolean }> = {
  "READ-ONLY": { tone: "neutral", icon: "Eye" },
  REVERSIBLE: { tone: "active", icon: "Undo2" },
  DESTRUCTIVE: { tone: "error", icon: "TriangleAlert", solid: true },
  "HUMAN-APPROVED": { tone: "success", icon: "ShieldCheck" },
  ALLOW: { tone: "success", icon: "Check" },
  "REQUIRE APPROVAL": { tone: "warning", icon: "Hand" },
  DENY: { tone: "error", icon: "Ban" },
};

export function ActionRiskBadge({ risk = "READ-ONLY", size = "md", showIcon = true, className = "" }: { risk?: string; size?: "sm" | "md"; showIcon?: boolean; className?: string }) {
  const key = String(risk).toUpperCase().replace(/_/g, " ").replace("READ ONLY", "READ-ONLY").replace("HUMAN APPROVED", "HUMAN-APPROVED");
  const s = ACTION_RISK[key] || ACTION_RISK["READ-ONLY"];
  return <Badge tone={s.tone} solid={!!s.solid} size={size} icon={showIcon ? s.icon : undefined} className={cn("inline-flex items-center gap-1", className)}>{key}</Badge>;
}

const AGENT_STATUS: Record<string, { tone: Badge_Tone; icon?: string; pulse?: boolean }> = {
  IDLE: { tone: "neutral", icon: "Circle" },
  ACTIVE: { tone: "active", pulse: true },
  WAITING: { tone: "warning", icon: "Hand" },
  COMPLETE: { tone: "success", icon: "Check" },
  FAILED: { tone: "error", icon: "CircleX" },
};

export function AgentStatus({ status = "IDLE", solid = false, size = "md", className = "" }: { status?: string; solid?: boolean; size?: "sm" | "md"; className?: string }) {
  const key = String(status).toUpperCase();
  const s = AGENT_STATUS[key] || AGENT_STATUS.IDLE;
  return <Badge tone={s.tone} solid={solid} size={size} icon={s.icon} dot={!!s.pulse} pulse={!!s.pulse} className={className}>{key}</Badge>;
}

// ---------------------------------------------------------------------------
// runs/ExecutionStep, runs/ExecutionTimeline
// ---------------------------------------------------------------------------

const STEP_MARK: Record<string, string> = { passed: "Check", failed: "X", skipped: "Minus", waiting: "Hand" };
const STEP_MARKER_TONE: Record<string, string> = {
  passed: "text-status-success", failed: "text-status-error", skipped: "text-text-disabled",
  pending: "text-text-disabled", active: "text-status-active", waiting: "text-status-warning",
};

export interface ExecutionStepDef {
  id?: string;
  title: React.ReactNode;
  state?: "passed" | "failed" | "active" | "pending" | "skipped" | "waiting";
  agent?: string;
  duration?: string;
  evidenceCount?: number;
  detail?: string | { key: string; value?: React.ReactNode }[];
  defaultOpen?: boolean;
  className?: string;
}

export function ExecutionStep({ index, title, state = "pending", agent, duration, evidenceCount, detail, defaultOpen = false, isLast = false, className = "" }: ExecutionStepDef & { index?: number; isLast?: boolean }) {
  const [open, setOpen] = React.useState(defaultOpen);
  const expandable = detail !== undefined && detail !== null;
  return (
    <div className={cn("relative flex flex-col pl-7", className)}>
      {!isLast ? <span className="absolute top-[22px] bottom-[-2px] left-[7px] w-px bg-border" aria-hidden="true" /> : null}
      <span className={cn("absolute top-[7px] left-0 flex size-4 items-center justify-center rounded-full bg-background", STEP_MARKER_TONE[state])} aria-hidden="true">
        {STEP_MARK[state] ? <Icon name={STEP_MARK[state]} size={state === "passed" || state === "failed" ? 14 : 12} strokeWidth={2.5} /> : (
          <span className={cn("size-2 rounded-full", state === "active" ? "animate-pulse bg-current" : "border-[1.5px] border-current")} />
        )}
      </span>
      <button type="button" className={cn("-ml-1.5 flex min-h-[30px] w-[calc(100%+6px)] items-center gap-2.5 rounded-sm px-1.5 text-left", expandable ? "cursor-pointer hover:bg-hover-overlay" : "cursor-default")} data-static={!expandable || undefined} aria-expanded={expandable ? open : undefined} onClick={() => expandable && setOpen((o) => !o)}>
        {index !== undefined ? <span className="min-w-[18px] font-mono text-[11px] text-text-tertiary">{String(index).padStart(2, "0")}</span> : null}
        <span className={cn("min-w-0 flex-1 truncate text-sm text-foreground", (state === "pending" || state === "skipped") && "text-text-tertiary", state === "active" && "font-medium")}>{title}</span>
        {agent ? <span className="text-xs whitespace-nowrap text-text-tertiary">{agent}</span> : null}
        {evidenceCount ? <span className="inline-flex items-center gap-1 text-[11px] tabular-nums text-text-tertiary"><Icon name="Paperclip" size={11} />{evidenceCount}</span> : null}
        <span className="min-w-[44px] text-right font-mono text-[11px] tabular-nums text-text-tertiary">{duration || (state === "active" ? "…" : "")}</span>
        {expandable ? <Icon name="ChevronRight" size={14} className={cn("text-text-disabled transition-transform", open && "rotate-90")} /> : <span className="w-3.5" />}
      </button>
      {expandable && open ? (
        <div className="my-0.5 mb-2 flex flex-col gap-2 rounded-md border border-border-subtle bg-card p-3 text-[13px] leading-normal text-muted-foreground">
          {typeof detail === "string" ? detail : Array.isArray(detail) ? detail.map((d, i) => (
            <div key={i} className="flex gap-3"><span className="min-w-[72px] text-xs text-text-tertiary">{d.key}</span><span className="flex-1 text-foreground">{d.value}</span></div>
          )) : detail}
        </div>
      ) : null}
    </div>
  );
}

export function ExecutionTimeline({ steps = [], numbered = true, className = "" }: { steps?: ExecutionStepDef[]; numbered?: boolean; className?: string }) {
  return (
    <div className={cn("flex flex-col", className)} role="list">
      {steps.map((s, i) => <ExecutionStep key={s.id || i} index={numbered ? i + 1 : undefined} isLast={i === steps.length - 1} {...s} />)}
    </div>
  );
}

// ---------------------------------------------------------------------------
// agents/ToolCallItem, agents/AgentTrace, agents/AgentInspector
// ---------------------------------------------------------------------------

const TOOL_ICON: Record<string, string> = { readFile: "FileCode", searchRepository: "Search", inspectNetwork: "Network", captureScreenshot: "Camera", readConsole: "Terminal", navigate: "Globe", click: "MousePointerClick", fill: "TextCursorInput", assert: "CircleCheck", createIssue: "Github", runQuery: "Database" };

export function ToolCallItem({ name, arg, time, state = "done", icon, className = "" }: { name: string; arg?: string; time?: string; state?: "done" | "running" | "error"; icon?: string; className?: string }) {
  return (
    <div className={cn("-mx-2 flex items-start gap-2.5 rounded-sm px-2 py-1.5 text-[13px] hover:bg-hover-overlay", className)}>
      <Icon name={icon || TOOL_ICON[name] || "Wrench"} size={14} className={cn("mt-0.5 shrink-0 text-text-tertiary", state === "running" && "animate-pulse text-status-active", state === "error" && "text-status-error")} />
      <div className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="font-mono text-xs text-foreground">{name}</span>
        {arg ? <span className="truncate font-mono text-[11.5px] text-muted-foreground" title={arg}>{arg}</span> : null}
      </div>
      {time ? <span className="shrink-0 font-mono text-[11px] tabular-nums text-text-tertiary">{time}</span> : null}
    </div>
  );
}

const AGENT_ICON: Record<string, string> = { "QA Supervisor": "Bot", "Browser Agent": "Globe", "Evidence Agent": "Camera", "Repository Agent": "GitBranch", "Root Cause Agent": "Bug", "Report Agent": "FileText" };

export function AgentTrace({ events = [], className = "" }: { events?: TraceEvent[]; className?: string }) {
  return (
    <div className={cn("flex flex-col", className)} role="log">
      {events.map((e, i) => (
        <div key={i} className={cn("grid grid-cols-[76px_150px_1fr_auto] items-baseline gap-3 border-b border-border-subtle px-3 py-2 text-[13px] last:border-0 hover:bg-hover-overlay", e.state === "failed" && "text-foreground")}>
          <span className="font-mono text-[11.5px] tabular-nums text-text-tertiary">{e.time}</span>
          <span className="inline-flex items-center gap-1.5 truncate text-xs font-medium whitespace-nowrap text-muted-foreground">
            <Icon name={AGENT_ICON[e.agent] || "Bot"} size={13} className={cn(e.state === "failed" ? "text-status-error" : e.state === "active" ? "text-status-active" : "text-text-tertiary")} />
            {e.agent}
          </span>
          <span className="min-w-0 leading-snug text-foreground">{e.event}</span>
          <span className="font-mono text-[11.5px] tabular-nums text-text-tertiary">{e.duration || ""}</span>
        </div>
      ))}
    </div>
  );
}

const EVIDENCE_ICON: Record<string, string> = { network: "Network", console: "Terminal", source: "FileCode", screenshot: "Image", trace: "Activity" };

export function AgentInspector({ agent = "Root Cause Agent", status = "ACTIVE", objective, evidence = [], hypothesis, confidence, tools = [], className = "", style }: {
  agent?: string;
  status?: string;
  objective?: React.ReactNode;
  evidence?: { kind: string; count: number; label: string }[];
  hypothesis?: React.ReactNode;
  confidence?: number;
  tools?: { name: string; arg?: string; time?: string; state?: "running" }[];
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <aside className={cn("flex h-full min-h-0 flex-col border-l border-border bg-surface-1", className)} style={style} aria-label="Agent inspector">
      <div className="flex items-center justify-between gap-2.5 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar variant="agent" size="sm" name={agent} />
          <span className="text-[11px] font-semibold tracking-[0.04em] whitespace-nowrap text-foreground uppercase">{agent}</span>
        </div>
        <AgentStatus status={status} size="sm" />
      </div>
      <div className="flex flex-1 flex-col overflow-auto px-4 pt-1 pb-4">
        {objective ? <section className="flex flex-col gap-1.5 border-b border-border-subtle py-3"><span className={LABEL_CLS}>Current objective</span><p className="text-sm leading-normal text-foreground text-pretty">{objective}</p></section> : null}
        {evidence.length ? (
          <section className="flex flex-col gap-1.5 border-b border-border-subtle py-3">
            <span className={LABEL_CLS}>Evidence considered</span>
            <div className="grid grid-cols-2 gap-1.5">
              {evidence.map((e) => (
                <span key={e.kind + e.label} className="flex items-center gap-2 rounded-sm border border-border-subtle bg-card px-2 py-1.5 text-[13px] text-muted-foreground">
                  <Icon name={EVIDENCE_ICON[e.kind] || "Paperclip"} size={13} className="text-text-tertiary" /><strong className="font-medium tabular-nums text-foreground">{e.count}</strong>{e.label}
                </span>
              ))}
            </div>
          </section>
        ) : null}
        {hypothesis ? <section className="flex flex-col gap-1.5 border-b border-border-subtle py-3"><span className={LABEL_CLS}>Current hypothesis</span><p className="rounded-md border border-border bg-card p-2.5 text-sm leading-normal text-foreground text-pretty">{hypothesis}</p></section> : null}
        {confidence !== undefined ? <section className="border-b border-border-subtle py-3 last:border-0"><ConfidenceMeter value={confidence} /></section> : null}
        {tools.length ? (
          <section className="flex flex-col gap-1.5 border-b border-border-subtle py-3 last:border-0">
            <span className={LABEL_CLS}>Tool activity</span>
            <div className="flex flex-col gap-0.5">{tools.map((t, i) => <ToolCallItem key={i} {...t} />)}</div>
          </section>
        ) : null}
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// evidence/EvidenceReference, evidence/ScreenshotViewer, evidence/SourceViewer,
// evidence/ConsoleViewer, evidence/EvidenceTabs, evidence/NetworkTable
// ---------------------------------------------------------------------------

const KIND_ICON: Record<string, string> = { network: "Network", console: "Terminal", source: "FileCode", screenshot: "Image", trace: "Activity", cookie: "Cookie", commit: "GitCommitHorizontal" };
const STATUS_META_TONE: Record<string, string> = { "2": "text-status-success", "3": "text-status-active", "4": "text-status-warning", "5": "text-status-error" };

export function EvidenceReference({ kind = "network", label, meta, href, onClick, className = "" }: { kind?: string; label: React.ReactNode; meta?: string | number; href?: string; onClick?: () => void; className?: string }) {
  const metaTone = meta && /^\d{3}$/.test(String(meta)) ? STATUS_META_TONE[String(meta)[0]] : undefined;
  const cls = cn("inline-flex h-[22px] max-w-full cursor-pointer items-center gap-1.5 overflow-hidden rounded-sm border border-border bg-secondary px-1.5 font-mono text-[11.5px] whitespace-nowrap text-muted-foreground no-underline transition-colors hover:border-border-strong hover:text-foreground hover:no-underline", className);
  const inner = <><Icon name={KIND_ICON[kind] || "Paperclip"} size={12} className="text-text-tertiary" /><span className="overflow-hidden text-ellipsis">{label}</span>{meta ? <span className={cn("text-text-tertiary", metaTone)}>{meta}</span> : null}</>;
  if (href) return <a className={cls} href={href} onClick={onClick}>{inner}</a>;
  return <button type="button" className={cls} onClick={onClick}>{inner}</button>;
}

export function ScreenshotViewer({ url, src, alt, viewport = "1440×900", browser = "Chrome", step, captured, onPrev, onNext, onOpen, hasPrev = true, hasNext = true, className = "" }: {
  url?: string;
  src?: string;
  alt?: string;
  viewport?: string;
  browser?: string;
  step?: number;
  captured?: string;
  onPrev?: () => void;
  onNext?: () => void;
  onOpen?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col overflow-hidden rounded-md border border-border bg-card", className)}>
      <div className="flex h-8 items-center gap-2 border-b border-border bg-secondary px-2.5 font-mono text-xs text-muted-foreground">
        <span className="mr-1 flex gap-1">{[0, 1, 2].map((i) => <i key={i} className="block size-[7px] rounded-full bg-border-strong" />)}</span>
        <Icon name="Lock" size={11} className="text-text-tertiary" />
        <span className="overflow-hidden text-ellipsis whitespace-nowrap">{url}</span>
      </div>
      <div className="relative flex aspect-video items-center justify-center overflow-hidden bg-surface-1 text-sm text-text-tertiary">
        {src ? <img src={src} alt={alt || `Browser capture, step ${step}`} className="block size-full object-contain" /> : (
          <div className="flex flex-col items-center gap-1.5 text-center">
            <Icon name="Image" size={18} />
            <span>Browser screenshot</span>
            <span className="font-mono text-[11px] text-text-disabled">{step !== undefined ? `screenshot-${String(step).padStart(2, "0")}.png` : "no capture yet"}</span>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-border px-2.5 py-2">
        <div className="flex flex-wrap gap-3.5 text-xs tabular-nums text-text-tertiary">
          <span>Viewport <b className="font-medium text-muted-foreground">{viewport}</b></span>
          <span><b className="font-medium text-muted-foreground">{browser}</b></span>
          {step !== undefined ? <span>Step <b className="font-medium text-muted-foreground">{String(step).padStart(2, "0")}</b></span> : null}
          {captured ? <span>Captured <b className="font-medium text-muted-foreground">{captured}</b></span> : null}
        </div>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="outline" icon="ChevronLeft" onClick={onPrev} disabled={!hasPrev}>Previous</Button>
          <Button size="sm" variant="outline" iconRight="ChevronRight" onClick={onNext} disabled={!hasNext}>Next</Button>
          <Button size="sm" variant="ghost" icon="Maximize2" onClick={onOpen}>Open full capture</Button>
        </div>
      </div>
    </div>
  );
}

export function SourceViewer({ file, lines = [], highlight = [], errorLine, commit, branch, repository, onOpenGithub, onAddEvidence, className = "" }: SourceFile & { onOpenGithub?: () => void; onAddEvidence?: () => void; className?: string }) {
  const range = highlight.length ? `L${highlight[0]}${highlight[1] && highlight[1] !== highlight[0] ? `–${highlight[1]}` : ""}` : "";
  const inRange = (n: number) => highlight.length > 0 && n >= highlight[0] && n <= (highlight[1] ?? highlight[0]);
  return (
    <div className={cn("flex flex-col overflow-hidden rounded-md border border-border bg-surface-1", className)}>
      <div className="flex h-9 items-center justify-between gap-3 border-b border-border bg-card px-3">
        <span className="inline-flex items-center gap-2 font-mono text-xs text-foreground"><Icon name="FileCode" size={14} className="text-text-tertiary" />{file}{range ? <span className="text-text-tertiary">{range}</span> : null}</span>
        <div className="flex gap-1.5"><Button size="sm" variant="ghost" icon="Copy">Copy path</Button></div>
      </div>
      <pre className="m-0 overflow-auto py-2 font-mono text-[12.5px] leading-relaxed text-foreground">
        {lines.map((l) => (
          <div key={l.n} className={cn("grid grid-cols-[48px_1fr] whitespace-pre py-0 pr-3", l.n === errorLine ? "bg-status-error-muted shadow-[inset_2px_0_0_var(--status-error)]" : inRange(l.n) ? "bg-[var(--blue-subtle)] shadow-[inset_2px_0_0_var(--status-active)]" : "")}>
            <span className={cn("text-right pr-4 tabular-nums text-text-disabled select-none", (l.n === errorLine || inRange(l.n)) && "text-muted-foreground")}>{l.n}</span>
            <span>{l.text}</span>
          </div>
        ))}
      </pre>
      <div className="flex items-center justify-between gap-3 border-t border-border bg-card px-3 py-2">
        <div className="flex flex-wrap gap-3.5 text-xs text-text-tertiary">
          {commit ? <span>Commit <code className="text-[11.5px] text-muted-foreground">{commit}</code></span> : null}
          {branch ? <span>Branch <code className="text-[11.5px] text-muted-foreground">{branch}</code></span> : null}
          {repository ? <span>Repository <code className="text-[11.5px] text-muted-foreground">{repository}</code></span> : null}
        </div>
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" icon="Github" iconRight="ExternalLink" onClick={onOpenGithub}>Open on GitHub</Button>
          <Button size="sm" variant="outline" icon="Paperclip" onClick={onAddEvidence}>Add to Evidence</Button>
        </div>
      </div>
    </div>
  );
}

const CONSOLE_LEVELS = [{ value: "DEBUG", label: "Debug" }, { value: "INFO", label: "Info" }, { value: "WARN", label: "Warn" }, { value: "ERROR", label: "Error" }];
const CONSOLE_LEVEL_TONE: Record<string, string> = { INFO: "text-muted-foreground", DEBUG: "text-text-tertiary", WARN: "text-status-warning", ERROR: "text-status-error" };
const CONSOLE_LINE_TONE: Record<string, string> = { WARN: "bg-status-warning-muted", ERROR: "bg-status-error-muted" };

export function ConsoleViewer({ entries = [], highlightIndex, height = 240, showToolbar = true, onJump, className = "" }: {
  entries?: ConsoleEntry[];
  highlightIndex?: number;
  height?: number;
  showToolbar?: boolean;
  onJump?: (entry: ConsoleEntry) => void;
  className?: string;
}) {
  const [levels, setLevels] = React.useState<string[]>(["DEBUG", "INFO", "WARN", "ERROR"]);
  const [q, setQ] = React.useState("");
  const visible = entries.filter((e) => levels.includes(e.level) && (!q || e.message.toLowerCase().includes(q.toLowerCase())));
  const copy = (e: ConsoleEntry) => { navigator.clipboard?.writeText(`${e.time}  ${e.level}  ${e.message}`); };
  return (
    <div className={cn("flex min-h-0 flex-col bg-surface-1", className)} style={{ height }}>
      {showToolbar ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
          <ToggleGroupLevels items={CONSOLE_LEVELS} value={levels} onValueChange={(v) => setLevels(v as string[])} />
          <Input icon="Search" size="sm" className="w-[220px]" placeholder="Search console…" value={q} onChange={(e) => setQ(e.target.value)} />
          <span className="ml-auto text-xs tabular-nums text-text-tertiary">{visible.length} / {entries.length} entries</span>
        </div>
      ) : null}
      <div className="flex-1 overflow-auto py-1.5 font-mono text-xs leading-relaxed">
        {visible.map((e, i) => (
          <div
            key={i}
            className={cn(
              "group grid grid-cols-[96px_52px_1fr_auto] gap-3 px-3 py-0.5 break-words whitespace-pre-wrap text-foreground",
              CONSOLE_LINE_TONE[e.level],
              highlightIndex === entries.indexOf(e) && "shadow-[inset_2px_0_0_var(--status-active)]",
              onJump && "cursor-pointer hover:bg-hover-overlay",
            )}
            onDoubleClick={onJump ? () => onJump(e) : undefined}
          >
            <span className="tabular-nums text-text-tertiary">{e.time}</span>
            <span className={cn("text-[11px] font-semibold tracking-[0.02em]", CONSOLE_LEVEL_TONE[e.level])}>{e.level}</span>
            <span>{e.message}</span>
            <button type="button" className="inline-flex items-center border-0 bg-transparent p-0 text-text-tertiary opacity-0 group-hover:opacity-100 hover:text-foreground" aria-label="Copy entry" onClick={() => copy(e)}><Icon name="Copy" size={12} /></button>
          </div>
        ))}
        {visible.length === 0 ? <div className="px-3 py-0.5 text-text-tertiary">No console entries match.</div> : null}
      </div>
    </div>
  );
}

export function EvidenceTabs({ panels = {}, counts = {}, value, defaultValue = "findings", onValueChange, className = "" }: {
  panels?: Partial<Record<"findings" | "screenshots" | "console" | "network" | "source" | "trace", React.ReactNode>>;
  counts?: Partial<Record<"findings" | "screenshots" | "console" | "network" | "source" | "trace", number>>;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  className?: string;
}) {
  return (
    <EvidenceTabsBase
      items={[
        { value: "findings", label: "Findings", icon: "Bug", count: counts.findings, content: panels.findings },
        { value: "screenshots", label: "Screenshots", icon: "Image", count: counts.screenshots, content: panels.screenshots },
        { value: "console", label: "Console", icon: "Terminal", count: counts.console, content: panels.console },
        { value: "network", label: "Network", icon: "Network", count: counts.network, content: panels.network },
        { value: "source", label: "Source", icon: "FileCode", count: counts.source, content: panels.source },
        { value: "trace", label: "Agent Trace", icon: "Activity", count: counts.trace, content: panels.trace },
      ]}
      value={value}
      defaultValue={defaultValue}
      onValueChange={onValueChange}
      className={cn("flex min-h-0 flex-col bg-background", className)}
    />
  );
}

const METHOD_TONE: Record<string, Badge_Tone> = { GET: "neutral", POST: "active", PUT: "warning", PATCH: "warning", DELETE: "error", OPTIONS: "neutral", HEAD: "neutral" };
const STATUS_CODE_TONE: Record<string, string> = { "2": "text-status-success", "3": "text-status-active", "4": "text-status-warning", "5": "text-status-error" };

export function NetworkTable({ requests = [], onOpen, selectedId, compact = true, pageSize = 25, toolbar }: {
  requests?: NetworkRequest[];
  onOpen?: (r: NetworkRequest) => void;
  selectedId?: number;
  compact?: boolean;
  pageSize?: number;
  toolbar?: React.ReactNode;
}) {
  const columns: Column<NetworkRequest>[] = [
    { key: "method", header: "Method", width: 84, render: (r) => <Badge tone={METHOD_TONE[r.method] || "neutral"} size="sm" mono>{r.method}</Badge> },
    { key: "url", header: "Request", mono: true, render: (r) => <span className={cn("font-mono", r.status >= 400 && "text-foreground")}>{r.url}</span> },
    { key: "status", header: "Status", width: 80, sortable: true, render: (r) => <span className={cn("font-mono text-xs tabular-nums", STATUS_CODE_TONE[String(r.status)[0]])}>{r.status}</span> },
    { key: "duration", header: "Duration", width: 90, align: "right", mono: true, muted: true, sortable: true, sortValue: (r) => parseFloat(String(r.duration)), render: (r) => `${r.duration}ms` },
    { key: "initiator", header: "Initiator", muted: true, mono: true },
    { key: "size", header: "Size", width: 80, align: "right", mono: true, muted: true },
  ];
  return <DataTable columns={columns} rows={requests} onRowClick={onOpen} selectedKey={selectedId} compact={compact} pageSize={pageSize} toolbar={toolbar} totalLabel="requests" emptyText="No network activity captured." rowClassName={(r) => (r.status >= 500 ? "bg-status-error-muted" : undefined)} />;
}

// ---------------------------------------------------------------------------
// findings/FindingCard, findings/FindingTable, runs/RunTable, runs/RunFilters, runs/RunHeader
// ---------------------------------------------------------------------------

const LIFECYCLE_TONE: Record<string, Badge_Tone> = { OPEN: "error", ACKNOWLEDGED: "warning", "ISSUE CREATED": "active", "FIX IN PROGRESS": "active", RESOLVED: "success", DISMISSED: "neutral" };

export function FindingCard({ finding, onInspectEvidence, onCreateIssue, onEvidenceClick, compact = false, className = "" }: {
  finding?: Finding;
  onInspectEvidence?: () => void;
  onCreateIssue?: () => void;
  onEvidenceClick?: (e: NonNullable<Finding["evidence"]>[number]) => void;
  compact?: boolean;
  className?: string;
}) {
  const f = finding || ({} as Partial<Finding>);
  return (
    <article className={cn("flex flex-col rounded-md border border-border bg-card", f.severity === "CRITICAL" && "border-status-error/45", className)}>
      <header className="flex items-start justify-between gap-3 px-4 pt-3.5">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex items-center gap-1.5">
            {f.severity ? <SeverityBadge severity={f.severity} /> : null}
            {f.status ? <Badge tone={LIFECYCLE_TONE[f.status] || "neutral"}>{f.status}</Badge> : null}
            {f.id ? <span className="font-mono text-[11px] text-text-tertiary">{f.id}</span> : null}
          </div>
          <h3 className="text-base leading-snug font-semibold text-foreground text-pretty">{f.title}</h3>
          {f.description ? <p className="text-sm leading-normal text-muted-foreground">{f.description}</p> : null}
        </div>
      </header>
      <div className="flex flex-col gap-3.5 px-4 pt-3 pb-3.5">
        {f.expected !== undefined || f.observed !== undefined ? (
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1 rounded-sm border border-border-subtle bg-secondary px-2.5 py-2"><span className={LABEL_CLS}>Expected</span><code className="text-[12.5px] text-foreground">{f.expected}</code></div>
            <div className="flex flex-col gap-1 rounded-sm border border-border-subtle bg-secondary px-2.5 py-2"><span className={LABEL_CLS}>Observed</span><code className="text-[12.5px] text-status-error">{f.observed}</code></div>
          </div>
        ) : null}
        {f.confidence !== undefined ? <ConfidenceMeter value={f.confidence} /> : null}
        {f.evidence && f.evidence.length ? (
          <div className="flex flex-col gap-1.5">
            <span className={LABEL_CLS}>Evidence</span>
            <div className="flex flex-col gap-1">{f.evidence.map((e, i) => <EvidenceReference key={i} {...e} onClick={onEvidenceClick ? () => onEvidenceClick(e) : undefined} />)}</div>
          </div>
        ) : null}
        {f.cause && !compact ? <div className="flex flex-col gap-1.5"><span className={LABEL_CLS}>Potential cause</span><p className="rounded-sm border border-border-subtle bg-secondary p-2.5 text-sm leading-normal text-foreground text-pretty">{f.cause}</p></div> : null}
      </div>
      <footer className="flex items-center gap-2 border-t border-border-subtle px-4 py-3">
        <Button variant="outline" size="sm" icon="Search" onClick={onInspectEvidence}>Inspect Evidence</Button>
        <Button variant="primary" size="sm" icon="Github" onClick={onCreateIssue}>Create Issue</Button>
        {f.affected ? <span className="ml-auto font-mono text-xs text-text-tertiary">{f.affected}</span> : null}
      </footer>
    </article>
  );
}

const SEV_RANK: Record<string, number> = { CRITICAL: 5, HIGH: 4, MEDIUM: 3, LOW: 2, INFO: 1 };

export function FindingTable({ findings = [], onOpen, selectedId, toolbar, pageSize = 10, compact = false }: {
  findings?: Finding[];
  onOpen?: (f: Finding) => void;
  selectedId?: string;
  toolbar?: React.ReactNode;
  pageSize?: number;
  compact?: boolean;
}) {
  const columns: Column<Finding>[] = [
    { key: "severity", header: "Severity", width: 110, sortable: true, sortValue: (r) => SEV_RANK[r.severity] || 0, render: (r) => <SeverityBadge severity={r.severity} size="sm" /> },
    { key: "title", header: "Finding", render: (r) => <span className="inline-block max-w-[380px] overflow-hidden align-middle text-ellipsis">{r.title}</span> },
    { key: "repository", header: "Repository", mono: true, muted: true },
    { key: "runId", header: "Run", mono: true },
    { key: "status", header: "Status", sortable: true, render: (r) => <Badge tone={LIFECYCLE_TONE[r.status] || "neutral"} size="sm">{r.status}</Badge> },
    { key: "confidence", header: "Confidence", sortable: true, render: (r) => <ConfidenceMeter inline value={r.confidence} showBand={false} segments={10} /> },
    { key: "created", header: "Created", muted: true, sortable: true },
  ];
  return <DataTable columns={columns} rows={findings} onRowClick={onOpen} selectedKey={selectedId} toolbar={toolbar} pageSize={pageSize} compact={compact} totalLabel="findings" emptyText="No findings." defaultSort={{ key: "severity", dir: "desc" }} />;
}

const ENV_TONE: Record<string, Badge_Tone> = { LOCAL: "neutral", PREVIEW: "neutral", STAGING: "active", PRODUCTION: "error" };

export function RunTable({ runs = [], onOpen, selectedId, toolbar, pageSize = 10, compact = false }: {
  runs?: Run[];
  onOpen?: (r: Run) => void;
  selectedId?: string;
  toolbar?: React.ReactNode;
  pageSize?: number;
  compact?: boolean;
}) {
  const columns: Column<Run>[] = [
    { key: "id", header: "Run ID", mono: true, width: 96, sortable: true },
    { key: "objective", header: "Objective", render: (r) => <span className="inline-block max-w-[360px] overflow-hidden align-middle text-ellipsis">{r.objective}</span> },
    { key: "repository", header: "Repository", mono: true, muted: true },
    { key: "environment", header: "Environment", render: (r) => <Badge tone={ENV_TONE[r.environment] || "neutral"} size="sm">{r.environment}</Badge> },
    { key: "status", header: "Status", sortable: true, render: (r) => <RunStatusBadge status={r.status} size="sm" /> },
    { key: "findings", header: "Findings", align: "right", sortable: true, render: (r) => (r.findings ? <span className={cn(r.criticalFindings && "text-status-error")}>{r.findings}</span> : <span className="text-text-tertiary">—</span>) },
    { key: "duration", header: "Duration", align: "right", mono: true, muted: true },
    { key: "triggeredBy", header: "Triggered By", muted: true },
    { key: "started", header: "Started", muted: true, sortable: true },
  ];
  return <DataTable columns={columns} rows={runs} onRowClick={onOpen} selectedKey={selectedId} toolbar={toolbar} pageSize={pageSize} compact={compact} totalLabel="runs" emptyText="No QA runs match these filters." />;
}

export interface RunFiltersValue { q?: string; repository?: string; environment?: string; status?: string; severity?: string; date?: string }

const STATUSES = ["QUEUED", "PLANNING", "RUNNING", "INVESTIGATING", "VALIDATING", "WAITING APPROVAL", "PASSED", "FAILED", "BLOCKED", "CANCELLED"];
const SEVERITIES = ["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"];

export function RunFilters({ value = {}, onChange, repositories = [], environments = ["LOCAL", "PREVIEW", "STAGING", "PRODUCTION"], showSeverity = true, actions, className = "" }: {
  value?: RunFiltersValue;
  onChange?: (value: RunFiltersValue) => void;
  repositories?: string[];
  environments?: string[];
  showSeverity?: boolean;
  actions?: React.ReactNode;
  className?: string;
}) {
  const set = (key: keyof RunFiltersValue) => (v: string) => onChange?.({ ...value, [key]: v });
  const any = Object.values(value).some((v) => v && v !== "all");
  const opt = (label: string, list: string[]): SelectOption[] => [{ value: "all", label }, ...list.map((x) => ({ value: x, label: x }))];
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <Input icon="Search" size="sm" className="w-[240px]" placeholder="Search runs…" value={value.q || ""} onChange={(e) => set("q")(e.target.value)} />
      <Select size="sm" className="w-auto min-w-[140px]" options={opt("All repositories", repositories)} value={value.repository || "all"} onValueChange={set("repository")} />
      <Select size="sm" className="w-auto min-w-[140px]" options={opt("All environments", environments)} value={value.environment || "all"} onValueChange={set("environment")} />
      <Select size="sm" className="w-auto min-w-[140px]" options={opt("Any status", STATUSES)} value={value.status || "all"} onValueChange={set("status")} />
      {showSeverity ? <Select size="sm" className="w-auto min-w-[140px]" options={opt("Any severity", SEVERITIES)} value={value.severity || "all"} onValueChange={set("severity")} /> : null}
      <Select
        size="sm"
        className="w-auto min-w-[140px]"
        options={[{ value: "all", label: "Any time" }, { value: "24h", label: "Last 24 hours" }, { value: "7d", label: "Last 7 days" }, { value: "30d", label: "Last 30 days" }]}
        value={value.date || "all"}
        onValueChange={set("date")}
      />
      {any ? <Button variant="ghost" size="sm" icon="X" className="text-text-tertiary" onClick={() => onChange?.({})}>Reset</Button> : null}
      <span className="flex-1" />
      {actions}
    </div>
  );
}

export function RunHeader({ run, onStop, onRerun, menuItems, className = "" }: { run: Run; onStop?: () => void; onRerun?: () => void; menuItems?: MenuItemDef[]; className?: string }) {
  const r = run;
  const live = ["PLANNING", "RUNNING", "INVESTIGATING", "VALIDATING"].includes(r.status);
  const items: MenuItemDef[] = menuItems || [
    { label: "Rerun", icon: "RotateCcw", onSelect: onRerun },
    { label: "Copy run link", icon: "Link" },
    { label: "Export report", icon: "FileText" },
    { type: "separator" },
    { label: "Delete run", icon: "Trash2", destructive: true },
  ];
  return (
    <div className={cn("flex flex-col gap-3 border-b border-border bg-surface-1 px-6 py-4", className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="font-mono text-sm text-muted-foreground">{r.id}</div>
          <h1 className="mt-0.5 text-xl leading-tight font-semibold tracking-tight text-foreground text-pretty">{r.objective}</h1>
          <div className="mt-2 flex items-center gap-1.5">
            {r.environment ? <Badge tone={ENV_TONE[r.environment] || "neutral"} solid={r.environment === "PRODUCTION"}>{r.environment}</Badge> : null}
            <RunStatusBadge status={r.status} />
            {r.plan ? <Badge caseSensitive>{r.plan}</Badge> : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {live ? <Button variant="outline" icon="Square" onClick={onStop}>Stop Run</Button> : <Button variant="outline" icon="RotateCcw" onClick={onRerun}>Rerun</Button>}
          <DropdownMenu align="end" trigger={<Button variant="outline" size="icon" aria-label="More actions"><Icon name="Ellipsis" size={16} /></Button>} items={items} />
        </div>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-muted-foreground">
        {r.repository ? <span className="inline-flex items-center gap-1.5"><Icon name="Github" size={14} className="text-text-tertiary" /><code className="text-xs text-foreground">{r.repository}</code></span> : null}
        {r.branch ? <span className="inline-flex items-center gap-1.5"><Icon name="GitBranch" size={14} className="text-text-tertiary" /><code className="text-xs text-foreground">{r.branch}{r.commit ? ` @ ${r.commit}` : ""}</code></span> : null}
        {r.started ? <span className="inline-flex items-center gap-1.5"><Icon name="Clock" size={14} className="text-text-tertiary" />Started <code className="text-xs text-foreground">{r.started}</code></span> : null}
        {r.elapsed ? <span className="inline-flex items-center gap-1.5"><Icon name="Timer" size={14} className="text-text-tertiary" />Elapsed <code className="text-xs text-foreground">{r.elapsed}</code></span> : null}
        {r.triggeredBy ? <span className="inline-flex items-center gap-1.5"><Icon name="User" size={14} className="text-text-tertiary" />{r.triggeredBy}</span> : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// approvals/ApprovalDialog
// ---------------------------------------------------------------------------

export function ApprovalDialog({ open = false, onOpenChange, action = "Create GitHub Issue", repository, title, fields = [], included = [], risk = "REVERSIBLE", confirmLabel = "Approve & Create", onApprove, onCancel, loading = false }: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  action?: string;
  repository?: string;
  title?: string;
  fields?: { label: string; value: React.ReactNode }[];
  included?: string[];
  risk?: string;
  confirmLabel?: string;
  onApprove?: () => void;
  onCancel?: () => void;
  loading?: boolean;
}) {
  const destructive = risk === "DESTRUCTIVE";
  const alertProps: AlertDialogProps = {
    open,
    onOpenChange,
    tone: destructive ? "destructive" : "warning",
    title: `${action}?`,
    description: repository ? `QAForge will ${action.toLowerCase().replace(/^create /, "create an ").replace(/^generate /, "generate a ")} in:` : undefined,
    confirmLabel,
    onConfirm: onApprove,
    onCancel,
    loading,
  };
  return (
    <AlertDialog {...alertProps}>
      {repository ? <span className="inline-flex items-center gap-2 rounded-sm border border-border bg-card px-2.5 py-2 font-mono text-[12.5px] text-foreground"><Icon name="Github" size={14} className="text-text-tertiary" />{repository}</span> : null}
      {title ? <div className="flex flex-col gap-1"><span className={LABEL_CLS}>Title</span><span className="text-sm leading-normal text-foreground">{title}</span></div> : null}
      {fields.map((f) => <div key={f.label} className="flex flex-col gap-1"><span className={LABEL_CLS}>{f.label}</span><span className="text-sm leading-normal text-foreground">{f.value}</span></div>)}
      {included.length ? (
        <div className="flex flex-col gap-1">
          <span className={LABEL_CLS}>Included</span>
          <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm text-muted-foreground">{included.map((x) => <li key={x} className="flex items-center gap-2"><Icon name="Check" size={13} className="text-status-success" />{x}</li>)}</ul>
        </div>
      ) : null}
      <div className="flex flex-col gap-1"><span className={LABEL_CLS}>Authority</span><span><ActionRiskBadge risk={risk} /></span></div>
    </AlertDialog>
  );
}

// Re-exports used by screens for convenience.
export { Card, Progress, Separator, Empty, Spinner };
