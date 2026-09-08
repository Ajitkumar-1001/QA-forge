export type OAuthErrorCopy = { title: string; description: string };

const DENIAL_CODES = new Set(["access_denied"]);
const TAMPERED_CODES = new Set(["state_mismatch", "state_not_found", "no_code", "invalid_code", "nonce_binding_missing"]);

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

  return PROVIDER_ERROR_COPY;
}
