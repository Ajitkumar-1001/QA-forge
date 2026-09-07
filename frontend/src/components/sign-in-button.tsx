"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";

// UX-002: if navigation hasn't happened within this window (blocked popup, dropped connection,
// any pre-navigation failure), re-enable rather than stay disabled indefinitely.
const NAVIGATION_TIMEOUT_MS = 8000;

// lucide-react (installed at v1.40.0) no longer ships brand/logo icons — inlined instead of
// adding a dependency for one static path.
function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4" fill="currentColor">
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56 0-.27-.01-1.17-.02-2.12-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.68 1.25 3.34.96.1-.74.4-1.25.72-1.54-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.29 1.18-3.09-.12-.29-.51-1.46.11-3.05 0 0 .96-.31 3.15 1.18a10.9 10.9 0 0 1 2.87-.39c.97 0 1.95.13 2.87.39 2.19-1.49 3.15-1.18 3.15-1.18.62 1.59.23 2.76.11 3.05.73.8 1.18 1.83 1.18 3.09 0 4.41-2.69 5.38-5.25 5.67.41.36.78 1.07.78 2.15 0 1.55-.01 2.8-.01 3.18 0 .31.21.67.8.56A10.52 10.52 0 0 0 23.5 12c0-6.35-5.15-11.5-11.5-11.5Z" />
    </svg>
  );
}

export function SignInButton() {
  const [status, setStatus] = useState<"idle" | "pending" | "timed-out">("idle");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  async function handleClick() {
    setStatus("pending");
    timeoutRef.current = setTimeout(() => setStatus("timed-out"), NAVIGATION_TIMEOUT_MS);

    // UX-004: fixed, hardcoded destination — never a request-supplied redirect target.
    await authClient.signIn.social({ provider: "github", callbackURL: "/dashboard" }).catch(() => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setStatus("timed-out");
    });
  }

  return (
    <div className="flex flex-col items-center gap-2">
      {/* UX-007: explicit 44px, not min-h-11 — this app's root font-size is 14px, so a
          rem-relative spacing utility (2.75rem) resolves to 38.5px here, not the expected 44px.
          button.tsx's own "lg" size alone tops out at 36px either way. */}
      <Button onClick={handleClick} disabled={status === "pending"} size="lg" className="min-h-[44px]">
        {status === "pending" ? <Spinner /> : <GitHubIcon />}
        Continue with GitHub
      </Button>
      {status === "timed-out" && (
        <p className="text-sm text-muted-foreground">Taking longer than expected — try again</p>
      )}
    </div>
  );
}
