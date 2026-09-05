"use client";

import * as React from "react";
import Link from "next/link";
import { Icon } from "./icon";
import { Avatar, Badge, Breadcrumb, type BreadcrumbItemDef, Button, Kbd } from "./primitives";
import { Command, type CommandGroup } from "./overlays";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";

// Ported from the imported design project's component bundle (components/{shell,ui/navigation}/**).
// AppSidebar now composes the real shadcn/ui Sidebar primitive (src/components/ui/sidebar.tsx)
// instead of a hand-rolled qf-sidebar — collapsed/expanded state and mobile behavior come from
// SidebarProvider (wired in app-shell.tsx), not local props.

// ---------------------------------------------------------------------------
// shell/AppSidebar (QAForge nav)
// ---------------------------------------------------------------------------

export interface SidebarNavItem { id: string; label: string; icon?: string; href: string; count?: number }
export interface SidebarNavGroup { label?: string; items: SidebarNavItem[] }

/** QAForge primary navigation with the fixed IA (design.md §14/§47). */
export const APP_NAV: SidebarNavGroup[] = [
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

export function AppSidebar({ activeId = "dashboard", counts = {}, workspace = { name: "qa-forge", plan: "Team workspace" }, user = { name: "Dana Okafor", email: "dana@qaforge.dev" }, ...props }: {
  activeId?: string;
  counts?: Record<string, number>;
  workspace?: { name: string; plan?: string; onClick?: () => void };
  user?: { name: string; email?: string; onClick?: () => void };
} & React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className="flex-row items-center justify-between border-b border-sidebar-border px-3 py-0 h-(--topbar-height)">
        <span className="text-sm font-semibold tracking-tight group-data-[collapsible=icon]:hidden">QAForge</span>
        <SidebarTrigger className="ml-auto group-data-[collapsible=icon]:mx-auto" />
      </SidebarHeader>
      <SidebarContent>
        {APP_NAV.map((g, gi) => (
          <SidebarGroup key={g.label || gi}>
            {g.label ? <SidebarGroupLabel>{g.label}</SidebarGroupLabel> : null}
            <SidebarMenu>
              {g.items.map((it) => (
                <SidebarMenuItem key={it.id}>
                  <SidebarMenuButton isActive={it.id === activeId} tooltip={it.label} className="text-sidebar-foreground no-underline hover:no-underline" render={<Link href={it.href} />}>
                    {it.icon ? <Icon name={it.icon} size={16} /> : null}
                    <span>{it.label}</span>
                  </SidebarMenuButton>
                  {counts[it.id] !== undefined ? <SidebarMenuBadge>{counts[it.id]}</SidebarMenuBadge> : null}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" onClick={workspace.onClick}>
              <Avatar name={workspace.name} shape="square" size="sm" />
              <span className="grid flex-1 text-left leading-tight">
                <span className="truncate">{workspace.name}</span>
                {workspace.plan ? <span className="truncate text-xs text-sidebar-foreground/60">{workspace.plan}</span> : null}
              </span>
              <Icon name="ChevronsUpDown" size={14} className="text-sidebar-foreground/60" />
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" onClick={user.onClick}>
              <Avatar name={user.name} size="sm" />
              <span className="grid flex-1 text-left leading-tight">
                <span className="truncate">{user.name}</span>
                {user.email ? <span className="truncate text-xs text-sidebar-foreground/60">{user.email}</span> : null}
              </span>
              <Icon name="EllipsisVertical" size={14} className="text-sidebar-foreground/60" />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
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
    <header className={`flex h-(--topbar-height) shrink-0 items-center justify-between gap-4 border-b border-border px-4 ${className}`.trim()}>
      <div className="min-w-0 flex-1"><Breadcrumb items={breadcrumb} /></div>
      <div className="flex shrink-0 items-center gap-2">
        {actions}
        {environment ? (
          <Badge tone={ENV_TONE[environment] || "neutral"} solid={environment === "PRODUCTION"} icon={environment === "PRODUCTION" ? "TriangleAlert" : undefined}>
            {environment}
          </Badge>
        ) : null}
        <Button variant="outline" size="sm" onClick={onSearch} aria-label="Open command palette">
          <Icon name="Search" size={14} />
          Search or jump to…
          <Kbd keys={["⌘", "K"]} />
        </Button>
        <Button variant="ghost" size="icon-sm" className="relative" aria-label="Notifications" onClick={onNotifications}>
          <Icon name="Bell" size={16} />
          {hasNotifications ? <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-status-active" /> : null}
        </Button>
        <button type="button" onClick={onUser} className="inline-flex cursor-pointer" aria-label="Account menu">
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
