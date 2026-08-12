/* The card ladder is generated from Truco.power at runtime, so it can drift
   only if the engine changes — which is exactly when we want to be told. */

import { test, expect } from '@playwright/test';

test('the card ladder shows every power tier, strongest first', async ({ page }) => {
  await page.goto('/index.html');
  await page.click('#btn-rules');

  const figures = page.locator('#card-ladder figure');
  await expect(figures).toHaveCount(14);
  await expect(page.locator('#card-ladder figure svg')).toHaveCount(14);

  const captions = await page.locator('#card-ladder figcaption').allTextContents();
  expect(captions.slice(0, 4).map((c) => c.trim()))
    .toEqual(['1 espadas', '1 bastos', '7 espadas', '7 oros']);
  expect(captions.at(-1).trim()).toBe('the 4s');

  // 14 cards on one page, each with its own gradient and filter ids
  const unique = await page.evaluate(() => {
    const nodes = document.querySelectorAll('#card-ladder svg [id]');
    const ids = [...nodes].map((n) => n.id);
    return ids.length === new Set(ids).size;
  });
  expect(unique, 'duplicate SVG def ids would cross-contaminate the cards').toBe(true);
});

test('the ladder relabels in Spanish and keeps its tiers', async ({ page }) => {
  await page.goto('/index.html');
  await page.click('#lang-toggle');
  await page.click('#btn-rules');

  const captions = await page.locator('#card-ladder figcaption').allTextContents();
  expect(captions).toHaveLength(14);
  expect(captions[0].trim()).toBe('1 de espadas');
  expect(captions.at(-1).trim()).toBe('los 4');
});

test('flor is on by default and an opt-out sticks', async ({ page }) => {
  await page.goto('/index.html');
  await page.click('#btn-start');
  const toggle = page.locator('#btn-flor-solo');
  await expect(toggle).toHaveText(/FLOR \(1v1\): ON/);
  await expect(toggle).toHaveClass(/flor-on/);

  await toggle.click();
  await expect(toggle).toHaveText(/FLOR \(1v1\): OFF/);

  await page.reload();
  await page.click('#btn-start');
  await expect(page.locator('#btn-flor-solo')).toHaveText(/FLOR \(1v1\): OFF/);
});
