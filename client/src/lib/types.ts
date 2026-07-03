// Mirror of server/src/types.ts (kept in sync manually across workspaces).

export type Platform = "Desktop";
export type BrowserName = "edge" | "chrome";
export type FarmProvider = "local";
export type UiPathAuthMode = "clientCredentials" | "bearer";
export type ConnectionTarget = "browser";

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
}

export interface DeviceConfig {
  platform: Platform;
  deviceName: string;
  osVersion: string;
  connectionTarget?: ConnectionTarget;
  browser?: BrowserName;
  headless?: boolean;
  viewportWidth?: number;
  viewportHeight?: number;
}

export interface AppConfig {
  appName?: string;
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

export type SessionMode = "live";
export type StepStatus = "pending" | "running" | "passed" | "needs-attention" | "failed";
export type ActionType =
  | "click"
  | "tap"
  | "setText"
  | "swipe"
  | "pressKey"
  | "getText"
  | "assertExists"
  | "closeBrowser";
export type SwipeDirection = "up" | "down" | "left" | "right";

export interface UiElement {
  index: number;
  platform: Platform;
  kind?: "web";
  className: string;
  text?: string;
  name?: string;
  value?: string;
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
  pageTitle?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface UiPathAnchorSelector {
  label: string;
  selector: string;
  targetSelector?: string;
  targetLocator?: string;
  relation: "left" | "right" | "above" | "below" | "near";
  distance: number;
  uiPathValidated?: boolean;
  uiPathValidationReason?: string;
}

export interface WebSelector {
  platform: Platform;
  kind: "web";
  mbl: string;
  strategy: "css" | "xpath";
  locator: string;
  anchors?: UiPathAnchorSelector[];
  uiPathValidated?: boolean;
  uiPathValidationReason?: string;
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

export interface RuntimePopupAction {
  label: string;
  tag: string;
  pageTitle?: string;
}

export interface StepResult {
  index: number;
  description: string;
  status: StepStatus;
  action?: PlannedAction;
  selector?: WebSelector;
  element?: UiElement;
  reason?: string;
  message?: string;
  capturedText?: string;
  outcome?: ActionOutcome;
  beforeScreenshot?: string;
  afterScreenshot?: string;
  elementShot?: string;
  popupActionsBefore?: RuntimePopupAction[];
  popupActionsAfter?: RuntimePopupAction[];
  startedAt?: number;
  finishedAt?: number;
}

export interface BrowserConnectionInfo {
  browserName: BrowserName;
  provider: FarmProvider;
  startUrl?: string;
  viewportWidth: number;
  viewportHeight: number;
  headless?: boolean;
  remoteUrl?: string;
}

export interface SessionState {
  id: string;
  title: string;
  browser?: BrowserConnectionInfo;
  mode: SessionMode;
  status: "created" | "connecting" | "running" | "completed" | "error";
  platform: Platform;
  target: ConnectionTarget;
  provider: FarmProvider;
  deviceLabel: string;
  browserLabel?: string;
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
  browser: {
    provider: FarmProvider;
    defaultBrowser: BrowserName;
    headless: boolean;
    viewportWidth: number;
    viewportHeight: number;
  };
}

export interface LogLine {
  level: "info" | "warn" | "error";
  message: string;
  at: number;
}

export interface RunStatus {
  state: "connecting" | "running" | "done" | "error";
  passed: number;
  attention: number;
  total: number;
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
