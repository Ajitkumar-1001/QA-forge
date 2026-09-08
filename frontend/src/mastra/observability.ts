export type ObservabilityEvent =
  | { type: "step_start"; runId: string; position: number; action: string }
  | { type: "step_end"; runId: string; position: number; status: string }
  | { type: "tool_call"; runId: string; tool: string }
  | { type: "loop_iteration"; runId: string; iteration: number }
  | {
      type: "terminal";
      runId: string;
      result: string;

      rootCauseConfirmed: boolean;
      hypothesesEvidenceCited: { hypothesisId: string; hasCitedEvidence: boolean }[];
    };

export function logEvent(event: ObservabilityEvent): void {
  process.stderr.write(`${JSON.stringify({ ts: new Date().toISOString(), ...event })}\n`);
}
