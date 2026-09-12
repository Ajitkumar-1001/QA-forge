"use client";

import { useActionState, useState } from "react";
import { Badge, Button } from "../primitives";
import { Field, Input, Select } from "../forms";
import {
  listLinearTeamsAction,
  connectLinearAction,
  disconnectLinearAction,
  type ListLinearTeamsState,
  type ConnectLinearState,
} from "@/app/settings/actions";

export type LinearConnectionData = { connected: false } | { connected: true; teamName: string };

const initialTeamsState: ListLinearTeamsState = { error: null, teams: null };
const initialConnectState: ConnectLinearState = { error: null };

/**
 * 008-slack-linear-integrations: the one row with a genuinely new interaction shape
 * (research.md Decision 7) — Linear's connect flow needs the team chosen before the
 * connection is stored (unlike GitHub, whose repository list is read-only and shown after
 * connecting). Two Server Actions, two local-state steps: paste key -> list teams -> pick
 * one -> connect. The key itself lives in this component's own state only for the duration
 * of these two steps — never written anywhere in between (contracts/action-contract.md).
 */
export function LinearConnectionRow({ data, githubConnected }: { data: LinearConnectionData; githubConnected: boolean }) {
  const [teamsState, listTeamsAction, listPending] = useActionState(listLinearTeamsAction, initialTeamsState);
  const [connectState, connectAction, connectPending] = useActionState(connectLinearAction, initialConnectState);
  const [apiKey, setApiKey] = useState("");
  const [teamId, setTeamId] = useState<string | undefined>(undefined);

  // FR-019: an existing connection stays visible and removable even while GitHub is
  // disconnected (suspended, not deleted) — the GitHub gate below only blocks *creating* a
  // new one (FR-017). Checked before the GitHub gate for the same reason as
  // SlackConnectionRow: the reverse order would hide the Disconnect button exactly when
  // FR-019 requires it stay reachable.
  if (data.connected) {
    return (
      <div className="flex w-full items-center justify-between gap-2">
        <Badge tone="success" icon="Check">Connected — {data.teamName}</Badge>
        <form action={disconnectLinearAction}>
          <Button type="submit" variant="outline" size="sm" icon="Unplug">Disconnect</Button>
        </form>
      </div>
    );
  }

  if (!githubConnected) {
    return (
      <div className="flex w-full flex-col gap-1">
        <Badge tone="neutral" icon="Lock">Requires GitHub</Badge>
        <span className="text-xs text-muted-foreground">Connect GitHub first — Slack and Linear both require it.</span>
      </div>
    );
  }

  if (teamsState.teams) {
    return (
      <form action={connectAction} className="flex w-full flex-col gap-2">
        <input type="hidden" name="apiKey" value={apiKey} />
        <input type="hidden" name="teamId" value={teamId ?? ""} />
        <Field label="Team" htmlFor="teamId" description="Which Linear team should new issues go to?" className="flex-1">
          <Select
            id="teamId"
            value={teamId}
            onValueChange={setTeamId}
            placeholder="Pick a team…"
            disabled={connectPending}
            options={teamsState.teams.map((team) => ({ value: team.id, label: team.name }))}
          />
        </Field>
        <Button type="submit" variant="primary" icon="Check" loading={connectPending} disabled={connectPending || !teamId}>
          Connect
        </Button>
        {connectState.error ? <span className="text-xs text-destructive" role="alert">{connectState.error}</span> : null}
      </form>
    );
  }

  return (
    <form action={listTeamsAction} className="flex w-full flex-col gap-2">
      <div className="flex items-end gap-2">
        <Field label="Linear API key" htmlFor="apiKey" description="A personal API key from Linear." className="flex-1">
          <Input id="apiKey" name="apiKey" type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} disabled={listPending} />
        </Field>
        <Button type="submit" variant="primary" icon="ListChecks" loading={listPending} disabled={listPending}>
          Continue
        </Button>
      </div>
      {teamsState.error ? <span className="text-xs text-destructive" role="alert">{teamsState.error}</span> : null}
    </form>
  );
}
