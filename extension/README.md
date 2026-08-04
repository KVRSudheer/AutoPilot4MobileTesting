# UiPath Mobile Test Autopilot Engine (browser extension)

**This extension *is* the backend.** It runs the entire Autopilot engine inside
the browser's extension service worker, so the UiPath Coded App at
`https://psindiacoe.staging.uipath.host/mobile-test-autopilot-v2` works with
**nothing else installed and no server running**.

What runs in here:

- **Planning** — UiPath LLM Gateway calls (auth via client credentials or PAT), with the
  built-in heuristic planner as fallback.
- **Device automation** — a fetch-based W3C WebDriver/Appium client (`src/engine/automation/webdriver.ts`)
  that drives BrowserStack / Sauce Labs / any Appium hub. This replaces `webdriverio`, which is
  Node-only and can't run in a browser.
- **Simulated mode** — the bundled ACME Shopping sample device, so the whole flow demos with
  zero credentials.
- **Output** — `<mbl/>` / `<webctrl/>` selector capture, `.xaml` builder, JSON action log,
  screenshots — all generated in-extension.

The page talks to it with the same `/api/*` request shapes the Express server used, over
`window.postMessage` → content script → service worker. Run streams (SSE equivalent) use a
long-lived extension port.

## Install (once)

1. Open `chrome://extensions` (or `edge://extensions`).
2. Enable **Developer mode**.
3. **Load unpacked** → select this `extension/` folder.
4. Reload the app page. A green **“Engine extension active”** pill appears in the Connect step.

That's it — no `npm run dev:server`, no localhost, no hosting.

## Developing

```bash
npm --workspace extension run build       # bundle src/background.ts -> background.js
npm --workspace extension run watch       # rebuild on change
npm --workspace extension run typecheck
```

After a rebuild, hit **Reload** on the extension card in `chrome://extensions`.

`src/engine/` is a port of `server/src/` (same planner, farms, workflow builders). The
Node-specific pieces were replaced: `webdriverio` → `webdriver.ts`, `Buffer` → `btoa`/`Uint8Array`,
`node:events` → a small emitter, dotenv config → `src/engine/config/env.ts`.

The standalone `server/` workspace still exists and still works (`npm run dev`) for local
development against the Vite client.

## Scope

- Content script runs only on `https://*.uipath.host` and `http://localhost:5174`.
- The worker calls UiPath, your device farm, and your app's own hosts — the same endpoints the
  server called. Credentials are entered in the app and never leave your browser except to those
  services.
