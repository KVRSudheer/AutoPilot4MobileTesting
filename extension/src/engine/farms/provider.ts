import type {
  AppConfig,
  DeviceConfig,
  FarmCredentials,
  FarmProvider,
} from "../types.js";

// webdriverio remote() connection options (subset we use).
export interface FarmConnection {
  protocol: "https" | "http";
  hostname: string;
  port: number;
  path: string;
  user: string;
  key: string;
  capabilities: Record<string, unknown>;
}

export interface DeviceFarm {
  readonly id: FarmProvider;
  readonly label: string;
  buildConnection(args: {
    creds: FarmCredentials;
    device: DeviceConfig;
    app: AppConfig;
  }): FarmConnection;
  hasCredentials(creds: FarmCredentials): boolean;
}

// Resolve the native build for THIS device's platform from the per-platform
// app config (one Android build, one iOS build - shared across all devices of
// that platform within a test case).
export interface ResolvedBuild {
  buildId?: string;
  appPackage?: string;
  appActivity?: string;
  bundleId?: string;
}
export function resolveNativeBuild(device: DeviceConfig, app: AppConfig): ResolvedBuild {
  if (device.platform === "Android") {
    return {
      buildId: app.android?.buildId,
      appPackage: app.android?.appPackage,
      appActivity: app.android?.appActivity,
    };
  }
  return { buildId: app.ios?.buildId, bundleId: app.ios?.bundleId };
}

// Display name for a native session (farm session label).
export function appSessionName(device: DeviceConfig, app: AppConfig): string {
  return app.appName || resolveNativeBuild(device, app).buildId || "app";
}

// Base W3C Appium capabilities shared by every provider.
export function baseCapabilities(device: DeviceConfig, app: AppConfig): Record<string, unknown> {
  const automationName = device.platform === "Android" ? "UiAutomator2" : "XCUITest";
  const build = resolveNativeBuild(device, app);
  const caps: Record<string, unknown> = {
    platformName: device.platform,
    "appium:automationName": automationName,
    "appium:deviceName": device.deviceName,
    "appium:platformVersion": device.osVersion,
    "appium:app": build.buildId,
    "appium:autoGrantPermissions": device.platform === "Android" ? true : undefined,
    "appium:newCommandTimeout": 1800,
  };
  if (device.platform === "Android" && build.appPackage) {
    caps["appium:appPackage"] = build.appPackage;
    if (build.appActivity) caps["appium:appActivity"] = build.appActivity;
  }
  if (device.platform === "iOS" && build.bundleId) {
    caps["appium:bundleId"] = build.bundleId;
  }
  // strip undefined
  for (const k of Object.keys(caps)) if (caps[k] === undefined) delete caps[k];
  return caps;
}

// Mobile-browser W3C capabilities (shared by providers for browser sessions).
// iOS only supports Safari; Android defaults to Chrome but can be overridden.
export function browserNameFor(device: DeviceConfig): string {
  if (device.platform === "iOS") return "safari";
  return device.browser?.trim() || "chrome";
}
export function browserCapabilities(device: DeviceConfig): Record<string, unknown> {
  const automationName = device.platform === "Android" ? "UiAutomator2" : "XCUITest";
  return {
    browserName: browserNameFor(device),
    platformName: device.platform,
    "appium:automationName": automationName,
    "appium:deviceName": device.deviceName,
    "appium:platformVersion": device.osVersion,
    "appium:newCommandTimeout": 1800,
  };
}
