/**
 * Bridge to the companion Chrome extension (extension/ in this repo).
 *
 * When the extension is installed, the page routes every backend call through
 * it: page -> window.postMessage -> content script -> service worker ->
 * http://127.0.0.1:8787 (the local Autopilot server). That lets the app run
 * as a UiPath Coded App on https://…uipath.host while the automation engine
 * runs on the operator's machine - a direct fetch from the hosted page to
 * localhost would be blocked (mixed content / private-network access).
 *
 * Without the extension, every helper falls back to plain fetch/EventSource,
 * so local dev (Vite proxy) and a hosted-backend build (VITE_API_BASE) are
 * unaffected.
 */

interface FetchResult {
  ok: boolean;
  status?: number;
  contentType?: string;
  contentDisposition?: string;
  body?: string;
  isBase64?: boolean;
  error?: string;
}

interface BridgeMessage {
  source?: string;
  type?: string;
  id?: string;
  version?: string;
  res?: FetchResult;
  data?: string;
  message?: string;
}

export interface EventStreamLike {
  onmessage: ((ev: { data: string }) => void) | null;
  onerror: (() => void) | null;
  readyState: number; // 0 connecting / 1 open / 2 closed (EventSource-compatible)
  close(): void;
}

const SOURCE = "mta-bridge";
const DETECT_TIMEOUT_MS = 700;
const FETCH_TIMEOUT_MS = 120_000;
const UPLOAD_TIMEOUT_MS = 10 * 60_000;
const UPLOAD_CHUNK_BYTES = 4 * 1024 * 1024;

let ready = false;
let seq = 0;
let readyWaiters: Array<(active: boolean) => void> = [];
const changeListeners = new Set<(active: boolean) => void>();
const pendingFetch = new Map<string, (r: FetchResult) => void>();
const openStreams = new Map<string, (msg: BridgeMessage) => void>();

function post(msg: Record<string, unknown>): void {
  window.postMessage({ target: SOURCE, ...msg }, window.location.origin);
}

if (typeof window !== "undefined") {
  window.addEventListener("message", (ev: MessageEvent) => {
    const d = ev.data as BridgeMessage | null;
    if (ev.source !== window || !d || d.source !== SOURCE) return;

    if (d.type === "ready") {
      if (!ready) {
        ready = true;
        readyWaiters.forEach((w) => w(true));
        readyWaiters = [];
        changeListeners.forEach((l) => l(true));
      }
      return;
    }
    if (d.type === "fetch-result" && d.id) {
      const resolve = pendingFetch.get(d.id);
      pendingFetch.delete(d.id);
      resolve?.(d.res ?? { ok: false, error: "Empty bridge response." });
      return;
    }
    if ((d.type === "stream-event" || d.type === "stream-end" || d.type === "stream-error") && d.id) {
      openStreams.get(d.id)?.(d);
    }
  });
  // Keep pinging for a while after load: covers a slow-starting content
  // script and makes the "Local engine linked" pill flip on without any
  // user-visible action beyond a page load.
  post({ type: "ping" });
  let pings = 0;
  const pinger = setInterval(() => {
    if (ready || ++pings > 20) {
      clearInterval(pinger);
      return;
    }
    post({ type: "ping" });
  }, 500);
}

/**
 * True when this build is served from UiPath Coded Apps hosting with no
 * dedicated backend baked in (no VITE_API_BASE): the only way this page can
 * reach an engine is through the bridge extension. Direct fetches would just
 * hit the static host's 404 ("App metadata not found"), so in this mode the
 * app refuses to fall back and explains what to set up instead.
 */
export function hostedWithoutBackend(): boolean {
  if (typeof window === "undefined") return false;
  const apiBase = ((import.meta.env.VITE_API_BASE as string | undefined) ?? "").trim();
  return apiBase === "" && window.location.hostname.endsWith("uipath.host");
}

export const BRIDGE_REQUIRED_MESSAGE =
  "Autopilot engine extension not detected. Install it (extension/ folder via chrome://extensions → Load unpacked), then reload this page.";

export function bridgeActive(): boolean {
  return ready;
}

