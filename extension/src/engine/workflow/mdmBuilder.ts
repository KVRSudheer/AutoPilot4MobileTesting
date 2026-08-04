import type { MobileSelector, SessionState, StepResult } from "../types.js";
import { GENERATOR_SOURCE, csString, csTextExpression, pascal } from "./csharpBuilder.js";

type GeneratedValue = NonNullable<SessionState["generatedData"]>[number];

/**
 * Generate a UiPath **Coded Workflow** (C#) that drives the device through the
 * UiPath Mobile Automation API - `mobile.Connect(...)` against a Mobile Device
 * Manager connection.
 *
 * Why this exists alongside the raw-HTTP export: a workflow that talks to
 * Appium directly opens its *own* session, which MDM knows nothing about, so
 * the run is invisible in the MDM device view. Connecting through MDM keeps
 * the live device window, MDM logs, screenshots and Test Manager reporting.
 *
 * Requires `UiPath.MobileAutomation.Activities` in the Studio project. No
 * credentials are emitted: the hub URL and access key live in the MDM
 * connection, which this file only references by name.
 */

// "Verify / wait for X" steps in the export mirror the agent's policy.
const VERIFY_ATTEMPTS = 12;
const VERIFY_DELAY_S = 5;

/** Android keycodes for keys `HardwareButton` cannot express. */
const ANDROID_KEYCODE_NUMBERS: Record<string, number> = {
  ENTER: 66,
  TAB: 61,
  DEL: 67,
  SEARCH: 84,
  BACK: 4,
  HOME: 3,
};

/** `HardwareButton` members - the only keys the typed API covers. */
const HARDWARE_BUTTONS: Record<string, string> = {
  BACK: "HardwareButton.BackButton",
  HOME: "HardwareButton.HomeButton",
  RECENTS: "HardwareButton.SwitchAppButton",
  APPSWITCH: "HardwareButton.SwitchAppButton",
};

const SWIPE_DIRECTIONS: Record<string, string> = {
  up: "SwipeDirection.Up",
  down: "SwipeDirection.Down",
  left: "SwipeDirection.Left",
  right: "SwipeDirection.Right",
};

/**
 * A `SelectorTarget` for a captured selector. Mobile APIs take the UiPath
 * `<mbl>` selector - the same string the .xaml export uses - so the two
 * exports target elements identically.
 */
function target(sel: MobileSelector): string {
  return `Sel(${csString(sel.mbl.replace(/\r?\n/g, " "))})`;
}

