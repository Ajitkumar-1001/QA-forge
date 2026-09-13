"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "./icon";
import { Avatar, Badge, Breadcrumb, type BreadcrumbItemDef, Button, Kbd } from "./primitives";
import { Command, DropdownMenu, type CommandGroup, type MenuItemDef } from "./overlays";
import { useQAForge } from "./provider";
import { authClient } from "@/lib/auth-client";
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

export interface SidebarNavItem { id: string; label: string; icon?: string; href: string; count?: number }
export interface SidebarNavGroup { label?: string; items: SidebarNavItem[] }

// Test Plans, Findings, Repositories, Policies removed: no PRD backing / no DB table,
// or a duplicate of a real surface wired elsewhere (Repositories duplicated /settings).
// Agent Activity and Environments (added back) are real, derived views — no new tables:
// Agent Activity flattens the modelCalls every run already stores; Environments groups
// existing project rows (applicationUrl + repository). Neither duplicates run-detail's
// per-run Agent Trace or the Runs list — both are cross-run/cross-project rollups.
export const APP_NAV: SidebarNavGroup[] = [
  { items: [{ id: "dashboard", label: "Overview", icon: "LayoutDashboard", href: "/dashboard" }] },
  { label: "Runs", items: [
    { id: "runs", label: "Runs", icon: "Play", href: "/runs" },
    { id: "agent-activity", label: "Agent Activity", icon: "Activity", href: "/agent-activity" },
  ] },
  { label: "System", items: [
    { id: "environments", label: "Environments", icon: "Globe", href: "/environments" },
    { id: "settings", label: "Settings", icon: "Settings", href: "/settings" },
  ] },
];

export function AppSidebar({ activeId = "dashboard", counts = {}, workspace = { name: "qa-forge", plan: "Team workspace" }, user = { name: "Dana Okafor", email: "dana@qaforge.dev" }, ...props }: {
  activeId?: string;
  counts?: Record<string, number>;
  workspace?: { name: string; plan?: string; onClick?: () => void };
  user?: { name: string; email?: string; onClick?: () => void };
} & React.ComponentProps<typeof Sidebar>) {
  const router = useRouter();
  const { toast } = useQAForge();
  const userMenuItems: MenuItemDef[] = [
    { label: "Settings", icon: "Settings", onSelect: () => router.push("/settings") },
    { type: "separator" },
    {
      label: "Log out",
      icon: "LogOut",
      destructive: true,
      onSelect: async () => {
        const { error } = await authClient.signOut();
        if (error) {
          toast({ title: "Couldn't sign out", description: "Please try again.", tone: "error" });
          return;
        }
        router.push("/sign-in");
      },
    },
  ];
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
            <DropdownMenu
              align="end"
              trigger={
                <SidebarMenuButton size="lg" onClick={user.onClick}>
                  <Avatar name={user.name} size="sm" />
                  <span className="grid flex-1 text-left leading-tight">
                    <span className="truncate">{user.name}</span>
                    {user.email ? <span className="truncate text-xs text-sidebar-foreground/60">{user.email}</span> : null}
                  </span>
                  <Icon name="EllipsisVertical" size={14} className="text-sidebar-foreground/60" />
                </SidebarMenuButton>
              }
              items={userMenuItems}
            />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

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

export function commandGroups(): CommandGroup[] {
  return [
    { heading: "Actions", items: [
      { id: "new-run", label: "New QA Run", icon: "Play", shortcut: ["N"] },
    ] },
    { heading: "Go to", items: [
      { id: "runs", label: "Go to Runs", icon: "ListChecks", shortcut: ["G", "R"] },
      { id: "agent-activity", label: "Go to Agent Activity", icon: "Activity" },
      { id: "environments", label: "Go to Environments", icon: "Globe" },
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