export function onBridgeChange(cb: (active: boolean) => void): () => void {
  changeListeners.add(cb);
  return () => changeListeners.delete(cb);
}

/** Resolve true once the extension answers; false after a short timeout. */
export function bridgeReady(): Promise<boolean> {
  if (ready) return Promise.resolve(true);
  return new Promise<boolean>((resolve) => {
    readyWaiters.push(resolve);
    post({ type: "ping" });
    setTimeout(() => {
      readyWaiters = readyWaiters.filter((w) => w !== resolve);
      resolve(ready);
    }, DETECT_TIMEOUT_MS);
  });
}

function sendFetch(
  req: {
    path: string;
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    binary?: boolean;
  },
  timeoutMs = FETCH_TIMEOUT_MS,
): Promise<FetchResult> {
  const id = `f${++seq}`;
  return new Promise<FetchResult>((resolve) => {
    pendingFetch.set(id, resolve);
    post({ type: "fetch", id, req });
    setTimeout(() => {
      if (pendingFetch.delete(id)) resolve({ ok: false, error: "Bridge request timed out." });
    }, timeoutMs);
  });
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const STEP = 0x8000;
  for (let i = 0; i < bytes.length; i += STEP) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + STEP)));
  }
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function toResponse(r: FetchResult): Response {
  if (!r.ok) throw new Error(r.error || "Bridge request failed.");
  const headers: Record<string, string> = {};
  if (r.contentType) headers["Content-Type"] = r.contentType;
  const body: BodyInit = r.isBase64
    ? new Blob([base64ToBytes(r.body ?? "") as BlobPart])
    : (r.body ?? "");
  return new Response(body, { status: r.status ?? 200, headers });
}

/**
 * Body -> Blob. Only base64-decode when the worker says the payload is
 * encoded (images); documents like .xaml / .json come back as plain text and
 * decoding those throws "Invalid character".
 */
function bodyToBlob(r: FetchResult, fallbackType: string): Blob {
  const type = r.contentType || fallbackType;
  return r.isBase64
    ? new Blob([base64ToBytes(r.body ?? "") as BlobPart], { type })
    : new Blob([r.body ?? ""], { type });
}

/**
 * Throw on a transport failure or an error status, so callers never turn a
 * `{"error": …}` payload into a "file" or a broken <img>.
 */
function assertFetched(r: FetchResult, what: string): void {
  if (!r.ok) throw new Error(r.error || `${what} failed.`);
  if ((r.status ?? 200) >= 400) {
    let detail = "";
    try {
      detail = (JSON.parse(r.body ?? "{}") as { error?: string }).error ?? "";
    } catch {
      /* non-JSON error body */
    }
    throw new Error(detail || `${what} failed (${r.status}).`);
  }
  if (!r.body) throw new Error(`${what} returned no content.`);
}

async function uploadViaBridge(url: string, form: FormData): Promise<Response> {
  const fields: Record<string, string> = {};
  let file: File | null = null;
  let fileField = "file";
  form.forEach((v, k) => {
    if (v instanceof File) {
      file = v;
      fileField = k;
    } else {
      fields[k] = String(v);
    }
  });

  const id = `u${++seq}`;
  const totalChunks = file ? Math.ceil((file as File).size / UPLOAD_CHUNK_BYTES) : 0;
  const done = new Promise<FetchResult>((resolve) => {
    pendingFetch.set(id, resolve);
    setTimeout(() => {
      if (pendingFetch.delete(id)) resolve({ ok: false, error: "Upload timed out." });
    }, UPLOAD_TIMEOUT_MS);
  });

  post({
    type: "upload-begin",
    id,
    req: {
      path: url,
      fields,
      fileField,
      fileName: file ? (file as File).name : "",
      fileType: file ? (file as File).type : "",
      totalChunks,
    },
  });

  if (file) {
    const buf = new Uint8Array(await (file as File).arrayBuffer());
    for (let i = 0; i < totalChunks; i++) {
      const chunk = buf.subarray(i * UPLOAD_CHUNK_BYTES, Math.min(buf.length, (i + 1) * UPLOAD_CHUNK_BYTES));
      post({ type: "upload-chunk", id, seq: i, data: bytesToBase64(chunk) });
    }
  }

  return toResponse(await done);
}

