/* The invite link, which shipped broken: built from location.origin, it
   pointed at capacitor://localhost inside the App Store build — the sender's
   own WebView, useless to anyone else. These pin down where the link points
   in each shell, and that a second browser given nothing but that link ends
   up dealt into the same hand. */

import { test, expect } from '@playwright/test';

const WEB_HOME = 'https://spencersearle.github.io/monolito-truco/';

/* Pretend to be the Capacitor shell. The real thing was confirmed in the iOS
   simulator to report location.origin as capacitor://localhost and to expose
   the Share plugin here. */
const NATIVE = `window.Capacitor = {
  isNativePlatform: () => true,
  Plugins: { Share: { share: async (o) => { window.__shared = o; } },
             App: { addListener: () => {}, getLaunchUrl: async () => null } }
};`;

async function hostTable(page, mode = '1v1') {
  await page.click('#btn-online');
  const agree = page.locator('#btn-terms-accept');
  if (await agree.isVisible()) await agree.click();
  await page.click(mode === '2v2' ? '#btn-mode-2v2' : '#btn-mode-1v1');
  await page.waitForFunction(
    () => (document.getElementById('online-link').value || '').includes('join'),
    null, { timeout: 40_000 },
  );
  return page.inputValue('#online-link');
}

test('on the web the link keeps its own origin', async ({ page }) => {
  await page.goto('/index.html');
  const link = await hostTable(page);
  expect(link).toContain('localhost:8123');
  expect(link).toMatch(/#join=[a-z0-9]{6}$/);
});

test('in the app the link points at the public build', async ({ page }) => {
  await page.addInitScript(NATIVE);
  await page.goto('/index.html');
  const link = await hostTable(page);
  expect(link).toMatch(new RegExp(`^${WEB_HOME}#join=[a-z0-9]{6}$`));

  await expect(page.locator('#btn-share-link')).toBeVisible();
  await page.click('#btn-share-link');
  const shared = await page.evaluate(() => window.__shared);
  expect(shared.url).toBe(link);
  expect(shared.text).toContain(link.split('#join=')[1].toUpperCase());
});

test('in the app a 2v2 link uses the join4 hash', async ({ page }) => {
  await page.addInitScript(NATIVE);
  await page.goto('/index.html');
  expect(await hostTable(page, '2v2')).toMatch(new RegExp(`^${WEB_HOME}#join4=[a-z0-9]{6}$`));
});

test('a browser invite offers to hand the table to the app', async ({ page }) => {
  await page.goto('/index.html#join=abc123');
  const agree = page.locator('#btn-terms-accept');
  if (await agree.isVisible()) await agree.click();

  const openApp = page.locator('#btn-open-app');
  await expect(openApp).toBeVisible();
  await expect(openApp).toHaveAttribute('data-code', 'abc123');
});

test('the app itself never offers to open the app', async ({ page }) => {
  await page.addInitScript(NATIVE);
  await page.goto('/index.html#join=abc123');
  const agree = page.locator('#btn-terms-accept');
  if (await agree.isVisible()) await agree.click();
  await expect(page.locator('#btn-join-go')).toBeVisible();
  await expect(page.locator('#btn-open-app')).toBeHidden();
});

/* The whole point of the link. Uses the public PeerJS broker and real WebRTC,
   so it is the slowest test here and the first to fail if signalling is down —
   which is itself worth knowing. */
test('a second browser joins from the link alone', async ({ browser }) => {
  const hostCtx = await browser.newContext();
  const guestCtx = await browser.newContext();
  const host = await hostCtx.newPage();
  const guest = await guestCtx.newPage();

  await host.goto('/index.html');
  const invite = await hostTable(host);

  await guest.goto(invite);
  const agree = guest.locator('#btn-terms-accept');
  if (await agree.isVisible()) await agree.click();
  await expect(guest.locator('#join-code')).toHaveValue(invite.split('#join=')[1].toUpperCase());
  await guest.fill('#online-name', 'Amiga');
  await guest.click('#btn-join-go');

  await expect(host.locator('#hand-you .card')).toHaveCount(3, { timeout: 60_000 });
  await expect(guest.locator('#hand-you .card')).toHaveCount(3, { timeout: 60_000 });

  await hostCtx.close();
  await guestCtx.close();
});
