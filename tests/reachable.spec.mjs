/* Every button a player needs must be reachable on the smallest phone we
   support. The 2v2 lobby shipped to the App Store with START, TABLE TALK,
   EDIT NAME and CANCEL rendered past the bottom of the screen, with no way to
   scroll to them and no hardware back button on iOS to escape with. Nothing in
   the Node suites could have seen that. This can. */

import { test, expect } from '@playwright/test';

const SMALLEST = { width: 320, height: 568 };   // iPhone SE, 1st gen

/** Scroll it into view the way a finger would, then ask if it's on screen. */
async function reachable(page, selector) {
  const el = page.locator(selector);
  await expect(el).toBeVisible();
  await el.scrollIntoViewIfNeeded();
  const box = await el.boundingBox();
  const height = page.viewportSize().height;
  return box !== null && box.y >= 0 && box.y + box.height <= height;
}

async function acceptTerms(page) {
  const agree = page.locator('#btn-terms-accept');
  if (await agree.isVisible()) await agree.click();
}

test.describe('every control is reachable on a 320x568 screen', () => {
  test.use({ viewport: SMALLEST });

  test('the 2v2 lobby can be escaped', async ({ page }) => {
    await page.goto('/index.html');
    await page.click('#btn-online');
    await acceptTerms(page);
    await page.click('#btn-mode-2v2');
    await page.waitForSelector('#lobby-roster .lobby-seat');

    // the four seats and every button below them
    for (const sel of ['#btn-start-2v2', '#btn-lobby-name', '#btn-online-cancel']) {
      expect(await reachable(page, sel), `${sel} is off screen`).toBe(true);
    }

    await page.click('#btn-online-cancel');
    await expect(page.locator('#online-overlay')).toBeHidden();
  });

  test('the 1v1 table can be escaped', async ({ page }) => {
    await page.goto('/index.html');
    await page.click('#btn-online');
    await acceptTerms(page);
    await page.click('#btn-mode-1v1');
    await page.waitForFunction(() => document.getElementById('online-link').value !== '');

    expect(await reachable(page, '#btn-online-cancel')).toBe(true);
    await page.click('#btn-online-cancel');
    await expect(page.locator('#online-overlay')).toBeHidden();
  });

  test('the rules close button survives a long rules body', async ({ page }) => {
    await page.goto('/index.html');
    await page.click('#btn-rules');
    await expect(page.locator('#card-ladder figure').first()).toBeVisible();
    expect(await reachable(page, '#btn-close-rules')).toBe(true);
  });

  test('the solo and settings panels stay usable', async ({ page }) => {
    await page.goto('/index.html');
    await page.click('#btn-start');
    expect(await reachable(page, '#btn-solo-cancel')).toBe(true);
    await page.click('#btn-solo-cancel');

    await page.click('#settings-toggle');
    expect(await reachable(page, '#btn-close-settings')).toBe(true);
  });
});
