import { test, expect, type Page } from "@playwright/test";

const CMD_K = process.platform === "darwin" ? "Meta+KeyK" : "Control+KeyK";
const SHOTS = "/private/tmp/claude-501/-Users-davidoliver-github-aero-mro/8749e9a4-7665-437f-9c34-b3dd4fc5a24b/scratchpad/shots";

// Boot the SPA and wait past the "Loading fleet data…" spinner.
async function boot(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Fleet Airworthiness Dashboard" })).toBeVisible({
    timeout: 20_000,
  });
}

function sidebar(page: Page) {
  return page.locator("aside.sidebar");
}

// Click a sidebar nav item by its visible label (badge aria-label is extra text).
async function nav(page: Page, label: string | RegExp) {
  await sidebar(page).getByRole("button", { name: label }).click();
}

test("1. boots authenticated to the Fleet Airworthiness Dashboard with breadcrumb", async ({ page }) => {
  await boot(page);
  const crumbs = page.locator(".crumbs");
  await expect(crumbs).toContainText("AeroMRO");
  await expect(crumbs).toContainText("Operations");
  await expect(crumbs.locator("strong")).toHaveText("Dashboard");
  await page.screenshot({ path: `${SHOTS}/01-dashboard.png` });
});

test("2. cross-links: Defects → Fleet, Defects → WO → Fleet", async ({ page }) => {
  await boot(page);

  // Defects register
  await nav(page, /Defects/);
  await expect(page.getByRole("heading", { level: 1, name: "Defects" })).toBeVisible();

  // Aircraft registration link in the register → Fleet, with a highlighted row.
  await page.locator("table .entity-link").first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Fleet" })).toBeVisible();
  await expect(page.locator(".crumbs strong")).toHaveText("Fleet");
  await expect(page.locator("tr.row-focus")).toHaveCount(1);
  await page.screenshot({ path: `${SHOTS}/02a-fleet-rowfocus.png` });

  // Back to Defects; open a Work Order from a WO number link.
  await nav(page, /Defects/);
  const woLink = page.locator('.entity-link[title="Open work order"]').first();
  await expect(woLink).toBeVisible();
  const woNumber = (await woLink.innerText()).trim();
  expect(woNumber).toMatch(/^WO-2026-/);
  await woLink.click();

  await expect(page.getByRole("heading", { level: 1, name: "Work Orders" })).toBeVisible();
  // The detail header card is the only .card carrying both the WO number and an
  // in-app link (the left-list cards have no entity-link).
  const detail = page.locator(".card", { hasText: woNumber }).filter({ has: page.locator(".entity-link") });
  await expect(detail).toContainText(woNumber);
  await page.screenshot({ path: `${SHOTS}/02b-wo-detail.png` });

  // Aircraft link inside the WO detail → Fleet again.
  await detail.locator('.entity-link[title="View aircraft in Fleet"]').click();
  await expect(page.getByRole("heading", { level: 1, name: "Fleet" })).toBeVisible();
  await expect(page.locator(".crumbs strong")).toHaveText("Fleet");
});

test("3. Fleet Sectors (7d) link deep-links to Tech Log with the aircraft filter set", async ({ page }) => {
  await boot(page);
  await nav(page, /Fleet/);
  await expect(page.getByRole("heading", { level: 1, name: "Fleet" })).toBeVisible();

  await page.locator('.entity-link[title="Open tech log for this aircraft"]').first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Electronic Tech Log" })).toBeVisible();

  // First select on the page is the sector-filter; a deep link pre-selects it.
  const filter = page.locator("select").first();
  await expect(filter).not.toHaveValue("");
  await page.screenshot({ path: `${SHOTS}/03-techlog-filtered.png` });
});

test("4. command palette: ⌘K search → aircraft, and / opens / Esc closes", async ({ page }) => {
  await boot(page);

  await page.keyboard.press(CMD_K);
  const palette = page.locator(".palette");
  await expect(palette).toBeVisible();
  await palette.locator("input").fill("G-ALBB");
  // Top result should be the aircraft match.
  await expect(palette.locator('li[role="option"]').first()).toContainText("G-ALBB");
  await palette.locator("input").press("Enter");
  await expect(palette).toBeHidden();
  await expect(page.getByRole("heading", { level: 1, name: "Fleet" })).toBeVisible();
  await expect(page.locator(".crumbs strong")).toHaveText("Fleet");

  // "/" opens the palette, Escape closes it.
  await page.keyboard.press("Slash");
  await expect(palette).toBeVisible();
  await palette.locator("input").press("Escape");
  await expect(palette).toBeHidden();
});

test("5. keyboard shortcuts: g-x, g-w, and ? help overlay", async ({ page }) => {
  await boot(page);

  await page.keyboard.press("g");
  await page.keyboard.press("x");
  await expect(page.getByRole("heading", { level: 1, name: "Defects" })).toBeVisible();

  await page.keyboard.press("g");
  await page.keyboard.press("w");
  await expect(page.getByRole("heading", { level: 1, name: "Work Orders" })).toBeVisible();

  await page.keyboard.press("Shift+Slash"); // "?"
  const help = page.locator(".kbd-help");
  await expect(help).toBeVisible();
  await expect(help).toContainText("Keyboard shortcuts");
  await page.screenshot({ path: `${SHOTS}/05-kbd-help.png` });
  await page.keyboard.press("Escape");
  await expect(help).toBeHidden();
});

test("6. Work Orders breadcrumb and AeroMRO crumb returns to Dashboard", async ({ page }) => {
  await boot(page);
  await nav(page, /Work Orders/);
  const crumbs = page.locator(".crumbs");
  await expect(crumbs).toContainText("Maintenance");
  await expect(crumbs.locator("strong")).toHaveText("Work Orders");

  await crumbs.getByRole("button", { name: "AeroMRO" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Fleet Airworthiness Dashboard" })).toBeVisible();
});

test("7. theme: Settings toggles html data-theme light and back to dark", async ({ page }) => {
  await boot(page);
  await nav(page, /Settings/);
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();

  await page.getByRole("radio", { name: /Light/ }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.screenshot({ path: `${SHOTS}/07-light.png` });

  await page.getByRole("radio", { name: /Dark/ }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});
