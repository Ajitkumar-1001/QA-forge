"use client";

import { useActionState } from "react";
import { Badge, Button } from "../primitives";
import { Field, Input } from "../forms";
import { connectGithubAction, disconnectGithubAction, type ConnectGithubState } from "@/app/settings/actions";

export type GithubConnectionData =
  | { connected: false }
  | { connected: true; repositories: string[] | null }; // null = the live GitHub call failed (research.md Decision 6)

const initialConnectState: ConnectGithubState = { error: null };

// 007-github-connection: replaces workspace.tsx's static GitHub row content only — the
// per-repository "GitHub App" framing that row used to show doesn't match what's actually
// built (a single account-level PAT, D13); everything else in SettingsScreen stays mock.
export function GithubConnectionRow({ data }: { data: GithubConnectionData }) {
  const [state, formAction, isPending] = useActionState(connectGithubAction, initialConnectState);

  if (!data.connected) {
    return (
      <form action={formAction} className="flex w-full flex-col gap-2">
        <div className="flex items-end gap-2">
          <Field label="GitHub personal access token" htmlFor="pat" description="Fine-grained, scoped to at least one repository." className="flex-1">
            <Input id="pat" name="pat" type="password" autoComplete="off" disabled={isPending} />
          </Field>
          <Button type="submit" variant="primary" icon="Github" loading={isPending} disabled={isPending}>
            Connect
          </Button>
        </div>
        {state.error ? <span className="text-xs text-destructive" role="alert">{state.error}</span> : null}
      </form>
    );
  }

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <Badge tone="success" icon="Check">Connected</Badge>
        <form action={disconnectGithubAction}>
          <Button type="submit" variant="outline" size="sm" icon="Unplug">Disconnect</Button>
        </form>
      </div>
      {data.repositories === null ? (
        <span className="text-xs text-muted-foreground">Couldn&apos;t load repositories — check that your token is still valid.</span>
      ) : data.repositories.length === 0 ? (
        <span className="text-xs text-muted-foreground">No repositories accessible to this token.</span>
      ) : (
        <ul className="flex flex-col gap-1">
          {data.repositories.map((repo) => (
            <li key={repo} className="font-mono text-xs text-foreground">{repo}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
