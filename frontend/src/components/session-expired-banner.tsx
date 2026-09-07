import { Skeleton } from "@/components/ui/skeleton";

// UX-005: session expiry on an already-loaded page is a routine, expected event (30 days of
// inactivity, NFR-001) — deliberately lower visual weight than UX-003's failure Alert.
//
// `role="status"` (polite, non-interrupting) — and the element is ALWAYS rendered, never
// conditionally mounted only once `expired` becomes true: some screen readers don't announce a
// `role="status"` element that's created and populated in the same update, only one whose text
// changes after it already existed in the DOM. `expired` only ever toggles this element's
// content/visibility, never its presence.
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

/**
 * UX-005: on expiry, protected content is REPLACED with this placeholder, never merely dimmed
 * via CSS while the real, now-stale data remains rendered underneath (dimming alone leaves
 * potentially sensitive data present in the DOM). A future authenticated page renders this in
 * place of its real content when `SessionExpiredBanner`'s `expired` is true.
 */
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
