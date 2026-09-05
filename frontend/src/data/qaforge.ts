// Sample data for the QAForge console (ported from the imported design project's app/data.js).
// Sequenced to WORKFLOW.md: 5-step journey, five-agent pipeline (no Supervisor row),
// report branch PASS | FAIL | FAIL(INCONCLUSIVE) | ERROR, and a separate Approval Draft.
// ponytail: this is fixture data for the console UI — the mastra backend (src/mastra) is not wired
// to it yet. Replace with real fetches when the API surface exists; the shapes below are the contract.

export type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
export type FindingStatus =
  | "OPEN"
  | "ACKNOWLEDGED"
  | "ISSUE CREATED"
  | "FIX IN PROGRESS"
  | "RESOLVED"
  | "DISMISSED";
export type RunStatusKey =
  | "QUEUED"
  | "PLANNING"
  | "RUNNING"
  | "INVESTIGATING"
  | "VALIDATING"
  | "WAITING_APPROVAL"
  | "PASSED"
  | "FAILED"
  | "BLOCKED"
  | "CANCELLED"
  | "ERROR";
export type ReasonCode =
  | "APP_UNREACHABLE"
  | "BROWSER_SESSION_FAILED"
  | "PLAN_NOT_POSSIBLE"
  | "REPOSITORY_UNAVAILABLE";

export interface Run {
  id: string;
  objective: string;
  plan: string;
  repository: string;
  branch: string;
  commit: string;
  environment: "LOCAL" | "PREVIEW" | "STAGING" | "PRODUCTION";
  status: RunStatusKey;
  findings: number;
  criticalFindings?: number;
  duration: string;
  triggeredBy: string;
  started: string;
  startedFull: string;
  elapsed: string;
  startedAt: number;
  report?: "PASSED" | "FAILED" | "INCONCLUSIVE";
  reason?: ReasonCode;
  hypothesesRejected?: number;
  live?: boolean;
}

export interface Step {
  id: string;
  title: string;
  state: "passed" | "failed" | "active" | "pending" | "skipped" | "waiting";
  agent: string;
  duration?: string;
  evidenceCount?: number;
  defaultOpen?: boolean;
  detail?: { key: string; value?: string }[];
}

export interface PipelineAgent {
  id: string;
  name: string;
  icon: string;
  op: string;
  result: string;
  state?: "failed";
}

export interface EvidenceItem {
  kind: "network" | "console" | "source" | "screenshot" | "trace" | "cookie" | "commit";
  label: string;
  meta?: string | number;
  tab?: string;
}

export interface Finding {
  id: string;
  severity: Severity;
  status: FindingStatus;
  title: string;
  description?: string;
  expected?: string;
  observed?: string;
  confidence: number;
  evidence?: EvidenceItem[];
  cause?: string;
  affected?: string;
  repository: string;
  runId: string;
  created: string;
  recommended?: string;
  inconclusive?: boolean;
}

export interface Approval {
  status: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";
  findingId: string;
  repository: string;
  requested?: string;
  expires?: string;
  expiresIn?: string;
  decidedBy?: string;
  decided?: string;
  issue?: string;
}

export interface NetworkRequest {
  id: number;
  method: string;
  url: string;
  status: number;
  duration: number;
  initiator: string;
  size: string;
}

export interface ConsoleEntry {
  time: string;
  level: "DEBUG" | "INFO" | "WARN" | "ERROR";
  message: string;
}

export interface SourceLine {
  n: number;
  text: string;
}

export interface SourceFile {
  file: string;
  highlight: number[];
  errorLine: number;
  commit: string;
  branch: string;
  repository: string;
  lines: SourceLine[];
}

export interface TraceEvent {
  time: string;
  agent: string;
  event: string;
  state?: "failed" | "active";
  duration?: string;
}

export interface Inspector {
  agent: string;
  status: string;
  objective: string;
  evidence: { kind: string; count: number; label: string }[];
  hypothesis?: string;
  confidence?: number;
  tools: { name: string; arg: string; time: string; state?: "running" }[];
}

export interface Plan {
  id: string;
  name: string;
  scenarios: string[];
  failed: string[];
  lastRun: string;
  passRate: number;
  repository: string;
  blocked?: boolean;
}

