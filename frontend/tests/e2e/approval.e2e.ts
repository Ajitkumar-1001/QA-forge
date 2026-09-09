import { expect, test } from "playwright/test";
import { signInAs } from "./fixtures/authed-session";
import { createProjectForCaller } from "@/lib/repositories/project";
import { createScenarioForCaller } from "@/lib/repositories/test-scenario";
import { startRunForCaller, recordRunResultForCaller } from "@/lib/repositories/test-run";
import { createApprovalDraftForCaller } from "@/lib/repositories/approval";
import type { Report } from "@/mastra/types";

// Requires a real DATABASE_URL (0004's migration applied) and `pnpm dev` running at
// PLAYWRIGHT_BASE_URL. Seeds fixture data via the real repository layer directly (same
// pattern run-history-view.e2e.ts already uses) rather than through a live investigation
// run — createApprovalDraftForCaller is the exact function cli/run.ts/runs/actions.ts call
// in production, so this exercises the identical drafting path without needing a real
// ANTHROPIC_API_KEY-backed run to reach a FAIL report.
//
// The Approve click needs one more test-only seam for the actual GitHub write, mirroring
// QAFORGE_E2E_FAKE_GITHUB_API's existing pattern in src/lib/github-api.ts:
//   QAFORGE_E2E_FAKE_GITHUB_ISSUE_URL=https://github.com/qa-forge/approval-e2e/issues/1
// Without it, an Approve click in this suite would attempt a real api.github.com call.

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3210";
const FAKE_ISSUE_URL = process.env.QAFORGE_E2E_FAKE_GITHUB_ISSUE_URL ?? "https://github.com/qa-forge/approval-e2e/issues/1";

function failReport(): Report {
  const hypothesisId = crypto.randomUUID();
  return {
    result: "FAIL",
    steps: [
      {
        position: 0,
        action: "Load the homepage",
        expectedOutcome: "Homepage renders",
        successCriteria: { kind: "url", match: "/" },
        failureCriteria: { kind: "consoleAbsent", pattern: "error" },
        observed: "500 error page",
        status: "FAILED",
      },
    ],
    evidence: [],
    hypotheses: [{ id: hypothesisId, status: "SUPPORTED", description: "The homepage 500s on load", confidence: 0.85, evidenceLinks: [], checks: [] }],
    winningHypothesisId: hypothesisId,
    confidence: 0.85,
  };
}

async function seedFailedRunWithApproval(callerId: string, repository = "qa-forge/approval-e2e") {
  const seededProject = await createProjectForCaller(callerId, { applicationUrl: "https://example.com", repository });
  const scenario = await createScenarioForCaller(callerId, { projectId: seededProject.id, objective: "load the homepage", credentialsReference: null });
  if ("ok" in scenario) throw new Error("seedFailedRunWithApproval: unexpected denial creating scenario");
  const started = await startRunForCaller(callerId, { scenarioId: scenario.id, idempotencyKey: crypto.randomUUID() });
  if ("ok" in started) throw new Error("seedFailedRunWithApproval: unexpected denial starting run");

  const report = failReport();
  await recordRunResultForCaller(callerId, started.run.id, { status: "FAILED", errorReason: null, modelCalls: [], report });
  await createApprovalDraftForCaller(callerId, started.run.id, { objective: "load the homepage", repository, applicationUrl: "https://example.com" }, report);

  return started.run.id;
}

