# Slack announcement — copy/paste ready

> Slack formatting: `*bold*`, `_italic_`, backticks for code. Paste as-is into Slack and it renders.
> Attach `mobile-test-autopilot-extension.zip` to the message before posting.

---

## Short version (recommended for a broad channel)

:sparkles: *Mobile Test Autopilot — testers wanted (2 min setup)*

Write a mobile test in plain English → an agent drives it on a real device → you get a UiPath `.xaml` with the *real* selectors it captured. No more digging through element trees for a resource-id.

Runs entirely in your browser — no server, nothing installed.

*Try it:*
1. Unzip the attached extension → `chrome://extensions` → *Developer mode* → *Load unpacked* → pick the folder
2. Open https://psindiacoe.staging.uipath.host/mobile-test-autopilot-v2 and *reload once*
3. Leave all credentials blank — it runs on a sample device so you can see the full flow immediately

Add UiPath credentials (scopes `OR.Execution ConversationalAgents`) for real LLM planning, and BrowserStack / Sauce Labs / LambdaTest for real devices. Setup details are behind the *Help* button in the app.

Feedback in thread :pray: — especially wrong elements picked, or selectors that didn't hold up in Studio.

---

:sparkles: *Mobile Test Autopilot — describe a mobile test in English, get a UiPath workflow with real selectors*

Looking for testers. It takes ~2 minutes to set up and you can try it with *zero credentials*.

*The idea*
Building mobile test automation is slow for one reason: the selectors. You launch the app, dig through the element tree, guess at a resource-id, run it, watch it break. Autopilot flips that around — you write the test in plain English, an agent drives your app on a real device, and it captures the *actual* selector for every element it touches. What you get back is a UiPath workflow you can open in Studio, not a starting point you still have to fix.

*What you can do with it*
• Write steps like `tap the search field` / `type running shoes` / `tap the first result` — one action per line
• Watch the agent run them live on a real device, with screenshots for every step
• Run the same test across *several devices in parallel* (Android + iOS together)
• Test *native apps* (`.apk` / `.ipa`) or *mobile web* (Chrome / Safari on device)
• Download a ready-to-review `.xaml`, a selector catalog, and a JSON action log

*How it works*
For each step, the agent reads the live screen, asks the *UiPath LLM Gateway* for the single best action + element, executes it, and records the resolved selector — UiPath `<mbl/>` for native, `<webctrl/>` for web. Those selectors are exact, not guessed. Everything runs *inside your browser* via a small extension; there's no server, no backend to host, nothing installed on your machine.

*Setup — 2 minutes*
1. Download the attached `mobile-test-autopilot-extension.zip` and *unzip it* (Chrome needs the folder, not the zip)
2. Open `chrome://extensions` → toggle *Developer mode* (top-right) → *Load unpacked* → pick the unzipped folder
3. Open the app: https://psindiacoe.staging.uipath.host/mobile-test-autopilot-v2
4. *Reload the page once* — extensions only attach to tabs opened after they're installed

You'll know it worked when a green *"Engine extension active"* pill shows up on the Connect step. Chrome or Edge only.

*Then pick your level*
• *No credentials at all* → runs against a bundled sample app with a built-in planner. Full flow end to end, real `.xaml` at the end. Best way to see it in 5 minutes.
• *+ UiPath credentials* → real LLM Gateway planning. You need an External Application with the scopes `OR.Execution ConversationalAgents` (that second one is what unlocks the Gateway — easy to miss).
• *+ device farm credentials* → real devices. BrowserStack, Sauce Labs or LambdaTest, plus your uploaded app build.

There's a *Help* button in the top-right of the app with the full setup guide, required scopes, and troubleshooting.

*What I'd love feedback on*
• Did the selectors it captured actually hold up when you ran the workflow in Studio?
• Where did the agent misread a screen or pick the wrong element?
• Steps it couldn't handle — phrasing that confused it
• Anything in the setup that tripped you up

Drop findings in this thread, ideally with the test steps you used + the app/device. :pray:

_Heads-up: this is on the staging environment and it's an unpacked dev-mode extension, so expect rough edges — that's what we're testing for. Your credentials stay in your browser; they only ever go to UiPath and your device farm._

---

## Shorter version (if the above is too long for your channel)

:sparkles: *Mobile Test Autopilot — testers wanted*

Write a mobile test in plain English → an agent drives it on a real device → you get a UiPath `.xaml` with the *real* selectors it captured along the way. No more digging through element trees.

Runs entirely in your browser, no server. Setup is ~2 min:
1. Unzip the attached extension, load it at `chrome://extensions` (*Developer mode* → *Load unpacked*)
2. Open https://psindiacoe.staging.uipath.host/mobile-test-autopilot-v2 and reload once
3. Leave every credential blank → it runs on a bundled sample device so you can see the whole flow immediately

Add UiPath credentials (scopes: `OR.Execution ConversationalAgents`) for real LLM planning, and BrowserStack / Sauce Labs / LambdaTest credentials for real devices. Full guide is behind the *Help* button in the app.

Feedback in thread — especially where the agent picked the wrong element, or selectors that didn't hold up in Studio. :pray:
