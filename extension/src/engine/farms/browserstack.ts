import type { FarmCredentials } from "../types.js";
import {
  appSessionName,
  baseCapabilities,
  browserNameFor,
  type DeviceFarm,
  type FarmConnection,
} from "./provider.js";

export const browserStack: DeviceFarm = {
  id: "browserstack",
  label: "BrowserStack App Automate",

  hasCredentials(creds: FarmCredentials): boolean {
    return Boolean(creds.username && creds.accessKey);
  },

  buildConnection({ creds, device, app }): FarmConnection {
    const target = device.connectionTarget ?? "app";
    let caps: Record<string, unknown>;

    if (target === "browser") {
      // Real mobile browser (BrowserStack Automate): browserName + realMobile.
      caps = {
        browserName: browserNameFor(device),
        "bstack:options": {
          userName: creds.username,
          accessKey: creds.accessKey,
          deviceName: device.deviceName,
          osVersion: device.osVersion,
          realMobile: "true",
          projectName: "UiPath Mobile Test Autopilot",
          buildName: "autopilot-build",
          sessionName: app.startUrl || "mobile-web",
          appiumVersion: "2.0.0",
        },
      };
    } else {
      caps = baseCapabilities(device, app);
      caps["bstack:options"] = {
        userName: creds.username,
        accessKey: creds.accessKey,
        deviceName: device.deviceName,
        osVersion: device.osVersion,
        projectName: "UiPath Mobile Test Autopilot",
        buildName: "autopilot-build",
        sessionName: appSessionName(device, app),
        appiumVersion: "2.0.0",
      };
    }

    // IP geolocation (ISO country code) - applies to both targets.
    const geo = device.geoLocation?.trim().toUpperCase();
    if (geo) {
      (caps["bstack:options"] as Record<string, unknown>).geoLocation = geo;
    }

    return {
      protocol: "https",
      hostname: "hub-cloud.browserstack.com",
      port: 443,
      path: "/wd/hub",
      user: creds.username ?? "",
      key: creds.accessKey ?? "",
      capabilities: caps,
    };
  },
};
