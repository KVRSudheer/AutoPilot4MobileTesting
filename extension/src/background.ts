/// <reference types="chrome" />
/**
 * Self-contained Autopilot engine inside the extension service worker.
 *
 * The web app (UiPath Coded App) sends the same {path, method, body} requests
 * it used to send to the Express server; this worker serves them directly -
 * planning via the UiPath LLM Gateway, driving cloud devices over the raw
 * WebDriver protocol, and generating the .xaml / selector catalog. Nothing
 * runs on the operator's machine besides the browser.
 */
import { env } from "./engine/config/env.js";
import type {
  FarmCredentials,
  FarmProvider,
  Platform,
  RunEvent,
  SessionRequest,
  SessionState,
  UiPathAuthMode,
} from "./engine/types.js";
import {
  getBatch,
  getSession,
  newBatchId,
  newSessionId,
  saveBatch,
  saveSession,
  setDriver,
} from "./engine/store.js";
import { isUiPathConfigured, resolveUiPathToken } from "./engine/uipath/auth.js";
import { chatComplete, listWorkingModels } from "./engine/uipath/llmGateway.js";
import { createSession } from "./engine/automation/session.js";
import { runAutomation } from "./engine/automation/orchestrator.js";
import { getRunControl } from "./engine/automation/runControl.js";
import { buildXaml } from "./engine/workflow/xamlBuilder.js";
import { buildCodedWorkflow } from "./engine/workflow/csharpBuilder.js";
import { buildMdmCodedWorkflow } from "./engine/workflow/mdmBuilder.js";
import { buildActionLog, buildSelectorCatalog } from "./engine/workflow/actionLog.js";
import { listFarmApps, uploadFarmApp } from "./engine/farms/appStorage.js";
import { listFarmDevices } from "./engine/farms/devices.js";
import { parseStepScriptWithData, regenerateRecordedText } from "./engine/workflow/stepScript.js";

// --- Tiny event emitter (no node:events in a service worker) ----------------
class Emitter<T> {
  private listeners = new Set<(v: T) => void>();
  on(cb: (v: T) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
  emit(v: T): void {
    for (const cb of [...this.listeners]) cb(v);
  }
}

// --- Per-session event runner (buffered) ------------------------------------
class SessionRunner {
  private events: RunEvent[] = [];
  private emitter = new Emitter<RunEvent>();
  private started = false;
  batchManaged = false;
  constructor(readonly request: SessionRequest) {}
  emit(event: RunEvent): void {
    if (event.type !== "frame") this.events.push(event);
    this.emitter.emit(event);
    // Persist terminal state so downloads survive a service-worker restart.
    if (event.type === "done" || event.type === "error") {
      const state = getSession(sessionIdOf(this));
      if (state) void persistSession(state);
    }
  }
  subscribe(cb: (event: RunEvent) => void): () => void {
    for (const e of this.events) cb(e);
    return this.emitter.on(cb);
  }
  begin(run: (emit: (e: RunEvent) => void) => Promise<void>): void {
    if (this.started) return;
    this.started = true;
    run((e) => this.emit(e)).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      this.emit({ type: "error", message });
    });
  }
}

const runners = new Map<string, SessionRunner>();
function sessionIdOf(runner: SessionRunner): string {
  for (const [id, r] of runners) if (r === runner) return id;
  return "";
}

// --- Batch runner (concurrency-capped, runs once) ----------------------------
class BatchRunner {
  private started = false;
  private settled = new Set<string>();
  private emitter = new Emitter<void>();
  done = false;
  constructor(readonly runIds: string[]) {}
  onDone(cb: () => void): () => void {
    if (this.done) {
      cb();
      return () => undefined;
    }
    return this.emitter.on(cb);
  }
  private markSettled(runId: string): void {
    if (this.settled.has(runId)) return;
    this.settled.add(runId);
    if (this.settled.size >= this.runIds.length && !this.done) {
      this.done = true;
      this.emitter.emit();
    }
  }
  begin(
    cap: number,
    run: (state: SessionState, request: SessionRequest, emit: (e: RunEvent) => void) => Promise<void>,
  ): void {
    if (this.started) return;
    this.started = true;
    if (this.runIds.length === 0) {
      this.done = true;
      this.emitter.emit();
      return;
    }
    let next = 0;
    let active = 0;
    const launch = () => {
      while (active < cap && next < this.runIds.length) {
        const runId = this.runIds[next++];
        const runner = runners.get(runId);
        const state = getSession(runId);
        if (!runner || !state) {
          this.markSettled(runId);
          continue;
        }
        active += 1;
        const off = runner.subscribe((event) => {
          if (event.type === "done" || event.type === "error") {
            off();
            active -= 1;
            this.markSettled(runId);
            launch();
          }
        });
        runner.begin(async (emit) => {
          await run(state, runner.request, emit);
        });
      }
    };
    launch();
  }
}

