import { Badge } from "../primitives";

/**
 * 008-slack-linear-integrations: shared by SlackConnectionRow and LinearConnectionRow —
 * identical markup and copy in both before this extraction (FR-017's "state, don't hide"
 * gate on *creating* a new connection). Not used by GithubConnectionRow itself, which has
 * no such gate.
 */
export function GithubGateNotice() {
  return (
    <div className="flex w-full flex-col gap-1">
      <Badge tone="neutral" icon="Lock">Requires GitHub</Badge>
      <span className="text-xs text-muted-foreground">Connect GitHub first — Slack and Linear both require it.</span>
    </div>
  );
}
