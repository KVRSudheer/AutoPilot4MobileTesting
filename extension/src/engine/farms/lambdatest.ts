import type { FarmCredentials } from "../types.js";
import {
  appSessionName,
  baseCapabilities,
  browserNameFor,
  resolveNativeBuild,
  type DeviceFarm,
  type FarmConnection,
} from "./provider.js";

// LambdaTest serves every data centre from ONE real-device hub - there is no
// per-region hostname (mobile-hub.eu-central-1… does not resolve). The data
// centre is chosen with the `region` capability instead.
export const LAMBDATEST_HUB = "mobile-hub.lambdatest.com";

/** Normalise a region to the values LambdaTest accepts: US | EU | AP. */
export function lambdaTestRegion(region?: string): "US" | "EU" | "AP" {
  const r = (region || "us").trim().toLowerCase();
  if (r.startsWith("eu")) return "EU";
  if (r.startsWith("ap") || r.startsWith("as")) return "AP";
  return "US";
}

/**
 * LambdaTest Real Device Cloud. Capabilities go in the W3C-prefixed
 * `lt:options` bucket (deviceName / platformVersion / isRealMobile / app),
 * with app builds referenced as `lt://APP…` ids.
 */
export const lambdaTest: DeviceFarm = {
  id: "lambdatest",
  label: "LambdaTest Real Device Cloud",

  hasCredentials(creds: FarmCredentials): boolean {
    return Boolean(creds.username && creds.accessKey);
  },

  buildConnection({ creds, device, app }): FarmConnection {
    const target = device.connectionTarget ?? "app";
    const automationName = device.platform === "Android" ? "UiAutomator2" : "XCUITest";

    const ltOptions: Record<string, unknown> = {
      username: creds.username,
      accessKey: creds.accessKey,
      deviceName: device.deviceName,
      platformName: device.platform,
      platformVersion: device.osVersion,
      isRealMobile: true,
      // Must match the region the device list was fetched from - the pools
      // differ per data centre, so the device may not exist in another one.
      region: lambdaTestRegion(creds.region),
      project: "UiPath Mobile Test Autopilot",
      build: "autopilot-build",
      w3c: true,
      autoGrantPermissions: device.platform === "Android" ? true : undefined,
      // IP geolocation for the session (ISO country code, e.g. "ZA").
      geoLocation: device.geoLocation?.trim().toUpperCase() || undefined,
    };

    let caps: Record<string, unknown>;
    if (target === "browser") {
      ltOptions.name = app.startUrl || "mobile-web";
      caps = {
        browserName: browserNameFor(device),
        platformName: device.platform,
        "appium:automationName": automationName,
        "appium:deviceName": device.deviceName,
        "appium:platformVersion": device.osVersion,
        "appium:newCommandTimeout": 1800,
      };
    } else {
      ltOptions.name = appSessionName(device, app);
      // LambdaTest takes the build reference inside lt:options, not appium:app.
      ltOptions.app = resolveNativeBuild(device, app).buildId;
      caps = baseCapabilities(device, app);
      delete caps["appium:app"];
    }

    for (const k of Object.keys(ltOptions)) {
      if (ltOptions[k] === undefined) delete ltOptions[k];
    }
    caps["lt:options"] = ltOptions;

    return {
      protocol: "https",
      hostname: LAMBDATEST_HUB,
      port: 443,
      path: "/wd/hub",
      user: creds.username ?? "",
      key: creds.accessKey ?? "",
      capabilities: caps,
    };
  },
};
