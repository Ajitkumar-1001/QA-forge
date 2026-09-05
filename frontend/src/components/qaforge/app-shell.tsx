"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { AppSidebar, CommandMenu, TopBar } from "./shell";
import { ToastRegion } from "./overlays";
import { useQAForge, LIVE_STATUSES } from "./provider";
import { MobileReview } from "./screens/mobile";

// Ported from the imported design project's app/app.jsx — the shell (sidebar + top bar + command
// palette + toasts) that wraps every route. Screens/routes derive from the real pathname instead
// of the source's hash-based `route` state; the mobile split (<720px) is now the design system's
// documented "review/approve subset", not the prototype's manual Desktop/Mobile toggle button
// (dropped — that button existed only so a demo on a desktop browser could preview the phone layout).

const TITLES: Record<string, string> = {
  dashboard: "Overview", runs: "Runs", "new-run": "New QA Run", "test-plans": "Test Plans",
  findings: "Findings", repositories: "Repositories", environments: "Environments",
  "agent-activity": "Agent Activity", policies: "Policies", settings: "Settings", approval: "Approval Draft",
};

function useIsMobile(breakpoint = 720) {
  const [isMobile, setIsMobile] = React.useState(false);
  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const onChange = () => setIsMobile(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [breakpoint]);
  return isMobile;
}

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

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { runs, findings, approvals, toasts, go, dismissToast } = useQAForge();
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = React.useState(false);
  const [cmdOpen, setCmdOpen] = React.useState(false);

  const { screen, runId } = currentScreen(pathname);
  const run = runId ? runs.find((r) => r.id === runId) : undefined;
  const envForBar = run ? run.environment : screen === "policies" || screen === "environments" ? undefined : "STAGING";
  const crumbs = run
    ? [
        { label: "Runs", onClick: () => go("runs") },
        { label: run.id, mono: true, onClick: screen === "approval" ? () => go("run", { runId: run.id }) : undefined },
        ...(screen === "approval" ? [{ label: "Approval Draft" }] : []),
      ]
    : [{ label: "qa-forge", onClick: () => go("dashboard") }, { label: TITLES[screen] || "Overview" }];
  const activeNav = ["run", "new-run", "approval"].includes(screen) ? "runs" : screen;
  const liveCount = runs.filter((r) => LIVE_STATUSES.includes(r.status)).length;
  const pendingCount = Object.values(approvals).filter((a) => a.status === "PENDING").length;
  const openCritical = findings.filter((f) => f.severity === "CRITICAL" && !["RESOLVED", "DISMISSED"].includes(f.status)).length;

  if (isMobile) {
    return (
      <div style={{ height: "100vh", display: "flex", justifyContent: "center", background: "var(--background)" }}>
        <div style={{ width: "min(100%, 420px)", height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
          {/* ponytail: there's no real "switch to desktop" on a genuinely narrow viewport (the
              source's Desktop/Mobile toggle was a demo-only device switcher, dropped here) — this
              just takes the reader to the dashboard route within the mobile-reduced UI. */}
          <MobileReview onSwitchToDesktop={() => go("dashboard")} />
        </div>
        <ToastRegion toasts={toasts} onDismiss={dismissToast} />
      </div>
    );
  }

  return (
    <div className="qf-shell" style={{ height: "100vh" }}>
      <AppSidebar activeId={activeNav} collapsed={collapsed} onToggleCollapse={() => setCollapsed((c) => !c)} counts={{ runs: liveCount, findings: openCritical }} />
      <div className="qf-shell__main">
        <TopBar breadcrumb={crumbs} environment={envForBar} onSearch={() => setCmdOpen(true)} hasNotifications={liveCount + pendingCount > 0} onNotifications={() => go("agent-activity")} onUser={() => go("settings")} />
        <div className="qf-shell__page" style={{ display: "flex", flexDirection: "column" }}>{children}</div>
      </div>
      <CommandMenu
        open={cmdOpen}
        onOpenChange={setCmdOpen}
        onAction={(id) => {
          if (id === "search-finding") go("findings");
          else if (id.startsWith("QF-")) go("run", { runId: id });
          else go(id);
        }}
        extraGroups={[{ heading: "Recent runs", items: runs.slice(0, 3).map((r) => ({ id: r.id, label: `${r.id} · ${r.objective}`, icon: "Play", hint: r.status.replace("_", " ") })) }]}
      />
      <ToastRegion toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