/**
 * Drop-in fetch: routes through the extension when present, otherwise plain
 * fetch. Mirrors fetch semantics (rejects on transport failure, resolves with
 * a Response - including non-2xx - otherwise).
 */
export async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  if (!ready && !(await bridgeReady())) {
    if (hostedWithoutBackend()) throw new Error(BRIDGE_REQUIRED_MESSAGE);
    return fetch(url, init);
  }
  if (init?.body instanceof FormData) return uploadViaBridge(url, init.body);
  const result = await sendFetch({
    path: url,
    method: init?.method ?? "GET",
    headers: (init?.headers as Record<string, string> | undefined) ?? undefined,
    body: typeof init?.body === "string" ? init.body : undefined,
  });
  return toResponse(result);
}

/** Image/binary URL -> displayable URL (object URL in bridge mode). */
export async function resolveMediaUrl(url: string): Promise<string> {
  if (!ready && !(await bridgeReady())) return url;
  const r = await sendFetch({ path: url, method: "GET", binary: true });
  assertFetched(r, "Loading the image");
  return URL.createObjectURL(bodyToBlob(r, "image/png"));
}

function dispositionFilename(disposition?: string): string | null {
  const m = disposition?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
  return m ? decodeURIComponent(m[1]) : null;
}

/** Download a server document, honoring the server's filename when bridged. */
export async function downloadDoc(url: string, fallbackName: string): Promise<void> {
  const click = (href: string, name: string) => {
    const a = document.createElement("a");
    a.href = href;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };
  if (!ready && !(await bridgeReady())) {
    click(url, fallbackName);
    return;
  }
  const r = await sendFetch({ path: url, method: "GET", binary: true });
  assertFetched(r, "The download");
  const objectUrl = URL.createObjectURL(bodyToBlob(r, "application/octet-stream"));
  click(objectUrl, dispositionFilename(r.contentDisposition) || fallbackName);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
}

/** Open a server document in a new tab (object URL in bridge mode). */
export async function openDoc(url: string): Promise<void> {
  if (!ready && !(await bridgeReady())) {
    window.open(url, "_blank");
    return;
  }
  const r = await sendFetch({ path: url, method: "GET", binary: true });
  assertFetched(r, "Opening the document");
  window.open(URL.createObjectURL(bodyToBlob(r, "text/plain")), "_blank");
}

/**
 * EventSource-compatible stream that transparently uses the bridge when
 * present. Handlers can be assigned right after construction, as with
 * EventSource; transport selection happens asynchronously underneath.
 */
export function openEventStream(url: string): EventStreamLike {
  let innerClose: (() => void) | null = null;
  let closed = false;

  const facade: EventStreamLike = {
    onmessage: null,
    onerror: null,
    readyState: 0,
    close() {
      closed = true;
      facade.readyState = 2;
      innerClose?.();
    },
  };

  void bridgeReady().then((active) => {
    if (closed) return;

    if (!active) {
      if (hostedWithoutBackend()) {
        // No transport at all: fail once, loudly, instead of letting an
        // EventSource retry against the static host forever.
        facade.readyState = 2;
        facade.onerror?.();
        return;
      }
      const es = new EventSource(url);
      es.onopen = () => {
        facade.readyState = 1;
      };
      es.onmessage = (e) => facade.onmessage?.(e);
      es.onerror = () => {
        facade.readyState = es.readyState;
        facade.onerror?.();
      };
      innerClose = () => es.close();
      return;
    }

    const id = `s${++seq}`;
    openStreams.set(id, (msg) => {
      if (msg.type === "stream-event") {
        facade.readyState = 1;
        facade.onmessage?.({ data: msg.data ?? "" });
      } else {
        // end or error: no auto-retry in bridge mode; the app closes streams
        // itself on terminal events, so a bare end surfaces as an error.
        openStreams.delete(id);
        facade.readyState = 2;
        facade.onerror?.();
      }
    });
    post({ type: "stream-open", id, path: url });
    facade.readyState = 1;
    innerClose = () => {
      openStreams.delete(id);
      post({ type: "stream-close", id });
    };
  });

  return facade;
}
