#!/usr/bin/env node
/**
 * Digital.ai Continuous Testing connection diagnostic.
 *
 * UiPath MDM fails with "There was an error retrieving pixel ratio" AFTER the
 * session opens. MDM derives the pixel ratio from the device's window rect and
 * a screenshot, so this script opens a session the same way MDM does and calls
 * exactly those commands, reporting which one fails.
 *
 * It runs each capability combination in turn so you can see whether the
 * Safari/browserName session is the problem or the device/driver itself.
 *
 * Needs only Node 18+ (global fetch). Run it ON the machine/VPN that can reach
 * the Digital.ai host - the host is internal-only.
 *
 *   node diagnose-digitalai.mjs --key <accessKey>
 *
 * Optional:
 *   --host <hostname>        default: your instance below
 *   --device <name>          default: Rajesh-iOS26
 *   --version <os version>   default: 26.5.2
 *   --bundle <bundleId>      app to launch. Apps already installed on the
 *                            device (com.apple.* system apps) are launched by
 *                            bundle id; anything else is treated as living in
 *                            the Digital.ai app repository (cloud:<id>).
 *   --installed              force bundle-id-only launch for a non-Apple app
 *                            that is already installed on the device.
 */

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith("--")) acc.push([cur.slice(2), arr[i + 1]]);
    return acc;
  }, []),
);

const HOST = args.host || "vm-682adced04fcd41207e503ef.us-east-1.compute.is.apple.com";
const DEVICE = args.device || "Rajesh-iOS26";
const OS_VERSION = args.version || "26.5.2";
const ACCESS_KEY = args.key || process.env.DIGITALAI_ACCESS_KEY;
const BUNDLE = args.bundle || "";

if (!ACCESS_KEY) {
  console.error("Missing access key. Pass --key <accessKey> or set DIGITALAI_ACCESS_KEY.");
  process.exit(1);
}

const BASE = `https://${HOST}/wd/hub`;

async function wd(method, path, body, timeoutMs = 180000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text.slice(0, 400) };
    }
    return { ok: res.ok, status: res.status, json, ms: Date.now() - started };
  } catch (e) {
    return { ok: false, status: 0, json: { error: String(e.message || e) }, ms: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

function errorOf(r) {
  const v = r.json?.value ?? r.json;
  return (v?.message || v?.error || v?.raw || JSON.stringify(v) || "").slice(0, 300);
}

// The three shapes worth comparing.
const SCENARIOS = [
  {
    name: "Safari web session (browserName)",
    caps: {
      platformName: "iOS",
      browserName: "Safari",
      "appium:automationName": "XCUITest",
      "appium:deviceName": DEVICE,
      "appium:platformVersion": OS_VERSION,
      "digitalai:accessKey": ACCESS_KEY,
      "digitalai:testName": "MDM pixel-ratio diagnostic (Safari)",
    },
  },
  {
    name: "Native session, no app launched",
    caps: {
      platformName: "iOS",
      "appium:automationName": "XCUITest",
      "appium:deviceName": DEVICE,
      "appium:platformVersion": OS_VERSION,
      "digitalai:accessKey": ACCESS_KEY,
      "digitalai:testName": "MDM pixel-ratio diagnostic (native)",
    },
  },
];
if (BUNDLE) {
  // Pre-installed apps (any com.apple.* system app, or --installed) launch by
  // bundle id alone. Only apps uploaded to the Digital.ai repository take the
  // `cloud:` form - passing cloud: for a system app fails, since it isn't there.
  const preinstalled = BUNDLE.startsWith("com.apple.") || "installed" in args;
  SCENARIOS.push({
    name: `Native session launching ${BUNDLE}${preinstalled ? " (pre-installed)" : " (from cloud repo)"}`,
    caps: {
      platformName: "iOS",
      "appium:automationName": "XCUITest",
      "appium:deviceName": DEVICE,
      "appium:platformVersion": OS_VERSION,
      ...(preinstalled ? {} : { "appium:app": `cloud:${BUNDLE}` }),
      "appium:bundleId": BUNDLE,
      "digitalai:accessKey": ACCESS_KEY,
      "digitalai:testName": "MDM pixel-ratio diagnostic (app)",
    },
  });
}

console.log(`host   : ${HOST}`);
console.log(`device : ${DEVICE} / iOS ${OS_VERSION}\n`);

for (const scenario of SCENARIOS) {
  console.log("=".repeat(72));
  console.log(scenario.name);
  console.log("=".repeat(72));

  const created = await wd("POST", "/session", {
    capabilities: { alwaysMatch: scenario.caps, firstMatch: [{}] },
  });
  if (!created.ok) {
    console.log(`  ✗ session NOT created (${created.status}, ${(created.ms / 1000).toFixed(0)}s)`);
    console.log(`    ${errorOf(created)}\n`);
    continue;
  }
  const sid = created.json?.value?.sessionId || created.json?.sessionId;
  console.log(`  ✓ session created in ${(created.ms / 1000).toFixed(0)}s  (${sid?.slice(0, 12)}…)`);

  // These two are what MDM needs for the pixel ratio.
  const rect = await wd("GET", `/session/${sid}/window/rect`, undefined, 60000);
  console.log(
    rect.ok
      ? `  ✓ window/rect  ${JSON.stringify(rect.json?.value)}  (${rect.ms}ms)`
      : `  ✗ window/rect FAILED (${rect.status}, ${rect.ms}ms): ${errorOf(rect)}`,
  );

  const shot = await wd("GET", `/session/${sid}/screenshot`, undefined, 90000);
  if (shot.ok) {
    const b64 = String(shot.json?.value ?? "");
    // PNG header bytes give us the real pixel dimensions.
    let dims = "unknown";
    try {
      const buf = Buffer.from(b64, "base64");
      if (buf.length > 24) dims = `${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}`;
    } catch {
      /* ignore */
    }
    console.log(`  ✓ screenshot   ${b64.length} b64 chars, ${dims} px  (${shot.ms}ms)`);
    const r = rect.json?.value;
    if (r?.width && dims !== "unknown") {
      const ratio = Number(dims.split("x")[0]) / r.width;
      console.log(`  → pixel ratio would be ${ratio.toFixed(2)}  ${Number.isFinite(ratio) && ratio > 0 ? "✓ computable" : "✗ not computable"}`);
    }
  } else {
    console.log(`  ✗ screenshot FAILED (${shot.status}, ${shot.ms}ms): ${errorOf(shot)}`);
    console.log("    ^ this is almost certainly what MDM is reporting as the pixel-ratio error");
  }

  // Extras that tell us whether the driver is healthy in general.
  const src = await wd("GET", `/session/${sid}/source`, undefined, 60000);
  console.log(
    src.ok
      ? `  ✓ page source  ${String(src.json?.value ?? "").length} chars`
      : `  ✗ page source FAILED: ${errorOf(src)}`,
  );

  await wd("DELETE", `/session/${sid}`, undefined, 30000);
  console.log("  · session closed\n");
}

console.log("Interpretation:");
console.log("  screenshot fails, others pass   -> device/driver can't screenshot; MDM's pixel");
console.log("                                     ratio depends on it. Raise with Digital.ai;");
console.log("                                     often an iOS-version/XCUITest support gap.");
console.log("  Safari fails but native passes  -> drop browserName from the MDM capabilities.");
console.log("  session never created           -> capabilities/access key/network, not MDM.");
console.log("  everything passes               -> the device is fine; the fault is inside MDM.");
