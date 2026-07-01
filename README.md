# UiPath Mobile Test Autopilot

Turn a plain-English mobile test case into a runnable **UiPath Mobile Automation workflow (`.xaml`) with real selectors** — by launching the app on a cloud device (BrowserStack / Sauce Labs), driving it one action per step, and using the **UiPath LLM Gateway** to decide each action and capture each element's UiPath mobile (`<mbl/>`) selector.

> Enterprise UI follows UiPath agentic branding (Poppins, UiPath orange/navy/blue, rounded cards).

---

## What it does

1. **Connect** — UiPath authentication (client credentials *or* a bearer/PAT token) + a cloud device farm + device capabilities.
2. **App & Test Case** — the app under test + your test steps in natural language (one action per step).
3. **Run** — the agent connects to the farm's hosted Appium hub, launches the app, and for **each step**:
   reads the live screen → asks the UiPath LLM Gateway for the single best action + element → executes it →
   captures the resolved `<mbl/>` selector → screenshots before/after. Progress streams live via SSE.
4. **Workflow** — download a ready-to-review **`.xaml`** workflow, a **JSON action log**, and a **selector catalog**.

### Live vs. simulated mode (graceful fallback)

The app is fully runnable **without any credentials**:

| | Device | Planner |
|---|---|---|
| **Live** | Farm creds present → real session on BrowserStack/Sauce | UiPath creds present → real **LLM Gateway** |
| **Simulated** | No farm creds → bundled "ACME Shopping" sample device | No UiPath creds → built-in **heuristic planner** |

Each side falls back independently, so you can mix (e.g. real LLM against the sample device). A banner in the Run view shows which mode is active.

---

## Architecture

Monorepo (npm workspaces). A Vite **client** dev-proxies `/api` to an Express **server**.

```
client/   React 19 + Vite + Tailwind 4 (UiPath branding), 4-step wizard, SSE live view
server/   Express + TypeScript
  uipath/      auth (client-creds + bearer via UiPath SDK) · llmGateway REST · planner
  farms/       provider abstraction · browserstack · saucelabs
  automation/  session (webdriverio) · driver · pageModel (Appium XML → elements) · orchestrator · simulated
  workflow/    selectors (<mbl/>) · xamlBuilder (.xaml) · actionLog (JSON + catalog)
  fixtures/    declarative sample app → page source + SVG screenshots for simulated runs
```

**Why a backend?** webdriverio can't run in a browser, the client secret must stay server-side, and BrowserStack/Sauce/UiPath calls are CORS-blocked from the browser.

**UiPath SDK + LLM:** the UiPath *TypeScript* SDK has no LLM module (only the Python SDK does), so the SDK is used as the **auth/token holder** (`secret` + `getToken()`), and the **LLM Gateway REST API** (`…/llmgateway_/api/chat/completions`, OpenAI-compatible) is called directly. The gateway base path auto-falls-back across `llmgateway_` → `orchestrator_/llm` → `agenthub_/llm`.

---

## Prerequisites

- Node.js 20+ (tested on 24) and npm 9+.
- *(Optional, for live runs)* A BrowserStack or Sauce Labs account with an **uploaded app build** (`bs://…` or `storage:…`), and a UiPath org/tenant with an **External Application** (client id + secret) that can reach the LLM Gateway.

## Setup

```bash
npm install                 # installs client + server workspaces
cp .env.example server/.env # optional: server-side defaults (everything is optional)
```

Edit `server/.env` to set defaults (UiPath org/tenant/creds, farm creds, LLM model). Anything left blank can be entered per-session in the UI, and anything blank everywhere triggers simulated/heuristic fallback. **Secrets stay server-side** — the UI only learns *whether* a credential is configured, never its value.

## Run

```bash
npm run dev        # server on :8787, client on :5173 (one command)
```

Open **http://localhost:5173** and walk the wizard.

Other scripts: `npm run build` (typecheck + build both), `npm run typecheck`, `npm start` (built server).

---

## UiPath authentication

- **Client credentials** — provide org, tenant, `clientId`, `clientSecret`, scope. The server exchanges them at
  `POST {baseUrl}/identity_/connect/token` (`grant_type=client_credentials`) and hands the bearer token to the UiPath SDK.
- **Bearer / PAT** — paste a token directly; the SDK holds it.

`OR.Execution` / `OR.Default` scopes typically cover the LLM Gateway — confirm in your tenant's external-app scope picker.

## Device farms

| Provider | Hub | App id | Notes |
|---|---|---|---|
| **BrowserStack** | `hub-cloud.browserstack.com/wd/hub` | `bs://<id>` | `bstack:options` capabilities |
| **Sauce Labs** | `ondemand.<region>.saucelabs.com/wd/hub` | `storage:<id>` | region selectable (us-west-1 / us-east-4 / eu-central-1) |

Both target Android (UiAutomator2) and iOS (XCUITest) via standard W3C Appium capabilities.

---

## Output: the generated workflow

- **Selectors** are UiPath mobile **`<mbl/>`** format (attribute-based — no XPath), preferring the most stable
  attribute per platform (Android: resource-id → content-desc → text; iOS: accessibilityId → name → label). These are **exact**.
- **`.xaml`** wraps the steps in a `MobileDeviceConnection` scope with one mobile activity per step
  (`Tap`, `TypeText`, `Swipe`, `PressHardwareButton`, `GetText`, `ElementExists`).

> ⚠️ **Confirm the mobile package namespace before importing.** The `.xaml` targets
> `UiPath.Mobile.Automation.Activities`; the exact activity namespace/version is Studio-package-dependent.
> The selector catalog and JSON action log are exact regardless and are the safest reference if the XAML
> needs a one-line namespace tweak for your Studio version.

---

## Verifying it works (no accounts needed)

```bash
npm run dev
```

Walk the wizard leaving all credentials blank → the Run step drives the bundled ACME Shopping sample with the
heuristic planner, streaming screenshots + an agent activity log, and the Workflow step renders a selector
catalog and downloads a well-formed `.xaml`. Add UiPath creds to use the real LLM Gateway; add farm creds + an
uploaded app to drive a real device.

## Notes & limitations

- Sessions are stored in-memory (single process) — fine for a single-operator tool; swap for Redis to scale out.
- Execution is **strict one-action-per-step** (with a single scroll-retry if an element isn't immediately found).
- Live device/LLM verification requires your own BrowserStack/Sauce + UiPath credentials and an uploaded app.
