import dotenv from "dotenv";

dotenv.config();

function read(name: string, fallback = ""): string {
  const value = process.env[name];
  return (value ?? "").trim() || fallback;
}

export const env = {
  port: Number(read("PORT", "8787")),

  uipath: {
    baseUrl: read("UIPATH_BASE_URL", "https://cloud.uipath.com"),
    orgName: read("UIPATH_ORG_NAME"),
    tenantName: read("UIPATH_TENANT_NAME"),
    clientId: read("UIPATH_CLIENT_ID"),
    clientSecret: read("UIPATH_CLIENT_SECRET"),
    scope: read("UIPATH_SCOPE", "OR.Execution"),
    bearerToken: read("UIPATH_BEARER_TOKEN"),
    llmModel: read("UIPATH_LLM_MODEL", "gpt-4o-mini-2024-07-18"),
    llmBasePath: read("UIPATH_LLM_BASE_PATH"),
    llmApiVersion: read("UIPATH_LLM_API_VERSION", "2024-10-21"),
  },

  farm: {
    provider: read("DEVICE_FARM_PROVIDER", "browserstack"),
    browserstackUser: read("BROWSERSTACK_USERNAME"),
    browserstackKey: read("BROWSERSTACK_ACCESS_KEY"),
    sauceUser: read("SAUCE_USERNAME"),
    sauceKey: read("SAUCE_ACCESS_KEY"),
    sauceRegion: read("SAUCE_REGION", "us-west-1"),
    // Real-device provisioning can be slow/queued; allow a generous timeout.
    connectTimeoutMs: Number(read("FARM_CONNECT_TIMEOUT_MS", "300000")),
    // Max concurrent device sessions in a parallel batch. 0 (default) = no
    // client-side cap: every run in the batch starts at once. Set a positive
    // number only if you need to stay under a farm's concurrent-session limit.
    maxParallel: Math.max(0, Number(read("MAX_PARALLEL_SESSIONS", "0")) || 0),
    // Live device-screen streaming: poll a screenshot every N ms during a run
    // so the UI shows a near-live feed (not just per-step snapshots). 0 = off.
    liveFrameMs: Math.max(0, Number(read("LIVE_FRAME_MS", "1500")) || 0),
  },
};

export type Env = typeof env;
