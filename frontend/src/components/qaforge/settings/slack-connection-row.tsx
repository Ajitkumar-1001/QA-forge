"use client";

import { useActionState } from "react";
import { Badge, Button } from "../primitives";
import { Field, Input } from "../forms";
import { connectSlackAction, disconnectSlackAction, type ConnectSlackState } from "@/app/settings/actions";

export type SlackConnectionData = { connected: false } | { connected: true };

const initialConnectState: ConnectSlackState = { error: null };

// 008-slack-linear-integrations: mirrors GithubConnectionRow's shape (data-model.md's own
// naming of this precedent) — one field, no live-verify call at connect time (FR-012's
// scheme+hostname check is the entire validation, done server-side in connectSlackAction).
export function SlackConnectionRow({ data, githubConnected }: { data: SlackConnectionData; githubConnected: boolean }) {
  const [state, formAction, isPending] = useActionState(connectSlackAction, initialConnectState);

  if (!githubConnected) {
    // FR-017: "state, don't hide" — matches GithubConnectionRow's own connected/disconnected
    // states, so a gated row is visibly gated, not silently absent.
    return (
      <div className="flex w-full flex-col gap-1">
        <Badge tone="neutral" icon="Lock">Requires GitHub</Badge>
        <span className="text-xs text-muted-foreground">Connect GitHub first — Slack and Linear both require it.</span>
      </div>
    );
  }

  if (!data.connected) {
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

  return (
    <div className="flex w-full items-center justify-between gap-2">
      <Badge tone="success" icon="Check">Connected</Badge>
      <form action={disconnectSlackAction}>
        <Button type="submit" variant="outline" size="sm" icon="Unplug">Disconnect</Button>
      </form>
    </div>
  );
}