const batchRunners = new Map<string, BatchRunner>();

// --- Persistence (survive service-worker restarts for finished runs) --------
const SESSION_KEY_PREFIX = "mta_s_";
// How many finished runs to keep. Each carries per-step screenshots (a real
// device run is several MB), and without pruning they accumulate until writes
// start failing - at which point a session silently isn't saved and, once the
// service worker restarts, its downloads report "Session not found".
const MAX_PERSISTED_SESSIONS = 10;

/** The same session minus the heavy base64 images. */
function withoutScreenshots(state: SessionState): SessionState {
  return {
    ...state,
    steps: state.steps.map((s) => ({
      ...s,
      beforeScreenshot: undefined,
      afterScreenshot: undefined,
      elementShot: undefined,
    })),
  };
}

async function prunePersistedSessions(keepId: string): Promise<void> {
  try {
    const all = await chrome.storage.local.get(null);
    const keys = Object.keys(all).filter(
      (k) => k.startsWith(SESSION_KEY_PREFIX) && k !== `${SESSION_KEY_PREFIX}${keepId}`,
    );
    if (keys.length < MAX_PERSISTED_SESSIONS) return;
    // Oldest first, so the newest MAX_PERSISTED_SESSIONS survive.
    const ordered = keys.sort(
      (a, b) =>
        ((all[a] as SessionState)?.createdAt ?? 0) - ((all[b] as SessionState)?.createdAt ?? 0),
    );
    const drop = ordered.slice(0, ordered.length - (MAX_PERSISTED_SESSIONS - 1));
    if (drop.length) await chrome.storage.local.remove(drop);
  } catch {
    /* pruning is best-effort */
  }
}

/**
 * Persist a finished run so its .xaml / .cs / catalog stay downloadable after
 * the service worker is recycled. Falls back to a screenshot-free copy when the
 * full state won't fit, because losing the images is far better than losing the
 * session (which is what produced "Session not found").
 */
async function persistSession(state: SessionState): Promise<void> {
  const key = `${SESSION_KEY_PREFIX}${state.id}`;
  await prunePersistedSessions(state.id);
  try {
    await chrome.storage.local.set({ [key]: state });
    return;
  } catch (error) {
    console.warn(
      "[autopilot] full session did not fit in storage, retrying without screenshots:",
      error,
    );
  }
  try {
    await chrome.storage.local.set({ [key]: withoutScreenshots(state) });
    console.warn("[autopilot] session persisted without screenshots (downloads still work).");
  } catch (error) {
    console.error(
      "[autopilot] could not persist the session - its downloads will only work while this service worker stays alive:",
      error,
    );
  }
}

async function loadSession(id: string): Promise<SessionState | undefined> {
  const inMemory = getSession(id);
  if (inMemory) return inMemory;
  try {
    const data = await chrome.storage.local.get(`mta_s_${id}`);
    const state = data[`mta_s_${id}`] as SessionState | undefined;
    if (state) saveSession(state);
    return state;
  } catch {
    return undefined;
  }
}

// --- Helpers ported from routes/api.ts ---------------------------------------
function resolveUipathConfig(u: Partial<SessionRequest["uipath"]> = {}): SessionRequest["uipath"] {
  return {
    mode: (u.mode || "clientCredentials") as UiPathAuthMode,
    baseUrl: u.baseUrl || env.uipath.baseUrl,
    orgName: u.orgName || env.uipath.orgName,
    tenantName: u.tenantName || env.uipath.tenantName,
    clientId: u.clientId || env.uipath.clientId,
    clientSecret: u.clientSecret || env.uipath.clientSecret,
    scope: u.scope || env.uipath.scope,
    bearerToken: u.bearerToken || env.uipath.bearerToken,
    llmModel: u.llmModel || env.uipath.llmModel,
  };
}