export interface Repository {
  id: string;
  name: string;
  branch: string;
  provider: string;
  lastRun: string;
  status: "CONNECTED" | "SYNC FAILED" | "DISCONNECTED";
  environments: string[];
}

export interface Environment {
  id: "LOCAL" | "PREVIEW" | "STAGING" | "PRODUCTION";
  url: string;
  repository: string;
  branch: string;
  credentials: string;
  browser: string;
  network: string;
  policy: "ALLOW" | "REQUIRE APPROVAL" | "DENY";
}

export interface PolicyRow {
  action: string;
  verdict: "ALLOW" | "REQUIRE APPROVAL" | "DENY";
}

export interface AgentSummary {
  name: string;
  status: "IDLE" | "ACTIVE" | "WAITING" | "COMPLETE" | "FAILED";
  run: string;
  task: string;
  tools: number;
}

export interface ChartPoint {
  label: string;
  value: number;
  tone?: string;
}

export const REASON_CODES: Record<ReasonCode, { text: string; retryable: boolean; detail: string }> = {
  APP_UNREACHABLE: {
    text: "The application did not respond at the environment URL.",
    retryable: true,
    detail: "NET::ERR_CONNECTION_REFUSED · https://app.qaforge.dev",
  },
  BROWSER_SESSION_FAILED: {
    text: "The browser session could not be started.",
    retryable: true,
    detail: "chromium exited before the first navigation",
  },
  PLAN_NOT_POSSIBLE: {
    text: "The objective could not be turned into an executable plan.",
    retryable: false,
    detail: "{ plannable: false }",
  },
  REPOSITORY_UNAVAILABLE: {
    text: "The repository could not be read at the recorded commit.",
    retryable: true,
    detail: "git: reference 9d02af1 not found",
  },
};

export const runs: Run[] = [
  { id: "QF-0218", objective: "Verify login → dashboard flow", plan: "Authentication Regression", repository: "qa-forge/web", branch: "main", commit: "28fa91c", environment: "STAGING", status: "INVESTIGATING", findings: 1, criticalFindings: 0, duration: "01:42", triggeredBy: "Dana Okafor", started: "14:32", startedFull: "14:32:18", elapsed: "01:42", startedAt: 218, report: "FAILED", live: true },
  { id: "QF-0217", objective: "Checkout with an expired card is rejected with a clear message", plan: "Checkout Smoke", repository: "qa-forge/web", branch: "main", commit: "28fa91c", environment: "PREVIEW", status: "PASSED", findings: 0, duration: "03:08", triggeredBy: "CI · main", started: "13:51", startedFull: "13:51:02", elapsed: "03:08", startedAt: 217 },
  { id: "QF-0216", objective: "Password reset token is rejected after it has been used once", plan: "Authentication Regression", repository: "qa-forge/api", branch: "main", commit: "b71c0e4", environment: "STAGING", status: "FAILED", report: "FAILED", findings: 2, criticalFindings: 1, duration: "06:12", triggeredBy: "Marcus Lee", started: "12:20", startedFull: "12:20:44", elapsed: "06:12", startedAt: 216 },
  { id: "QF-0215", objective: "Admin can export the audit log as CSV", plan: "Admin Console", repository: "qa-forge/web", branch: "release/2.4", commit: "9d02af1", environment: "PRODUCTION", status: "ERROR", reason: "APP_UNREACHABLE", findings: 0, duration: "00:14", triggeredBy: "Schedule · nightly", started: "02:00", startedFull: "02:00:00", elapsed: "00:14", startedAt: 215 },
  { id: "QF-0214", objective: "Invalid credentials show a rate-limit message after 5 attempts", plan: "Authentication Regression", repository: "qa-forge/api", branch: "main", commit: "b71c0e4", environment: "STAGING", status: "FAILED", report: "FAILED", findings: 3, criticalFindings: 1, duration: "04:47", triggeredBy: "CI · main", started: "Yesterday", startedFull: "Yesterday 22:14", elapsed: "04:47", startedAt: 214 },
  { id: "QF-0213", objective: "Team invite link works for a brand-new Google account", plan: "Onboarding", repository: "qa-forge/web", branch: "main", commit: "4fe1d90", environment: "STAGING", status: "PASSED", findings: 0, duration: "05:31", triggeredBy: "Dana Okafor", started: "Yesterday", startedFull: "Yesterday 18:02", elapsed: "05:31", startedAt: 213 },
  { id: "QF-0212", objective: "Billing page renders invoices for annual plans", plan: "Billing", repository: "qa-forge/web", branch: "main", commit: "4fe1d90", environment: "PREVIEW", status: "CANCELLED", findings: 0, duration: "00:48", triggeredBy: "Priya Natarajan", started: "Sep 2", startedFull: "Sep 2 16:40", elapsed: "00:48", startedAt: 212 },
  { id: "QF-0211", objective: "Signup form validation errors are announced to screen readers", plan: "Accessibility", repository: "qa-forge/web", branch: "main", commit: "4fe1d90", environment: "STAGING", status: "PASSED", findings: 0, duration: "07:15", triggeredBy: "CI · main", started: "Sep 2", startedFull: "Sep 2 11:05", elapsed: "07:15", startedAt: 211 },
  { id: "QF-0210", objective: "Webhook retries back off exponentially after 5xx", plan: "Integrations", repository: "qa-forge/api", branch: "main", commit: "0c9e77b", environment: "STAGING", status: "PASSED", findings: 0, duration: "02:59", triggeredBy: "Schedule · nightly", started: "Sep 2", startedFull: "Sep 2 02:00", elapsed: "02:59", startedAt: 210 },
  { id: "QF-0209", objective: "Dashboard loads under 2s on a cold cache", plan: "Performance", repository: "qa-forge/web", branch: "main", commit: "0c9e77b", environment: "STAGING", status: "PASSED", findings: 0, duration: "01:20", triggeredBy: "CI · main", started: "Sep 1", startedFull: "Sep 1 20:12", elapsed: "01:20", startedAt: 209 },
  { id: "QF-0208", objective: "Expired session redirects to /login and preserves the return URL", plan: "Authentication Regression", repository: "qa-forge/web", branch: "main", commit: "0c9e77b", environment: "STAGING", status: "FAILED", report: "INCONCLUSIVE", hypothesesRejected: 3, findings: 1, criticalFindings: 0, duration: "03:41", triggeredBy: "CI · main", started: "Sep 1", startedFull: "Sep 1 09:30", elapsed: "03:41", startedAt: 208 },
];

