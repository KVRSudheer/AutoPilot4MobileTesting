// Mirror of server/src/types.ts (kept in sync manually across workspaces).

export type Platform = "Android" | "iOS";
export type FarmProvider = "browserstack" | "saucelabs" | "custom";
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
}

export interface AndroidBuild {
  buildId: string; // apk/aab reference: bs://… or storage:…
  appPackage?: string;
  appActivity?: string;
}
export interface IosBuild {
  buildId: string; // ipa reference: bs://… or storage:…
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
  title?: string;
}

export type SessionMode = "live" | "simulated";
export type StepStatus = "pending" | "running" | "passed" | "needs-attention" | "failed";
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

export interface SessionState {
  id: string;
  title: string;
  mobile?: MobileConnectionInfo;
  mode: SessionMode;
  status: "created" | "connecting" | "running" | "completed" | "error";
  platform: Platform;
  target: ConnectionTarget;
  provider: FarmProvider;
  deviceLabel: string;
  appLabel: string;
  llmModel: string;
  llmLive: boolean;
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