/** C# lines for one step, against the UiPath mobile API. */
function stepLines(
  step: StepResult,
  isAndroid: boolean,
  generated: GeneratedValue[],
): string[] {
  const a = step.action;
  const sel = step.selector;
  const n = step.index + 1;
  const out: string[] = [];

  out.push(`// Step ${n}: ${step.description.replace(/\r?\n/g, " ")}`);
  if (step.reason) out.push(`// Planner: ${step.reason.replace(/\r?\n/g, " ")}`);
  // Conditional blocks are recorded for reference; the exported workflow runs
  // the steps that actually executed, same as the .xaml export.
  if (step.condition) {
    out.push(`// Conditional (group ${step.conditionGroup ?? 0}): only ran because - ${step.condition.replace(/\r?\n/g, " ")}`);
  }
  if (step.optional) out.push(`// Optional step: skipped rather than failed when absent.`);
  if (!a) {
    out.push(`// (no action was planned for this step)`);
    return out;
  }

  switch (a.actionType) {
    case "tap":
      if (!sel) break;
      out.push(`connection.Tap(${target(sel)});`);
      break;

    case "setText":
      if (!sel) break;
      out.push(
        `connection.SetText(${target(sel)}, ${csTextExpression(a.text ?? "", generated, step.descriptionTemplate)});`,
      );
      break;

    case "getText": {
      if (!sel) break;
      out.push(`string text${n} = connection.GetText(${target(sel)});`);
      out.push(`Trace($"Step ${n} captured: {text${n}}");`);
      if (step.capturedText) {
        out.push(`// Recorded run captured: ${step.capturedText.replace(/\r?\n/g, " ").slice(0, 120)}`);
      }
      break;
    }

    case "assertExists": {
      if (!sel) break;
      // Same policy as the agent.
      out.push(`if (!WaitForElement(connection, ${target(sel)}, attempts: ${VERIFY_ATTEMPTS}, delaySeconds: ${VERIFY_DELAY_S}))`);
      out.push(
        `    throw new Exception(${csString(`Step ${n} failed: element not found - ${step.description}`)});`,
      );
      break;
    }

    case "swipe": {
      const dir = a.direction ?? "up";
      // `direction` is the finger movement, matching what the agent performed.
      out.push(`connection.DirectionalSwipe(${SWIPE_DIRECTIONS[dir] ?? "SwipeDirection.Up"}, 60);`);
      break;
    }

    case "pressKey": {
      const key = (a.key ?? "BACK").toUpperCase();
      const button = HARDWARE_BUTTONS[key];
      if (button) {
        out.push(`connection.PressHardwareButton(${button});`);
      } else if (isAndroid) {
        // HardwareButton has no ENTER/TAB/DEL/SEARCH, so the key goes through
        // ExecuteCommand - still on the MDM session, so the run stays visible.
        // Command naming differs across drivers; the Appium 2 form is in the
        // comment below in case "pressKeyCode" is rejected.
        out.push(`// HardwareButton has no ${key}; sent as a native command on this session.`);
        out.push(
          `// If the driver rejects this name, use: connection.ExecuteCommand("mobile: pressKey", new Dictionary<string, object> { ["keycode"] = ${ANDROID_KEYCODE_NUMBERS[key] ?? 66} });`,
        );
        out.push(
          `connection.ExecuteCommand("pressKeyCode", new Dictionary<string, object> { ["keycode"] = ${ANDROID_KEYCODE_NUMBERS[key] ?? 66} }); // ${key}`,
        );
      } else {
        out.push(
          `connection.ExecuteCommand("mobile: pressButton", new Dictionary<string, object> { ["name"] = ${csString(key.toLowerCase())} });`,
        );
      }
      break;
    }
  }
  return out;
}

