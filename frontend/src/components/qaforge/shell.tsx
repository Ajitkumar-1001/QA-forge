"use client";

import * as React from "react";
import Link from "next/link";
import { Icon } from "./icon";
import { Badge, Avatar } from "./primitives";
import { Breadcrumb, type BreadcrumbItemDef } from "./primitives";
import { Button, Kbd } from "./primitives";
import { Command, type CommandGroup } from "./overlays";

// Ported from the imported design project's component bundle (components/{shell,ui/navigation}/**).

// ---------------------------------------------------------------------------
// ui/navigation/Sidebar (generic) + shell/AppSidebar (QAForge nav)
// ---------------------------------------------------------------------------

export interface SidebarItem { id: string; label: string; icon?: string; href: string; badge?: React.ReactNode }
export interface SidebarGroup { label?: string; items: SidebarItem[] }

export function Sidebar({ wordmark = "QAForge", groups = [], activeId, collapsed = false, onToggleCollapse, workspace, user, footer, className = "", style }: {
  wordmark?: string;
  groups?: SidebarGroup[];
  activeId?: string;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  workspace?: { name: string; plan?: string; initials?: string; onClick?: () => void };
  user?: { name: string; email?: string; initials?: string; onClick?: () => void };
  footer?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <aside className={`qf-sidebar ${collapsed ? "qf-sidebar--collapsed" : ""} ${className}`.trim()} style={style} aria-label="Primary">
      <div className="qf-sidebar__header">
        <span className="qf-sidebar__wordmark">{collapsed ? wordmark.slice(0, 2) : wordmark}</span>
        {onToggleCollapse && !collapsed ? (
          <button type="button" className="qf-btn qf-btn--ghost qf-btn--icon qf-btn--sm" style={{ marginLeft: "auto" }} aria-label="Collapse sidebar" onClick={onToggleCollapse}>
            <Icon name="PanelLeftClose" size={14} />
          </button>
        ) : null}
      </div>
      <nav className="qf-sidebar__content">
        {groups.map((g, gi) => (
          <div key={g.label || gi} className="qf-sidebar__group">
            {g.label ? <div className="qf-sidebar__group-label">{g.label}</div> : null}
            {g.items.map((it) => (
              <Link key={it.id} href={it.href} className="qf-sidebar__item" aria-current={it.id === activeId ? "page" : undefined} title={collapsed ? it.label : undefined}>
                {it.icon ? <Icon name={it.icon} size={16} /> : null}
                <span className="qf-sidebar__item-label">{it.label}</span>
                {it.badge !== undefined ? <span className="qf-sidebar__item-badge">{it.badge}</span> : null}
              </Link>
            ))}
          </div>
        ))}
      </nav>
      <div className="qf-sidebar__footer">
        {footer}
        {workspace ? (
          <button type="button" className="qf-sidebar__workspace" onClick={workspace.onClick}>
            <span className="qf-avatar qf-avatar--sm qf-avatar--square">{workspace.initials || (workspace.name || "").slice(0, 2)}</span>
            <span className="qf-sidebar__workspace-text"><span>{workspace.name}</span>{workspace.plan ? <small>{workspace.plan}</small> : null}</span>
            <Icon name="ChevronsUpDown" size={14} style={{ color: "var(--text-tertiary)" }} />
          </button>
        ) : null}
        {user ? (
          <button type="button" className="qf-sidebar__workspace" onClick={user.onClick}>
            <span className="qf-avatar qf-avatar--sm">{user.initials || (user.name || "").split(" ").map((s) => s[0]).join("").slice(0, 2)}</span>
            <span className="qf-sidebar__workspace-text"><span>{user.name}</span>{user.email ? <small>{user.email}</small> : null}</span>
            <Icon name="EllipsisVertical" size={14} style={{ color: "var(--text-tertiary)" }} />
          </button>
        ) : null}
        {collapsed && onToggleCollapse ? (
          <button type="button" className="qf-sidebar__item" aria-label="Expand sidebar" onClick={onToggleCollapse}><Icon name="PanelLeftOpen" size={16} /></button>
        ) : null}
      </div>
    </aside>
  );
}

