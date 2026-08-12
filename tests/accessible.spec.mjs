/* A card game whose cards are unlabelled SVG is, to a screen reader, an empty
   screen. These check the names exist and that a hand can be played without a
   mouse or a working pair of eyes. */

import { test, expect } from '@playwright/test';

/** Deal a solo hand against the bot and wait for the cards to land. */
async function dealSolo(page) {
  await page.goto('/index.html');
  await page.click('#btn-start');
  await page.click('#btn-solo-bot');
  await expect(page.locator('#hand-you .card')).toHaveCount(3, { timeout: 30_000 });
}

test('every card in your hand has a name', async ({ page }) => {
  await dealSolo(page);
  const labels = await page.locator('#hand-you .card').evaluateAll(
    (els) => els.map((e) => e.getAttribute('aria-label')));

  expect(labels).toHaveLength(3);
  for (const label of labels) {
    expect(label, 'a card with no accessible name is invisible to VoiceOver')
      .toMatch(/(1|2|3|4|5|6|7|10|11|12) (espadas|bastos|oros|copas)/);
  }
});

test("the rival's face-down cards say so rather than lying", async ({ page }) => {
  await dealSolo(page);
  const labels = await page.locator('#hand-ai .card').evaluateAll(
    (els) => els.map((e) => e.getAttribute('aria-label')));
  expect(labels.length).toBeGreaterThan(0);
  for (const label of labels) expect(label).toBe('face-down card');
});

test('the card art itself is hidden from the accessibility tree', async ({ page }) => {
  await dealSolo(page);
  const exposed = await page.locator('#hand-you .card .face:not([aria-hidden="true"])').count();
  expect(exposed, 'the SVG would be read out as a pile of nothing').toBe(0);
});

test('a card can be played from the keyboard', async ({ page }) => {
  await dealSolo(page);
  const first = page.locator('#hand-you .card.playable').first();
  await expect(first).toHaveAttribute('role', 'button');
  await expect(first).toHaveAttribute('tabindex', '0');
  await expect(first).toHaveAttribute('aria-label', /^Play the /);

  await first.focus();
  await page.keyboard.press('Enter');
  // the played card leaves the hand for the table
  await expect(page.locator('#hand-you .card')).toHaveCount(2, { timeout: 20_000 });
});

test('the running commentary is announced', async ({ page }) => {
  await page.goto('/index.html');
  const dock = page.locator('#dock-msg');
  await expect(dock).toHaveAttribute('role', 'status');
  await expect(dock).toHaveAttribute('aria-live', 'polite');
});

test('icon-only controls have names', async ({ page }) => {
  await page.goto('/index.html');
  for (const sel of ['#lang-toggle', '#settings-toggle']) {
    const label = await page.getAttribute(sel, 'aria-label');
    expect(label, `${sel} is an unlabelled glyph`).toBeTruthy();
  }
});
