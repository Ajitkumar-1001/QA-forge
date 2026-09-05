import { describe, expect, it, vi } from "vitest";
import type { Page } from "playwright";
import { createActionTools } from "@/mastra/tools/browser/actions.tool";

const ORIGIN = "https://example.com";

function fakePage(fill: (value: string) => Promise<void>): Page {
  return {
    url: () => ORIGIN,
    getByRole: () => ({ fill, click: vi.fn().mockResolvedValue(undefined) }),
  } as unknown as Page;
}

/**
 * T065, 2026-09-04 /speckit-converge (FR-001) — previously the supplied credential was threaded
 * only into evidence redaction, never into the browser-execution path; the fill tool's value was
 * entirely LLM-supplied, so a login-style objective had no mechanism to actually use it.
 */
describe("actions.tool fill — real credential substitution (T065)", () => {
  it("uses the real credential value for a field whose accessible name looks credential-like", async () => {
    const fill = vi.fn().mockResolvedValue(undefined);
    const page = fakePage(fill);
    const { fill: fillTool } = createActionTools(page, ORIGIN, "real-secret-password");

    await fillTool.execute!(
      { role: "textbox", name: "Password", value: "model-guessed-value" },
      {} as never,
    );

    expect(fill).toHaveBeenCalledWith("real-secret-password");
  });

  it("leaves a non-credential-shaped field's value alone", async () => {
    const fill = vi.fn().mockResolvedValue(undefined);
    const page = fakePage(fill);
    const { fill: fillTool } = createActionTools(page, ORIGIN, "real-secret-password");

    await fillTool.execute!({ role: "textbox", name: "Username", value: "alice" }, {} as never);

    expect(fill).toHaveBeenCalledWith("alice");
  });

  it("falls back to the model's own value when no credential was supplied for this run", async () => {
    const fill = vi.fn().mockResolvedValue(undefined);
    const page = fakePage(fill);
    const { fill: fillTool } = createActionTools(page, ORIGIN);

    await fillTool.execute!({ role: "textbox", name: "Password", value: "model-guessed-value" }, {} as never);

    expect(fill).toHaveBeenCalledWith("model-guessed-value");
  });
});
