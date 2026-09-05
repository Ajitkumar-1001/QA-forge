"use client";

import * as React from "react";
import { Icon } from "./icon";
import { Badge, Button, Card, DataTable, type Column, Progress, Avatar, Separator, Empty, Spinner, ToggleGroup as ToggleGroupLevels } from "./primitives";
import { Input, Select, type SelectOption } from "./forms";
import { Tabs as EvidenceTabsBase } from "./overlays";
import { AlertDialog, DropdownMenu, type AlertDialogProps, type MenuItemDef } from "./overlays";
import type { ConsoleEntry, Finding, NetworkRequest, Run, SourceFile, TraceEvent } from "@/data/qaforge";

// Ported from the imported design project's component bundle (components/{agents,approvals,evidence,
// findings,runs,shell}/**). These are QAForge-specific compositions built on the primitives in
// ./primitives, ./forms and ./overlays — same qf-* classes as the source.

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
    <div className={`qf-page-header ${compact ? "qf-page-header--compact" : ""} ${className}`.trim()}>
      <div className="qf-page-header__text">
        <h1 className="qf-page-header__title">{title}{badge}</h1>
        {description ? <p className="qf-page-header__description">{description}</p> : null}
      </div>
      {actions ? <div className="qf-page-header__actions">{actions}</div> : null}
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
    <div className="qf-confidence__meter" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      {Array.from({ length: segments }, (_, i) => <span key={i} className={`qf-confidence__seg ${i < on ? "qf-confidence__seg--on" : ""}`.trim()} />)}
    </div>
  );
  const val = (
    <span className="qf-confidence__value">
      <span className="qf-confidence__pct">{pct}%</span>
      {showBand ? <span className="qf-confidence__band">{confidenceBand(pct)}</span> : null}
    </span>
  );
  if (inline) return <span className={`qf-confidence qf-confidence--inline ${className}`.trim()}>{meter}{val}</span>;
  return (
    <div className={`qf-confidence ${className}`.trim()}>
      <div className="qf-confidence__row"><span className="qf-confidence__label">{label}</span>{val}</div>
      {meter}
    </div>
  );
}

// ---------------------------------------------------------------------------
// findings/SeverityBadge, runs/RunStatusBadge, approvals/ActionRiskBadge, agents/AgentStatus
// ---------------------------------------------------------------------------

const SEVERITY: Record<string, { tone: Badge_Tone; icon: string; solid?: boolean }> = {
  INFO: { tone: "active", icon: "Info" },
  LOW: { tone: "neutral", icon: "ArrowDown" },
  MEDIUM: { tone: "warning", icon: "TriangleAlert" },
  HIGH: { tone: "error", icon: "TriangleAlert" },
  CRITICAL: { tone: "error", icon: "OctagonAlert", solid: true },
};
type Badge_Tone = "neutral" | "active" | "success" | "warning" | "error";

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
  return <Badge tone={s.tone} solid={!!s.solid} size={size} icon={showIcon ? s.icon : undefined} className={`qf-risk ${className}`.trim()}>{key}</Badge>;
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
    <div className={`qf-step qf-step--${state} ${isLast ? "qf-step--last" : ""} ${className}`.trim()}>
      <span className={`qf-step__marker qf-step__marker--${state}`} aria-hidden="true">
        {STEP_MARK[state] ? <Icon name={STEP_MARK[state]} size={state === "passed" || state === "failed" ? 14 : 12} strokeWidth={2.5} /> : null}
      </span>
      <button type="button" className="qf-step__row" data-static={!expandable || undefined} aria-expanded={expandable ? open : undefined} onClick={() => expandable && setOpen((o) => !o)}>
        {index !== undefined ? <span className="qf-step__index">{String(index).padStart(2, "0")}</span> : null}
        <span className="qf-step__title">{title}</span>
        {agent ? <span className="qf-step__agent">{agent}</span> : null}
        {evidenceCount ? <span className="qf-step__evidence"><Icon name="Paperclip" size={11} />{evidenceCount}</span> : null}
        <span className="qf-step__duration">{duration || (state === "active" ? "…" : "")}</span>
        {expandable ? <Icon name="ChevronRight" size={14} className="qf-step__chevron" /> : <span style={{ width: 14 }} />}
      </button>
      {expandable && open ? (
        <div className="qf-step__detail">
          {typeof detail === "string" ? detail : Array.isArray(detail) ? detail.map((d, i) => (
            <div key={i} className="qf-step__detail-row"><span className="qf-step__detail-key">{d.key}</span><span className="qf-step__detail-val">{d.value}</span></div>
          )) : detail}
        </div>
      ) : null}
    </div>
  );
}

