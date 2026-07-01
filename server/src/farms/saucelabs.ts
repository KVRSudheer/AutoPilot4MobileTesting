import type { FarmCredentials } from "../types.js";
import {
  appSessionName,
  baseCapabilities,
  browserNameFor,
  type DeviceFarm,
  type FarmConnection,
} from "./provider.js";

function hostForRegion(region?: string): string {
  const r = (region || "us-west-1").trim();
  if (r.startsWith("eu")) return "ondemand.eu-central-1.saucelabs.com";
  if (r.startsWith("us-east")) return "ondemand.us-east-4.saucelabs.com";
  return "ondemand.us-west-1.saucelabs.com";
}

// Sauce treats appium:deviceName as a REGEX. Device names like "iPad (2022)"
// or "Galaxy S20+" contain regex-special chars, so we escape and anchor them
// for an exact, literal match (otherwise the parens/plus break matching).
function sauceDeviceName(name: string): string {
  return `^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`;
}

export const sauceLabs: DeviceFarm = {
  id: "saucelabs",
  label: "Sauce Labs Real Device Cloud",

  hasCredentials(creds: FarmCredentials): boolean {
    return Boolean(creds.username && creds.accessKey);
  },

  buildConnection({ creds, device, app }): FarmConnection {
    const target = device.connectionTarget ?? "app";
    const automationName = device.platform === "Android" ? "UiAutomator2" : "XCUITest";
    let caps: Record<string, unknown>;

    if (target === "browser") {
      const sauceOptions: Record<string, unknown> = {
        username: creds.username,
        accessKey: creds.accessKey,
        build: "UiPath Mobile Test Autopilot",
        name: app.startUrl || "mobile-web",
        deviceOrientation: "PORTRAIT",
      };
      // Real devices (RDC) on Android 14+ / iOS 17+ require Appium 2 / W3C.
      // "latest" works across OS versions on RDC, but VDC emulators/simulators
      // reject it ("Invalid version format") - so set it only for real devices.
      const isVirtual = /emulator|simulator/i.test(device.deviceName);
      if (!isVirtual) sauceOptions.appiumVersion = "latest";
      caps = {
        browserName: browserNameFor(device),
        platformName: device.platform,
        "appium:automationName": automationName,
        "appium:platformVersion": device.osVersion,
        "appium:newCommandTimeout": 300,
        "sauce:options": sauceOptions,
      };
    } else {
      caps = baseCapabilities(device, app);
      caps["sauce:options"] = {
        username: creds.username,
        accessKey: creds.accessKey,
        build: "UiPath Mobile Test Autopilot",
        name: appSessionName(device, app),
        // Required for Android 14+ real devices on Sauce RDC (Appium 2 / W3C).
        appiumVersion: "latest",
      };
    }

    // Sauce matches deviceName as a regex — escape/anchor for an exact match.
    caps["appium:deviceName"] = sauceDeviceName(device.deviceName);

    return {
      protocol: "https",
      hostname: hostForRegion(creds.region),
      port: 443,
      path: "/wd/hub",
      user: creds.username ?? "",
      key: creds.accessKey ?? "",
      capabilities: caps,
    };
  },
};