// The plan. Five steps, one per user action — the agent pipeline is NOT in this list.
export const steps: Step[] = [
  { id: "s1", title: "Open login page", state: "passed", agent: "Browser Agent", duration: "1.8s", evidenceCount: 1, detail: [{ key: "URL", value: "https://staging.qaforge.dev/login" }, { key: "Viewport", value: "1440×900 · Chrome" }] },
  { id: "s2", title: "Enter credentials", state: "passed", agent: "Browser Agent", duration: "0.9s", evidenceCount: 1, detail: [{ key: "Account", value: "qa+0218@qaforge.dev" }, { key: "Source", value: "vault: qa/staging" }] },
  { id: "s3", title: "Submit login", state: "passed", agent: "Browser Agent", duration: "1.2s", evidenceCount: 1, detail: [{ key: "Request", value: "POST /api/auth/login → 200" }] },
  { id: "s4", title: "Verify session established", state: "passed", agent: "Browser Agent", duration: "0.6s", evidenceCount: 1, detail: [{ key: "Cookie", value: "qf_session set · HttpOnly · SameSite=Lax" }, { key: "Request", value: "GET /api/session → 200" }] },
  { id: "s5", title: "Navigate dashboard", state: "failed", agent: "Browser Agent", duration: "1.2s", evidenceCount: 3, defaultOpen: true, detail: [{ key: "Expected", value: "/dashboard" }, { key: "Observed", value: "/login" }, { key: "Assertion", value: "URL pathname equals /dashboard within 5s after login" }] },
];

// Agent Activity panel — this exact order (§8–9). The QA Supervisor is the graph, not a row.
export const pipeline: PipelineAgent[] = [
  { id: "browser", name: "Browser Agent", icon: "Bot", op: "Executing planned journey…", result: "5 steps executed · 1 failed", state: "failed" },
  { id: "evidence", name: "Evidence Agent", icon: "Camera", op: "Collecting runtime evidence…", result: "19 artifacts collected" },
  { id: "repo", name: "Repository Investigator", icon: "FileCode", op: "Inspecting repository at 28fa91c…", result: "7 relevant files" },
  { id: "rootcause", name: "Root Cause Agent", icon: "Bug", op: "Forming root-cause hypotheses…", result: "3 hypotheses · 2 rejected" },
  { id: "validator", name: "Validator", icon: "ShieldCheck", op: "Validating hypothesis against evidence…", result: "Confirmed · confidence 0.89" },
];

