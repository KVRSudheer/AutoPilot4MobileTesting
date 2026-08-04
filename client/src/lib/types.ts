// Mirror of server/src/types.ts (kept in sync manually across workspaces).

export type Platform = "Android" | "iOS";
export type FarmProvider = "browserstack" | "saucelabs" | "lambdatest" | "custom";
export type UiPathAuthMode = "clientCredentials" | "bearer";
export type ConnectionTarget = "app" | "browser";

export interface UiPathAuthConfig {
  mode: UiPathAuthMode;
  baseUrl: string;
  orgName: string;
  tenantName: string;
  clientId?: string;
  clientSecret?: string;
  scope?: string;
  bearerToken?: string;
  llmModel?: string;
}

export interface FarmCredentials {
  provider: FarmProvider;
  username?: string;
  accessKey?: string;
  region?: string;
  hubUrl?: string;
}

export interface DeviceConfig {
  platform: Platform;
  deviceName: string;
  osVersion: string;
  connectionTarget?: ConnectionTarget;
  browser?: string;
  // ISO country code for the device's IP geolocation (e.g. "ZA").
  // Supported by BrowserStack and LambdaTest.
  geoLocation?: string;
  // GPS the device reports to the app, as "latitude,longitude". This is what
  // "use my current location" reads - separate from the IP-level geoLocation.
  gpsCoordinates?: string;
}

export interface AndroidBuild {
  buildId: string; // apk/aab reference: bs://… , storage:… or lt://…
  appPackage?: string;
  appActivity?: string;
}
export interface IosBuild {
  buildId: string; // ipa reference: bs://… , storage:… or lt://…
  bundleId?: string;
}

// App under test = a property of the test case: one build per platform (shared
// across all devices of that platform) + one browser URL (shared).
export interface AppConfig {
  appName?: string;
  android?: AndroidBuild;
  ios?: IosBuild;
  startUrl?: string;
}

export interface SessionRequest {
  uipath: UiPathAuthConfig;
  farm: FarmCredentials;
  device: DeviceConfig;
  app: AppConfig;
  testSteps: string[];
  // Replay: re-run a finished session's recorded actions + selectors with no
  // LLM planning, to measure how fast the captured automation actually runs.
  replayOf?: string;
  title?: string;
}

export type SessionMode = "live" | "simulated";
export type StepStatus =
  | "pending"
  | "running"
  | "passed"
  | "needs-attention"
  | "failed"
  | "skipped";
export type ActionType = "tap" | "setText" | "swipe" | "pressKey" | "getText" | "assertExists";
export type SwipeDirection = "up" | "down" | "left" | "right";

export interface UiElement {
  index: number;
  platform: Platform;
  kind?: "native" | "web";
  className: string;
  text?: string;
  contentDesc?: string;
  resourceId?: string;
  accessibilityId?: string;
  name?: string;
  value?: string;
  bounds?: string;
  clickable?: boolean;
  enabled?: boolean;
  focused?: boolean;
  tag?: string;
  htmlId?: string;
  testId?: string;
  inputType?: string;
  ariaLabel?: string;
  placeholder?: string;
  href?: string;
  role?: string;
  cssPath?: string;
}

export interface MobileSelector {
  platform: Platform;
  kind: "mobile" | "web";
  mbl: string;
  strategy: "accessibility id" | "id" | "-android uiautomator" | "xpath" | "css";
  locator: string;
}

export interface PlannedAction {
  actionType: ActionType;
  targetIndex: number;
  text?: string;
  direction?: SwipeDirection;
  key?: string;
  reason: string;
  confidence?: number;
}

export interface ActionOutcome {
  dispatched: boolean;
  effect: "applied" | "no-change" | "unverified";
  detail: string;
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
  // Conditional execution: `condition` is the guard text from an `If …` block
  // (steps sharing a `conditionGroup` are gated together); `optional` marks a
  // step that is skipped rather than failed when its target isn't present.
  // Pre-expansion step text, so exports know which {{tokens}} were this step's.
  descriptionTemplate?: string;
  condition?: string;
  conditionGroup?: number;
  optional?: boolean;
  outcome?: ActionOutcome;
  beforeScreenshot?: string;
  afterScreenshot?: string;
  elementShot?: string;
  startedAt?: number;
  finishedAt?: number;
}

export interface MobileConnectionInfo {
  platformName: Platform;
  platformVersion: string;
  deviceName: string;
  automationName: string;
  provider: FarmProvider;
  app?: string;
  startUrl?: string;
  browserName?: string;
}

// Endpoint + capabilities the driver actually connected with (no credentials).
export interface DriverConnectionInfo {
  hubUrl: string;
  capabilities: Record<string, unknown>;
}

export interface SessionState {
  id: string;
  title: string;
  mobile?: MobileConnectionInfo;
  connection?: DriverConnectionInfo;
  // {{token}} values generated for this run, so exported workflows can
  // regenerate them at their own runtime instead of reusing this run's data.
  generatedData?: Array<{ token: string; kind: string; arg: string; value: string }>;
  mode: SessionMode;
  status: "created" | "connecting" | "running" | "paused" | "completed" | "error";
  platform: Platform;
  target: ConnectionTarget;
  provider: FarmProvider;
  deviceLabel: string;
  appLabel: string;
  llmModel: string;
  llmLive: boolean;
  // GPS the run applied to the device, as "latitude,longitude", so exported
  // workflows can reproduce the same simulated position.
  gpsCoordinates?: string;
  createdAt: number;
  steps: StepResult[];
  currentStep: number;
  error?: string;
}

export type RunEvent =
  | { type: "session"; session: SessionState }
  | { type: "step"; step: StepResult }
  | { type: "log"; level: "info" | "warn" | "error"; message: string; at: number }
  | { type: "frame"; image: string; at: number }
  // Interactive control: the run is waiting for the operator. `candidates`
  // are the elements read from the current screen so a target can be chosen.
  | { type: "paused"; step: StepResult; candidates: UiElement[]; reason: string }
  | { type: "resumed" }
  | { type: "done"; session: SessionState }
  | { type: "error"; message: string };

export interface ServerDefaults {
  uipath: {
    baseUrl: string;
    orgName: string;
    tenantName: string;
    scope: string;
    llmModel: string;
    hasClientCredentials: boolean;
    hasBearer: boolean;
  };
  farm: {
    provider: FarmProvider;
    sauceRegion: string;
    hasBrowserstack: boolean;
    hasSauce: boolean;
  };
}

export interface LogLine {
  level: "info" | "warn" | "error";
  message: string;
  at: number;
}

// Live, rolled-up status a run reports to the workspace nav.
export interface RunStatus {
  state: "connecting" | "running" | "done" | "error";
  passed: number;
  attention: number;
  total: number;
}

export interface FarmApp {
  appId: string;
  name: string;
  customId?: string;
  uploadedAt?: string;
  platform?: Platform;
}

export interface DeviceCatalog {
  Android: Record<string, string[]>;
  iOS: Record<string, string[]>;
}

export interface SelectorCatalogEntry {
  step: number;
  description: string;
  action: string;
  status: string;
  selector?: string;
  strategy?: string;
  reason?: string;
  capturedText?: string;
  hasScreenshot?: boolean;
  hasElementShot?: boolean;
}
