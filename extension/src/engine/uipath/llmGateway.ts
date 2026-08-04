import { env } from "../config/env.js";
import type { ResolvedToken } from "./auth.js";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionResult {
  content: string;
  model: string;
  basePathUsed: string;
}

// Candidate LLM Gateway base segments, tried in order. The gateway moved
// across UiPath versions: legacy `llmgateway_`, then `orchestrator_/llm`,
// then `agenthub_/llm`. We probe until one answers.
const DEFAULT_BASE_PATHS = [
  "llmgateway_/api/chat/completions",
  "orchestrator_/llm/api/chat/completions",
  "agenthub_/llm/api/chat/completions",
];

function basePaths(): string[] {
  if (env.uipath.llmBasePath) {
    // allow a fully custom override (with or without the completions suffix)
    const custom = env.uipath.llmBasePath.replace(/^\/+|\/+$/g, "");
    const withSuffix = custom.endsWith("chat/completions")
      ? custom
      : `${custom}/api/chat/completions`;
    return [withSuffix, ...DEFAULT_BASE_PATHS];
  }
  return DEFAULT_BASE_PATHS;
}

function buildUrl(auth: ResolvedToken, basePath: string): string {
  const apiVersion = encodeURIComponent(env.uipath.llmApiVersion);
  return `${auth.baseUrl}/${auth.orgName}/${auth.tenantName}/${basePath}?api-version=${apiVersion}`;
}

function buildHeaders(token: string, model: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    "X-UIPATH-STREAMING-ENABLED": "false",
    "X-UiPath-LlmGateway-RequestingProduct": "mobile-test-autopilot",
    "X-UiPath-LlmGateway-RequestingFeature": "action-planner",
    // Required by the normalized LLM Gateway API (agenthub_/orchestrator_ /llm).
    "X-UiPath-LlmGateway-NormalizedApi-ModelName": model,
    "X-UiPath-LLMGateway-AllowFull4xxResponse": "true",
  };
}

/**
 * Call the UiPath LLM Gateway (OpenAI-compatible chat completions). Tries the
 * candidate base paths in order; the first that returns a usable completion
 * wins, and its path is remembered for subsequent calls in this process.
 */
let stickyBasePath: string | null = null;

export async function chatComplete(
  auth: ResolvedToken,
  messages: ChatMessage[],
  options: { model?: string; temperature?: number; jsonMode?: boolean } = {},
): Promise<ChatCompletionResult> {
  const model = options.model || env.uipath.llmModel;
  const payload: Record<string, unknown> = {
    model,
    messages,
    temperature: options.temperature ?? 0,
    max_tokens: 800,
  };
  if (options.jsonMode) {
    payload.response_format = { type: "json_object" };
  }

  const ordered = stickyBasePath
    ? [stickyBasePath, ...basePaths().filter((p) => p !== stickyBasePath)]
    : basePaths();

  const errors: string[] = [];

  for (const basePath of ordered) {
    const url = buildUrl(auth, basePath);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: buildHeaders(auth.token, model),
        body: JSON.stringify(payload),
      });

      if (response.status === 404 || response.status === 405) {
        errors.push(`${basePath} -> ${response.status}`);
        continue; // wrong base path for this tenant; try the next
      }

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        errors.push(`${basePath} -> ${response.status} ${text.slice(0, 200)}`);
        // A 403/404 on one base path often just means that path is wrong/
        // deprecated for this tenant - keep trying the others before giving up.
        continue;
      }

      const json = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = json.choices?.[0]?.message?.content ?? "";
      if (!content) {
        errors.push(`${basePath} -> empty completion`);
        continue;
      }

      stickyBasePath = basePath;
      return { content, model, basePathUsed: basePath };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${basePath} -> ${message}`);
    }
  }

  throw new Error(
    `UiPath LLM Gateway call failed across all base paths. Tried: ${errors.join(" | ")}`,
  );
}

/**
 * Discover the models this tenant's normalized LLM Gateway accepts. The
 * gateway doesn't return them via /capabilities, but a request with an invalid
 * model returns a 400 whose message lists the supported models — we parse that.
 */
export async function listModels(auth: ResolvedToken): Promise<string[]> {
  const ordered = stickyBasePath
    ? [stickyBasePath, ...basePaths().filter((p) => p !== stickyBasePath)]
    : basePaths();

  for (const basePath of ordered) {
    const url = buildUrl(auth, basePath);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: buildHeaders(auth.token, "__list_models__"),
        body: JSON.stringify({
          model: "__list_models__",
          messages: [{ role: "user", content: "x" }],
          max_tokens: 5,
        }),
      });
      if (response.status === 404 || response.status === 405) continue;
      const text = await response.text();
      const match = text.match(/Supported models are:\s*([^"}]+)/i);
      if (match) {
        stickyBasePath = basePath;
        return match[1]
          .replace(/\.\s*$/, "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .sort();
      }
      // 403/other on a wrong/deprecated path - keep trying the rest.
    } catch {
      // try next base path
    }
  }
  return [];
}

// Models in the catalog that aren't usable for our text chat planner.
const NON_CHAT = /(image|embed|whisper|tts|audio|moderation|computer-use|bison|vision)/i;

// Quick liveness probe: a tiny completion. 200 (or 429 = exists-but-throttled)
// means the model is actually available to this tenant; 400/403 means it isn't.
async function probeModel(auth: ResolvedToken, model: string, basePath: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(buildUrl(auth, basePath), {
      method: "POST",
      headers: buildHeaders(auth.token, model),
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 1,
        temperature: 0,
      }),
      signal: controller.signal,
    });
    return response.ok || response.status === 429;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Return only the models that ACTUALLY work for this tenant - we take the
 * gateway catalog, drop obvious non-chat models, then probe the rest
 * concurrently and keep the ones that respond.
 */
export async function listWorkingModels(auth: ResolvedToken): Promise<string[]> {
  const catalog = await listModels(auth);
  if (catalog.length === 0) return [];
  const basePath = stickyBasePath ?? basePaths()[0];
  const candidates = catalog.filter((m) => !NON_CHAT.test(m));

  const working: string[] = [];
  let next = 0;
  const CONCURRENCY = 8;
  const worker = async (): Promise<void> => {
    while (next < candidates.length) {
      const model = candidates[next++];
      if (await probeModel(auth, model, basePath)) working.push(model);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, candidates.length) }, () => worker()),
  );
  return working.sort();
}