/** QAForge primary navigation with the fixed IA (design.md §14/§47). */
export const APP_NAV: SidebarGroup[] = [
  { items: [{ id: "dashboard", label: "Overview", icon: "LayoutDashboard", href: "/dashboard" }] },
  { label: "Runs", items: [
    { id: "runs", label: "Runs", icon: "Play", href: "/runs" },
    { id: "test-plans", label: "Test Plans", icon: "FlaskConical", href: "/test-plans" },
    { id: "findings", label: "Findings", icon: "Bug", href: "/findings" },
  ] },
  { label: "Workspace", items: [
    { id: "repositories", label: "Repositories", icon: "GitBranch", href: "/repositories" },
    { id: "environments", label: "Environments", icon: "Server", href: "/environments" },
  ] },
  { label: "System", items: [
    { id: "agent-activity", label: "Agent Activity", icon: "Bot", href: "/agent-activity" },
    { id: "policies", label: "Policies", icon: "ShieldCheck", href: "/policies" },
    { id: "settings", label: "Settings", icon: "Settings", href: "/settings" },
  ] },
];

export function AppSidebar({ activeId = "dashboard", collapsed = false, onToggleCollapse, counts = {}, workspace = { name: "qa-forge", plan: "Team workspace" }, user = { name: "Dana Okafor", email: "dana@qaforge.dev" }, className = "", style }: {
  activeId?: string;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  counts?: Record<string, number>;
  workspace?: { name: string; plan?: string };
  user?: { name: string; email?: string };
  className?: string;
  style?: React.CSSProperties;
}) {
  const groups = APP_NAV.map((g) => ({
    ...g,
    items: g.items.map((it) => (counts[it.id] !== undefined ? { ...it, badge: <Badge tone={it.id === "findings" ? "error" : "active"} size="sm">{counts[it.id]}</Badge> } : it)),
  }));
  return <Sidebar groups={groups} activeId={activeId} collapsed={collapsed} onToggleCollapse={onToggleCollapse} workspace={workspace} user={user} className={className} style={style} />;
}

// ---------------------------------------------------------------------------
// shell/TopBar
// ---------------------------------------------------------------------------

const ENV_TONE: Record<string, "neutral" | "active" | "error"> = { LOCAL: "neutral", PREVIEW: "neutral", STAGING: "active", PRODUCTION: "error" };

export function TopBar({ breadcrumb = [], environment, onSearch, hasNotifications = false, onNotifications, user = { name: "Dana Okafor" }, onUser, actions, className = "" }: {
  breadcrumb?: BreadcrumbItemDef[];
  environment?: string;
  onSearch?: () => void;
  hasNotifications?: boolean;
  onNotifications?: () => void;
  user?: { name: string };
  onUser?: () => void;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={`qf-topbar ${className}`.trim()}>
      <div className="qf-topbar__left"><Breadcrumb items={breadcrumb} /></div>
      <div className="qf-topbar__right">
        {actions}
        {environment ? <Badge tone={ENV_TONE[environment] || "neutral"} solid={environment === "PRODUCTION"} icon={environment === "PRODUCTION" ? "TriangleAlert" : undefined}>{environment}</Badge> : null}
        <Button variant="outline" size="sm" className="qf-topbar__search" onClick={onSearch} aria-label="Open command palette">
          <Icon name="Search" size={14} />
          Search or jump to…
          <Kbd keys={["⌘", "K"]} />
        </Button>
        <Button variant="ghost" size="icon-sm" className="qf-topbar__bell" aria-label="Notifications" onClick={onNotifications}>
          <Icon name="Bell" size={16} />
          {hasNotifications ? <span className="qf-topbar__bell-dot" /> : null}
        </Button>
        <button type="button" onClick={onUser} style={{ all: "unset", cursor: "pointer", display: "inline-flex" }} aria-label="Account menu">
          <Avatar name={user.name} size="sm" />
        </button>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// shell/CommandMenu — ⌘K palette with the fixed QAForge action set (design.md §37)
// ---------------------------------------------------------------------------

export function commandGroups(): CommandGroup[] {
  return [
    { heading: "Actions", items: [
      { id: "new-run", label: "New QA Run", icon: "Play", shortcut: ["N"] },
      { id: "search-finding", label: "Search Finding", icon: "Bug" },
    ] },
    { heading: "Go to", items: [
      { id: "runs", label: "Go to Runs", icon: "ListChecks", shortcut: ["G", "R"] },
      { id: "repositories", label: "Open Repository", icon: "GitBranch" },
      { id: "agent-activity", label: "Open Agent Activity", icon: "Bot" },
      { id: "settings", label: "Open Settings", icon: "Settings", shortcut: ["G", "S"] },
    ] },
  ];
}

export function CommandMenu({ open = false, onOpenChange, onAction, extraGroups = [] }: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onAction?: (id: string, item: CommandGroup["items"][number]) => void;
  extraGroups?: CommandGroup[];
}) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); onOpenChange?.(!open); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);
  return <Command asDialog open={open} onOpenChange={onOpenChange} groups={[...commandGroups(), ...extraGroups]} onSelect={(it) => onAction?.(it.id, it)} />;
}