export function ExecutionTimeline({ steps = [], numbered = true, className = "" }: { steps?: ExecutionStepDef[]; numbered?: boolean; className?: string }) {
  return (
    <div className={`qf-timeline ${className}`.trim()} role="list">
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
    <div className={`qf-tool-call ${state !== "done" ? `qf-tool-call--${state}` : ""} ${className}`.trim()}>
      <Icon name={icon || TOOL_ICON[name] || "Wrench"} size={14} className="qf-tool-call__icon" />
      <div className="qf-tool-call__text">
        <span className="qf-tool-call__name">{name}</span>
        {arg ? <span className="qf-tool-call__arg" title={arg}>{arg}</span> : null}
      </div>
      {time ? <span className="qf-tool-call__time">{time}</span> : null}
    </div>
  );
}

const AGENT_ICON: Record<string, string> = { "QA Supervisor": "Bot", "Browser Agent": "Globe", "Evidence Agent": "Camera", "Repository Agent": "GitBranch", "Root Cause Agent": "Bug", "Report Agent": "FileText" };

export function AgentTrace({ events = [], className = "" }: { events?: TraceEvent[]; className?: string }) {
  return (
    <div className={`qf-trace ${className}`.trim()} role="log">
      {events.map((e, i) => (
        <div key={i} className={`qf-trace__row ${e.state ? `qf-trace__row--${e.state}` : ""}`.trim()}>
          <span className="qf-trace__time">{e.time}</span>
          <span className="qf-trace__agent"><Icon name={AGENT_ICON[e.agent] || "Bot"} size={13} />{e.agent}</span>
          <span className="qf-trace__event">{e.event}</span>
          <span className="qf-trace__time">{e.duration || ""}</span>
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
    <aside className={`qf-agent-inspector ${className}`.trim()} style={style} aria-label="Agent inspector">
      <div className="qf-agent-inspector__header">
        <div className="qf-agent-inspector__agent">
          <Avatar variant="agent" size="sm" name={agent} />
          <span className="qf-agent-inspector__name">{agent}</span>
        </div>
        <AgentStatus status={status} size="sm" />
      </div>
      <div className="qf-agent-inspector__body">
        {objective ? <section className="qf-agent-inspector__section"><span className="qf-agent-inspector__label">Current objective</span><p className="qf-agent-inspector__text">{objective}</p></section> : null}
        {evidence.length ? (
          <section className="qf-agent-inspector__section">
            <span className="qf-agent-inspector__label">Evidence considered</span>
            <div className="qf-agent-inspector__evidence">
              {evidence.map((e) => <span key={e.kind + e.label} className="qf-agent-inspector__evidence-item"><Icon name={EVIDENCE_ICON[e.kind] || "Paperclip"} size={13} /><strong>{e.count}</strong>{e.label}</span>)}
            </div>
          </section>
        ) : null}
        {hypothesis ? <section className="qf-agent-inspector__section"><span className="qf-agent-inspector__label">Current hypothesis</span><p className="qf-agent-inspector__hypothesis">{hypothesis}</p></section> : null}
        {confidence !== undefined ? <section className="qf-agent-inspector__section"><ConfidenceMeter value={confidence} /></section> : null}
        {tools.length ? (
          <section className="qf-agent-inspector__section">
            <span className="qf-agent-inspector__label">Tool activity</span>
            <div className="qf-agent-inspector__tools">{tools.map((t, i) => <ToolCallItem key={i} {...t} />)}</div>
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

export function EvidenceReference({ kind = "network", label, meta, href, onClick, className = "" }: { kind?: string; label: React.ReactNode; meta?: string | number; href?: string; onClick?: () => void; className?: string }) {
  const cls = ["qf-evidence-ref", meta && /^\d{3}$/.test(String(meta)) ? `qf-evidence-ref--${String(meta)[0]}xx` : "", className].filter(Boolean).join(" ");
  const inner = <><Icon name={KIND_ICON[kind] || "Paperclip"} size={12} /><span className="qf-evidence-ref__label">{label}</span>{meta ? <span className="qf-evidence-ref__meta">{meta}</span> : null}</>;
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
    <div className={`qf-screenshot ${className}`.trim()}>
      <div className="qf-screenshot__urlbar">
        <span className="qf-screenshot__dots"><i /><i /><i /></span>
        <Icon name="Lock" size={11} />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{url}</span>
      </div>
      <div className="qf-screenshot__frame">
        {src ? <img src={src} alt={alt || `Browser capture, step ${step}`} /> : (
          <div className="qf-screenshot__placeholder">
            <Icon name="Image" size={18} />
            <span>Browser screenshot</span>
            <span className="qf-mono">{step !== undefined ? `screenshot-${String(step).padStart(2, "0")}.png` : "no capture yet"}</span>
          </div>
        )}
      </div>
      <div className="qf-screenshot__footer">
        <div className="qf-screenshot__meta">
          <span>Viewport <b>{viewport}</b></span>
          <span><b>{browser}</b></span>
          {step !== undefined ? <span>Step <b>{String(step).padStart(2, "0")}</b></span> : null}
          {captured ? <span>Captured <b>{captured}</b></span> : null}
        </div>
        <div className="qf-screenshot__controls">
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
    <div className={`qf-source ${className}`.trim()}>
      <div className="qf-source__header">
        <span className="qf-source__file"><Icon name="FileCode" size={14} />{file}{range ? <span className="qf-source__range">{range}</span> : null}</span>
        <div className="qf-source__actions"><Button size="sm" variant="ghost" icon="Copy">Copy path</Button></div>
      </div>
      <pre className="qf-source__code">
        {lines.map((l) => (
          <div key={l.n} className={`qf-source__line ${l.n === errorLine ? "qf-source__line--error" : inRange(l.n) ? "qf-source__line--highlight" : ""}`.trim()}>
            <span className="qf-source__ln">{l.n}</span>
            <span>{l.text}</span>
          </div>
        ))}
      </pre>
      <div className="qf-source__footer">
        <div className="qf-source__meta">
          {commit ? <span>Commit <code>{commit}</code></span> : null}
          {branch ? <span>Branch <code>{branch}</code></span> : null}
          {repository ? <span>Repository <code>{repository}</code></span> : null}
        </div>
        <div className="qf-source__actions">
          <Button size="sm" variant="outline" icon="Github" iconRight="ExternalLink" onClick={onOpenGithub}>Open on GitHub</Button>
          <Button size="sm" variant="outline" icon="Paperclip" onClick={onAddEvidence}>Add to Evidence</Button>
        </div>
      </div>
    </div>
  );
}

const CONSOLE_LEVELS = [{ value: "DEBUG", label: "Debug" }, { value: "INFO", label: "Info" }, { value: "WARN", label: "Warn" }, { value: "ERROR", label: "Error" }];

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
    <div className={`qf-console ${className}`.trim()} style={{ height }}>
      {showToolbar ? (
        <div className="qf-console__toolbar">
          <ToggleGroupLevels items={CONSOLE_LEVELS} value={levels} onValueChange={(v) => setLevels(v as string[])} />
          <Input icon="Search" size="sm" placeholder="Search console…" value={q} onChange={(e) => setQ(e.target.value)} />
          <span className="qf-tertiary" style={{ marginLeft: "auto", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{visible.length} / {entries.length} entries</span>
        </div>
      ) : null}
      <div className="qf-console__lines">
        {visible.map((e, i) => (
          <div key={i} className={`qf-console__line ${e.level === "WARN" ? "qf-console__line--warn" : e.level === "ERROR" ? "qf-console__line--error" : ""} ${highlightIndex === entries.indexOf(e) ? "qf-console__line--highlight" : ""}`.trim()} onDoubleClick={onJump ? () => onJump(e) : undefined}>
            <span className="qf-console__time">{e.time}</span>
            <span className={`qf-console__level qf-console__level--${e.level.toLowerCase()}`}>{e.level}</span>
            <span>{e.message}</span>
            <button type="button" className="qf-console__copy" aria-label="Copy entry" onClick={() => copy(e)}><Icon name="Copy" size={12} /></button>
          </div>
        ))}
        {visible.length === 0 ? <div className="qf-console__line" style={{ color: "var(--text-tertiary)" }}><span /><span /><span>No console entries match.</span></div> : null}
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
      className={`qf-evidence-tabs ${className}`.trim()}
    />
  );
}

const METHOD_TONE: Record<string, Badge_Tone> = { GET: "neutral", POST: "active", PUT: "warning", PATCH: "warning", DELETE: "error", OPTIONS: "neutral", HEAD: "neutral" };

export function NetworkTable({ requests = [], onOpen, selectedId, compact = true, pageSize = 25, toolbar }: {
  requests?: NetworkRequest[];
  onOpen?: (r: NetworkRequest) => void;
  selectedId?: number;
  compact?: boolean;
  pageSize?: number;
  toolbar?: React.ReactNode;
}) {
  const columns: Column<NetworkRequest>[] = [
    { key: "method", header: "Method", width: 84, render: (r) => <Badge tone={METHOD_TONE[r.method] || "neutral"} size="sm" mono className="qf-method">{r.method}</Badge> },
    { key: "url", header: "Request", mono: true, render: (r) => <span className="qf-mono" style={{ color: r.status >= 400 ? "var(--text-primary)" : undefined }}>{r.url}</span> },
    { key: "status", header: "Status", width: 80, sortable: true, render: (r) => <span className={`qf-status-code qf-status-code--${String(r.status)[0]}xx`}>{r.status}</span> },
    { key: "duration", header: "Duration", width: 90, align: "right", mono: true, muted: true, sortable: true, sortValue: (r) => parseFloat(String(r.duration)), render: (r) => `${r.duration}ms` },
    { key: "initiator", header: "Initiator", muted: true, mono: true },
    { key: "size", header: "Size", width: 80, align: "right", mono: true, muted: true },
  ];
  return <DataTable columns={columns} rows={requests} onRowClick={onOpen} selectedKey={selectedId} compact={compact} pageSize={pageSize} toolbar={toolbar} totalLabel="requests" emptyText="No network activity captured." rowClassName={(r) => (r.status >= 500 ? "qf-network-row--failed" : undefined)} />;
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
    <article className={`qf-finding ${f.severity === "CRITICAL" ? "qf-finding--critical" : ""} ${className}`.trim()}>
      <header className="qf-finding__header">
        <div className="qf-finding__heading">
          <div className="qf-finding__badges">
            {f.severity ? <SeverityBadge severity={f.severity} /> : null}
            {f.status ? <Badge tone={LIFECYCLE_TONE[f.status] || "neutral"}>{f.status}</Badge> : null}
            {f.id ? <span className="qf-mono qf-tertiary" style={{ fontSize: 11 }}>{f.id}</span> : null}
          </div>
          <h3 className="qf-finding__title">{f.title}</h3>
          {f.description ? <p className="qf-finding__description">{f.description}</p> : null}
        </div>
      </header>
      <div className="qf-finding__body">
        {f.expected !== undefined || f.observed !== undefined ? (
          <div className="qf-finding__compare">
            <div className="qf-finding__cell"><span className="qf-finding__cell-label">Expected</span><code>{f.expected}</code></div>
            <div className="qf-finding__cell qf-finding__cell--observed"><span className="qf-finding__cell-label">Observed</span><code>{f.observed}</code></div>
          </div>
        ) : null}
        {f.confidence !== undefined ? <ConfidenceMeter value={f.confidence} /> : null}
        {f.evidence && f.evidence.length ? (
          <div className="qf-finding__section">
            <span className="qf-finding__label">Evidence</span>
            <div className="qf-evidence-list">{f.evidence.map((e, i) => <EvidenceReference key={i} {...e} onClick={onEvidenceClick ? () => onEvidenceClick(e) : undefined} />)}</div>
          </div>
        ) : null}
        {f.cause && !compact ? <div className="qf-finding__section"><span className="qf-finding__label">Potential cause</span><p className="qf-finding__cause">{f.cause}</p></div> : null}
      </div>
      <footer className="qf-finding__footer">
        <Button variant="outline" size="sm" icon="Search" onClick={onInspectEvidence}>Inspect Evidence</Button>
        <Button variant="primary" size="sm" icon="Github" onClick={onCreateIssue}>Create Issue</Button>
        {f.affected ? <span className="qf-finding__footer-meta">{f.affected}</span> : null}
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
    { key: "title", header: "Finding", render: (r) => <span style={{ display: "inline-block", maxWidth: 380, overflow: "hidden", textOverflow: "ellipsis", verticalAlign: "middle" }}>{r.title}</span> },
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
    { key: "objective", header: "Objective", render: (r) => <span style={{ display: "inline-block", maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis", verticalAlign: "middle" }}>{r.objective}</span> },
    { key: "repository", header: "Repository", mono: true, muted: true },
    { key: "environment", header: "Environment", render: (r) => <Badge tone={ENV_TONE[r.environment] || "neutral"} size="sm">{r.environment}</Badge> },
    { key: "status", header: "Status", sortable: true, render: (r) => <RunStatusBadge status={r.status} size="sm" /> },
    { key: "findings", header: "Findings", align: "right", sortable: true, render: (r) => (r.findings ? <span style={{ color: r.criticalFindings ? "var(--error)" : "inherit" }}>{r.findings}</span> : <span className="qf-tertiary">—</span>) },
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
    <div className={`qf-run-filters ${className}`.trim()}>
      <Input icon="Search" size="sm" className="qf-run-filters__search" placeholder="Search runs…" value={value.q || ""} onChange={(e) => set("q")(e.target.value)} />
      <Select size="sm" options={opt("All repositories", repositories)} value={value.repository || "all"} onValueChange={set("repository")} />
      <Select size="sm" options={opt("All environments", environments)} value={value.environment || "all"} onValueChange={set("environment")} />
      <Select size="sm" options={opt("Any status", STATUSES)} value={value.status || "all"} onValueChange={set("status")} />
      {showSeverity ? <Select size="sm" options={opt("Any severity", SEVERITIES)} value={value.severity || "all"} onValueChange={set("severity")} /> : null}
      <Select
        size="sm"
        options={[{ value: "all", label: "Any time" }, { value: "24h", label: "Last 24 hours" }, { value: "7d", label: "Last 7 days" }, { value: "30d", label: "Last 30 days" }]}
        value={value.date || "all"}
        onValueChange={set("date")}
      />
      {any ? <Button variant="ghost" size="sm" icon="X" className="qf-run-filters__reset" onClick={() => onChange?.({})}>Reset</Button> : null}
      <span className="qf-run-filters__spacer" />
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
    <div className={`qf-run-header ${className}`.trim()}>
      <div className="qf-run-header__top">
        <div style={{ minWidth: 0 }}>
          <div className="qf-run-header__id">{r.id}</div>
          <h1 className="qf-run-header__objective">{r.objective}</h1>
          <div className="qf-run-header__badges">
            {r.environment ? <Badge tone={ENV_TONE[r.environment] || "neutral"} solid={r.environment === "PRODUCTION"}>{r.environment}</Badge> : null}
            <RunStatusBadge status={r.status} />
            {r.plan ? <Badge caseSensitive>{r.plan}</Badge> : null}
          </div>
        </div>
        <div className="qf-run-header__actions">
          {live ? <Button variant="outline" icon="Square" onClick={onStop}>Stop Run</Button> : <Button variant="outline" icon="RotateCcw" onClick={onRerun}>Rerun</Button>}
          <DropdownMenu align="end" trigger={<Button variant="outline" size="icon" aria-label="More actions"><Icon name="Ellipsis" size={16} /></Button>} items={items} />
        </div>
      </div>
      <div className="qf-run-header__meta">
        {r.repository ? <span className="qf-run-header__meta-item"><Icon name="Github" size={14} /><code>{r.repository}</code></span> : null}
        {r.branch ? <span className="qf-run-header__meta-item"><Icon name="GitBranch" size={14} /><code>{r.branch}{r.commit ? ` @ ${r.commit}` : ""}</code></span> : null}
        {r.started ? <span className="qf-run-header__meta-item"><Icon name="Clock" size={14} />Started <code>{r.started}</code></span> : null}
        {r.elapsed ? <span className="qf-run-header__meta-item"><Icon name="Timer" size={14} />Elapsed <code>{r.elapsed}</code></span> : null}
        {r.triggeredBy ? <span className="qf-run-header__meta-item"><Icon name="User" size={14} />{r.triggeredBy}</span> : null}
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
      {repository ? <span className="qf-approval__repo"><Icon name="Github" size={14} />{repository}</span> : null}
      {title ? <div className="qf-approval__field"><span className="qf-approval__label">Title</span><span className="qf-approval__value">{title}</span></div> : null}
      {fields.map((f) => <div key={f.label} className="qf-approval__field"><span className="qf-approval__label">{f.label}</span><span className="qf-approval__value">{f.value}</span></div>)}
      {included.length ? (
        <div className="qf-approval__field">
          <span className="qf-approval__label">Included</span>
          <ul className="qf-approval__list">{included.map((x) => <li key={x}><Icon name="Check" size={13} />{x}</li>)}</ul>
        </div>
      ) : null}
      <div className="qf-approval__field"><span className="qf-approval__label">Authority</span><span><ActionRiskBadge risk={risk} /></span></div>
    </AlertDialog>
  );
}

// Re-exports used by screens for convenience.
export { Card, Progress, Separator, Empty, Spinner };
