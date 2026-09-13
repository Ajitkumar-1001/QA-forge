"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { AppSidebar, CommandMenu, TopBar } from "./shell";
import { ToastRegion } from "./overlays";
import { useQAForge } from "./provider";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

const TITLES: Record<string, string> = {
  dashboard: "Overview", runs: "Runs", "new-run": "New QA Run", settings: "Settings", approval: "Approval Draft",
  "agent-activity": "Agent Activity", environments: "Environments",
};

function currentScreen(pathname: string): { screen: string; runId?: string } {
  const segs = pathname.replace(/^\/|\/$/g, "").split("/").filter(Boolean);
  if (segs.length === 0) return { screen: "dashboard" };
  if (segs[0] === "runs") {
    if (segs[1] === "new") return { screen: "new-run" };
    if (segs[1]) return { screen: segs[2] === "approval" ? "approval" : "run", runId: segs[1] };
    return { screen: "runs" };
  }
  return { screen: segs[0] };
}

const SHELL_LESS_ROUTES = ["/sign-in"];

// The sidebar's own responsive Sheet (src/components/ui/sidebar.tsx's useIsMobile) already
// handles narrow viewports — this component used to duplicate that with its own
// useIsMobile() + a full-page swap to a fully mock MobileReview screen, discarding whatever
// real page was actually being viewed. Removed; real content now renders at every width.
export function AppShell({ children, liveRunCount, pendingApprovalCount, user }: {
  children: React.ReactNode;
  liveRunCount: number;
  pendingApprovalCount: number;
  user?: { name: string; email: string };
}) {
  const pathname = usePathname();
  const { toasts, go, dismissToast } = useQAForge();
  const [cmdOpen, setCmdOpen] = React.useState(false);

  if (SHELL_LESS_ROUTES.includes(pathname)) {
    return <>{children}</>;
  }

  const { screen, runId } = currentScreen(pathname);
  // No real per-run title/environment is fetched here (that would mean a second data fetch
  // just for the breadcrumb) — the run's own id is all the breadcrumb shows.
  const crumbs = runId
    ? [
        { label: "Runs", onClick: () => go("runs") },
        { label: runId, mono: true, onClick: screen === "approval" ? () => go("run", { runId }) : undefined },
        ...(screen === "approval" ? [{ label: "Approval Draft" }] : []),
      ]
    : [{ label: "qa-forge", onClick: () => go("dashboard") }, { label: TITLES[screen] || "Overview" }];
  const activeNav = ["run", "new-run", "approval"].includes(screen) ? "runs" : screen;

  return (
    <SidebarProvider style={{ "--sidebar-width": "248px", "--sidebar-width-icon": "52px" } as React.CSSProperties}>
      <AppSidebar activeId={activeNav} counts={{ runs: liveRunCount }} user={user} />
      <SidebarInset>
        <TopBar breadcrumb={crumbs} onSearch={() => setCmdOpen(true)} hasNotifications={liveRunCount + pendingApprovalCount > 0} onNotifications={() => go("agent-activity")} onUser={() => go("settings")} user={user} />
        <div className="flex flex-1 flex-col overflow-auto">{children}</div>
      </SidebarInset>
      {/* extraGroups (a "Recent runs" quick-jump list keyed by the mock's QF-#### id scheme)
          removed — real run ids are UUIDs, and there is no real recent-runs fetch wired to
          this command palette yet (YAGNI: no user-visible need identified for it). */}
      <CommandMenu open={cmdOpen} onOpenChange={setCmdOpen} onAction={(id) => go(id)} />
      <ToastRegion toasts={toasts} onDismiss={dismissToast} />
    </SidebarProvider>
  );
}
