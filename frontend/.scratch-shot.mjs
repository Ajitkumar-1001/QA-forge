import { chromium } from "playwright";
import fs from "node:fs";

const routes = [
  "/dashboard", "/runs", "/runs/new", "/findings", "/repositories",
  "/environments", "/agent-activity", "/policies", "/settings", "/test-plans",
];
const outDir = process.argv[2] || "before";
const base = "http://localhost:3000";
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const results = [];
for (const route of routes) {
  try {
    await page.goto(base + route, { waitUntil: "networkidle", timeout: 15000 });
    await page.waitForTimeout(300);
    const file = `${outDir}/${route.replace(/\//g, "_") || "root"}.png`;
    await page.screenshot({ path: file, fullPage: false });
    results.push({ route, ok: true });
  } catch (e) {
    results.push({ route, ok: false, error: String(e).slice(0, 200) });
  }
}
await browser.close();
console.log(JSON.stringify(results, null, 2));
