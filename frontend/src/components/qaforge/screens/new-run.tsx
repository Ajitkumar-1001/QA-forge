"use client";

import * as React from "react";
import { Alert, Button, Card, Separator } from "../primitives";
import { Checkbox, Combobox, Field, Input, RadioGroup, Select, Textarea } from "../forms";
import { ActionRiskBadge, PageHeader } from "../domain";
import { useQAForge } from "../provider";
import { initialPolicies, type Environment } from "@/data/qaforge";

// Ported from the imported design project's app/screens/new-run.jsx.

const ENV_URL: Record<Environment["id"], string> = {
  LOCAL: "http://localhost:3000",
  PREVIEW: "https://pr-412.preview.qaforge.dev",
  STAGING: "https://staging.qaforge.dev",
  PRODUCTION: "https://app.qaforge.dev",
};

export function NewRunScreen() {
  const { go, startRun } = useQAForge();
  const [repo, setRepo] = React.useState("qa-forge/web");
  const [env, setEnv] = React.useState<Environment["id"]>("STAGING");
  const [url, setUrl] = React.useState(ENV_URL.STAGING);
  const [objective, setObjective] = React.useState("Verify that a new user can sign up, authenticate and reach the dashboard.");
  const [mode, setMode] = React.useState("guided");
  const [opts, setOpts] = React.useState({ shots: true, net: true, console: true, source: true, report: true });
  const [error, setError] = React.useState("");
  const setOpt = (k: keyof typeof opts) => (v: boolean) => setOpts((o) => ({ ...o, [k]: v }));
  const changeEnv = (v: string) => { const e = v as Environment["id"]; setEnv(e); setUrl(ENV_URL[e]); };
  const start = () => {
    if (objective.trim().length < 12) { setError("Describe the journey to verify in at least one full sentence."); return; }
    // ponytail: `url` and `mode` are collected here but the mock backend (provider.startRun)
    // doesn't consume them yet — add when a real run-execution API exists.
    startRun({ repository: repo, environment: env, objective: objective.trim() });
  };
  const policy = initialPolicies[env === "PRODUCTION" ? "PRODUCTION" : "STAGING"];
  return (
    <div className="qf-page" style={{ maxWidth: 1080 }}>
      <PageHeader title="New QA Run" description="Define the objective. QAForge plans the journey, executes it against the environment and investigates failures." actions={<Button variant="ghost" onClick={() => go("runs")}>Cancel</Button>} />
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 320px", gap: 20, alignItems: "start" }}>
        <Card padding="large">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px 20px" }}>
            <Field label="Repository" required>
              <Combobox icon="Github" value={repo} onValueChange={setRepo} options={[
                { value: "qa-forge/web", label: "qa-forge/web", hint: "main" },
                { value: "qa-forge/api", label: "qa-forge/api", hint: "main" },
                { value: "qa-forge/docs", label: "qa-forge/docs", hint: "next" },
              ]} />
            </Field>
            <Field label="Environment" required>
              <Select value={env} onValueChange={changeEnv} options={["LOCAL", "PREVIEW", "STAGING", "PRODUCTION"]} />
            </Field>
            <Field label="Target URL" htmlFor="url" description="Defaults to the environment base URL." style={{ gridColumn: "1 / -1" }}>
              <Input id="url" mono value={url} onChange={(e) => setUrl(e.target.value)} />
            </Field>
            <Field label="Test Objective" htmlFor="objective" required error={error} description="One journey per run. Name the expected end state." style={{ gridColumn: "1 / -1" }}>
              <Textarea id="objective" rows={3} value={objective} onChange={(e) => { setObjective(e.target.value); setError(""); }} />
            </Field>
            <Field label="Execution Mode">
              <RadioGroup value={mode} onValueChange={setMode} options={[
                { value: "guided", label: "Guided", description: "Pauses for approval before any consequential action." },
                { value: "autonomous", label: "Autonomous", description: "Runs to completion within the environment policy." },
              ]} />
            </Field>
            <Field label="Options">
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <Checkbox checked={opts.shots} onCheckedChange={setOpt("shots")} label="Capture screenshots" />
                <Checkbox checked={opts.net} onCheckedChange={setOpt("net")} label="Capture network activity" />
                <Checkbox checked={opts.console} onCheckedChange={setOpt("console")} label="Capture browser console" />
                <Checkbox checked={opts.source} onCheckedChange={setOpt("source")} label="Investigate source on failure" />
                <Checkbox checked={opts.report} onCheckedChange={setOpt("report")} label="Generate root-cause report" />
              </div>
            </Field>
          </div>
          <Separator />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button variant="outline" onClick={() => go("runs")}>Cancel</Button>
            <Button variant="primary" icon="Play" onClick={start}>Start QA Run</Button>
          </div>
        </Card>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {env === "PRODUCTION" ? <Alert tone="warning" title="Production environment" description="Form submission requires approval; data deletion and code pushes are denied. Runs use a read-only session." /> : null}
          <Card title={`${env} policy`} titleSize="sm" description="Authority granted to the agent in this environment" padding="compact">
            <div style={{ display: "flex", flexDirection: "column" }}>
              {policy.map((p) => (
                <div key={p.action} className="qf-policy-row" style={{ padding: "7px 0" }}>
                  <span className="qf-policy-row__action" style={{ fontSize: 13 }}>{p.action}</span>
                  <ActionRiskBadge risk={p.verdict} size="sm" />
                </div>
              ))}
            </div>
            <Button variant="link" size="sm" onClick={() => go("policies")}>Edit policies</Button>
          </Card>
          <Card title="Credentials" titleSize="sm" padding="compact">
            <div style={{ fontSize: 13, color: "var(--text-secondary)", display: "flex", flexDirection: "column", gap: 4 }}>
              <span>Test users from <code className="qf-mono">vault: qa/{env.toLowerCase()}</code></span>
              <span>Secrets are never shown in QAForge.</span>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
