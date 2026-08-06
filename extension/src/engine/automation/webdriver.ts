/**
 * Minimal fetch-based W3C WebDriver / Appium client.
 *
 * Replaces webdriverio (Node-only) inside the extension service worker. It
 * implements exactly the structural surface `driver.ts` uses (WdBrowser /
 * WdElement / action chain), speaking the plain WebDriver HTTP protocol that
 * BrowserStack / Sauce Labs / any Appium hub expose.
 */

const ELEMENT_KEY = "element-6066-11e4-a52e-4f735466cecf";

export interface RemoteOptions {
  protocol: "https" | "http";
  hostname: string;
  port: number;
  path: string;
  user: string;
  key: string;
  capabilities: Record<string, unknown>;
  connectTimeoutMs?: number;
}

interface WdResponse {
  value: unknown;
}

class WebDriverError extends Error {
  constructor(message: string, readonly status: number, readonly wdError?: string) {
    super(message);
  }
}

function isNoSuchElement(err: unknown): boolean {
  return err instanceof WebDriverError && (err.wdError === "no such element" || err.status === 404);
}

async function wdFetch(
  url: string,
  init: RequestInit & { timeoutMs?: number },
): Promise<WdResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 120_000);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const text = await res.text();
    let json: { value?: { error?: string; message?: string } | unknown } = {};
    try {
      json = JSON.parse(text) as typeof json;
    } catch {
      /* some hubs return empty bodies on success */
    }
    if (!res.ok) {
      const v = json.value as { error?: string; message?: string } | undefined;
      throw new WebDriverError(
        v?.message || `WebDriver call failed (${res.status}): ${text.slice(0, 300)}`,
        res.status,
        v?.error,
      );
    }
    return { value: (json as { value?: unknown }).value };
  } finally {
    clearTimeout(timer);
  }
}

// Decode the webdriverio-style selector strings produced by driver.ts's
// toWdSelector() back into W3C locator strategies.
function toStrategy(selector: string): { using: string; value: string } {
  if (selector.startsWith("~")) return { using: "accessibility id", value: selector.slice(1) };
  if (selector.startsWith("id=")) return { using: "id", value: selector.slice(3) };
  if (selector.startsWith("android="))
    return { using: "-android uiautomator", value: selector.slice(8) };
  if (selector.startsWith("//") || selector.startsWith("(")) {
    return { using: "xpath", value: selector };
  }
  return { using: "css selector", value: selector };
}

interface PointerAction {
  type: string;
  duration?: number;
  x?: number;
  y?: number;
  button?: number;
  origin?: string;
}

class ActionChain {
  private actions: PointerAction[] = [];
  constructor(
    private readonly session: RemoteSession,
    private readonly pointerType: "touch" | "mouse" | "pen",
  ) {}
  move(opts: { duration?: number; x: number; y: number }): ActionChain {
    this.actions.push({
      type: "pointerMove",
      duration: opts.duration ?? 0,
      x: opts.x,
      y: opts.y,
      origin: "viewport",
    });
    return this;
  }
  down(): ActionChain {
    this.actions.push({ type: "pointerDown", button: 0 });
    return this;
  }
  up(): ActionChain {
    this.actions.push({ type: "pointerUp", button: 0 });
    return this;
  }
  pause(ms: number): ActionChain {
    this.actions.push({ type: "pause", duration: ms });
    return this;
  }
  async perform(): Promise<void> {
    await this.session.cmd("POST", "/actions", {
      actions: [
        {
          type: "pointer",
          id: "finger1",
          parameters: { pointerType: this.pointerType },
          actions: this.actions,
        },
      ],
    });
  }
}

export class RemoteElement {
  private id: string | null = null;
  constructor(
    private readonly session: RemoteSession,
    private readonly selector: string,
  ) {}

  get elementId(): string | undefined {
    return this.id ?? undefined;
  }

  // WebDriver arg serialization for execute(): {element-6066…: id}.
  toJSON(): Record<string, string> {
    return this.id ? { [ELEMENT_KEY]: this.id } : {};
  }

  private async find(): Promise<string> {
    const { using, value } = toStrategy(this.selector);
    const res = await this.session.cmd("POST", "/element", { using, value });
    const el = res.value as Record<string, string>;
    this.id = el[ELEMENT_KEY] ?? Object.values(el)[0];
    if (!this.id) throw new Error(`Element not found: ${this.selector}`);
    return this.id;
  }

  private async ensure(): Promise<string> {
    return this.id ?? (await this.find());
  }

  async waitForExist(opts?: { timeout?: number }): Promise<void> {
    const deadline = Date.now() + (opts?.timeout ?? 10_000);
    for (;;) {
      try {
        await this.find();
        return;
      } catch (err) {
        if (!isNoSuchElement(err) || Date.now() > deadline) throw err;
        await new Promise((r) => setTimeout(r, 500));
      }
    }
  }

  async isExisting(): Promise<boolean> {
    try {
      await this.find();
      return true;
    } catch (err) {
      if (isNoSuchElement(err)) return false;
      throw err;
    }
  }

  async click(): Promise<void> {
    const id = await this.ensure();
    await this.session.cmd("POST", `/element/${id}/click`, {});
  }

