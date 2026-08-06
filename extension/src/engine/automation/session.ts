import type {
  AppConfig,
  ConnectionTarget,
  DeviceConfig,
  DriverConnectionInfo,
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
  // Endpoint + capabilities actually used (live only), credentials removed.
  connection?: DriverConnectionInfo;
}

// Capability keys / nested option buckets that carry secrets.
const SECRET_KEYS = new Set(["username", "userName", "accessKey", "access_key", "key", "password"]);

function stripSecrets(caps: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(caps)) {
    if (SECRET_KEYS.has(k)) continue;
    out[k] =
      v && typeof v === "object" && !Array.isArray(v)
        ? stripSecrets(v as Record<string, unknown>)
        : v;
  }
  return out;
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

  // Raw fetch-based WebDriver client (webdriverio is Node-only; this runs in
  // the extension service worker). Single attempt - surface a clear error.
  const { RemoteSession } = await import("./webdriver.js");
  const browser = await RemoteSession.create({
    protocol: conn.protocol,
    hostname: conn.hostname,
    port: conn.port,
    path: conn.path,
    user: conn.user,
    key: conn.key,
    capabilities: conn.capabilities,
    connectTimeoutMs: env.farm.connectTimeoutMs,
  });

  // Browser navigation is done by the orchestrator (executeRun) so it can be
  // logged, verified and retried.
  return {
    mode: "live",
    driver: new WebdriverDriver(browser as never, args.device.platform, target),
    connection: {
      hubUrl: `${conn.protocol}://${conn.hostname}${conn.port === 443 || conn.port === 80 ? "" : `:${conn.port}`}${conn.path}`,
      capabilities: stripSecrets(conn.capabilities),
    },
  };
}
