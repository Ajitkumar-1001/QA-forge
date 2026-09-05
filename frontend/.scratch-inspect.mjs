import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto("http://localhost:3000/dashboard", { waitUntil: "networkidle" });
const info = await page.evaluate(() => {
  const links = Array.from(document.querySelectorAll('[data-slot="sidebar-menu-button"]'));
  return links.map(el => ({
    text: el.textContent?.trim().slice(0, 20),
    color: getComputedStyle(el).color,
    className: el.className,
    tag: el.tagName,
    active: el.getAttribute('data-active'),
  }));
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