function resolveFarmCreds(input: Partial<FarmCredentials> | undefined): FarmCredentials {
  const provider = (input?.provider || env.farm.provider) as FarmProvider;
  return {
    provider,
    region: input?.region || env.farm.sauceRegion,
    hubUrl: input?.hubUrl,
    username:
      input?.username ||
      (provider === "browserstack" ? env.farm.browserstackUser : env.farm.sauceUser),
    accessKey:
      input?.accessKey ||
      (provider === "browserstack" ? env.farm.browserstackKey : env.farm.sauceKey),
  };
}

function mergeWithEnvDefaults(req: SessionRequest): SessionRequest {
  return { ...req, farm: resolveFarmCreds(req.farm), uipath: resolveUipathConfig(req.uipath) };
}

// Replay: copy the recorded action + selector from a finished session so the
// new run can execute them directly instead of re-planning.
//
// Any {{token}} data is regenerated rather than reused: `state.generatedData`
// already holds fresh values (buildInitialState re-parsed the same script), so
// the recorded text is re-pointed at those instead of resubmitting the values
// the first run used.
function seedFromRecording(state: SessionState, source: SessionState): SessionState {
  const oldGen = source.generatedData ?? [];
  const newGen = state.generatedData ?? [];
  const refresh = (text: string | undefined, template: string | undefined) =>
    text === undefined ? undefined : regenerateRecordedText(text, template, oldGen, newGen);

  state.steps = source.steps
    .filter((s) => s.action)
    .map((s, i) => ({
      index: i,
      description: refresh(s.description, s.descriptionTemplate) ?? s.description,
      // Carried through so exports from a replay keep per-step token scoping.
      descriptionTemplate: s.descriptionTemplate,
      status: "pending" as const,
      action: s.action
        ? { ...s.action, text: refresh(s.action.text, s.descriptionTemplate) }
        : s.action,
      selector: s.selector,
      element: s.element,
      condition: s.condition,
      conditionGroup: s.conditionGroup,
      optional: s.optional,
    }));
  state.title = `${source.title} (replay)`;
  return state;
}

function buildInitialState(id: string, req: SessionRequest): SessionState {
  // Expand {{tokens}} once, keeping the token->value map for the exporters.
  const parsed = parseStepScriptWithData(req.testSteps ?? []);
  const platform = (req.device?.platform || "Android") as Platform;
  const target = req.device?.connectionTarget ?? "app";
  const provider = req.farm.provider;
  const deviceLabel = `${req.device?.deviceName || "Sample Device"} · ${platform} ${req.device?.osVersion || ""}`.trim();
  const nativeBuildId = platform === "Android" ? req.app?.android?.buildId : req.app?.ios?.buildId;
  const appLabel =
    target === "browser"
      ? req.app?.startUrl || "ACME Shopping (sample web)"
      : req.app?.appName || nativeBuildId || "ACME Shopping (sample)";
  const title = (req.title || "").trim() || appLabel;

  const mobile = {
    platformName: platform,
    platformVersion: req.device?.osVersion || "",
    deviceName: req.device?.deviceName || "",
    automationName: platform === "Android" ? "UiAutomator2" : "XCUITest",
    provider,
    app: target === "browser" ? undefined : nativeBuildId || undefined,
    startUrl: target === "browser" ? req.app?.startUrl || undefined : undefined,
    browserName:
      target === "browser"
        ? platform === "iOS"
          ? "safari"
          : req.device?.browser || "chrome"
        : undefined,
  };

  return {
    id,
    title,
    mobile,
    mode: "simulated",
    status: "created",
    platform,
    target,
    provider,
    deviceLabel,
    appLabel,
    llmModel: req.uipath.llmModel || env.uipath.llmModel,
    llmLive: false,
    gpsCoordinates: req.device?.gpsCoordinates?.trim() || undefined,
    createdAt: Date.now(),
    currentStep: 0,
    generatedData: parsed.generated.length ? parsed.generated : undefined,
    // Conditional syntax (`If … / End if`, `Optional:`) is parsed here so the
    // orchestrator can gate steps without re-parsing.
    steps: parsed.steps.map((parsed, index) => ({
      index,
      description: parsed.description,
      descriptionTemplate: parsed.template,
      status: "pending" as const,
      condition: parsed.condition,
      conditionGroup: parsed.conditionGroup,
      optional: parsed.optional,
    })),
  };
}

function slug(s: string): string {
  return (s || "").replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
}
function fileStem(state: SessionState): string {
  const title = slug(state.title) || "MobileTest";
  const device = slug((state.deviceLabel || "").split("·")[0]);
  return [title, device, state.id.slice(-6)].filter(Boolean).join("_");
}

