// Shared domain types for the UiPath Mobile Test Autopilot server.
// The client keeps a mirrored copy in client/src/lib/types.ts.

export type Platform = "Android" | "iOS";
export type FarmProvider = "browserstack" | "saucelabs" | "custom";
export type UiPathAuthMode = "clientCredentials" | "bearer";
// What we drive on the device: a native app or the mobile web browser.
export type ConnectionTarget = "app" | "browser";

export interface UiPathAuthConfig {
  mode: UiPathAuthMode;
  baseUrl: string;
  orgName: string;
  tenantName: string;
  // client-credentials
  clientId?: string;
  clientSecret?: string;
  scope?: string;
  // bearer / PAT
  bearerToken?: string;
  // LLM
  llmModel?: string;
}

export interface FarmCredentials {
  provider: FarmProvider;
  // browserstack
  username?: string;
  accessKey?: string;
  // saucelabs adds region
  region?: string;
  // custom: a self-hosted / own Appium (WebDriver) hub URL
  hubUrl?: string;
}

export interface DeviceConfig {
  platform: Platform;
  deviceName: string; // e.g. "Google Pixel 8" / "iPhone 15"
  osVersion: string; // e.g. "14.0" / "17"
  // Provision a native-app session or a mobile-browser session. Default "app".
  connectionTarget?: ConnectionTarget;
  // Browser-mode browserName override (Android). iOS is always Safari.
  browser?: string;
}

// Native build, one per platform. The farm-uploaded reference is
// bs://<id> (BrowserStack) or storage:<id> (Sauce).
export interface AndroidBuild {
  buildId: string; // apk/aab reference
  appPackage?: string;
  appActivity?: string;
}
export interface IosBuild {
  buildId: string; // ipa reference
  bundleId?: string;
}

// The app under test is a property of the TEST CASE, not the device: one
// build per platform (shared across all devices of that platform) and one
// browser URL (shared across all browser targets).
export interface AppConfig {
  appName?: string;
  android?: AndroidBuild;
  ios?: IosBuild;
  // Browser mode: the URL to open and automate.
  startUrl?: string;
}

export interface SessionRequest {
  uipath: UiPathAuthConfig;
  farm: FarmCredentials;
  device: DeviceConfig;
  app: AppConfig;
  testSteps: string[];
  // Human-readable test-case name; used as the run identifier in the UI,
  // logs and downloaded artifact filenames.
  title?: string;
}

export type SessionMode = "live" | "simulated";

export type StepStatus =
  | "pending"
  | "running"
  | "passed"
  | "needs-attention"
  | "failed";

export type ActionType =
  | "tap"
  | "setText"
  | "swipe"
  | "pressKey"
  | "getText"
  | "assertExists";

export type SwipeDirection = "up" | "down" | "left" | "right";

// A single element parsed from the device page source (native or web).
export interface UiElement {
  index: number;
  platform: Platform;
  kind?: "native" | "web";
  className: string; // android class / iOS XCUIElementType / html tag
  text?: string;
  contentDesc?: string; // android content-desc / iOS label
  resourceId?: string; // android resource-id
  accessibilityId?: string; // accessibility id / iOS name
  name?: string; // iOS name / html name attribute
  value?: string;
  bounds?: string;
  clickable?: boolean;
  enabled?: boolean;
  focused?: boolean;
  // web-only attributes
  tag?: string;
  htmlId?: string;
  testId?: string; // data-test / data-testid
  inputType?: string; // <input type=...>
  ariaLabel?: string;
  placeholder?: string;
  href?: string;
  role?: string;
  cssPath?: string;
}

// A resolved UiPath selector + the runtime locator strategy used.
// For native: `mbl` is a <mbl .../> fragment. For web: `mbl` holds the
// UiPath web selector (<html .../><webctrl .../>).
export interface MobileSelector {
  platform: Platform;
  kind: "mobile" | "web";
  mbl: string;
  // runtime locator the driver used to find the element
  strategy: "accessibility id" | "id" | "-android uiautomator" | "xpath" | "css";
  locator: string;
}

// The LLM planner's single-action decision for one test step.
export interface PlannedAction {
  actionType: ActionType;
  targetIndex: number; // -1 when no element is targeted (e.g. pressKey BACK)
  text?: string;
  direction?: SwipeDirection;
  key?: string; // for pressKey: BACK | HOME | ENTER ...
  reason: string;
  confidence?: number;
}

// Whether the device accepted and actually applied an action.
export interface ActionOutcome {
  dispatched: boolean; // the command was accepted by the device (no driver error)
  effect: "applied" | "no-change" | "unverified";
  detail: string; // human-readable explanation
  durationMs: number;
}

export interface StepResult {
  index: number;
  description: string;
  status: StepStatus;
  action?: PlannedAction;
  selector?: MobileSelector;
  element?: UiElement;
  reason?: string;
  message?: string;
  capturedText?: string;
  outcome?: ActionOutcome;
  beforeScreenshot?: string; // base64 png (no data: prefix)
  afterScreenshot?: string;
  elementShot?: string; // screenshot cropped to the interacted element (data URL)
  startedAt?: number;
  finishedAt?: number;
}

// Non-secret connection details carried for generating the Mobile Automation
// .xaml (Appium capabilities). Credentials are deliberately NOT included.
export interface MobileConnectionInfo {
  platformName: Platform;
  platformVersion: string;
  deviceName: string;
  automationName: string; // UiAutomator2 | XCUITest
  provider: FarmProvider;
  app?: string; // native build reference (bs://… / storage:…)
  startUrl?: string; // mobile-browser start page
  browserName?: string; // mobile-browser browser
}

export interface SessionState {
  id: string;
  title: string; // test-case name / run identifier
  mobile?: MobileConnectionInfo;
  mode: SessionMode;
  status: "created" | "connecting" | "running" | "completed" | "error";
  platform: Platform;
  target: ConnectionTarget;
  provider: FarmProvider;
  deviceLabel: string;
  appLabel: string;
  llmModel: string;
  llmLive: boolean; // true when the real LLM Gateway answered
  createdAt: number;
  steps: StepResult[];
  currentStep: number;
  error?: string;
}

// Server-Sent Event payloads streamed to the client during a run.
export type RunEvent =
  | { type: "session"; session: SessionState }
  | { type: "step"; step: StepResult }
  | { type: "log"; level: "info" | "warn" | "error"; message: string; at: number }
  // Live device-screen frame (ephemeral - not buffered/replayed).
  | { type: "frame"; image: string; at: number }
  | { type: "done"; session: SessionState }
  | { type: "error"; message: string };