export function buildMdmCodedWorkflow(state: SessionState): string {
  const className = pascal(state.title);
  const isAndroid = state.platform === "Android";
  const isWeb = state.target === "browser";
  const generated = state.generatedData ?? [];

  // MDM entry names. These must match what the user configured in Mobile
  // Device Manager; the recorded labels are the best available default.
  const deviceName = state.mobile?.deviceName || state.deviceLabel || "My Device";
  const appName = state.appLabel || "My Application";

  const body: string[] = [];
  for (const step of state.steps) {
    if (step.status === "pending" || step.status === "skipped") continue;
    body.push(...stepLines(step, isAndroid, generated), "");
  }

  const bodyText = body.join("\n");
  const usedGenerators = Object.keys(GENERATOR_SOURCE).filter((name) =>
    new RegExp(`\\b${name}\\(`).test(bodyText),
  );
  const generatorBlock = usedGenerators.length
    ? [
        "",
        "        // --- Fresh test data on every run -------------------------------",
        "        // The recorded run used one set of values; regenerating here keeps",
        "        // re-runs unique for apps that de-duplicate on these fields.",
        "        private static readonly Random _rng = new Random();",
        ...usedGenerators.flatMap((name) => ["", ...GENERATOR_SOURCE[name].map((l) => `        ${l}`)]),
      ]
    : [];

  const needsWait = /\bWaitForElement\(/.test(bodyText);

  const gps = state.gpsCoordinates;

  const header = [
    "// ---------------------------------------------------------------------------",
    `// ${state.title}`,
    "// UiPath Coded Workflow - generated by UiPath Mobile Test Autopilot.",
    "//",
    `// Device   : ${state.deviceLabel}`,
    `// Provider : ${state.provider}`,
    `// Target   : ${isWeb ? "mobile browser" : "native app"}`,
    `// App      : ${state.appLabel}`,
    `// Mode     : ${state.mode}${state.mode === "simulated" ? " (recorded against the bundled sample device)" : ""}`,
    "//",
    "// Drives the device through the UiPath Mobile Automation API, so the run is",
    "// visible in Mobile Device Manager - live device view, MDM logs, screenshots",
    "// and Test Manager reporting. (The raw-Appium export opens its own session,",
    "// which MDM has no knowledge of, so nothing shows up in the device view.)",
    "//",
    "// Setup in Studio:",
    "//   1. Install the UiPath.MobileAutomation.Activities package.",
    "//   2. In Mobile Device Manager, create a device connection and an",
    "//      application entry, then make the two constants below match their",
    "//      names exactly. The hub URL and access key live in MDM, which is why",
    "//      no credentials appear in this file.",
    "// ---------------------------------------------------------------------------",
    "",
    "using System;",
    "using System.Collections.Generic;",
    "using System.Linq;",
    "using System.Threading;",
    "using UiPath.CodedWorkflows;",
    "using UiPath.MobileAutomation.API.Models;",
    "",
    "namespace MobileTestAutopilot",
    "{",
    `    public class ${className} : CodedWorkflow`,
    "    {",
    "        // Must match the entries configured in Mobile Device Manager.",
    `        private const string MdmDeviceName      = ${csString(deviceName)};`,
    `        private const string MdmApplicationName = ${csString(appName)};`,
    "",
    "        [Workflow]",
    "        public void Execute()",
    "        {",
    "            using (Connection connection = mobile.Connect(MdmDeviceName, MdmApplicationName))",
    "            {",
    `                Trace($"Connected through MDM to {MdmDeviceName} (Appium session {connection.GetSessionIdentifier()})");`,
  ];

  const preamble: string[] = [];
  if (gps) {
    const [lat, lon] = gps.split(",").map((v) => Number(v.trim()));
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      preamble.push("");
      preamble.push("                // GPS the app reads for \"use my current location\".");
      preamble.push(`                connection.SetDeviceGeoLocation(0, ${lat}, ${lon});`);
    }
  }
  if (isWeb && state.mobile?.startUrl) {
    preamble.push("");
    preamble.push(`                connection.OpenUrl(${csString(state.mobile.startUrl)});`);
  }
  preamble.push("");

  const helpers: string[] = [
    "",
    "        /// <summary>",
    "        /// A mobile target from a captured native selector. If your activity-pack",
    "        /// version exposes the static factory instead, the body becomes:",
    "        ///     SelectorTarget.FromSelector(selector);",
    "        /// </summary>",
    "        private static SelectorTarget Sel(string selector) =>",
    "            new SelectorTarget { Selector = selector };",
  ];
  if (needsWait) {
    helpers.push(
      "",
      "        /// <summary>Spaced presence check - mirrors the agent's verify policy.</summary>",
      "        private static bool WaitForElement(",
      `            Connection connection, SelectorTarget target, int attempts = ${VERIFY_ATTEMPTS}, int delaySeconds = ${VERIFY_DELAY_S})`,
      "        {",
      "            for (var attempt = 1; attempt <= attempts; attempt++)",
      "            {",
      "                try { if (connection.ElementExists(target)) return true; }",
      "                catch { /* not present on this attempt */ }",
      "                if (attempt < attempts) Thread.Sleep(delaySeconds * 1000);",
      "            }",
      "            return false;",
      "        }",
    );
  }

  const footer = [
    "            }",
    "        }",
    ...helpers,
    "",
    "        private static void Trace(string message) => Console.WriteLine(message);",
    ...generatorBlock,
    "    }",
    "}",
    "",
  ];

  const indentedBody = body.map((l) => (l ? `                ${l}` : ""));
  return [...header, ...preamble, ...indentedBody, ...footer].join("\n");
}
