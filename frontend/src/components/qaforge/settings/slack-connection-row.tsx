"use client";

import { useActionState } from "react";
import { Badge, Button } from "../primitives";
import { Field, Input } from "../forms";
import { GithubGateNotice } from "./github-gate-notice";
import { connectSlackAction, disconnectSlackAction, type ConnectSlackState } from "@/app/settings/actions";

export type SlackConnectionData = { connected: false } | { connected: true };

const initialConnectState: ConnectSlackState = { error: null };

// 008-slack-linear-integrations: mirrors GithubConnectionRow's shape (data-model.md's own
// naming of this precedent) — one field, no live-verify call at connect time (FR-012's
// scheme+hostname check is the entire validation, done server-side in connectSlackAction).
export function SlackConnectionRow({ data, githubConnected }: { data: SlackConnectionData; githubConnected: boolean }) {
  const [state, formAction, isPending] = useActionState(connectSlackAction, initialConnectState);

  // FR-019: an existing connection stays visible and removable even while GitHub is
  // disconnected (suspended, not deleted) — the GitHub gate below only blocks *creating* a
  // new one (FR-017). Checking data.connected first, not githubConnected first, is the fix:
  // the reverse order would hide the Disconnect button for exactly the case FR-019 requires
  // it stay reachable.
  if (data.connected) {
    return (
      <div className="flex w-full items-center justify-between gap-2">
        <Badge tone="success" icon="Check">Connected</Badge>
        <form action={disconnectSlackAction}>
          <Button type="submit" variant="outline" size="sm" icon="Unplug">Disconnect</Button>
        </form>
      </div>
    );
  }

  if (!githubConnected) {
    return <GithubGateNotice />;
  }

  return (
    <form action={formAction} className="flex w-full flex-col gap-2">
      <div className="flex items-end gap-2">
        <Field label="Slack webhook URL" htmlFor="webhookUrl" description="An incoming webhook URL from Slack (hooks.slack.com)." className="flex-1">
          <Input id="webhookUrl" name="webhookUrl" type="url" autoComplete="off" disabled={isPending} />
        </Field>
        <Button type="submit" variant="primary" icon="Bell" loading={isPending} disabled={isPending}>
          Connect
        </Button>
      </div>
      {state.error ? <span className="text-xs text-destructive" role="alert">{state.error}</span> : null}
    </form>
  );
}
