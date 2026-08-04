import type { FarmCredentials } from "../types.js";
import {
  baseCapabilities,
  browserCapabilities,
  type DeviceFarm,
  type FarmConnection,
} from "./provider.js";

/**
 * A self-hosted / own Appium (WebDriver) endpoint. The user provides the hub
 * URL (e.g. http://my-host:4723/wd/hub or an Appium Grid / DeviceFarmer hub);
 * we drive it with standard W3C capabilities, no cloud-vendor options.
 */
export const customFarm: DeviceFarm = {
  id: "custom",
  label: "Custom Appium endpoint",

  hasCredentials(creds: FarmCredentials): boolean {
    return Boolean(creds.hubUrl && creds.hubUrl.trim());
  },

  buildConnection({ creds, device, app }): FarmConnection {
    let url: URL;
    try {
      url = new URL((creds.hubUrl ?? "").trim());
    } catch {
      throw new Error("Invalid Appium hub URL. Use e.g. http://host:4723/wd/hub");
    }
    const target = device.connectionTarget ?? "app";
    const caps = target === "browser" ? browserCapabilities(device) : baseCapabilities(device, app);
    const isHttps = url.protocol === "https:";

    return {
      protocol: isHttps ? "https" : "http",
      hostname: url.hostname,
      port: url.port ? Number(url.port) : isHttps ? 443 : 4723,
      path: url.pathname && url.pathname !== "/" ? url.pathname : "/wd/hub",
      user: creds.username ?? "",
      key: creds.accessKey ?? "",
      capabilities: caps,
    };
  },
};
