import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BrowserName, DeviceConfig, SessionMode } from "../types.js";
import { env } from "../config/env.js";
import { connectLaunchedBrowser, type BrowserDriver } from "./driver.js";

export interface CreatedSession {
  driver: BrowserDriver;
  mode: SessionMode;
}

function normalizeBrowser(value?: string): BrowserName {
  return value?.toLowerCase() === "chrome" ? "chrome" : "edge";
}

function resolveViewport(device: DeviceConfig): { width: number; height: number } {
  return {
    width: device.viewportWidth || env.farm.viewportWidth,
    height: device.viewportHeight || env.farm.viewportHeight,
  };
}

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

function browserExecutable(browser: BrowserName): string {
  const candidates =
    browser === "chrome"
      ? [
          "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
          "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
          join(process.env.LOCALAPPDATA || "", "Google\\Chrome\\Application\\chrome.exe"),
        ]
      : [
          "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
          "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
          join(process.env.LOCALAPPDATA || "", "Microsoft\\Edge\\Application\\msedge.exe"),
        ];

  const found = candidates.find((path) => path && existsSync(path));
  if (!found) {
    const label = browser === "chrome" ? "Google Chrome" : "Microsoft Edge";
    throw new Error(`${label} was not found on this machine.`);
  }
  return found;
}

function cleanupLaunch(browserProcess: ChildProcess, profileDir: string): void {
  try {
    browserProcess.kill();
  } catch {
    // Ignore cleanup errors; the original launch/connect error is more useful.
  }
  try {
    rmSync(profileDir, { recursive: true, force: true });
  } catch {
    // Profile files can be held briefly by the browser process.
  }
}

function seedAutomationProfile(profileDir: string): void {
  const defaultDir = join(profileDir, "Default");
  mkdirSync(defaultDir, { recursive: true });
  writeFileSync(join(profileDir, "First Run"), "");
  writeFileSync(
    join(profileDir, "Local State"),
    JSON.stringify({
      browser: { has_seen_welcome_page: true },
      signin: { allowed: false },
      sync: { requested: false, suppress_start: true },
      user_experience_metrics: { stability: { exited_cleanly: true } },
      profile: {
        info_cache: {
          Default: {
            name: "Automation",
            is_using_default_name: false,
          },
        },
      },
    }),
  );
  writeFileSync(
    join(defaultDir, "Preferences"),
    JSON.stringify({
      browser: {
        check_default_browser: false,
        has_seen_welcome_page: true,
      },
      credentials_enable_service: false,
      profile: {
        content_settings: { exceptions: {} },
        default_content_setting_values: { notifications: 2 },
        password_manager_enabled: false,
      },
      signin: { allowed: false, allowed_on_next_startup: false },
      sync: { requested: false, suppress_start: true },
    }),
  );
}

function launchArguments(args: {
  browser: BrowserName;
  debugPort: number;
  profileDir: string;
  width: number;
  height: number;
  headless: boolean;
}): string[] {
  const common = [
    `--remote-debugging-port=${args.debugPort}`,
    "--remote-allow-origins=*",
    `--user-data-dir=${args.profileDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-default-apps",
    "--disable-extensions",
    "--disable-popup-blocking",
    "--disable-sync",
    "--new-window",
    ...(args.headless ? [`--window-size=${args.width},${args.height}`] : ["--start-maximized"]),
  ];

  const edgeOnly =
    args.browser === "edge"
      ? [
          "--guest",
          "--disable-features=msEdgeBrowserSignin,msEdgeSync,msImplicitSignin,msSingleSignOn,EdgeIdentitySignin,EdgeSyncConsent,EdgeWelcomePage,SignInProfileCreationEnterprise",
        ]
      : [];

  return [...(args.headless ? ["--headless=new"] : []), ...common, ...edgeOnly, "about:blank"];
}

/**
 * Create a local desktop browser automation session. The app launches Chrome or
 * Edge directly on this machine and drives it through Chrome DevTools Protocol.
 */
export async function createSession(args: {
  device: DeviceConfig;
}): Promise<CreatedSession> {
  const browser = normalizeBrowser(args.device.browser || env.farm.defaultBrowser);
  const { width, height } = resolveViewport(args.device);
  const headless = args.device.headless ?? env.farm.headless;
  const debugPort = await getFreePort();
  const profileDir = mkdtempSync(join(tmpdir(), `uipath-browser-${browser}-`));
  seedAutomationProfile(profileDir);
  const executable = browserExecutable(browser);
  const launchArgs = launchArguments({
    browser,
    debugPort,
    profileDir,
    width,
    height,
    headless,
  });

  const browserProcess = spawn(executable, launchArgs, {
    stdio: "ignore",
    detached: false,
    windowsHide: false,
  });

  let spawnError: Error | undefined;
  browserProcess.once("error", (error) => {
    spawnError = error instanceof Error ? error : new Error(String(error));
  });

  try {
    const driver = await connectLaunchedBrowser({
      browserProcess,
      debugPort,
      profileDir,
      viewportWidth: width,
      viewportHeight: height,
      maximize: !headless,
    });

    return {
      mode: "live",
      driver,
    };
  } catch (error) {
    cleanupLaunch(browserProcess, profileDir);
    throw spawnError || error;
  }
}