export const finding: Finding = { id: "F-0412", severity: "HIGH", status: "OPEN", title: "Login succeeds but user is redirected back to /login.", description: "Step 5 asserted navigation to /dashboard. The browser landed on /login with a valid session cookie already set.", expected: "/dashboard", observed: "/login", confidence: 89, evidence: [{ kind: "network", label: "POST /auth/login", meta: "200", tab: "network" }, { kind: "network", label: "GET /dashboard → 307", tab: "network" }, { kind: "console", label: "Auth state unavailable during route evaluation", tab: "console" }, { kind: "source", label: "middleware.ts:41–63", tab: "source" }, { kind: "screenshot", label: "screenshot-05.png", tab: "screenshots" }], cause: "Authentication middleware reads stale session state immediately after login.", affected: "middleware.ts:41–63", repository: "qa-forge/web", runId: "QF-0218", created: "14:34", recommended: "Await the session write before evaluating the protected route, or revalidate the cookie jar inside the middleware." };

export const findings: Finding[] = [
  finding,
  { id: "F-0409", severity: "CRITICAL", title: "Password reset token accepted after expiry", repository: "qa-forge/api", runId: "QF-0216", status: "OPEN", confidence: 96, created: "12:26", cause: "Token expiry is compared against the issue timestamp, not the current time.", affected: "reset-token.ts:72–96", expected: "410 Gone", observed: "200 OK", recommended: "Compare expiresAt against Date.now() and invalidate the token on first use." },
  { id: "F-0408", severity: "MEDIUM", title: "Reset email delivered in 74s (limit 60s)", repository: "qa-forge/api", runId: "QF-0216", status: "OPEN", confidence: 88, created: "12:24" },
  { id: "F-0407", severity: "MEDIUM", title: "Rate limit message missing retry-after hint", repository: "qa-forge/api", runId: "QF-0214", status: "ACKNOWLEDGED", confidence: 74, created: "Yesterday" },
  { id: "F-0406", severity: "CRITICAL", title: "Rate limit resets when the email casing changes", repository: "qa-forge/api", runId: "QF-0214", status: "ISSUE CREATED", confidence: 93, created: "Yesterday", cause: "The rate-limit key is built from the raw email string without normalisation.", affected: "rate-limit.ts:18–34" },
  { id: "F-0405", severity: "LOW", title: "Lockout banner overlaps the password field at 320px", repository: "qa-forge/api", runId: "QF-0214", status: "OPEN", confidence: 61, created: "Yesterday" },
  { id: "F-0396", severity: "HIGH", title: "Return URL dropped after session expiry redirect", repository: "qa-forge/web", runId: "QF-0208", status: "OPEN", confidence: 38, created: "Sep 1", inconclusive: true },
];

// Human approval (§11). PENDING → APPROVED | REJECTED | EXPIRED. 24h expiry. No suspended run state.
export const initialApprovals: Record<string, Approval> = {
  "QF-0216": { status: "PENDING", findingId: "F-0409", repository: "qa-forge/api", requested: "Today 12:26", expires: "Tomorrow 12:26", expiresIn: "21h 08m" },
  "QF-0214": { status: "APPROVED", findingId: "F-0406", repository: "qa-forge/api", requested: "Yesterday 22:31", decidedBy: "Marcus Lee", decided: "Yesterday 22:40", issue: "qa-forge/api#318" },
};

export const network: NetworkRequest[] = [
  { id: 1, method: "GET", url: "/login", status: 200, duration: 212, initiator: "navigation", size: "18.4 kB" },
  { id: 2, method: "POST", url: "/api/auth/login", status: 200, duration: 182, initiator: "fetch · login.tsx:41", size: "1.2 kB" },
  { id: 3, method: "GET", url: "/api/session", status: 200, duration: 61, initiator: "fetch · useSession.ts:12", size: "640 B" },
  { id: 4, method: "GET", url: "/dashboard", status: 307, duration: 34, initiator: "navigation", size: "—" },
  { id: 5, method: "GET", url: "/login", status: 200, duration: 49, initiator: "navigation · redirect", size: "18.4 kB" },
  { id: 6, method: "GET", url: "/api/session", status: 200, duration: 58, initiator: "fetch · useSession.ts:12", size: "640 B" },
  { id: 7, method: "GET", url: "/api/flags", status: 500, duration: 1204, initiator: "fetch · flags.ts:8", size: "—" },
];

