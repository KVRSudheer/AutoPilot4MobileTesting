import type {
  AppConfig,
  ConnectionTarget,
  DeviceConfig,
  FarmCredentials,
  SessionMode,
} from "../types.js";
import { env } from "../config/env.js";
import { getFarm } from "../farms/index.js";
import { resolveNativeBuild } from "../farms/provider.js";
import { WebdriverDriver, type DeviceDriver } from "./driver.js";
import { SimulatedDriver } from "./simulated.js";

export interface CreatedSession {
  driver: DeviceDriver;
  mode: SessionMode;
}

/**
 * Create a device session. If the chosen farm has credentials, open a real
 * webdriverio (Appium) session against its hosted hub; otherwise fall back to
 * the simulated sample driver so the full pipeline still runs.
 *
 * Supports both connection targets:
 *  - "app": native app session (selectors = UiPath <mbl/>)
 *  - "browser": mobile web session (selectors = UiPath web <html>/<webctrl>)
 */
export async function createSession(args: {
  creds: FarmCredentials;
  device: DeviceConfig;
  app: AppConfig;
}): Promise<CreatedSession> {
  const farm = getFarm(args.creds.provider);
  const target: ConnectionTarget = args.device.connectionTarget ?? "app";
  const deviceLabel = `${args.device.deviceName} · ${args.device.platform} ${args.device.osVersion}`;

  if (!farm.hasCredentials(args.creds)) {
    return {
      mode: "simulated",
      driver: new SimulatedDriver(args.device.platform, target, deviceLabel),
    };
  }

  // A live native session needs a build for this device's platform. (The
  // client gates this, but guard the API directly too.)
  if (target === "app" && !resolveNativeBuild(args.device, args.app).buildId) {
    throw new Error(
      `No ${args.device.platform} build (.${args.device.platform === "iOS" ? "ipa" : "apk/.aab"}) was provided for this native run.`,
    );
  }

  const conn = farm.buildConnection(args);

  // Lazy import so webdriverio is only loaded for live sessions.
  const { remote } = await import("webdriverio");
  const browser = await remote({
    protocol: conn.protocol,
    hostname: conn.hostname,
    port: conn.port,
    path: conn.path,
    user: conn.user,
    key: conn.key,
    logLevel: "error",
    capabilities: conn.capabilities,
    connectionRetryTimeout: env.farm.connectTimeoutMs,
    connectionRetryCount: 0, // single attempt - surface a clear error rather than silently retrying
  } as Parameters<typeof remote>[0]);

  // Browser navigation is done by the orchestrator (executeRun) so it can be
  // logged, verified and retried.
  return {
    mode: "live",
    driver: new WebdriverDriver(browser as never, args.device.platform, target),
  };
}
