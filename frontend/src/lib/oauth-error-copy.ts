// UX-003: the copy variant shown for a failed GitHub callback MUST be selected server-side from
// a closed set of validated conditions — never by rendering the raw `error`/`error_description`
// query parameter (Constitution Principle II: untrusted content never renders as-is). This module
// is that closed set: every known code maps to one of exactly three calm, non-technical copy
// variants; anything unrecognized falls through to the generic "tampered/invalid callback" one.
export type OAuthErrorCopy = { title: string; description: string };

// GitHub's own denial code (RFC 6749 §4.1.2.1), and Better Auth's OAUTH_CALLBACK_ERROR_CODES for
// a state mismatch/missing (oauth2/errors.mjs + the state-not-found path — both mean "this
// callback doesn't correspond to a sign-in we actually started," the tampered/invalid case).
const DENIAL_CODES = new Set(["access_denied"]);
const TAMPERED_CODES = new Set(["state_mismatch", "state_not_found", "no_code", "invalid_code", "nonce_binding_missing"]);
// Everything else Better Auth or GitHub can hand back that isn't the two above — a real failure
// on GitHub's or Better Auth's side, not something the visitor did.
const PROVIDER_ERROR_COPY: OAuthErrorCopy = {
  title: "GitHub sign-in isn't working right now",
  description: "Something went wrong on GitHub's side. Please try again in a moment.",
};

export function getOAuthErrorCopy(error: string | null | undefined): OAuthErrorCopy | null {
  if (!error) return null;
  if (DENIAL_CODES.has(error)) {
    return {
      title: "Sign-in was cancelled",
      description: "You didn't approve access, so we couldn't sign you in. You can try again anytime.",
    };
  }
  if (TAMPERED_CODES.has(error)) {
    return {
      title: "That sign-in link isn't valid",
      description: "This link may have expired or already been used. Please start signing in again.",
    };
  }
  // Any other recognized-looking code (a real provider/network failure) and any unrecognized
  // value both land here — the visible copy is identical either way (UX-003's "anything else"
  // catch-all), so an attacker-crafted `error` value can't select different rendered text.
  return PROVIDER_ERROR_COPY;
}
