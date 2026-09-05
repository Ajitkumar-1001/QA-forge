/**
 * NFR-005's "informal log" (spec.md), made concrete: one JSON line to stderr per significant
 * event, tagged with a run ID — step start/end, tool call, loop iteration, terminal state. Stderr
 * only, never stdout — `--format json` (contracts/cli-contract.md) prints exactly one JSON object
 * to stdout, so diagnostic output must never share that stream.
 */
export type ObservabilityEvent =
  | { type: "step_start"; runId: string; position: number; action: string }
  | { type: "step_end"; runId: string; position: number; status: string }
  | { type: "tool_call"; runId: string; tool: string }
  | { type: "loop_iteration"; runId: string; iteration: number }
  | { type: "terminal"; runId: string; result: string };

export function logEvent(event: ObservabilityEvent): void {
  process.stderr.write(`${JSON.stringify({ ts: new Date().toISOString(), ...event })}\n`);
}
