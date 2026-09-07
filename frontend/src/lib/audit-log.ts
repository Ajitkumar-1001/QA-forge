// SEC-007: every sign-in, sign-out, and denied/empty scoped-query result produces one structured
// log entry limited to an explicit field allowlist (userId, provider, resource type/id,
// timestamp, outcome) — and must NEVER log the raw sign-in event/callback/account/token object.
//
// The allowlist is enforced by this module's own type, not by convention: `AuditEvent` is a
// discriminated union of exactly the fields each event type is allowed to carry, so there is no
// `...rest`/`Record<string, unknown>` spread anywhere a raw object could slip through as an
// extra field.
export type AuditOutcome = "success" | "denied" | "not_found_or_not_owned" | "error";

export type AuditEvent =
  | { type: "sign_in"; provider: "github"; userId?: string; outcome: AuditOutcome }
  | { type: "sign_out"; userId?: string; outcome: AuditOutcome }
  | {
      type: "scoped_query";
      userId?: string;
      resourceType: string;
      resourceId?: string;
      // FR-009: a scoped-query miss can't distinguish "doesn't exist" from "exists, not
      // yours" without a second, ownership-blind lookup — so every miss is logged
      // identically as `not_found_or_not_owned`, never a more specific outcome.
      outcome: AuditOutcome;
    };

export function auditLog(event: AuditEvent): void {
  console.log(JSON.stringify({ audit: { timestamp: new Date().toISOString(), ...event } }));
}
