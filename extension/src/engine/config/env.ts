// Browser-safe stand-in for the server's env config. The extension has no
// .env; all credentials come from the UI per session. Shape matches the
// server module so ported code compiles unchanged.
export const env = {
  port: 0,

  uipath: {
    baseUrl: "https://cloud.uipath.com",
    orgName: "",
    tenantName: "",
    clientId: "",
    clientSecret: "",
    scope: "OR.Execution ConversationalAgents",
    bearerToken: "",
    llmModel: "gpt-4o-mini-2024-07-18",
    llmBasePath: "",
    llmApiVersion: "2024-10-21",
  },

  farm: {
    provider: "browserstack",
    browserstackUser: "",
    browserstackKey: "",
    sauceUser: "",
    sauceKey: "",
    sauceRegion: "us-west-1",
    connectTimeoutMs: 300000,
    maxParallel: 0,
    // Live device-screen streaming cadence during a run (ms). 0 = off.
    // Floor between live frames; each is scheduled from how long the previous
    // one took, so a fast device streams smoothly and a slow one backs off
    // rather than queueing behind the step commands.
    liveFrameMs: 700,
  },
};

export type Env = typeof env;
