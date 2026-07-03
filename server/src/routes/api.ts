import { Router, type Request, type Response } from "express";
import { EventEmitter } from "node:events";
import { env } from "../config/env.js";
import type { FarmCredentials, Platform, RunEvent, SessionRequest, SessionState, UiPathAuthMode } from "../types.js";
import {
  getBatch,
  getSession,
  newBatchId,
  newSessionId,
  saveBatch,
  saveSession,
  setDriver,
} from "../store.js";
import { isUiPathConfigured, resolveUiPathToken } from "../uipath/auth.js";
import { chatComplete, listWorkingModels } from "../uipath/llmGateway.js";
import { createSession } from "../automation/session.js";
import { runAutomation } from "../automation/orchestrator.js";
import { buildXaml } from "../workflow/xamlBuilder.js";
import { buildActionLog, buildSelectorCatalog } from "../workflow/actionLog.js";

export const api = Router();

// --- Per-session event runner (buffered SSE) --------------------------------
class SessionRunner {
  private events: RunEvent[] = [];
  private emitter = new EventEmitter();
  private started = false;
  // When true, this run's start is controlled by its BatchRunner (concurrency
  // cap) - a direct /sessions/:id/events subscription must NOT begin() it.
  batchManaged = false;
  constructor(readonly request: SessionRequest) {
    this.emitter.setMaxListeners(0);
  }
  emit(event: RunEvent): void {
    // Live frames are ephemeral - delivered only to currently-connected
    // subscribers, never buffered (they're large and would bloat memory and
    // get replayed in bulk on every reconnect).
    if (event.type !== "frame") this.events.push(event);
    this.emitter.emit("event", event);
  }
  subscribe(cb: (event: RunEvent) => void): () => void {
    for (const e of this.events) cb(e);
    this.emitter.on("event", cb);
    return () => this.emitter.off("event", cb);
  }
  isDone(): boolean {
    return this.events.some((e) => e.type === "done" || e.type === "error");
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

// Drives a batch's runs ONCE (concurrency-capped), independent of how many
// SSE clients are connected. Reconnecting/extra subscribers attach to its
// completion signal instead of re-running the launcher (which would corrupt
// the active/settled accounting and fire batchDone prematurely).
class BatchRunner {
  private started = false;
  private settled = new Set<string>();
  private emitter = new EventEmitter();
  done = false;
  constructor(readonly runIds: string[]) {
    this.emitter.setMaxListeners(0);
  }
  // Invoke cb when the whole batch is done (immediately if already done).
  onDone(cb: () => void): () => void {
    if (this.done) {
      cb();
      return () => undefined;
    }
    this.emitter.on("done", cb);
    return () => this.emitter.off("done", cb);
  }
  private markSettled(runId: string): void {
    if (this.settled.has(runId)) return;
    this.settled.add(runId);
    if (this.settled.size >= this.runIds.length && !this.done) {
      this.done = true;
      this.emitter.emit("done");
    }
  }
  begin(cap: number, run: (state: SessionState, request: SessionRequest, emit: (e: RunEvent) => void) => Promise<void>): void {
    if (this.started) return;
    this.started = true;
    if (this.runIds.length === 0) {
      this.done = true;
      this.emitter.emit("done");
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

// --- Helpers ----------------------------------------------------------------
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

function mergeWithEnvDefaults(req: SessionRequest): SessionRequest {
  return {
    ...req,
    farm: resolveFarmCreds(req.farm),
    uipath: resolveUipathConfig(req.uipath),
  };
}

// Resolve browser provider settings from a request body, falling back to env defaults.
function resolveFarmCreds(_input: Partial<FarmCredentials> | undefined): FarmCredentials {
  return {
    provider: "local",
  };
}

function buildInitialState(id: string, req: SessionRequest): SessionState {
  const platform = (req.device?.platform || "Desktop") as Platform;
  const target = req.device?.connectionTarget ?? "browser";
  const provider = req.farm.provider;
  const browserName = (req.device?.browser || env.farm.defaultBrowser) as "edge" | "chrome";
  const viewportWidth = req.device?.viewportWidth || env.farm.viewportWidth;
  const viewportHeight = req.device?.viewportHeight || env.farm.viewportHeight;
  const isHeadless = req.device?.headless ?? env.farm.headless;
  const browserTitle = browserName === "edge" ? "Microsoft Edge" : "Google Chrome";
  const browserLabel = isHeadless ? `${browserTitle} ${viewportWidth}x${viewportHeight}` : `${browserTitle} maximized`;
  const environmentLabel =
    req.device?.deviceName?.trim() ||
    `${browserName === "edge" ? "Microsoft Edge" : "Google Chrome"} desktop`;
  const appLabel = req.app?.startUrl || "ACME Shopping (sample web)";
  const title = (req.title || "").trim() || appLabel;

  const browser = {
    browserName,
    provider,
    startUrl: req.app?.startUrl || undefined,
    viewportWidth,
    viewportHeight,
    headless: isHeadless,
  };

  return {
    id,
    title,
    browser,
    mode: "live",
    status: "created",
    platform,
    target,
    provider,
    deviceLabel: environmentLabel,
    browserLabel,
    appLabel,
    llmModel: req.uipath.llmModel || env.uipath.llmModel,
    llmLive: false,
    createdAt: Date.now(),
    currentStep: 0,
    steps: (req.testSteps ?? []).map((description, index) => ({
      index,
      description,
      status: "pending" as const,
    })),
  };
}

// Make a safe, readable, UNIQUE filename stem (e.g. "Login_smoke_Edge_a1b2c3").
// The browser environment + short id keep parallel-batch runs (which share a title) from
// overwriting each other when downloaded.
function slug(s: string): string {
  return (s || "").replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
}
function fileStem(state: SessionState): string {
  const title = slug(state.title) || "BrowserTest";
  const browser = slug(state.browserLabel || state.deviceLabel || "browser");
  return [title, browser, state.id.slice(-6)].filter(Boolean).join("_");
}

function sameHost(a: string, b: string): boolean {
  try {
    return new URL(a).host === new URL(b).host;
  } catch {
    return false;
  }
}

function normalizeStartUrl(url: string): string {
  return /^[a-z][a-z\d+.-]*:\/\//i.test(url) ? url : `https://${url}`;
}

// --- Routes -----------------------------------------------------------------

api.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// Non-secret defaults so the UI can prefill + show which creds are server-side.
api.get("/defaults", (_req, res) => {
  res.json({
    uipath: {
      baseUrl: env.uipath.baseUrl,
      orgName: env.uipath.orgName,
      tenantName: env.uipath.tenantName,
      scope: env.uipath.scope,
      llmModel: env.uipath.llmModel,
      hasClientCredentials: Boolean(env.uipath.clientId && env.uipath.clientSecret),
      hasBearer: Boolean(env.uipath.bearerToken),
    },
    browser: {
      provider: env.farm.provider,
      defaultBrowser: env.farm.defaultBrowser,
      headless: env.farm.headless,
      viewportWidth: env.farm.viewportWidth,
      viewportHeight: env.farm.viewportHeight,
    },
  });
});

// Validate UiPath connection: authenticate, then ping the LLM Gateway.
api.post("/uipath/validate", async (req: Request, res: Response) => {
  const u = resolveUipathConfig(req.body as Partial<SessionRequest["uipath"]>);
  if (!isUiPathConfigured(u)) {
    return res.status(400).json({
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
      return res.json({ ok: true, llm: true, model: r.model, basePath: r.basePathUsed });
    } catch (error) {
      // Authenticated, but the LLM Gateway isn't reachable for this tenant.
      return res.json({
        ok: true,
        llm: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  } catch (error) {
    return res.json({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});

// List the LLM models this tenant's gateway actually accepts.
api.post("/uipath/models", async (req: Request, res: Response) => {
  const u = resolveUipathConfig(req.body as Partial<SessionRequest["uipath"]>);
  if (!isUiPathConfigured(u)) {
    return res.status(400).json({ error: "Provide UiPath credentials first." });
  }
  try {
    const auth = await resolveUiPathToken(u);
    // Only the models that actually work for this tenant (probed), not the
    // gateway's full legacy catalog.
    const models = await listWorkingModels(auth);
    res.json({ models });
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : "Failed to list models." });
  }
});

api.post("/sessions", (req: Request, res: Response) => {
  const body = req.body as SessionRequest;
  if (!body || !Array.isArray(body.testSteps) || body.testSteps.length === 0) {
    return res.status(400).json({ error: "At least one test step is required." });
  }

  const merged = mergeWithEnvDefaults(body);
  const id = newSessionId();
  const state = buildInitialState(id, merged);
  saveSession(state);
  runners.set(id, new SessionRunner(merged));

  res.status(201).json({ session: state });
});

api.get("/sessions/:id", (req, res) => {
  const state = getSession(req.params.id);
  if (!state) return res.status(404).json({ error: "Session not found." });
  res.json({ session: state });
});

// SSE stream - also kicks off the run on first subscription.
api.get("/sessions/:id/events", (req, res) => {
  const id = req.params.id;
  const state = getSession(id);
  const runner = runners.get(id);
  if (!state || !runner) {
    res.status(404).end();
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write(`retry: 3000\n\n`);

  const send = (event: RunEvent) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };
  const unsubscribe = runner.subscribe(send);

  const heartbeat = setInterval(() => res.write(`: ping\n\n`), 15000);

  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });

  // Start the run once. Batch-managed runs are started by their BatchRunner
  // (respecting the concurrency cap); a direct subscription here only watches.
  if (!runner.batchManaged) {
    runner.begin(async (emit) => {
      await executeRun(state, runner.request, emit);
    });
  }
});

api.get("/sessions/:id/catalog", (req, res) => {
  const state = getSession(req.params.id);
  if (!state) return res.status(404).json({ error: "Session not found." });
  res.json({ catalog: buildSelectorCatalog(state), actionLog: buildActionLog(state) });
});

// The interaction screenshot for one step (after-action, else before), as PNG.
api.get("/sessions/:id/steps/:index/screenshot", (req, res) => {
  const state = getSession(req.params.id);
  const idx = Number(req.params.index);
  const step = state?.steps.find((s) => s.index === idx);
  const b64 = step?.afterScreenshot || step?.beforeScreenshot;
  if (!b64) {
    res.status(404).end();
    return;
  }
  // Stored as a data: URL or raw base64 - strip any prefix before decoding.
  const raw = b64.replace(/^data:image\/\w+;base64,/, "");
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "no-cache");
  res.send(Buffer.from(raw, "base64"));
});

// The element-cropped "field" screenshot for one step, as PNG.
api.get("/sessions/:id/steps/:index/elementshot", (req, res) => {
  const state = getSession(req.params.id);
  const idx = Number(req.params.index);
  const step = state?.steps.find((s) => s.index === idx);
  const b64 = step?.elementShot;
  if (!b64) {
    res.status(404).end();
    return;
  }
  const raw = b64.replace(/^data:image\/\w+;base64,/, "");
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "no-cache");
  res.send(Buffer.from(raw, "base64"));
});

api.get("/sessions/:id/workflow.xaml", (req, res) => {
  const state = getSession(req.params.id);
  if (!state) return res.status(404).json({ error: "Session not found." });
  res.setHeader("Content-Type", "application/xml");
  res.setHeader("Content-Disposition", `attachment; filename="${fileStem(state)}.xaml"`);
  res.send(buildXaml(state));
});

api.get("/sessions/:id/actionlog.json", (req, res) => {
  const state = getSession(req.params.id);
  if (!state) return res.status(404).json({ error: "Session not found." });
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="${fileStem(state)}.json"`);
  res.send(JSON.stringify(buildActionLog(state), null, 2));
});

// --- Batches: parallel multi-run execution ---------------------------------
api.post("/batches", (req: Request, res: Response) => {
  const body = req.body as { runs?: SessionRequest[] };
  const runs = Array.isArray(body?.runs) ? body.runs : [];
  if (runs.length === 0) {
    return res.status(400).json({ error: "A batch needs at least one run." });
  }

  const runIds: string[] = [];
  const sessions: SessionState[] = [];
  for (const run of runs) {
    if (!Array.isArray(run.testSteps) || run.testSteps.filter((s) => s.trim()).length === 0) {
      continue; // skip runs with no steps
    }
    const merged = mergeWithEnvDefaults(run);
    const id = newSessionId();
    const state = buildInitialState(id, merged);
    saveSession(state);
    const runner = new SessionRunner(merged);
    runner.batchManaged = true; // started by the BatchRunner, not by a direct subscription
    runners.set(id, runner);
    runIds.push(id);
    sessions.push(state);
  }
  if (runIds.length === 0) {
    return res.status(400).json({ error: "No valid runs (each run needs at least one step)." });
  }

  const batchId = newBatchId();
  saveBatch({ id: batchId, runIds, createdAt: Date.now() });
  batchRunners.set(batchId, new BatchRunner(runIds));
  // 0 = no cap: run every browser environment at once.
  const effectiveCap = env.farm.maxParallel > 0 ? env.farm.maxParallel : runIds.length;
  res.status(201).json({ batchId, runIds, sessions, maxParallel: effectiveCap });
});

// Multiplexed SSE: streams every run's events tagged with its runId, and runs
// them concurrently up to the configured parallel-session cap.
api.get("/batches/:id/events", (req, res) => {
  const batch = getBatch(req.params.id);
  if (!batch) {
    res.status(404).end();
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write(`retry: 3000\n\n`);

  const send = (obj: unknown) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
  const unsubs: Array<() => void> = [];

  // Forward every run's events to THIS client, tagged with the runId. On a
  // reconnect the runner replays its buffered events so the client rebuilds
  // state; this is purely a read - it never (re)starts a run.
  for (const runId of batch.runIds) {
    const runner = runners.get(runId);
    if (!runner) continue;
    unsubs.push(runner.subscribe((event) => send({ runId, event })));
  }

  // The batch's completion is owned by its BatchRunner, not by this
  // connection's accounting - so reconnects can't fire batchDone early.
  const controller = batchRunners.get(batch.id) ?? new BatchRunner(batch.runIds);
  batchRunners.set(batch.id, controller);
  unsubs.push(controller.onDone(() => send({ batchDone: true })));

  const heartbeat = setInterval(() => res.write(`: ping\n\n`), 15000);
  req.on("close", () => {
    clearInterval(heartbeat);
    unsubs.forEach((u) => u());
  });

  // Launch the batch exactly once regardless of how many clients connect or
  // reconnect. maxParallel 0 = no cap: start every run at once.
  const cap = env.farm.maxParallel > 0 ? env.farm.maxParallel : batch.runIds.length;
  controller.begin(cap, executeRun);
});

// --- Run execution ----------------------------------------------------------
async function executeRun(
  state: SessionState,
  request: SessionRequest,
  emit: (e: RunEvent) => void,
): Promise<void> {
  state.status = "connecting";
  saveSession(state);
  emit({ type: "session", session: state });
  emit({ type: "log", level: "info", message: "Starting browser automation session...", at: Date.now() });

  // 1) Resolve UiPath auth (heuristic planner is used if LLM Gateway is unavailable).
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

  // 2) Create the local desktop browser session.
  let created: Awaited<ReturnType<typeof createSession>>;
  try {
    created = await createSession({
      device: request.device,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    state.status = "error";
    state.error = message;
    saveSession(state);
    emit({ type: "log", level: "error", message: `Could not start the local browser: ${message}`, at: Date.now() });
    emit({ type: "session", session: state });
    emit({ type: "error", message });
    return;
  }
  const { driver, mode } = created;
  state.mode = mode;
  setDriver(state.id, driver);
  emit({
    type: "log",
    level: "info",
    message: `Local browser session started (${state.browserLabel || state.deviceLabel}).`,
    at: Date.now(),
  });
  const initialFrame = await driver.takeScreenshot().catch(() => "");
  if (initialFrame) emit({ type: "frame", image: initialFrame, at: Date.now() });

  // 2b) Open the start URL before automating - logged, verified against the
  // page we actually landed on, and retried once.
  if (state.target === "browser") {
    const url = normalizeStartUrl(request.app.startUrl?.trim() || "");
    if (!url) {
      emit({
        type: "log",
        level: "warn",
        message: "No start URL provided - the browser will stay on its current page.",
        at: Date.now(),
      });
    } else {
      emit({
        type: "log",
        level: "info",
        message: `Opening ${url} in ${state.browserLabel || "the desktop browser"}...`,
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
          emit({
            type: "log",
            level: "warn",
            message: `Navigation attempt ${attempt} failed: ${message}`,
            at: Date.now(),
          });
        }
      }
      if (sameHost(landed, url)) {
        emit({ type: "log", level: "info", message: `Browser loaded ${landed}.`, at: Date.now() });
      } else if (landed) {
        emit({
          type: "log",
          level: "warn",
          message: `Browser ended on ${landed} (expected ${url}) - continuing with what's on screen.`,
          at: Date.now(),
        });
      } else {
        emit({
          type: "log",
          level: "warn",
          message: `Could not confirm ${url} loaded - continuing; the agent will read whatever is on screen.`,
          at: Date.now(),
        });
      }
    }
  }

  // 3) Run the strict one-action-per-step loop.
  await runAutomation({
    session: state,
    driver,
    auth,
    llmModel: request.uipath.llmModel || env.uipath.llmModel,
    emit,
  });
}
