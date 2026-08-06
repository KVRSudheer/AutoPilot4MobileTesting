import type { UiPathAuthConfig } from "../types.js";

/**
 * UiPath auth for the extension engine. Same contract as the server module,
 * minus the SDK instance: the service worker exchanges client credentials at
 * the Identity endpoint (or holds a pasted bearer/PAT) and caches the token.
 */
export interface ResolvedToken {
  token: string;
  baseUrl: string;
  orgName: string;
  tenantName: string;
  expiresAt: number; // epoch ms
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "") || "https://cloud.uipath.com";
}

// Simple cache keyed by clientId|tenant so we don't re-exchange on every step.
const tokenCache = new Map<string, ResolvedToken>();

function cacheKey(config: UiPathAuthConfig): string {
  return [
    config.mode,
    config.baseUrl,
    config.orgName,
    config.tenantName,
    config.clientId ?? "",
    config.bearerToken ? "bearer" : "",
  ].join("|");
}

/**
 * Exchange UiPath external-application client credentials for a bearer token:
 *   POST {baseUrl}/identity_/connect/token  (grant_type=client_credentials)
 */
async function exchangeClientCredentials(
  config: UiPathAuthConfig,
): Promise<{ token: string; expiresIn: number }> {
  const baseUrl = normalizeBaseUrl(config.baseUrl);
  const tokenUrl = `${baseUrl}/identity_/connect/token`;

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: config.clientId ?? "",
    client_secret: config.clientSecret ?? "",
    scope: config.scope?.trim() || "OR.Execution",
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `UiPath token exchange failed (${response.status}): ${detail.slice(0, 400)}`,
    );
  }

  const json = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
  };

  if (!json.access_token) {
    throw new Error("UiPath token endpoint returned no access_token.");
  }

  return { token: json.access_token, expiresIn: json.expires_in ?? 3600 };
}

export async function resolveUiPathToken(
  config: UiPathAuthConfig,
): Promise<ResolvedToken> {
  const key = cacheKey(config);
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached;
  }

  const baseUrl = normalizeBaseUrl(config.baseUrl);

  let token: string;
  let expiresAt: number;

  if (config.mode === "bearer") {
    if (!config.bearerToken) {
      throw new Error("Bearer auth selected but no token was provided.");
    }
    token = config.bearerToken.trim();
    // Unknown expiry for a pasted token; assume short and re-validate often.
    expiresAt = Date.now() + 30 * 60_000;
  } else {
    if (!config.clientId || !config.clientSecret) {
      throw new Error(
        "Client-credentials auth selected but clientId/clientSecret are missing.",
      );
    }
    const result = await exchangeClientCredentials(config);
    token = result.token;
    expiresAt = Date.now() + result.expiresIn * 1000;
  }

  const resolved: ResolvedToken = {
    token,
    baseUrl,
    orgName: config.orgName,
    tenantName: config.tenantName,
    expiresAt,
  };

  tokenCache.set(key, resolved);
  return resolved;
}

export function isUiPathConfigured(config?: Partial<UiPathAuthConfig>): boolean {
  if (!config) return false;
  if (!config.orgName || !config.tenantName) return false;
  if (config.mode === "bearer") return Boolean(config.bearerToken);
  return Boolean(config.clientId && config.clientSecret);
}
