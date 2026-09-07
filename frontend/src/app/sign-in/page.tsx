import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { SignInButton } from "@/components/sign-in-button";
import { getOAuthErrorCopy } from "@/lib/oauth-error-copy";

// UX-001: single-purpose signed-out landing, exactly one action (FR-001) — the only sign-in
// method offered. UX-003: a failed callback lands back here with `?error=<code>`; the copy shown
// is picked server-side from a closed set (getOAuthErrorCopy), never the raw query value.
export default async function Page(props: PageProps<"/sign-in">) {
  const { error } = await props.searchParams;
  const errorCopy = getOAuthErrorCopy(typeof error === "string" ? error : undefined);

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