function sameHost(a: string, b: string): boolean {
  try {
    return new URL(a).host === new URL(b).host;
  } catch {
    return false;
  }
}

// --- Run execution (ported from routes/api.ts) --------------------------------
// "lat,long" -> numbers. Rejects anything out of range so a typo can't send
// the device to the middle of the ocean silently.
function parseCoordinates(value?: string): { latitude: number; longitude: number } | null {
  if (!value) return null;
  const m = value.split(",").map((p) => Number(p.trim()));
  if (m.length !== 2 || !Number.isFinite(m[0]) || !Number.isFinite(m[1])) return null;
  if (Math.abs(m[0]) > 90 || Math.abs(m[1]) > 180) return null;
  return { latitude: m[0], longitude: m[1] };
}

async function executeRun(
  state: SessionState,
  request: SessionRequest,
  emit: (e: RunEvent) => void,
): Promise<void> {
  state.status = "connecting";
  saveSession(state);
  emit({ type: "session", session: state });
  emit({ type: "log", level: "info", message: "Provisioning device session…", at: Date.now() });

  let auth = null as Awaited<ReturnType<typeof resolveUiPathToken>> | null;
  if (isUiPathConfigured(request.uipath)) {
    try {
      auth = await resolveUiPathToken(request.uipath);
      emit({ type: "log", level: "info", message: "UiPath authenticated; LLM Gateway will plan actions.", at: Date.now() });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      emit({ type: "log", level: "warn", message: `${message} Falling back to the built-in heuristic planner.`, at: Date.now() });
    }
  } else {
    emit({ type: "log", level: "info", message: "No UiPath credentials provided; using the built-in heuristic planner.", at: Date.now() });
  }

  const { driver, mode, connection } = await createSession({
    creds: request.farm,
    device: request.device,
    app: request.app,
  });
  state.mode = mode;
  // Recorded (without credentials) so the generated code can reproduce the
  // exact session this run used.
  if (connection) state.connection = connection;
  saveSession(state);
  // Tell the UI immediately - until this lands it can't know whether the run
  // is live or simulated, and provisioning can take minutes.
  emit({ type: "session", session: state });
  emit({
    type: "log",
    level: "info",
    message:
      mode === "live"
        ? `Live session started on ${state.provider} (${state.deviceLabel}).`
        : "No device-farm credentials - running the bundled simulated session.",
    at: Date.now(),
  });

  // GPS: what "use my current location" will read. Applied after the session
  // opens (a driver command, not a capability) and read back so the log proves
  // whether the device accepted it.
  const coords = parseCoordinates(request.device?.gpsCoordinates);
  if (mode === "live" && coords) {
    try {
      const reported = await driver.setGeoLocation(coords.latitude, coords.longitude);
      emit({
        type: "log",
        level: reported ? "info" : "warn",
        message: reported
          ? `📍 Device GPS set to ${coords.latitude}, ${coords.longitude} - device reports ${reported.latitude}, ${reported.longitude}.`
          : `📍 Device GPS set to ${coords.latitude}, ${coords.longitude} - accepted, but this device can't report its position back, so confirm from the app itself (e.g. the address "use my current location" resolves to).`,
        at: Date.now(),
      });
    } catch (error) {
      emit({
        type: "log",
        level: "warn",
        message: `Could not set the device GPS (${error instanceof Error ? error.message : String(error)}). "Use my current location" will use the device's real position.`,
        at: Date.now(),
      });
    }
  }

  if (mode === "live" && state.target === "browser") {
    const url = request.app.startUrl?.trim();
    if (!url) {
      emit({ type: "log", level: "warn", message: "No start URL provided - the browser will stay on its home page.", at: Date.now() });
    } else {
      emit({
        type: "log",
        level: "info",
        message: `Opening ${url} in ${state.platform === "iOS" ? "Safari" : "the device browser"}…`,
        at: Date.now(),
      });
      let landed = "";
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        try {
          await driver.navigateTo(url);
          landed = await driver.currentUrl();
          if (sameHost(landed, url)) break;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          emit({ type: "log", level: "warn", message: `Navigation attempt ${attempt} failed: ${message}`, at: Date.now() });
        }
      }
      if (sameHost(landed, url)) {
        emit({ type: "log", level: "info", message: `Browser loaded ${landed}.`, at: Date.now() });
      } else if (landed) {
        emit({ type: "log", level: "warn", message: `Browser ended on ${landed} (expected ${url}) - continuing with what's on screen.`, at: Date.now() });
      } else {
        emit({ type: "log", level: "warn", message: `Could not confirm ${url} loaded - continuing; the agent will read whatever is on screen.`, at: Date.now() });
      }
    }
  }

  await runAutomation({
    session: state,
    driver,
    auth,
    llmModel: request.uipath.llmModel || env.uipath.llmModel,
    emit,
    replay: Boolean(request.replayOf),
  });
}

