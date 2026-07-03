# UiPath Browser Test Autopilot

Turn plain-English desktop browser test steps into a runnable UiPath workflow with captured web selectors. The app connects to UiPath for LLM Gateway planning, runs Chrome or Edge locally, streams screenshots while the run executes, and produces a `.xaml`, action log, and selector catalog.

## What It Does

1. **Connect** - validate UiPath credentials and add one or more Chrome/Edge browser environments.
2. **Compose** - enter a start URL and one browser action per test step.
3. **Run** - the agent opens the URL, reads the DOM, plans one action, executes it, captures screenshots, and records UiPath web selectors.
4. **Workflow** - download the browser automation `.xaml`, JSON action log, and selector catalog.

The browser runner supports:

- Local Microsoft Edge or Google Chrome via WebDriver.
- UiPath LLM Gateway planning, with a built-in heuristic fallback.

## Architecture

```text
client/   React + Vite + Tailwind, wizard UI, SSE live run view
server/   Express + TypeScript
  uipath/      auth, LLM Gateway REST client, planner
  automation/  local browser session, WebDriver wrapper, orchestrator
  workflow/    UiPath web selector builder, browser XAML builder, action log
```

The backend owns WebDriver sessions and keeps UiPath secrets server-side. The Vite client proxies `/api` to the Express server.

## Setup

```bash
npm install
cp .env.example server/.env
```

Edit `server/.env` only if you want server-side defaults. All UiPath and browser settings can also be entered in the UI.

## Run

```bash
npm run dev
```

Open `http://localhost:5173` or the Vite port shown in the terminal.

Other scripts:

```bash
npm run typecheck
npm run build
npm start
```

## Browser Configuration

Local browser defaults:

```env
BROWSER_NAME=edge
BROWSER_HEADLESS=false
BROWSER_VIEWPORT_WIDTH=1440
BROWSER_VIEWPORT_HEIGHT=900
```

## Output

- Selectors use UiPath web format: `<html .../><webctrl .../>`.
- The `.xaml` opens Chrome or Edge and emits browser UI Automation activities for click, type, get text, element exists, keyboard, and scroll-style steps.
- The JSON action log records the browser environment, start URL, planned action, runtime locator, selector, screenshots, and browser outcome.

## Notes

- Sessions are stored in memory for local/operator use.
- Execution is strict one-action-per-step, with a scroll retry when a target is not initially visible.
- `server/src/uipath/llmGateway.ts` is left on the original gateway implementation.