  // webdriverio's setValue = clear + type; mirror that.
  async setValue(value: string): Promise<void> {
    const id = await this.ensure();
    try {
      await this.session.cmd("POST", `/element/${id}/clear`, {});
    } catch {
      /* some elements refuse clear; typing still works */
    }
    await this.session.cmd("POST", `/element/${id}/value`, { text: value });
  }

  async getText(): Promise<string> {
    const id = await this.ensure();
    const res = await this.session.cmd("GET", `/element/${id}/text`);
    return String(res.value ?? "");
  }

  async getValue(): Promise<string> {
    const id = await this.ensure();
    try {
      const res = await this.session.cmd("GET", `/element/${id}/property/value`);
      return String(res.value ?? "");
    } catch {
      return "";
    }
  }

  async getAttribute(name: string): Promise<string | null> {
    const id = await this.ensure();
    const res = await this.session.cmd("GET", `/element/${id}/attribute/${encodeURIComponent(name)}`);
    return res.value == null ? null : String(res.value);
  }
}

export class RemoteSession {
  private constructor(
    private readonly baseUrl: string,
    private readonly headers: Record<string, string>,
    readonly sessionId: string,
  ) {}

  static async create(options: RemoteOptions): Promise<RemoteSession> {
    const base = `${options.protocol}://${options.hostname}:${options.port}${options.path.replace(/\/+$/, "")}`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (options.user && options.key) {
      headers.Authorization = "Basic " + btoa(`${options.user}:${options.key}`);
    }
    const res = await wdFetch(`${base}/session`, {
      method: "POST",
      headers,
      timeoutMs: options.connectTimeoutMs ?? 300_000,
      body: JSON.stringify({
        capabilities: { alwaysMatch: options.capabilities, firstMatch: [{}] },
      }),
    });
    const value = res.value as { sessionId?: string; capabilities?: unknown };
    const sessionId =
      value.sessionId ?? (res as unknown as { sessionId?: string }).sessionId;
    if (!sessionId) throw new Error("Device session did not return a sessionId.");
    return new RemoteSession(base, headers, sessionId);
  }

  async cmd(method: "GET" | "POST" | "DELETE", path: string, body?: unknown): Promise<WdResponse> {
    return wdFetch(`${this.baseUrl}/session/${this.sessionId}${path}`, {
      method,
      headers: this.headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  // --- WdBrowser structural surface (what driver.ts consumes) ---------------

  $(selector: string): RemoteElement {
    return new RemoteElement(this, selector);
  }

  async url(u: string): Promise<void> {
    await this.cmd("POST", "/url", { url: u });
  }

  async getPageSource(): Promise<string> {
    const res = await this.cmd("GET", "/source");
    return String(res.value ?? "");
  }

  async takeScreenshot(): Promise<string> {
    const res = await this.cmd("GET", "/screenshot");
    return String(res.value ?? "");
  }

  async getWindowSize(): Promise<{ width: number; height: number }> {
    const res = await this.cmd("GET", "/window/rect");
    const rect = res.value as { width?: number; height?: number };
    return { width: rect.width ?? 390, height: rect.height ?? 844 };
  }

  action(
    _type: "pointer",
    opts?: { parameters?: { pointerType?: "touch" | "mouse" | "pen" } },
  ): ActionChain {
    return new ActionChain(this, opts?.parameters?.pointerType ?? "touch");
  }

  async pressKeyCode(code: number): Promise<void> {
    await this.cmd("POST", "/appium/device/press_keycode", { keycode: code });
  }

  /**
   * Send keystrokes to the focused element (webdriverio's `browser.keys`
   * equivalent) as a W3C key input source. Real key events, so UIs that move
   * focus per character - OTP/PIN boxes - behave as they do for a user.
   */
  async keys(text: string): Promise<void> {
    const actions: Array<{ type: string; value?: string }> = [];
    for (const ch of text) {
      actions.push({ type: "keyDown", value: ch });
      actions.push({ type: "keyUp", value: ch });
    }
    await this.cmd("POST", "/actions", {
      actions: [{ type: "key", id: "keyboard", actions }],
    });
  }

  async execute<T>(script: string, ...args: unknown[]): Promise<T> {
    const serialized = args.map((a) => (a instanceof RemoteElement ? a.toJSON() : a));
    const res = await this.cmd("POST", "/execute/sync", { script, args: serialized });
    return res.value as T;
  }

  async takeElementScreenshot(elementId: string): Promise<string> {
    const res = await this.cmd("GET", `/element/${elementId}/screenshot`);
    return String(res.value ?? "");
  }

  async setGeoLocation(loc: { latitude: number; longitude: number; altitude?: number }): Promise<void> {
    await this.cmd("POST", "/location", {
      location: { latitude: loc.latitude, longitude: loc.longitude, altitude: loc.altitude ?? 0 },
    });
  }

  async getGeoLocation(): Promise<{ latitude: number; longitude: number } | null> {
    const res = await this.cmd("GET", "/location");
    const v = res.value as { latitude?: number; longitude?: number } | null;
    return v && typeof v.latitude === "number" && typeof v.longitude === "number"
      ? { latitude: v.latitude, longitude: v.longitude }
      : null;
  }

  async hideKeyboard(): Promise<void> {
    await this.cmd("POST", "/appium/device/hide_keyboard", {});
  }

  async deleteSession(): Promise<void> {
    await this.cmd("DELETE", "");
  }
}
