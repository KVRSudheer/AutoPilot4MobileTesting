import { UiPath } from "@uipath/uipath-typescript/core";

/**
 * UiPath platform integration for running the client as a UiPath Coded App.
 *
 * When the app is deployed to Coded Apps (or served locally through the
 * @uipath/coded-apps-dev bundler plugin), the platform injects `uipath:*`
 * meta tags with the OAuth config. The SDK reads those tags automatically, so
 * `new UiPath()` + `initialize()` signs the user in and yields a bearer token
 * we can hand to the backend (which already supports bearer auth).
 *
 * Outside the platform (plain `npm run dev` with a placeholder uipath.json)
 * none of the meta tags exist and all of this stays inert.
 */

function metaContent(name: string): string {
  return (
    document
      .querySelector<HTMLMetaElement>(`meta[name="uipath:${name}"]`)
      ?.content?.trim() ?? ""
  );
}

/** OAuth config present (deployed coded app, or dev plugin with a filled-in uipath.json). */
export function isPlatformConfigured(): boolean {
  const clientId = metaContent("client-id");
  return Boolean(clientId) && !clientId.startsWith("<");
}

/** Actually hosted by UiPath Coded Apps (the platform injects uipath:app-base). */
export function isCodedAppHost(): boolean {
  return Boolean(metaContent("app-base"));
}

export interface PlatformSignIn {
  token: string;
  baseUrl: string;
  orgName: string;
  tenantName: string;
}

let initPromise: Promise<PlatformSignIn | null> | null = null;

/**
 * Sign in via the platform OAuth flow and return the session token + tenant
 * coordinates. May redirect the page to UiPath sign-in and back (the SDK
 * resumes the flow after the redirect). Resolves null when not running in a
 * platform context.
 */
export function signInWithPlatform(): Promise<PlatformSignIn | null> {
  if (!isPlatformConfigured()) return Promise.resolve(null);
  if (!initPromise) {
    initPromise = (async () => {
      const sdk = new UiPath(); // config comes from the injected meta tags
      await sdk.initialize(); // may round-trip through UiPath sign-in
      const token = sdk.getToken();
      if (!token) return null;
      return {
        token,
        baseUrl: metaContent("base-url") || "https://cloud.uipath.com",
        orgName: metaContent("org-name"),
        tenantName: metaContent("tenant-name"),
      };
    })().catch((error) => {
      initPromise = null; // allow a retry after a failed/cancelled sign-in
      throw error;
    });
  }
  return initPromise;
}

// A user-initiated sign-in redirects away mid-flow; this flag survives the
// round trip so the app knows to finish the flow when it loads back up.
const OAUTH_FLAG = "uipath-oauth-inflight";

export function markOAuthStarted(): void {
  try {
    sessionStorage.setItem(OAUTH_FLAG, "1");
  } catch {
    /* storage unavailable - the ?code= check below still catches the return */
  }
}

export function clearOAuthFlag(): void {
  try {
    sessionStorage.removeItem(OAUTH_FLAG);
  } catch {
    /* ignore */
  }
}

/** Should the app complete/start platform sign-in on load? */
export function shouldAutoSignIn(): boolean {
  if (!isPlatformConfigured()) return false;
  if (isCodedAppHost()) return true; // seamless inside the platform session
  try {
    if (sessionStorage.getItem(OAUTH_FLAG)) return true;
  } catch {
    /* ignore */
  }
  // Returning from the OAuth redirect (local dev without sessionStorage).
  const params = new URLSearchParams(window.location.search);
  return params.has("code") && params.has("state");
}
