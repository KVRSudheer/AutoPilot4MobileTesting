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

export interface UiPathValidation {
  ok: boolean;
  llm?: boolean;
  model?: string;
  basePath?: string;
  error?: string;
}

export async function listUiPathModels(uipath: UiPathAuthConfig): Promise<string[]> {
  const res = await fetch("/api/uipath/models", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(uipath),
  });
  const data = (await res.json().catch(() => ({ models: [] }))) as { models?: string[] };
  return Array.isArray(data.models) ? data.models : [];
}

export async function validateUiPath(uipath: UiPathAuthConfig): Promise<UiPathValidation> {
  const res = await fetch("/api/uipath/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(uipath),
  });
  return (await res.json().catch(() => ({ ok: false, error: "Validation request failed." }))) as UiPathValidation;
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((body as { error?: string }).error || `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

export async function getDefaults(): Promise<ServerDefaults> {
  return json<ServerDefaults>(await fetch("/api/defaults"));
}

export async function createSession(request: SessionRequest): Promise<SessionState> {
  const res = await fetch("/api/sessions", {
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
  const res = await fetch("/api/batches", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ runs }),
  });
  return json<BatchInfo>(res);
}

export async function getCatalog(
  sessionId: string,
): Promise<{ catalog: SelectorCatalogEntry[]; actionLog: unknown }> {
  return json(await fetch(`/api/sessions/${sessionId}/catalog`));
}

export async function listFarmDevices(creds: FarmCredentials): Promise<DeviceCatalog> {
  const res = await fetch("/api/farm/devices", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(creds),
  });
  const data = await json<{ devices: DeviceCatalog }>(res);
  return data.devices;
}

export async function listFarmApps(creds: FarmCredentials): Promise<FarmApp[]> {
  const res = await fetch("/api/farm/apps", {
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

  const res = await fetch("/api/farm/upload", { method: "POST", body: form });
  const data = await json<{ app: FarmApp }>(res);
  return data.app;
}

export function workflowXamlUrl(sessionId: string): string {
  return `/api/sessions/${sessionId}/workflow.xaml`;
}

// Full-screen interaction screenshot for a step (0-based index) as an image URL.
export function stepScreenshotUrl(sessionId: string, stepIndex: number): string {
  return `/api/sessions/${sessionId}/steps/${stepIndex}/screenshot`;
}

// Element-cropped "field" screenshot for a step (0-based index).
export function stepElementShotUrl(sessionId: string, stepIndex: number): string {
  return `/api/sessions/${sessionId}/steps/${stepIndex}/elementshot`;
}

export function actionLogUrl(sessionId: string): string {
  return `/api/sessions/${sessionId}/actionlog.json`;
}