export const consoleEntries: ConsoleEntry[] = [
  { time: "14:33:40.902", level: "DEBUG", message: "submit login form · email=qa+0218@qaforge.dev" },
  { time: "14:33:41.129", level: "INFO", message: "Auth request completed · 200" },
  { time: "14:33:41.191", level: "INFO", message: "Session cookie stored · qf_session" },
  { time: "14:33:41.221", level: "WARN", message: "Auth state unavailable during route evaluation" },
  { time: "14:33:41.240", level: "INFO", message: 'Redirect → /login' },
  { time: "14:33:41.302", level: "DEBUG", message: 'router.replace("/login") from middleware' },
  { time: "14:33:42.010", level: "ERROR", message: "GET /api/flags 500 (Internal Server Error)" },
];

export const source: SourceFile = {
  file: "src/middleware.ts", highlight: [49, 55], errorLine: 55, commit: "28fa91c", branch: "main", repository: "qa-forge/web", lines: [
    { n: 41, text: "export async function middleware(req: NextRequest) {" },
    { n: 42, text: '  const loginUrl = new URL("/login", req.url)' },
    { n: 43, text: '  const guarded = req.nextUrl.pathname.startsWith("/dashboard")' },
    { n: 44, text: "" },
    { n: 45, text: "  if (!guarded) {" },
    { n: 46, text: "    return NextResponse.next()" },
    { n: 47, text: "  }" },
    { n: 48, text: "" },
    { n: 49, text: "  // Read from the request cookie jar, which still holds the" },
    { n: 50, text: "  // pre-login state on the navigation that follows login." },
    { n: 51, text: "  const session = await getSession(req)" },
    { n: 52, text: "" },
    { n: 53, text: "  if (!session) {" },
    { n: 54, text: "" },
    { n: 55, text: "    return NextResponse.redirect(loginUrl)" },
    { n: 56, text: "  }" },
    { n: 57, text: "" },
    { n: 58, text: "  if (session.expiresAt < Date.now()) {" },
    { n: 59, text: "    return NextResponse.redirect(loginUrl)" },
    { n: 60, text: "  }" },
    { n: 61, text: "" },
    { n: 62, text: "  return NextResponse.next()" },
    { n: 63, text: "}" },
  ],
};

export const trace: TraceEvent[] = [
  { time: "14:32:18", agent: "Browser Agent", event: "Opened https://staging.qaforge.dev/login · 1440×900, Chrome", duration: "1.8s" },
  { time: "14:32:20", agent: "Browser Agent", event: "Entered credentials for qa+0218@qaforge.dev", duration: "0.9s" },
  { time: "14:32:21", agent: "Browser Agent", event: "Submitted login · POST /api/auth/login → 200", duration: "1.2s" },
  { time: "14:32:23", agent: "Browser Agent", event: "Session verified · qf_session set (HttpOnly, SameSite=Lax)", duration: "0.6s" },
  { time: "14:32:24", agent: "Browser Agent", event: "Navigation assertion failed · expected /dashboard, observed /login", state: "failed", duration: "1.2s" },
  { time: "14:32:27", agent: "Evidence Agent", event: "Captured 5 screenshots, 7 network events, 7 console entries", duration: "2.9s" },
  { time: "14:32:31", agent: "Repository Investigator", event: "Read 7 files · src/middleware.ts, lib/session.ts, app/login/page.tsx", duration: "8.4s" },
  { time: "14:32:40", agent: "Root Cause Agent", event: "Hypothesis 1 — credentials rejected by the login API. Rejected: POST /api/auth/login returned 200 with a session cookie.", duration: "2.1s" },
  { time: "14:32:43", agent: "Root Cause Agent", event: "Hypothesis 2 — session cookie never written. Rejected: GET /api/session returned the authenticated user.", duration: "1.8s" },
  { time: "14:32:47", agent: "Root Cause Agent", event: "Hypothesis 3 — middleware evaluates stale session state before navigation completes. Confidence 0.61 → 0.82.", duration: "4.4s" },
  { time: "14:32:52", agent: "Validator", event: "Confirmed hypothesis 3 against middleware.ts:41–63 and console 14:33:41.221 · confidence 0.89", state: "active", duration: "3.2s" },
];

