import { z } from "zod";
import { createTool } from "@mastra/core/tools";
import type { Page } from "playwright";
import { CREDENTIAL_LIKE_KEY } from "./evidence.tool";

const ariaRoleSchema = z.enum([
  "alert", "alertdialog", "application", "article", "banner", "blockquote", "button", "caption",
  "cell", "checkbox", "code", "columnheader", "combobox", "complementary", "contentinfo",
  "definition", "deletion", "dialog", "directory", "document", "emphasis", "feed", "figure",
  "form", "generic", "grid", "gridcell", "group", "heading", "img", "insertion", "link", "list",
  "listbox", "listitem", "log", "main", "marquee", "math", "meter", "menu", "menubar", "menuitem",
  "menuitemcheckbox", "menuitemradio", "navigation", "none", "note", "option", "paragraph",
  "presentation", "progressbar", "radio", "radiogroup", "region", "row", "rowgroup", "rowheader",
  "scrollbar", "search", "searchbox", "separator", "slider", "spinbutton", "status", "strong",
  "subscript", "superscript", "switch", "tab", "table", "tablist", "tabpanel", "term", "textbox",
  "time", "timer", "toolbar", "tooltip", "tree", "treegrid", "treeitem",
]);

const roleTargetSchema = z.object({
  role: ariaRoleSchema,
  name: z.string().optional(),
});

function assertSameOrigin(page: Page, originUrl: string): void {
  const current = new URL(page.url()).origin;
  const original = new URL(originUrl).origin;
  if (current !== original) {
    throw new Error(
      `CROSS_ORIGIN_BLOCKED: refusing to fill/submit — current origin ${current} does not match the run's original URL origin ${original}`,
    );
  }
}

export function createActionTools(page: Page, originUrl: string, credentialValue?: string) {
  const click = createTool({
    id: "click",
    description: "Click an element identified by its accessibility role and accessible name.",
    inputSchema: roleTargetSchema,
    execute: async ({ role, name }) => {
      await page.getByRole(role, { name }).click();
      return { url: page.url() };
    },
  });

  const fill = createTool({
    id: "fill",
    description: "Fill a form field identified by its accessibility role and accessible name.",
    inputSchema: roleTargetSchema.extend({ value: z.string() }),
    execute: async ({ role, name, value }) => {
      assertSameOrigin(page, originUrl);
      const actualValue =
        credentialValue && name && CREDENTIAL_LIKE_KEY.test(name) ? credentialValue : value;
      await page.getByRole(role, { name }).fill(actualValue);
      return { url: page.url() };
    },
  });

  const submit = createTool({
    id: "submit",
    description: "Submit a form by clicking a submit control identified by its accessibility role and accessible name.",
    inputSchema: roleTargetSchema,
    execute: async ({ role, name }) => {
      assertSameOrigin(page, originUrl);
      await page.getByRole(role, { name }).click();
      return { url: page.url() };
    },
  });

  const wait = createTool({
    id: "wait",
    description: "Wait for an element identified by its accessibility role and accessible name to become visible.",
    inputSchema: roleTargetSchema,
    execute: async ({ role, name }) => {
      await page.getByRole(role, { name }).waitFor({ state: "visible" });
      return { url: page.url() };
    },
  });

  return { click, fill, submit, wait };
}
