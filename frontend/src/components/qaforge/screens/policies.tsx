"use client";

import * as React from "react";
import { Alert, Badge } from "../primitives";
import { Field, Select, Switch } from "../forms";
import { AlertDialog } from "../overlays";
import { ActionRiskBadge, Card, PageHeader } from "../domain";
import { useQAForge } from "../provider";
import { initialPolicies, type PolicyRow } from "@/data/qaforge";

// Ported from the imported design project's app/screens/policies.jsx.

const VERDICTS = ["ALLOW", "REQUIRE APPROVAL", "DENY"] as const;

function PolicyCard({ env, rows, onChange, locked }: { env: "STAGING" | "PRODUCTION"; rows: PolicyRow[]; onChange: (env: "STAGING" | "PRODUCTION", action: string, verdict: string) => void; locked?: boolean }) {
  const prod = env === "PRODUCTION";
  return (
    <Card padding="none" title={<span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><Badge tone={prod ? "error" : env === "STAGING" ? "active" : "neutral"} solid={prod}>{env}</Badge>{prod ? <span style={{ fontSize: 12, fontWeight: 400, color: "var(--text-tertiary)" }}>stricter policy · changes require a second approver</span> : null}</span>}>
      <div style={{ padding: "12px 16px 4px" }}>
        {rows.map((r) => (
          <div key={r.action} className="qf-policy-row">
            <div>
              <div className="qf-policy-row__action">{r.action}</div>
              <div className="qf-policy-row__hint">{r.verdict === "DENY" ? "Agent will never attempt this action" : r.verdict === "REQUIRE APPROVAL" ? "Run pauses until a human approves" : "Agent acts autonomously"}</div>
            </div>
            <ActionRiskBadge risk={r.verdict} size="sm" />
            <Select size="sm" value={r.verdict} disabled={locked} onValueChange={(v) => onChange(env, r.action, v)} options={VERDICTS as unknown as string[]} style={{ width: 170 }} />
          </div>
        ))}
      </div>
    </Card>
  );
}

export function PoliciesScreen() {
  const { toast } = useQAForge();
  const [policies, setPolicies] = React.useState(initialPolicies);
  const [pending, setPending] = React.useState<{ env: "STAGING" | "PRODUCTION"; action: string; verdict: string; prev: string } | null>(null);
  const [locked, setLocked] = React.useState(true);
  const change = (env: "STAGING" | "PRODUCTION", action: string, verdict: string) => {
    const prev = policies[env].find((r) => r.action === action)!.verdict;
    const loosening = VERDICTS.indexOf(verdict as (typeof VERDICTS)[number]) < VERDICTS.indexOf(prev as (typeof VERDICTS)[number]);
    if (loosening || env === "PRODUCTION") { setPending({ env, action, verdict, prev }); return; }
    apply(env, action, verdict);
  };
  const apply = (env: "STAGING" | "PRODUCTION", action: string, verdict: string) => {
    setPolicies((p) => ({ ...p, [env]: p[env].map((r) => (r.action === action ? { ...r, verdict: verdict as PolicyRow["verdict"] } : r)) }));
    toast({ tone: "success", title: "Policy updated", description: `${env} · ${action} → ${verdict}` });
    setPending(null);
  };
  return (
    <div className="qf-page" style={{ maxWidth: 1100 }}>
      <PageHeader title="Policies" description="Make autonomous authority explicit. Every consequential action is ALLOW, REQUIRE APPROVAL or DENY per environment." actions={<Field orientation="horizontal" label="Lock production policy"><Switch checked={locked} onCheckedChange={setLocked} /></Field>} />
      <Alert tone="info" title="Loosening a policy requires confirmation" description="Moving any action toward ALLOW, or changing PRODUCTION, opens an approval dialog. Tightening applies immediately." />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>
        <PolicyCard env="STAGING" rows={policies.STAGING} onChange={change} />
        <PolicyCard env="PRODUCTION" rows={policies.PRODUCTION} onChange={change} locked={locked} />
      </div>
      <AlertDialog
        open={!!pending}
        onOpenChange={() => setPending(null)}
        tone={pending && pending.verdict === "ALLOW" ? "destructive" : "warning"}
        title="Change policy?"
        description={pending ? `${pending.env} · ${pending.action}: ${pending.prev} → ${pending.verdict}. This widens what the agent may do without a human.` : ""}
        confirmLabel="Apply change"
        onConfirm={() => pending && apply(pending.env, pending.action, pending.verdict)}
      />
    </div>
  );
}