export const inspector: Inspector = { agent: "Root Cause Agent", status: "ACTIVE", objective: "Determine why a successful login returns the user to /login instead of /dashboard.", evidence: [{ kind: "network", count: 7, label: "Network Events" }, { kind: "console", count: 7, label: "Console Entries" }, { kind: "source", count: 7, label: "Source Files" }, { kind: "screenshot", count: 5, label: "Screenshots" }], hypothesis: "Middleware evaluates stale session state before navigation completes.", confidence: 82, tools: [{ name: "readFile", arg: "src/middleware.ts", time: "14:33:52" }, { name: "searchRepository", arg: '"getSession"', time: "14:33:58" }, { name: "readFile", arg: "lib/session.ts", time: "14:34:01" }, { name: "inspectNetwork", arg: "GET /dashboard → 307", time: "14:34:03", state: "running" }] };

export const plans: Plan[] = [
  { id: "p1", name: "Authentication Regression", scenarios: ["login → dashboard", "signup", "logout", "password reset", "protected route", "expired session", "invalid credentials"], failed: ["login → dashboard", "expired session"], lastRun: "12 minutes ago", passRate: 71, repository: "qa-forge/web" },
  { id: "p2", name: "Checkout Smoke", scenarios: ["add to cart", "apply coupon", "expired card", "successful payment", "order confirmation"], failed: [], lastRun: "43 minutes ago", passRate: 100, repository: "qa-forge/web" },
  { id: "p3", name: "Admin Console", scenarios: ["audit log export", "role change", "SSO enforcement", "API key rotation"], failed: [], lastRun: "12 hours ago", passRate: 100, repository: "qa-forge/web", blocked: true },
  { id: "p4", name: "Integrations", scenarios: ["webhook delivery", "webhook retry", "GitHub app install", "Slack notifications"], failed: [], lastRun: "Yesterday", passRate: 100, repository: "qa-forge/api" },
  { id: "p5", name: "Accessibility", scenarios: ["form errors announced", "keyboard-only signup", "focus order", "reduced motion"], failed: ["focus order"], lastRun: "2 days ago", passRate: 75, repository: "qa-forge/web" },
  { id: "p6", name: "Performance", scenarios: ["cold dashboard < 2s", "runs table 1k rows", "evidence panel paint"], failed: [], lastRun: "3 days ago", passRate: 100, repository: "qa-forge/web" },
];

export const repositories: Repository[] = [
  { id: "r1", name: "qa-forge/web", branch: "main", provider: "GitHub", lastRun: "QF-0218 · investigating", status: "CONNECTED", environments: ["PREVIEW", "STAGING", "PRODUCTION"] },
  { id: "r2", name: "qa-forge/api", branch: "main", provider: "GitHub", lastRun: "QF-0216 · failed", status: "CONNECTED", environments: ["STAGING"] },
  { id: "r3", name: "qa-forge/docs", branch: "next", provider: "GitHub", lastRun: "—", status: "SYNC FAILED", environments: ["PREVIEW"] },
];

export const environments: Environment[] = [
  { id: "LOCAL", url: "http://localhost:3000", repository: "qa-forge/web", branch: "any", credentials: "none", browser: "all permissions", network: "unrestricted", policy: "ALLOW" },
  { id: "PREVIEW", url: "https://*.preview.qaforge.dev", repository: "qa-forge/web", branch: "feature/*", credentials: "vault: qa/preview", browser: "clipboard denied", network: "*.qaforge.dev", policy: "ALLOW" },
  { id: "STAGING", url: "https://staging.qaforge.dev", repository: "qa-forge/web · qa-forge/api", branch: "main", credentials: "vault: qa/staging", browser: "clipboard, geolocation denied", network: "*.qaforge.dev", policy: "REQUIRE APPROVAL" },
  { id: "PRODUCTION", url: "https://app.qaforge.dev", repository: "qa-forge/web", branch: "release/*", credentials: "vault: qa/prod-readonly", browser: "read-only session", network: "app.qaforge.dev only", policy: "DENY" },
];

