import { Skeleton } from "@/components/ui/skeleton";

export function SessionExpiredBanner({ expired }: { expired: boolean }) {
  return (
    <div
      role="status"
      className={expired ? "flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground" : "sr-only"}
    >
      {expired && (
        <>
          <span>Your session expired.</span>
          <a href="/sign-in" className="underline underline-offset-4 hover:text-foreground">
            Sign in again
          </a>
        </>
      )}
    </div>
  );
}

export function ProtectedContentSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      <Skeleton className="h-6 w-1/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
}
