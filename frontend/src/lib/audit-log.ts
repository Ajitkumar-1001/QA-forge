export type AuditOutcome = "success" | "denied" | "not_found_or_not_owned" | "error";

export type AuditEvent =
  | { type: "sign_in"; provider: "github"; userId?: string; outcome: AuditOutcome }
  | { type: "sign_out"; userId?: string; outcome: AuditOutcome }
  | {
      type: "scoped_query";
      userId?: string;
      resourceType: string;
      resourceId?: string;

      outcome: AuditOutcome;
    };

export function auditLog(event: AuditEvent): void {
  console.log(JSON.stringify({ audit: { timestamp: new Date().toISOString(), ...event } }));
}
