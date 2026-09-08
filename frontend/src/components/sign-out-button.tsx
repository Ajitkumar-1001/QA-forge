"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "pending" | "failed">("idle");

  async function handleClick() {
    setStatus("pending");
    const { error } = await authClient.signOut();
    if (error) {

      setStatus("failed");
      return;
    }
    router.push("/sign-in");
  }

  return (
    <div className="flex flex-col items-start gap-1">

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
