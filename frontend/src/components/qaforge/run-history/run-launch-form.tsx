"use client";

import { useActionState } from "react";
import { Alert, Button, Card, Separator } from "../primitives";
import { Field, Input, Textarea } from "../forms";
import { startRunAction, type StartRunState } from "@/app/runs/actions";

// "use server" files may only export async functions (verified by running this against
// the dev server: a runtime object export fails Next's "found object" check) — the
// initial state object lives here instead, not alongside the action.
const initialStartRunState: StartRunState = { error: null };

// 005-run-launch-ui (tasks.md T007): only the fields that map to something real —
// url/repository/objective/credential — no environment/branch/commit (004's own
// no-fabrication rule: the mock new-run.tsx's Environment/Execution Mode/Options fields
// have no backing repository column or workflow input, so they're dropped rather than
// wired to nothing).
export function RunLaunchForm() {
  const [state, formAction, isPending] = useActionState(startRunAction, initialStartRunState);

  return (
    <form action={formAction}>
      <Card padding="large">
        <div className="flex flex-col gap-4">
          <Field label="Application URL" htmlFor="url" required>
            <Input id="url" name="url" type="url" mono placeholder="https://staging.example.com" required disabled={isPending} />
          </Field>
          <Field label="Repository" htmlFor="repository" required description="owner/repo, as passed to the CLI's --repo flag.">
            <Input id="repository" name="repository" mono placeholder="qa-forge/web" required disabled={isPending} />
          </Field>
          <Field label="Objective" htmlFor="objective" required description="One journey per run. Name the expected end state.">
            <Textarea
              id="objective"
              name="objective"
              rows={3}
              placeholder="Verify that a new user can sign up, authenticate, and reach the dashboard."
              required
              disabled={isPending}
            />
          </Field>
          <Separator label="Credential (optional)" />
          <div className="grid grid-cols-2 gap-4">
            <Field label="Username" htmlFor="credentialUsername" description="Used only for this run's login step.">
              <Input id="credentialUsername" name="credentialUsername" autoComplete="off" disabled={isPending} />
            </Field>
            <Field label="Password" htmlFor="credentialPassword" description="Encrypted at rest; never shown again.">
              <Input id="credentialPassword" name="credentialPassword" type="password" autoComplete="off" disabled={isPending} />
            </Field>
          </div>
          {state.error ? <Alert tone="destructive" title="Couldn't start the run" description={state.error} /> : null}
          <Separator />
          <div className="flex justify-end">
            <Button type="submit" variant="primary" icon="Play" loading={isPending} disabled={isPending}>
              {isPending ? "Running investigation…" : "Start QA Run"}
            </Button>
          </div>
        </div>
      </Card>
    </form>
  );
}