// --- Router -------------------------------------------------------------------
interface RouteResult {
  status: number;
  contentType?: string;
  contentDisposition?: string;
  body: string;
  isBase64?: boolean;
}

const json = (status: number, value: unknown): RouteResult => ({
  status,
  contentType: "application/json",
  body: JSON.stringify(value),
});

function imageResult(stored?: string): RouteResult {
  if (!stored) return json(404, { error: "No screenshot for this step." });
  // Stored as a data: URL - image/png from real devices, image/svg+xml from
  // the simulated device - or as raw base64. Match any media type (not just
  // \w+, which misses "svg+xml") and echo it back as the content type.
  const m = stored.match(/^data:([^;,]+);base64,/);
  return {
    status: 200,
    contentType: m ? m[1] : "image/png",
    isBase64: true,
    body: m ? stored.slice(m[0].length) : stored,
  };
}

async function route(req: {
  method: string;
  path: string;
  body?: string;
  file?: { bytes: Uint8Array; name: string };
  fields?: Record<string, string>;
}): Promise<RouteResult> {
  const path = req.path.split("?")[0].replace(/\/+$/, "");
  const method = (req.method || "GET").toUpperCase();
  const parse = <T>(): T => (req.body ? (JSON.parse(req.body) as T) : ({} as T));

  try {
    if (method === "GET" && path === "/api/health") return json(200, { ok: true });

    if (method === "GET" && path === "/api/defaults") {
      return json(200, {
        uipath: {
          baseUrl: env.uipath.baseUrl,
          orgName: env.uipath.orgName,
          tenantName: env.uipath.tenantName,
          scope: env.uipath.scope,
          llmModel: env.uipath.llmModel,
          hasClientCredentials: false,
          hasBearer: false,
        },
        farm: {
          provider: env.farm.provider,
          sauceRegion: env.farm.sauceRegion,
          hasBrowserstack: false,
          hasSauce: false,
        },
      });
    }

    if (method === "POST" && path === "/api/uipath/validate") {
      const u = resolveUipathConfig(parse<Partial<SessionRequest["uipath"]>>());
      if (!isUiPathConfigured(u)) {
        return json(400, {
          ok: false,
          error:
            u.mode === "bearer"
              ? "Provide UiPath org, tenant and a bearer/PAT token."
              : "Provide UiPath org, tenant, client id and client secret.",
        });
      }
      try {
        const auth = await resolveUiPathToken(u);
        try {
          const r = await chatComplete(
            auth,
            [{ role: "user", content: "Reply with the single word: ok" }],
            { model: u.llmModel, temperature: 0 },
          );
          return json(200, { ok: true, llm: true, model: r.model, basePath: r.basePathUsed });
        } catch (error) {
          return json(200, {
            ok: true,
            llm: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      } catch (error) {
        return json(200, { ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    }

    if (method === "POST" && path === "/api/uipath/models") {
      const u = resolveUipathConfig(parse<Partial<SessionRequest["uipath"]>>());
      if (!isUiPathConfigured(u)) return json(400, { error: "Provide UiPath credentials first." });
      const auth = await resolveUiPathToken(u);
      const models = await listWorkingModels(auth);
      return json(200, { models });
    }

    if (method === "POST" && path === "/api/farm/devices") {
      const creds = resolveFarmCreds(parse<Partial<FarmCredentials>>());
      const devices = await listFarmDevices(creds);
      return json(200, { devices });
    }

    if (method === "POST" && path === "/api/farm/apps") {
      const creds = resolveFarmCreds(parse<Partial<FarmCredentials>>());
      if (!creds.username || !creds.accessKey) {
        return json(400, { error: "Provide device-farm username and access key." });
      }
      const apps = await listFarmApps(creds);
      return json(200, { apps });
    }

    if (method === "POST" && path === "/api/farm/upload") {
      const fields = req.fields ?? {};
      const creds = resolveFarmCreds(fields as Partial<FarmCredentials>);
      if (!creds.username || !creds.accessKey) {
        return json(400, { error: "Provide device-farm username and access key." });
      }
      if (!req.file && !fields.url) {
        return json(400, { error: "Attach a file or provide a public URL." });
      }
      const app = await uploadFarmApp(creds, {
        file: req.file ? { buffer: req.file.bytes, filename: req.file.name } : undefined,
        url: fields.url,
        customId: fields.customId,
      });
      return json(200, { app });
    }

    if (method === "POST" && path === "/api/sessions") {
      const body = parse<SessionRequest>();
      if (!body || !Array.isArray(body.testSteps) || body.testSteps.length === 0) {
        return json(400, { error: "At least one test step is required." });
      }
      const merged = mergeWithEnvDefaults(body);
      const id = newSessionId();
      let state = buildInitialState(id, merged);
      if (merged.replayOf) {
        const source = await loadSession(merged.replayOf);
        if (!source) return json(404, { error: "The run to replay was not found." });
        state = seedFromRecording(state, source);
      }
      saveSession(state);
      runners.set(id, new SessionRunner(merged));
      return json(201, { session: state });
    }

    if (method === "POST" && path === "/api/batches") {
      const body = parse<{ runs?: SessionRequest[] }>();
      const runs = Array.isArray(body?.runs) ? body.runs : [];
      if (runs.length === 0) return json(400, { error: "A batch needs at least one run." });

      const runIds: string[] = [];
      const sessions: SessionState[] = [];
      for (const run of runs) {
        if (!Array.isArray(run.testSteps) || run.testSteps.filter((s) => s.trim()).length === 0) continue;
        const merged = mergeWithEnvDefaults(run);
        const id = newSessionId();
        const state = buildInitialState(id, merged);
        saveSession(state);
        const runner = new SessionRunner(merged);
        runner.batchManaged = true;
        runners.set(id, runner);
        runIds.push(id);
        sessions.push(state);
      }
      if (runIds.length === 0) {
        return json(400, { error: "No valid runs (each run needs at least one step)." });
      }
      const batchId = newBatchId();
      saveBatch({ id: batchId, runIds, createdAt: Date.now() });
      batchRunners.set(batchId, new BatchRunner(runIds));
      const effectiveCap = env.farm.maxParallel > 0 ? env.farm.maxParallel : runIds.length;
      return json(201, { batchId, runIds, sessions, maxParallel: effectiveCap });
    }

    let m = path.match(/^\/api\/sessions\/([^/]+)$/);
    if (method === "GET" && m) {
      const state = await loadSession(m[1]);
      if (!state) return json(404, { error: "Session not found." });
      return json(200, { session: state });
    }

    // Interactive run control: stop / pause / resume / retry.
    m = path.match(/^\/api\/sessions\/([^/]+)\/control$/);
    if (method === "POST" && m) {
      const body = parse<{
        action?: "stop" | "pause" | "resume" | "retry" | "skip" | "pauseOnFailure";
        targetIndex?: number;
        value?: boolean;
      }>();
      const control = getRunControl(m[1]);
      switch (body?.action) {
        case "stop":
          control.stop();
          break;
        case "pause":
          control.requestPause();
          break;
        case "resume":
        case "skip":
          control.resume({ kind: "skip" });
          break;
        case "retry":
          control.resume({ kind: "retry", targetIndex: body.targetIndex });
          break;
        case "pauseOnFailure":
          control.pauseOnFailure = Boolean(body.value);
          break;
        default:
          return json(400, { error: "Unknown control action." });
      }
      return json(200, { ok: true, paused: control.paused, pauseOnFailure: control.pauseOnFailure });
    }

    m = path.match(/^\/api\/sessions\/([^/]+)\/catalog$/);
    if (method === "GET" && m) {
      const state = await loadSession(m[1]);
      if (!state) return json(404, { error: "Session not found." });
      return json(200, { catalog: buildSelectorCatalog(state), actionLog: buildActionLog(state) });
    }

    m = path.match(/^\/api\/sessions\/([^/]+)\/steps\/(\d+)\/screenshot$/);
    if (method === "GET" && m) {
      const state = await loadSession(m[1]);
      const step = state?.steps.find((s) => s.index === Number(m![2]));
      return imageResult(step?.afterScreenshot || step?.beforeScreenshot);
    }

    m = path.match(/^\/api\/sessions\/([^/]+)\/steps\/(\d+)\/elementshot$/);
    if (method === "GET" && m) {
      const state = await loadSession(m[1]);
      const step = state?.steps.find((s) => s.index === Number(m![2]));
      return imageResult(step?.elementShot);
    }

    m = path.match(/^\/api\/sessions\/([^/]+)\/workflow\.xaml$/);
    if (method === "GET" && m) {
      const state = await loadSession(m[1]);
      if (!state) return json(404, { error: "Session not found." });
      return {
        status: 200,
        contentType: "application/xml",
        contentDisposition: `attachment; filename="${fileStem(state)}.xaml"`,
        body: buildXaml(state),
      };
    }

    m = path.match(/^\/api\/sessions\/([^/]+)\/workflow\.cs$/);
    if (method === "GET" && m) {
      const state = await loadSession(m[1]);
      if (!state) return json(404, { error: "Session not found." });
      // hybrid (default) = MDM opens the device, raw HTTP drives that session.
      // mdm = UiPath mobile activities throughout. http = standalone session.
      const flavor = /[?&]flavor=(http|mdm|hybrid)\b/.exec(req.path)?.[1] ?? "hybrid";
      const body =
        flavor === "http"
          ? buildCodedWorkflow(state)
          : flavor === "mdm"
            ? buildMdmCodedWorkflow(state)
            : buildCodedWorkflow(state, { attachToMdm: true });
      const suffix = flavor === "http" ? "-appium" : flavor === "mdm" ? "-mdm" : "-mdm-http";
      return {
        status: 200,
        contentType: "text/plain; charset=utf-8",
        contentDisposition: `attachment; filename="${fileStem(state)}${suffix}.cs"`,
        body,
      };
    }

    m = path.match(/^\/api\/sessions\/([^/]+)\/actionlog\.json$/);
    if (method === "GET" && m) {
      const state = await loadSession(m[1]);
      if (!state) return json(404, { error: "Session not found." });
      return {
        status: 200,
        contentType: "application/json",
        contentDisposition: `attachment; filename="${fileStem(state)}.json"`,
        body: JSON.stringify(buildActionLog(state), null, 2),
      };
    }

    return json(404, { error: `No such endpoint: ${method} ${path}` });
  } catch (error) {
    return json(502, { error: error instanceof Error ? error.message : String(error) });
  }
}

// --- Streams (session + batch events over an extension port) ----------------
async function openStream(path: string, send: (event: string, data?: string) => void): Promise<() => void> {
  const cleanPath = path.split("?")[0].replace(/\/+$/, "");

  let m = cleanPath.match(/^\/api\/sessions\/([^/]+)\/events$/);
  if (m) {
    const id = m[1];
    const runner = runners.get(id);
    if (!runner) {
      // Worker restarted: replay the persisted terminal state if we have it.
      const state = await loadSession(id);
      if (state) {
        send("data", JSON.stringify({ type: "session", session: state }));
        if (state.status === "completed" || state.status === "error") {
          send("data", JSON.stringify({ type: "done", session: state }));
        }
        send("end");
        return () => undefined;
      }
      send("error", "Session not found.");
      return () => undefined;
    }
    const state = getSession(id)!;
    const off = runner.subscribe((event) => send("data", JSON.stringify(event)));
    if (!runner.batchManaged) {
      runner.begin(async (emit) => {
        await executeRun(state, runner.request, emit);
      });
    }
    return off;
  }

  m = cleanPath.match(/^\/api\/batches\/([^/]+)\/events$/);
  if (m) {
    const batch = getBatch(m[1]);
    if (!batch) {
      send("error", "Batch not found.");
      return () => undefined;
    }
    const unsubs: Array<() => void> = [];
    for (const runId of batch.runIds) {
      const runner = runners.get(runId);
      if (!runner) continue;
      unsubs.push(runner.subscribe((event) => send("data", JSON.stringify({ runId, event }))));
    }
    const controller = batchRunners.get(batch.id) ?? new BatchRunner(batch.runIds);
    batchRunners.set(batch.id, controller);
    unsubs.push(controller.onDone(() => send("data", JSON.stringify({ batchDone: true }))));
    const cap = env.farm.maxParallel > 0 ? env.farm.maxParallel : batch.runIds.length;
    controller.begin(cap, executeRun);
    return () => unsubs.forEach((u) => u());
  }

  send("error", `No such stream: ${cleanPath}`);
  return () => undefined;
}

// --- Message plumbing (same protocol the proxy version spoke) ----------------
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

interface UploadBuffer {
  req: { path: string; fields?: Record<string, string>; fileField?: string; fileName?: string; fileType?: string; totalChunks: number };
  chunks: Array<string | null>;
  received: number;
}
const uploads = new Map<string, UploadBuffer>();

function toWireResult(r: RouteResult) {
  return {
    ok: true,
    status: r.status,
    contentType: r.contentType ?? "",
    contentDisposition: r.contentDisposition ?? "",
    body: r.body,
    isBase64: r.isBase64 ?? false,
  };
}

async function finishUpload(id: string) {
  const u = uploads.get(id);
  uploads.delete(id);
  if (!u) return { ok: false, error: "Unknown upload." };
  try {
    let file: { bytes: Uint8Array; name: string } | undefined;
    if (u.chunks.length > 0) {
      const parts = u.chunks.map((c) => base64ToBytes(c ?? ""));
      const total = parts.reduce((n, p) => n + p.length, 0);
      const bytes = new Uint8Array(total);
      let offset = 0;
      for (const p of parts) {
        bytes.set(p, offset);
        offset += p.length;
      }
      file = { bytes, name: u.req.fileName || "upload.bin" };
    }
    const result = await route({ method: "POST", path: u.req.path, fields: u.req.fields, file });
    return toWireResult(result);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

chrome.runtime.onMessage.addListener(
  (
    msg: { type?: string; id?: string; seq?: number; data?: string; req?: Record<string, unknown> },
    _sender,
    sendResponse,
  ) => {
    if (msg.type === "fetch" && msg.req) {
      const r = msg.req as { path: string; method?: string; body?: string };
      route({ method: r.method ?? "GET", path: r.path, body: r.body }).then(
        (result) => sendResponse(toWireResult(result)),
        (error) => sendResponse({ ok: false, error: String(error?.message || error) }),
      );
      return true;
    }

    if (msg.type === "upload-begin" && msg.id && msg.req) {
      const req = msg.req as UploadBuffer["req"];
      uploads.set(msg.id, { req, chunks: new Array(req.totalChunks).fill(null), received: 0 });
      if (req.totalChunks === 0) {
        void finishUpload(msg.id).then((result) => sendResponse({ final: true, result }));
        return true;
      }
      sendResponse({ final: false });
      return false;
    }

    if (msg.type === "upload-chunk" && msg.id) {
      const u = uploads.get(msg.id);
      if (!u) {
        sendResponse({ final: true, result: { ok: false, error: "Unknown upload." } });
        return false;
      }
      if (u.chunks[msg.seq ?? 0] == null) {
        u.chunks[msg.seq ?? 0] = msg.data ?? "";
        u.received++;
      }
      if (u.received === u.chunks.length) {
        void finishUpload(msg.id).then((result) => sendResponse({ final: true, result }));
        return true;
      }
      sendResponse({ final: false });
      return false;
    }

    return false;
  },
);

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "mta-stream") return;
  let cleanup: (() => void) | null = null;
  let closed = false;

  // Keepalive. Provisioning a real device can take minutes with no traffic on
  // this port, and Chrome terminates an idle MV3 service worker after ~30s -
  // which would kill the run and leave the UI waiting forever. Periodic port
  // + storage activity resets that idle timer. (The Express server did the
  // same thing with an SSE comment ping.)
  const keepAlive = setInterval(() => {
    if (closed) return;
    try {
      port.postMessage({ event: "ping" });
      void chrome.storage.local.get("mta_keepalive");
    } catch {
      /* port gone - onDisconnect will clear this */
    }
  }, 20_000);

  port.onDisconnect.addListener(() => {
    closed = true;
    clearInterval(keepAlive);
    cleanup?.();
  });

  port.onMessage.addListener((m: { path?: string }) => {
    if (!m.path) return;
    void openStream(m.path, (event, data) => {
      if (closed) return;
      try {
        if (event === "data") port.postMessage({ event: "data", data });
        else if (event === "end") {
          clearInterval(keepAlive);
          port.postMessage({ event: "end" });
        } else {
          clearInterval(keepAlive);
          port.postMessage({ event: "error", message: data ?? "stream error" });
        }
      } catch {
        /* port gone */
      }
    }).then((off) => {
      cleanup = off;
      if (closed) off();
    });
  });
});
