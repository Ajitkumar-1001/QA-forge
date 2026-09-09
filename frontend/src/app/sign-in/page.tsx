import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { SignInButton } from "@/components/sign-in-button";
import { getOAuthErrorCopy } from "@/lib/oauth-error-copy";
import { getCallerId } from "@/lib/auth";

export default async function Page(props: PageProps<"/sign-in">) {
  const { error } = await props.searchParams;
  const errorCopy = getOAuthErrorCopy(typeof error === "string" ? error : undefined);

  // A-first (login-gate plan): an already-authenticated visitor lands on /dashboard, not
  // the sign-in form again — unless there's a real error to show (e.g. a stale callback
  // link), in which case showing it takes priority over the redirect.
  if (!errorCopy) {
    const callerId = await getCallerId(await headers());
    if (callerId) redirect("/dashboard");
  }

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <div className="flex w-full max-w-sm flex-col gap-4">
        {errorCopy && (
          <Alert variant="destructive">
            <AlertTitle>{errorCopy.title}</AlertTitle>
            <AlertDescription>{errorCopy.description}</AlertDescription>
          </Alert>
        )}
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Sign in to QAForge</EmptyTitle>
            <EmptyDescription>Use your GitHub account to continue.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <SignInButton />
          </EmptyContent>
        </Empty>
      </div>
    </div>
  );
}
