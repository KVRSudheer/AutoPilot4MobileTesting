import { apiFetch } from "./bridge";
import type {
  DeviceCatalog,
  FarmApp,
  FarmCredentials,
  SelectorCatalogEntry,
  ServerDefaults,
  SessionRequest,
  SessionState,
  UiPathAuthConfig,
} from "./types";

// Backend origin. Empty = same origin (local dev proxy / co-hosted build).
// When the client is deployed as a UiPath Coded App on uipath.host, the
// Express API runs on its own host - set VITE_API_BASE to that URL at build
// time (e.g. VITE_API_BASE=https://autopilot-api.example.com).
const API_BASE = ((import.meta.env.VITE_API_BASE as string | undefined) ?? "").replace(
  /\/+$/,
  "",
);

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

export interface UiPathValidation {
  ok: boolean;
  llm?: boolean;
  model?: string;
  basePath?: string;
  error?: string;
}

export async function listUiPathModels(uipath: UiPathAuthConfig): Promise<string[]> {
  const res = await apiFetch(apiUrl("/api/uipath/models"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(uipath),
  });
  const data = (await res.json().catch(() => ({ models: [] }))) as { models?: string[] };
  return Array.isArray(data.models) ? data.models : [];
}

export async function validateUiPath(uipath: UiPathAuthConfig): Promise<UiPathValidation> {
  try {
    const res = await apiFetch(apiUrl("/api/uipath/validate"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(uipath),
    });
    return (await res.json().catch(() => ({ ok: false, error: "Validation request failed." }))) as UiPathValidation;
  } catch (error) {
    // Transport-level failure (e.g. bridge extension / local engine missing):
    // show the real reason instead of a generic validation error.
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Validation request failed.",
    };
  }
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((body as { error?: string }).error || `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

export async function getDefaults(): Promise<ServerDefaults> {
  return json<ServerDefaults>(await apiFetch(apiUrl("/api/defaults")));
}

export async function createSession(request: SessionRequest): Promise<SessionState> {
  const res = await apiFetch(apiUrl("/api/sessions"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  const data = await json<{ session: SessionState }>(res);
  return data.session;
}

export interface BatchInfo {
  batchId: string;
  runIds: string[];
  sessions: SessionState[];
  maxParallel: number;
}

export async function createBatch(runs: SessionRequest[]): Promise<BatchInfo> {
  const res = await apiFetch(apiUrl("/api/batches"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ runs }),
  });
  return json<BatchInfo>(res);
}

export async function getCatalog(
  sessionId: string,
): Promise<{ catalog: SelectorCatalogEntry[]; actionLog: unknown }> {
  return json(await apiFetch(apiUrl(`/api/sessions/${sessionId}/catalog`)));
}

export async function listFarmDevices(creds: FarmCredentials): Promise<DeviceCatalog> {
  const res = await apiFetch(apiUrl("/api/farm/devices"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(creds),
  });
  const data = await json<{ devices: DeviceCatalog }>(res);
  return data.devices;
}

export async function listFarmApps(creds: FarmCredentials): Promise<FarmApp[]> {
  const res = await apiFetch(apiUrl("/api/farm/apps"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(creds),
  });
  const data = await json<{ apps: FarmApp[] }>(res);
  return data.apps;
}

export async function uploadFarmApp(
  creds: FarmCredentials,
  source: { file?: File; url?: string },
): Promise<FarmApp> {
  const form = new FormData();
  form.append("provider", creds.provider);
  if (creds.username) form.append("username", creds.username);
  if (creds.accessKey) form.append("accessKey", creds.accessKey);
  if (creds.region) form.append("region", creds.region);
  if (source.file) form.append("file", source.file);
  if (source.url) form.append("url", source.url);

  const res = await apiFetch(apiUrl("/api/farm/upload"), { method: "POST", body: form });
  const data = await json<{ app: FarmApp }>(res);
  return data.app;
}

export type ControlAction =
  | "stop"
  | "pause"
  | "resume"
  | "retry"
  | "skip"
  | "pauseOnFailure";

/** Interactive run control. `targetIndex` retargets a paused step's retry. */
export async function controlRun(
  sessionId: string,
  action: ControlAction,
  opts: { targetIndex?: number; value?: boolean } = {},
): Promise<void> {
  const res = await apiFetch(apiUrl(`/api/sessions/${sessionId}/control`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...opts }),
  });
  if (!res.ok) throw new Error(`Control "${action}" failed (${res.status}).`);
}

export function workflowXamlUrl(sessionId: string): string {
  return apiUrl(`/api/sessions/${sessionId}/workflow.xaml`);
}

export type CodedFlavor = "hybrid" | "mdm" | "http";

/**
 * C# coded workflow.
 *  - "hybrid": MDM opens the device (so it shows in the MDM view), then every
 *              action is a raw Appium HTTP call against that same session.
 *  - "mdm"   : MDM connection plus UiPath mobile activities for each action.
 *  - "http"  : standalone - creates its own session, which MDM cannot see.
 */
export function workflowCodedUrl(sessionId: string, flavor: CodedFlavor = "hybrid"): string {
  return apiUrl(`/api/sessions/${sessionId}/workflow.cs?flavor=${flavor}`);
}

// Full-screen interaction screenshot for a step (0-based index) as an image URL.
export function stepScreenshotUrl(sessionId: string, stepIndex: number): string {
  return apiUrl(`/api/sessions/${sessionId}/steps/${stepIndex}/screenshot`);
}

// Element-cropped "field" screenshot for a step (0-based index).
export function stepElementShotUrl(sessionId: string, stepIndex: number): string {
  return apiUrl(`/api/sessions/${sessionId}/steps/${stepIndex}/elementshot`);
}

export function actionLogUrl(sessionId: string): string {
  return apiUrl(`/api/sessions/${sessionId}/actionlog.json`);
}
