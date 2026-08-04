import { UiPath, getErrorDetails } from "@uipath/uipath-typescript/core";
import type { UiPathAuthConfig } from "../types.js";

export interface ResolvedToken {
  token: string;
  baseUrl: string;
  orgName: string;
  tenantName: string;
  expiresAt: number; // epoch ms
  // The SDK instance that holds the token (per the "auth via the UiPath SDK" requirement).
  sdk: UiPath;
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
 * Exchange UiPath external-application client credentials for a bearer token
 * at the Identity token endpoint. Confirmed endpoint:
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

/**
 * Resolve a usable bearer token + an initialized SDK instance that holds it.
 * The SDK is constructed with the `secret` field so it auto-initializes and
 * `getToken()` returns the live token - the SDK is the genuine auth holder.
 */
export async function resolveUiPathToken(
  config: UiPathAuthConfig,
): Promise<ResolvedToken> {
  const key = cacheKey(config);
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached;
  }

  const baseUrl = normalizeBaseUrl(config.baseUrl);

  try {
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

    // Hand the token to the SDK as `secret` (PAT/Bearer field). With `secret`,
    // the SDK auto-initializes; getToken() reads it back.
    const sdk = new UiPath({
      baseUrl,
      orgName: config.orgName,
      tenantName: config.tenantName,
      secret: token,
    });

    const heldToken = sdk.getToken() ?? token;

    const resolved: ResolvedToken = {
      token: heldToken,
      baseUrl,
      orgName: config.orgName,
      tenantName: config.tenantName,
      expiresAt,
      sdk,
    };

    tokenCache.set(key, resolved);
    return resolved;
  } catch (error) {
    const details = getErrorDetails(error);
    throw new Error(`UiPath authentication failed: ${details.message}`);
  }
}

export function isUiPathConfigured(config?: Partial<UiPathAuthConfig>): boolean {
  if (!config) return false;
  if (!config.orgName || !config.tenantName) return false;
  if (config.mode === "bearer") return Boolean(config.bearerToken);
  return Boolean(config.clientId && config.clientSecret);
}
