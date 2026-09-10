"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ToastDef } from "./overlays";

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
  toasts: ToastDef[];
  go: Go;
  toast: (t: Omit<ToastDef, "id">) => void;
  dismissToast: (id: string | number) => void;
}

const QAForgeContext = React.createContext<QAForgeState | null>(null);

export function useQAForge(): QAForgeState {
  const ctx = React.useContext(QAForgeContext);
  if (!ctx) throw new Error("useQAForge must be used within <QAForgeProvider>");
  return ctx;
}

export function QAForgeProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [toasts, setToasts] = React.useState<ToastDef[]>([]);

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

  const value = React.useMemo<QAForgeState>(() => ({ toasts, go, toast, dismissToast }), [toasts, go, toast, dismissToast]);

  return <QAForgeContext.Provider value={value}>{children}</QAForgeContext.Provider>;
}