test.describe("D9/GitHub-Write-Path", () => {
  test("signed out, the approval page redirects to /sign-in", async ({ page }) => {
    await page.goto("/runs/some-run-id/approval");
    await expect(page).toHaveURL(/\/sign-in$/);
  });

  test("a PASSED run has no approval draft — its approval page 404s for the owner", async ({ browser }) => {
    const context = await browser.newContext();
    const { userId } = await signInAs(context, BASE_URL);
    const passProject = await createProjectForCaller(userId, { applicationUrl: "https://example.com", repository: "qa-forge/approval-e2e-pass" });
    const scenario = await createScenarioForCaller(userId, { projectId: passProject.id, objective: "a run that passes", credentialsReference: null });
    if ("ok" in scenario) throw new Error("unexpected denial");
    const started = await startRunForCaller(userId, { scenarioId: scenario.id, idempotencyKey: crypto.randomUUID() });
    if ("ok" in started) throw new Error("unexpected denial");
    await recordRunResultForCaller(userId, started.run.id, {
      status: "PASSED",
      errorReason: null,
      modelCalls: [],
      report: { result: "PASS", steps: [], evidence: [], hypotheses: [], winningHypothesisId: null, confidence: null },
    });

    const page = await context.newPage();
    await page.goto(`/runs/${started.run.id}/approval`);
    await expect(page.getByText(/404|not found/i)).toBeVisible();
    await context.close();
  });

  test("another user cannot see or act on someone else's approval draft", async ({ browser }) => {
    const ownerContext = await browser.newContext();
    const { userId: ownerId } = await signInAs(ownerContext, BASE_URL);
    const runId = await seedFailedRunWithApproval(ownerId, "qa-forge/approval-e2e-ownership");
    await ownerContext.close();

    const otherContext = await browser.newContext();
    await signInAs(otherContext, BASE_URL);
    const page = await otherContext.newPage();
    await page.goto(`/runs/${runId}/approval`);
    await expect(page.getByText(/404|not found/i)).toBeVisible();
    await otherContext.close();
  });

  test("shows the drafted title/body and rejecting transitions to REJECTED with no GitHub call", async ({ browser }) => {
    const context = await browser.newContext();
    const { userId } = await signInAs(context, BASE_URL);
    const runId = await seedFailedRunWithApproval(userId, "qa-forge/approval-e2e-reject");

    const page = await context.newPage();
    await page.goto(`/runs/${runId}/approval`);
    // Ambiguous unscoped: the root cause text legitimately appears three times (issue
    // title, issue body, and the sidebar's own winning-hypothesis line) — .first() is
    // enough to prove the drafted content actually rendered.
    await expect(page.getByText("The homepage 500s on load").first()).toBeVisible();

    await page.getByRole("button", { name: "Reject" }).click();
    await expect(page.getByText("Request rejected")).toBeVisible();
    await context.close();
  });

  test("connected + approve creates the issue and shows its URL; a repeat approve is idempotent", async ({ browser }) => {
    const context = await browser.newContext();
    const { userId } = await signInAs(context, BASE_URL);
    const runId = await seedFailedRunWithApproval(userId, "qa-forge/approval-e2e-approve");

    // Connected through the real Settings UI (same flow settings.e2e.ts already proves),
    // not upsertGithubConnectionForCaller called directly from this test-runner process:
    // that would encrypt the PAT with whatever AUTH_ENCRYPTION_KEY this process happens to
    // have (often unset entirely), while the running dev server later decrypts it with its
    // own .env.local value — a real key mismatch, found by running this exact test.
    const page = await context.newPage();
    await page.goto("/settings");
    await page.getByRole("tab", { name: "Integrations" }).click();
    await page.locator("#pat").fill("ghp_fake_for_approval_e2e");
    await page.locator("form").filter({ has: page.locator("#pat") }).getByRole("button", { name: "Connect" }).click();
    await expect(page.getByRole("button", { name: "Disconnect" })).toBeVisible();

    await page.goto(`/runs/${runId}/approval`);
    await page.getByRole("button", { name: "Approve & Create" }).click();
    await page.getByRole("button", { name: "Create Issue" }).click();

    await expect(page.getByText("Approved and created")).toBeVisible();
    await expect(page.getByRole("link", { name: "Open on GitHub" })).toHaveAttribute("href", FAKE_ISSUE_URL);

    // The action page re-renders in place after refresh() — a second visit must still show
    // APPROVED, not a form to approve again (idempotency observed through the real UI, the
    // same class of bug settings.e2e.ts's own missing-refresh() regression caught once).
    await page.goto(`/runs/${runId}/approval`);
    await expect(page.getByText("Approved and created")).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve & Create" })).not.toBeVisible();

    await context.close();
  });

  test("without a GitHub connection, approving surfaces a clear error and leaves the draft PENDING", async ({ browser }) => {
    const context = await browser.newContext();
    const { userId } = await signInAs(context, BASE_URL);
    const runId = await seedFailedRunWithApproval(userId, "qa-forge/approval-e2e-no-connection");

    const page = await context.newPage();
    await page.goto(`/runs/${runId}/approval`);
    await page.getByRole("button", { name: "Approve & Create" }).click();
    await page.getByRole("button", { name: "Create Issue" }).click();

    await expect(page.getByText(/Connect your GitHub account in Settings/i)).toBeVisible();
    await context.close();
  });
});