// Repository access is read-only everywhere. The one approved write is issue creation (§12).
export const initialPolicies: Record<"STAGING" | "PRODUCTION", PolicyRow[]> = {
  STAGING: [{ action: "Browser navigation", verdict: "ALLOW" }, { action: "Form submission", verdict: "ALLOW" }, { action: "Create test users", verdict: "ALLOW" }, { action: "Read repository", verdict: "ALLOW" }, { action: "Create GitHub issue", verdict: "REQUIRE APPROVAL" }, { action: "Push code", verdict: "DENY" }],
  PRODUCTION: [{ action: "Browser navigation", verdict: "ALLOW" }, { action: "Form submission", verdict: "REQUIRE APPROVAL" }, { action: "Create test users", verdict: "DENY" }, { action: "Delete data", verdict: "DENY" }, { action: "Read repository", verdict: "ALLOW" }, { action: "Create GitHub issue", verdict: "REQUIRE APPROVAL" }, { action: "Push code", verdict: "DENY" }],
};

export const agents: AgentSummary[] = [
  { name: "Browser Agent", status: "FAILED", run: "QF-0218", task: "Navigation assertion failed at step 5", tools: 118 },
  { name: "Evidence Agent", status: "COMPLETE", run: "QF-0218", task: "19 artifacts collected", tools: 19 },
  { name: "Repository Investigator", status: "COMPLETE", run: "QF-0218", task: "7 relevant files read at 28fa91c", tools: 24 },
  { name: "Root Cause Agent", status: "ACTIVE", run: "QF-0218", task: "Hypothesis 3 · confidence 0.82", tools: 27 },
  { name: "Validator", status: "WAITING", run: "QF-0218", task: "Queued: validate hypothesis 3 against source", tools: 0 },
];

export const passRate: ChartPoint[] = [{ label: "Aug 29", value: 91 }, { label: "Aug 30", value: 94 }, { label: "Aug 31", value: 88 }, { label: "Sep 1", value: 90 }, { label: "Sep 2", value: 96 }, { label: "Sep 3", value: 97 }, { label: "Sep 4", value: 93 }];
export const runsPerDay: ChartPoint[] = [{ label: "Aug 29", value: 14 }, { label: "Aug 30", value: 11 }, { label: "Aug 31", value: 6, tone: "muted" }, { label: "Sep 1", value: 17 }, { label: "Sep 2", value: 19 }, { label: "Sep 3", value: 15 }, { label: "Sep 4", value: 8 }];

export const LIVE_STATUSES: RunStatusKey[] = ["QUEUED", "INVESTIGATING"];

// The drafted GitHub issue shown on the Approval Draft screen.
export function draftIssue(f: Finding, run?: Run) {
  const r = run || ({} as Partial<Run>);
  const title = f.title;
  const body = [
    "### Summary",
    "",
    f.description || f.title,
    "",
    "### Steps to reproduce",
    "",
    ...steps.map((s, i) => `${i + 1}. ${s.title}${i === steps.length - 1 ? "  ← fails here" : ""}`),
    "",
    "### Observed",
    "",
    `Expected \`${f.expected || "/dashboard"}\`, observed \`${f.observed || "/login"}\`.`,
    "",
    "### Evidence",
    "",
    "- `POST /api/auth/login` → 200, `qf_session` set (HttpOnly, SameSite=Lax)",
    "- `GET /dashboard` → 307 → `/login`",
    "- console 14:33:41.221 `WARN Auth state unavailable during route evaluation`",
    "- screenshot-05.png (1440×900, Chrome)",
    "",
    "### Likely root cause",
    "",
    `${f.cause || "—"} (confidence ${f.confidence}%)`,
    "",
    `Affected source: \`${f.affected || "—"}\` at \`${r.commit || "28fa91c"}\``,
    "",
    "### Recommended action",
    "",
    f.recommended || "Reviewed by the assignee.",
    "",
    "---",
    `Reported by QAForge · run \`${f.runId}\` · ${r.environment || "STAGING"} · ${r.repository || f.repository}@\`${r.branch || "main"}\``,
  ].join("\n");
  return { title, body };
}
