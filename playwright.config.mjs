/* Browser tests for the parts of Monolito the Node suites can't see.
   test_engine*.js prove the rules; these prove the screen — that every button
   a player needs is actually reachable, and that two browsers can find each
   other. The 2v2 lobby once shipped to the App Store with its CANCEL button
   rendered off the bottom of the phone, which is exactly the shape of bug
   that only shows up in a real layout at a real viewport size. */

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 90_000,               // the two-peer test waits on a real WebRTC link
  expect: { timeout: 15_000 },
  fullyParallel: false,          // the online tests share a public broker
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',

  use: {
    baseURL: 'http://localhost:8123',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    /* Layout runs on WebKit because that is literally the engine the iOS app
       ships in — a panel that overflows in WKWebView is the bug we're hunting,
       and Chromium would not reproduce it faithfully. */
    {
      name: 'phone-webkit',
      use: { ...devices['iPhone 12'] },
      testMatch: /(reachable|rules-and-settings)\.spec\.mjs/,
    },
    /* The peer-to-peer test runs on Chromium, whose headless WebRTC actually
       completes a connection; Playwright's WebKit build can't be relied on for
       that, and a flaky test nobody trusts is worse than no test. */
    {
      name: 'online-chromium',
      use: { ...devices['Pixel 5'], browserName: 'chromium' },
      testMatch: /invite\.spec\.mjs/,
    },
  ],

  // serve the repo exactly as GitHub Pages does: static files, no build
  webServer: {
    command: 'python3 -m http.server 8123',
    url: 'http://localhost:8123/index.html',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    stdout: 'ignore',            // one line per asset request, every run
    stderr: 'pipe',
  },
});
