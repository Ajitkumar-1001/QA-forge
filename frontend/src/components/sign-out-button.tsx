"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";

// UX-006: no confirmation dialog — but "no confirmation UI" is not license for an optimistic
// client-only sign-out. This is a real, CSRF-protected mutation (Better Auth's own POST
// /api/auth/sign-out) that waits for the server-side session-row invalidation (FR-004) to
// actually complete before navigating anywhere, with a defined, visible fail-safe if it doesn't.
export function SignOutButton() {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "pending" | "failed">("idle");

  async function handleClick() {
    setStatus("pending");
    const { error } = await authClient.signOut();
    if (error) {
      // Fail-safe, not silently ignored: the session may still be valid server-side — stay put
      // and let the visitor retry, rather than navigating as if sign-out succeeded.
      setStatus("failed");
      return;
    }
    router.push("/sign-in");
  }

  return (
    <div className="flex flex-col items-start gap-1">
      {/* UX-007: explicit 44px — see sign-in-button.tsx's identical note on why min-h-11 (a
          rem-relative Tailwind spacing utility) doesn't reach 44px in this app. */}
      <Button onClick={handleClick} disabled={status === "pending"} variant="outline" className="min-h-[44px]">
        {status === "pending" && <Spinner />}
        Sign out
      </Button>
      {status === "failed" && (
        <p className="text-sm text-destructive">Couldn&apos;t sign out — please try again.</p>
      )}
    </div>
  );
}
