import type { ChildProcess } from "node:child_process";
import { rmSync } from "node:fs";
import type {
  ConnectionTarget,
  Platform,
  RuntimePopupAction,
  SwipeDirection,
  UiElement,
  WebSelector,
} from "../types.js";

export interface BrowserDriver {
  readonly platform: Platform;
  readonly target: ConnectionTarget;
  captureElements(): Promise<UiElement[]>;
  navigateTo(url: string): Promise<void>;
  currentUrl(): Promise<string>;
  takeScreenshot(): Promise<string>;
  tap(selector: WebSelector): Promise<void>;
  setText(selector: WebSelector, text: string): Promise<void>;
  swipe(direction: SwipeDirection): Promise<void>;
  pressKey(key: string): Promise<void>;
  getText(selector: WebSelector): Promise<string>;
  getFieldValue(selector: WebSelector): Promise<string>;
  captureElementShot(selector: WebSelector): Promise<string>;
  exists(selector: WebSelector): Promise<boolean>;
  validateUiPathSelector(selector: WebSelector): Promise<{ valid: boolean; matchCount: number; reason: string }>;
  screenSignature(): Promise<string>;
  clearInterruptions(): Promise<RuntimePopupAction[]>;
  detach(): Promise<void>;
  quit(): Promise<void>;
}

export interface BrowserLaunch {
  browserProcess: ChildProcess;
  debugPort: number;
  profileDir: string;
  viewportWidth: number;
  viewportHeight: number;
  maximize: boolean;
}

type JsonObject = Record<string, unknown>;

interface WsLike {
  send(data: string): void;
  close(): void;
  addEventListener(type: "open" | "message" | "error" | "close", listener: (event: unknown) => void): void;
}

type WsConstructor = new (url: string) => WsLike;

class CdpClient {
  private id = 0;
  private readonly pending = new Map<number, { resolve: (value: JsonObject) => void; reject: (error: Error) => void }>();
  private readonly eventHandlers = new Map<string, Set<(params: JsonObject) => void>>();
  private readonly ready: Promise<void>;
  private closed = false;

  private constructor(private readonly ws: WsLike) {
    this.ready = new Promise((resolve, reject) => {
      ws.addEventListener("open", () => resolve());
      ws.addEventListener("error", (event) => reject(new Error(`Browser DevTools connection failed: ${String(event)}`)));
    });
    ws.addEventListener("message", (event) => this.onMessage(event));
    ws.addEventListener("close", () => {
      this.closed = true;
      for (const pending of this.pending.values()) pending.reject(new Error("Browser DevTools connection closed."));
      this.pending.clear();
    });
  }

  static async connect(url: string): Promise<CdpClient> {
    const WebSocketCtor = (globalThis as unknown as { WebSocket?: WsConstructor }).WebSocket;
    if (!WebSocketCtor) {
      throw new Error("This Node.js runtime does not expose WebSocket; local browser control requires Node 22+.");
    }
    const client = new CdpClient(new WebSocketCtor(url));
    await client.ready;
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    return client;
  }

  async send<T extends JsonObject = JsonObject>(method: string, params: JsonObject = {}): Promise<T> {
    await this.ready;
    if (this.closed) throw new Error("Browser DevTools connection is closed.");
    const id = ++this.id;
    const payload = JSON.stringify({ id, method, params });
    const result = new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
      });
    });
    this.ws.send(payload);
    return result;
  }

  close(): void {
    this.closed = true;
    this.ws.close();
  }

  on(method: string, handler: (params: JsonObject) => void): () => void {
    const handlers = this.eventHandlers.get(method) ?? new Set<(params: JsonObject) => void>();
    handlers.add(handler);
    this.eventHandlers.set(method, handlers);
    return () => handlers.delete(handler);
  }

  private onMessage(event: unknown): void {
    const data = (event as { data?: unknown }).data;
    const raw =
      typeof data === "string"
        ? data
        : Buffer.isBuffer(data)
          ? data.toString("utf8")
          : data instanceof ArrayBuffer
            ? Buffer.from(data).toString("utf8")
            : "";
    if (!raw) return;
    const msg = JSON.parse(raw) as {
      id?: number;
      method?: string;
      params?: JsonObject;
      result?: JsonObject;
      error?: { message?: string };
    };
    if (!msg.id) {
      if (msg.method) {
        const handlers = this.eventHandlers.get(msg.method);
        if (handlers) {
          for (const handler of handlers) handler(msg.params ?? {});
        }
      }
      return;
    }
    const pending = this.pending.get(msg.id);
    if (!pending) return;
    this.pending.delete(msg.id);
    if (msg.error) pending.reject(new Error(msg.error.message || "Browser DevTools command failed."));
    else pending.resolve(msg.result ?? {});
  }
}

const WEB_EXTRACT_JS = `
(() => {
  const out = [];
  const sel = 'a,button,input,textarea,select,[role="button"],[role="link"],[role="textbox"],[contenteditable="true"],[onclick],[data-test],[data-testid],label,h1,h2,h3';
  const nodes = Array.from(document.querySelectorAll(sel)).slice(0, 90);
  function cssPath(el){
    if (el.id) return '#' + CSS.escape(el.id);
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && parts.length < 4){
      let part = node.tagName.toLowerCase();
      if (node.classList && node.classList.length) {
        const stable = Array.from(node.classList).filter(c=>!/^(ng-|is-|has-|mat-|cdk-)|^(active|show|open|focus|focused|hover|disabled|selected|touched|untouched|dirty|pristine|valid|invalid|loading|loaded)$/.test(c)).slice(0,2);
        if (stable.length) part += '.' + stable.map(c=>CSS.escape(c)).join('.');
      }
      const parent = node.parentNode;
      if (parent){
        const sibs = Array.from(parent.children).filter(c=>c.tagName===node.tagName);
        if (sibs.length>1) part += ':nth-of-type(' + (sibs.indexOf(node)+1) + ')';
      }
      parts.unshift(part);
      node = node.parentElement;
    }
    return parts.join(' > ');
  }
  const txt = (e) => (e.innerText||e.textContent||'').replace(/\\s+/g,' ').trim().slice(0,80);
  function isClickable(el) {
    const tag = el.tagName.toLowerCase();
    const type = (el.getAttribute('type') || '').toLowerCase();
    const role = (el.getAttribute('role') || '').toLowerCase();
    return (
      tag === 'a' ||
      tag === 'button' ||
      tag === 'select' ||
      tag === 'summary' ||
      tag === 'label' ||
      (tag === 'input' && !['hidden','text','search','email','password','number','tel','url'].includes(type)) ||
      ['button','link','menuitem','tab','option','checkbox','radio'].includes(role) ||
      Boolean(el.getAttribute('onclick')) ||
      Boolean(el.getAttribute('tabindex'))
    );
  }
  const pageTitle = document.title || '';
  nodes.forEach((el)=>{
    const r = el.getBoundingClientRect();
    if (r.width===0 || r.height===0) return;
    const tag = el.tagName.toLowerCase();
    const isField = tag==='input'||tag==='textarea'||tag==='select';
    const o = {
      tag,
      id: el.id||'',
      name: el.getAttribute('name')||'',
      type: el.getAttribute('type')||'',
      text: isField ? (el.value||'') : txt(el),
      ariaLabel: el.getAttribute('aria-label')||'',
      placeholder: el.getAttribute('placeholder')||'',
      title: el.getAttribute('title')||'',
      href: el.getAttribute('href')||'',
      role: el.getAttribute('role')||'',
      dataTest: el.getAttribute('data-test')||el.getAttribute('data-testid')||'',
      css: cssPath(el),
      clickable: isClickable(el),
      pageTitle,
      x: Math.round(r.x),
      y: Math.round(r.y),
      width: Math.round(r.width),
      height: Math.round(r.height),
    };
    const signal = o.id||o.name||o.dataTest||o.text||o.ariaLabel||o.placeholder||o.title||o.href;
    if (!isField && !signal) return;
    out.push(o);
  });
  return out;
})()
`;

const FINDER = `
function __autopilotFind(strategy, locator) {
  if (strategy === "css") return document.querySelector(locator);
  const result = document.evaluate(locator, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
  return result.singleNodeValue;
}
`;

const CLICK_HELPERS = `
function __autopilotActionable(el) {
  if (!el || el.nodeType !== 1) return null;
  const selector = [
    'button',
    'a[href]',
    'input:not([type="hidden"])',
    'select',
    'textarea',
    'summary',
    'label',
    '[role="button"]',
    '[role="link"]',
    '[role="menuitem"]',
    '[role="tab"]',
    '[role="option"]',
    '[onclick]',
    '[tabindex]'
  ].join(',');
  return el.closest(selector) || el;
}
function __autopilotClickTarget(strategy, locator) {
  const el = __autopilotFind(strategy, locator);
  return __autopilotActionable(el);
}
`;

function decodeSelectorValue(value: string): string {
  return value
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function parseSelectorAttrs(selector: string, nodeName: string): Record<string, string> | null {
  const node = selector.match(new RegExp(`<${nodeName}\\b([^>]*)\\/>`, "i"));
  if (!node) return null;
  const attrs: Record<string, string> = {};
  const attrPattern = /([A-Za-z][\w:-]*)='([^']*)'/g;
  let match: RegExpExecArray | null;
  while ((match = attrPattern.exec(node[1])) !== null) {
    attrs[match[1].toLowerCase()] = decodeSelectorValue(match[2]);
  }
  return Object.keys(attrs).length ? attrs : null;
}

function parseWebctrlAttrs(selector: string): Record<string, string> | null {
  return parseSelectorAttrs(selector, "webctrl");
}

function popupActionKey(action: RuntimePopupAction): string {
  return [action.pageTitle ?? "", action.tag ?? "", action.label ?? ""]
    .map((value) => value.trim().toLowerCase().replace(/\s+/g, " "))
    .join("|");
}

function uniquePopupActions(actions: RuntimePopupAction[]): RuntimePopupAction[] {
  const seen = new Set<string>();
  return actions.filter((action) => {
    const key = popupActionKey(action);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const RUNTIME_INTERRUPTION_JS = `
(() => {
  const ACTION_RE = /\\b(got\\s*it|i\\s*agree|agree|accept(?:\\s+all)?|allow|ok|okay|continue|proceed|confirm|yes|reload|close|dismiss|skip|no\\s*thanks|not\\s*now)\\b/i;
  const PRIMARY_ACTION_RE = /\\b(got\\s*it|i\\s*agree|agree|accept(?:\\s+all)?|allow|ok|okay|confirm|yes|reload)\\b/i;
  const BLOCKER_RE = /(syncing your browsing data|cookie|privacy|privacy policy|policy|terms|terms of use|notice|consent|confirm|confirmation|reload|leave|unsaved|alert|warning|important notice|important|permission|required|modal|dialog)/i;
  const ROOT_SELECTOR = [
    '[role="dialog"]',
    '[aria-modal="true"]',
    'dialog[open]',
    '.modal',
    '.modal-dialog',
    '.MuiDialog-root',
    '.MuiDialog-container',
    '.cdk-overlay-pane',
    '.ant-modal',
    '.ant-modal-root',
    '.swal2-popup',
    '.popup',
    '.overlay'
  ].join(',');
  const CONTROL_SELECTOR = [
    'button',
    '[role="button"]',
    '[role="link"]',
    '[role="menuitem"]',
    '[role="tab"]',
    'input[type="button"]',
    'input[type="submit"]',
    'a[href]',
    '[onclick]',
    '[tabindex]',
    '[class*="btn" i]',
    '[class*="button" i]',
    '[class*="close" i]'
  ].join(',');

  function hasBox(el) {
    if (!el || el.nodeType !== 1) return false;
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function visible(el) {
    if (!hasBox(el)) return false;
    const r = el.getBoundingClientRect();
    return r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
  }

  function label(el) {
    return String(el.innerText || el.value || el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || '').replace(/\\s+/g, ' ').trim();
  }

  function actionResult(el) {
    return {
      label: label(el),
      tag: String(el.tagName || 'BUTTON').toUpperCase(),
      pageTitle: document.title || ''
    };
  }

  function area(el) {
    const r = el.getBoundingClientRect();
    return Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0)) *
      Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
  }

  function isOverlayLike(el) {
    if (!visible(el)) return false;
    const style = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const z = Number.parseInt(style.zIndex || '0', 10) || 0;
    const coversEnough = area(el) > innerWidth * innerHeight * 0.18;
    const positioned = style.position === 'fixed' || style.position === 'sticky' || style.position === 'absolute';
    return positioned && (z >= 10 || coversEnough);
  }

  function buttonScore(el, rootIsStrong) {
    const text = label(el);
    if (!ACTION_RE.test(text)) return -1;
    if (PRIMARY_ACTION_RE.test(text)) return 100;
    if (/\\b(continue|proceed)\\b/i.test(text)) return rootIsStrong ? 80 : -1;
    if (/\\b(close|dismiss|skip|no\\s*thanks|not\\s*now)\\b/i.test(text)) return 60;
    return 10;
  }

  function isLeafActionLike(el) {
    if (!hasBox(el)) return false;
    if (/^(html|body|script|style|svg|path)$/i.test(el.tagName)) return false;
    const text = label(el);
    if (!ACTION_RE.test(text)) return false;
    const r = el.getBoundingClientRect();
    if (r.width > innerWidth * 0.95 && r.height > innerHeight * 0.5) return false;
    const actionableChild = el.querySelector(CONTROL_SELECTOR);
    return !actionableChild || actionableChild === el;
  }

  function clickElement(el) {
    const result = actionResult(el);
    el.scrollIntoView({ block: 'center', inline: 'center' });
    if (typeof el.focus === 'function') {
      try { el.focus({ preventScroll: true }); } catch { try { el.focus(); } catch {} }
    }
    el.click();
    return result;
  }

  function clickBestControl(root, rootIsStrong) {
    const controls = Array.from(root.querySelectorAll(CONTROL_SELECTOR)).filter(hasBox);
    const leafActions = Array.from(root.querySelectorAll('*')).filter(isLeafActionLike);
    const scored = Array.from(new Set([...controls, ...leafActions]))
      .map((el) => ({ el, score: buttonScore(el, rootIsStrong), text: label(el) }))
      .filter((item) => item.score >= 0)
      .sort((a, b) => b.score - a.score || (visible(b.el) ? 1 : 0) - (visible(a.el) ? 1 : 0) || a.text.length - b.text.length);
    if (!scored.length) return null;
    return clickElement(scored[0].el);
  }

  const explicitRoots = Array.from(document.querySelectorAll(ROOT_SELECTOR)).filter(visible);
  const overlayRoots = Array.from(document.body ? document.body.querySelectorAll('*') : [])
    .filter(isOverlayLike)
    .sort((a, b) => area(b) - area(a))
    .slice(0, 20);
  const roots = Array.from(new Set([...explicitRoots, ...overlayRoots]));

  for (const root of roots) {
    const text = (root.innerText || root.textContent || '').replace(/\\s+/g, ' ').trim();
    const strongRoot = Boolean(root.matches(ROOT_SELECTOR)) || BLOCKER_RE.test(text) || area(root) > innerWidth * innerHeight * 0.35;
    if (!strongRoot) continue;
    const handled = clickBestControl(root, true);
    if (handled) return handled;
    const close = Array.from(root.querySelectorAll('[aria-label*="close" i], [title*="close" i], .close, button'))
      .filter(visible)
      .find((el) => /^(x|×|close)$/i.test(label(el)) || /close/i.test(String(el.getAttribute('aria-label') || el.getAttribute('title') || '')));
    if (close) {
      return clickElement(close);
    }
  }

  const bodyText = document.body ? (document.body.innerText || '') : '';
  if (BLOCKER_RE.test(bodyText)) {
    const controls = Array.from(document.querySelectorAll(CONTROL_SELECTOR)).filter(hasBox);
    const leafActions = Array.from(document.querySelectorAll('*')).filter(isLeafActionLike);
    const primary = Array.from(new Set([...controls, ...leafActions]))
      .map((el) => ({ el, score: buttonScore(el, false), text: label(el) }))
      .filter((item) => item.score >= 90)
      .sort((a, b) => b.score - a.score || (visible(b.el) ? 1 : 0) - (visible(a.el) ? 1 : 0) || a.text.length - b.text.length);
    if (primary.length) {
      return clickElement(primary[0].el);
    }
  }

  return null;
})()
`;

interface RawWebEl {
  tag: string;
  id: string;
  name: string;
  type: string;
  text: string;
  ariaLabel: string;
  placeholder: string;
  title: string;
  href: string;
  role: string;
  dataTest: string;
  css: string;
  clickable: boolean;
  pageTitle: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return (await res.json()) as T;
}

async function waitForPageWebSocket(port: number): Promise<string> {
  const deadline = Date.now() + 15_000;
  let lastError = "";
  while (Date.now() < deadline) {
    try {
      const targets = await fetchJson<Array<{ type?: string; webSocketDebuggerUrl?: string }>>(
        `http://127.0.0.1:${port}/json/list`,
      );
      const page = targets.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for the local browser DevTools endpoint. ${lastError}`);
}

export async function connectLaunchedBrowser(launch: BrowserLaunch): Promise<BrowserDriver> {
  const wsUrl = await waitForPageWebSocket(launch.debugPort);
  const cdp = await CdpClient.connect(wsUrl);
  if (launch.maximize) {
    try {
      const windowInfo = await cdp.send<{ windowId?: number }>("Browser.getWindowForTarget");
      if (typeof windowInfo.windowId === "number") {
        await cdp.send("Browser.setWindowBounds", {
          windowId: windowInfo.windowId,
          bounds: { windowState: "maximized" },
        });
      }
    } catch {
      // --start-maximized already asks the browser to use the local screen size.
    }
    await delay(500);
  } else {
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: launch.viewportWidth,
      height: launch.viewportHeight,
      deviceScaleFactor: 1,
      mobile: false,
    });
  }
  return new CdpBrowserDriver(cdp, launch);
}

class CdpBrowserDriver implements BrowserDriver {
  readonly platform: Platform = "Desktop";
  readonly target: ConnectionTarget = "browser";
  private readonly handledPopupBuffer: RuntimePopupAction[] = [];
  private readonly bufferedPopupKeys = new Set<string>();

  constructor(
    private readonly cdp: CdpClient,
    private readonly launch: BrowserLaunch,
  ) {
    this.cdp.on("Page.javascriptDialogOpening", () => {
      void this.cdp.send("Page.handleJavaScriptDialog", { accept: true, promptText: "" }).catch(() => undefined);
    });
  }

  async navigateTo(url: string): Promise<void> {
    await this.handleRuntimeInterruptions();
    await this.cdp.send("Page.navigate", { url });
    await this.waitForWebReady();
    await this.handleRuntimeInterruptions();
  }

  async currentUrl(): Promise<string> {
    await this.handleRuntimeInterruptions();
    return await this.evaluate<string>("document.location.href", "");
  }

  async captureElements(): Promise<UiElement[]> {
    await this.waitForWebReady();
    await this.handleRuntimeInterruptions();
    const raw = await this.evaluate<RawWebEl[]>(WEB_EXTRACT_JS, []);
    return raw.map((e, index) => ({
      index,
      platform: this.platform,
      kind: "web" as const,
      className: e.tag,
      tag: e.tag,
      htmlId: e.id || undefined,
      name: e.name || undefined,
      testId: e.dataTest || undefined,
      inputType: e.type || undefined,
      text: e.text || undefined,
      ariaLabel: e.ariaLabel || e.title || e.dataTest || undefined,
      placeholder: e.placeholder || undefined,
      href: e.href || undefined,
      role: e.role || undefined,
      cssPath: e.css || undefined,
      clickable: e.clickable,
      pageTitle: e.pageTitle || undefined,
      x: e.x,
      y: e.y,
      width: e.width,
      height: e.height,
    }));
  }

  async takeScreenshot(): Promise<string> {
    await this.handleRuntimeInterruptions();
    const result = await this.cdp.send<{ data?: string }>("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
    });
    return result.data ? `data:image/png;base64,${result.data}` : "";
  }

  async tap(selector: WebSelector): Promise<void> {
    await this.handleRuntimeInterruptions();
    const sigBefore = await this.pageSignature();
    const box = await this.clickTargetBox(selector);
    if (!box) throw new Error(`Element not found for ${selector.locator}`);
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await this.cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "none" });
    await this.cdp.send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x,
      y,
      button: "left",
      buttons: 1,
      clickCount: 1,
    });
    await this.cdp.send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x,
      y,
      button: "left",
      buttons: 0,
      clickCount: 1,
    });
    await delay(300);

    const clickLanded = await this.evaluate<boolean>("Boolean(window.__autopilotClickSeen)", false);
    let sigAfter = await this.pageSignature();
    if (!sigAfter) {
      await delay(500);
      sigAfter = await this.pageSignature();
    }
    if (clickLanded || (sigBefore && sigAfter && sigBefore !== sigAfter)) {
      return;
    }
    if (sigBefore && !sigAfter) return;

    // If the first mouse click caused navigation, the old selector may no longer
    // exist. Only use DOM fallback when the page is still on the same screen.
    if (!clickLanded) {
      const ok = await this.domClick(selector);
      if (!ok) throw new Error(`Element not found for ${selector.locator}`);
    }
  }

  async setText(selector: WebSelector, text: string): Promise<void> {
    await this.handleRuntimeInterruptions();
    const ok = await this.evaluate<boolean>(
      `(() => {
        ${FINDER}
        const el = __autopilotFind(${JSON.stringify(selector.strategy)}, ${JSON.stringify(selector.locator)});
        if (!el) return false;
        el.scrollIntoView({ block: "center", inline: "center" });
        el.focus();
        if ("value" in el) {
          el.value = ${JSON.stringify(text)};
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        } else {
          el.textContent = ${JSON.stringify(text)};
          el.dispatchEvent(new Event("input", { bubbles: true }));
        }
        return true;
      })()`,
      false,
    );
    if (!ok) throw new Error(`Element not found for ${selector.locator}`);
  }

  async getText(selector: WebSelector): Promise<string> {
    await this.handleRuntimeInterruptions();
    return await this.evaluate<string>(
      `(() => {
        ${FINDER}
        const el = __autopilotFind(${JSON.stringify(selector.strategy)}, ${JSON.stringify(selector.locator)});
        return el ? ((el.innerText || el.textContent || el.value || "").trim()) : "";
      })()`,
      "",
    );
  }

  async getFieldValue(selector: WebSelector): Promise<string> {
    await this.handleRuntimeInterruptions();
    return await this.evaluate<string>(
      `(() => {
        ${FINDER}
        const el = __autopilotFind(${JSON.stringify(selector.strategy)}, ${JSON.stringify(selector.locator)});
        return el ? String(el.value || el.innerText || el.textContent || "") : "";
      })()`,
      "",
    );
  }

  async captureElementShot(selector: WebSelector): Promise<string> {
    await this.handleRuntimeInterruptions();
    const box = await this.elementBox(selector);
    if (!box) return "";
    const result = await this.cdp.send<{ data?: string }>("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
      clip: { x: Math.max(0, box.x), y: Math.max(0, box.y), width: box.width, height: box.height, scale: 1 },
    });
    return result.data ? `data:image/png;base64,${result.data}` : "";
  }

  async screenSignature(): Promise<string> {
    await this.handleRuntimeInterruptions();
    return await this.pageSignature();
  }

  async exists(selector: WebSelector): Promise<boolean> {
    await this.handleRuntimeInterruptions();
    return await this.evaluate<boolean>(
      `(() => {
        ${FINDER}
        return Boolean(__autopilotFind(${JSON.stringify(selector.strategy)}, ${JSON.stringify(selector.locator)}));
      })()`,
      false,
    );
  }

  async validateUiPathSelector(selector: WebSelector): Promise<{ valid: boolean; matchCount: number; reason: string }> {
    await this.handleRuntimeInterruptions();
    const htmlAttrs = parseSelectorAttrs(selector.mbl, "html") ?? {};
    const attrs = parseWebctrlAttrs(selector.mbl);
    if (!attrs?.tag) {
      return { valid: false, matchCount: 0, reason: "Selector does not contain a webctrl tag attribute." };
    }
    if (!Object.keys(attrs).some((key) => key !== "tag")) {
      return { valid: false, matchCount: 0, reason: "Selector has only a tag and no stable UiPath web attribute." };
    }
    const result = await this.evaluate<{ matchCount: number; rootMatched: boolean; rootReason: string }>(
      `(() => {
        const htmlAttrs = ${JSON.stringify(htmlAttrs)};
        const attrs = ${JSON.stringify(attrs)};
        function hasBox(el) {
          if (!el || el.nodeType !== 1) return false;
          const style = getComputedStyle(el);
          if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) return false;
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        }
        function textOf(el) {
          return String(el.innerText || el.textContent || el.value || el.getAttribute('aria-label') || el.getAttribute('title') || '').replace(/\\s+/g, ' ').trim();
        }
        function patternMatches(actual, expected) {
          actual = String(actual || '').replace(/\\s+/g, ' ').trim();
          expected = String(expected || '').replace(/\\s+/g, ' ').trim();
          if (!expected) return false;
          if (!expected.includes('*')) return actual === expected;
          const specials = '\\\\^$+?.()|{}[]';
          const escaped = Array.from(expected).map((ch) => ch === '*' ? '.*' : specials.includes(ch) ? '\\\\' + ch : ch).join('');
          return new RegExp('^' + escaped + '$', 'i').test(actual);
        }
        if (htmlAttrs.title && !patternMatches(document.title, htmlAttrs.title)) {
          return {
            matchCount: 0,
            rootMatched: false,
            rootReason: "HTML title '" + htmlAttrs.title + "' did not match current page title '" + (document.title || '') + "'."
          };
        }
        const tag = String(attrs.tag || '*').toLowerCase();
        const nodes = Array.from(document.querySelectorAll(tag === '*' ? '*' : tag));
        const matchCount = nodes.filter((el) => {
          if (!hasBox(el)) return false;
          if (attrs.id && !patternMatches(el.id, attrs.id)) return false;
          if (attrs.name && !patternMatches(el.getAttribute('name'), attrs.name)) return false;
          if (attrs.href && !patternMatches(el.getAttribute('href') || el.href, attrs.href)) return false;
          if (attrs.aaname && !patternMatches(textOf(el), attrs.aaname)) return false;
          return true;
        }).length;
        return { matchCount, rootMatched: true, rootReason: '' };
      })()`,
      { matchCount: 0, rootMatched: false, rootReason: "Selector validation script did not return a result." },
    );
    if (!result.rootMatched) {
      return { valid: false, matchCount: result.matchCount, reason: result.rootReason };
    }
    return {
      valid: result.matchCount > 0,
      matchCount: result.matchCount,
      reason:
        result.matchCount > 0
          ? `UiPath selector matched ${result.matchCount} visible element(s).`
          : "UiPath selector did not match any visible element on the page.",
    };
  }

  async pressKey(key: string): Promise<void> {
    await this.handleRuntimeInterruptions();
    const normalized = key?.toUpperCase();
    if (normalized === "BACK") {
      await this.cdp.send("Runtime.evaluate", { expression: "window.history.back()", awaitPromise: false });
      return;
    }
    const code =
      normalized === "ENTER"
        ? "Enter"
        : normalized === "TAB"
          ? "Tab"
          : normalized === "ESC" || normalized === "ESCAPE"
            ? "Escape"
            : key;
    await this.cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: code, code });
    await this.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: code, code });
  }

  async swipe(direction: SwipeDirection): Promise<void> {
    await this.handleRuntimeInterruptions();
    const viewport = await this.viewportSize();
    const x = direction === "left" ? viewport.width * 0.6 : direction === "right" ? -viewport.width * 0.6 : 0;
    const y = direction === "up" ? viewport.height * 0.6 : direction === "down" ? -viewport.height * 0.6 : 0;
    await this.cdp.send("Runtime.evaluate", { expression: `window.scrollBy(${Math.round(x)}, ${Math.round(y)})` });
  }

  async clearInterruptions(): Promise<RuntimePopupAction[]> {
    const buffered = this.handledPopupBuffer.splice(0);
    this.bufferedPopupKeys.clear();
    const fresh = await this.handleRuntimeInterruptions(false);
    return uniquePopupActions([...buffered, ...fresh]);
  }

  async detach(): Promise<void> {
    this.cdp.close();
  }

  async quit(): Promise<void> {
    this.cdp.close();
    this.launch.browserProcess.kill();
    setTimeout(() => {
      try {
        rmSync(this.launch.profileDir, { recursive: true, force: true });
      } catch {
        // Browser shutdown can briefly hold files; cleanup is best-effort.
      }
    }, 1000);
  }

  private async waitForWebReady(): Promise<void> {
    for (let i = 0; i < 60; i += 1) {
      const state = await this.evaluate<string>("document.readyState", "");
      if (state === "complete" || state === "interactive") {
        await delay(250);
        await this.handleRuntimeInterruptions();
        return;
      }
      await delay(250);
    }
  }

  private async handleRuntimeInterruptions(bufferActions = true): Promise<RuntimePopupAction[]> {
    const handledActions: RuntimePopupAction[] = [];
    for (let i = 0; i < 3; i += 1) {
      const handled = await this.evaluate<RuntimePopupAction | null>(RUNTIME_INTERRUPTION_JS, null).catch(() => null);
      if (!handled) return handledActions;
      const action = {
        label: handled.label || "popup action",
        tag: handled.tag || "BUTTON",
        pageTitle: handled.pageTitle || undefined,
      };
      handledActions.push(action);
      if (bufferActions) {
        const key = popupActionKey(action);
        if (!this.bufferedPopupKeys.has(key)) {
          this.bufferedPopupKeys.add(key);
          this.handledPopupBuffer.push(action);
        }
      }
      await delay(250);
    }
    return uniquePopupActions(handledActions);
  }

  private async elementBox(selector: WebSelector): Promise<{ x: number; y: number; width: number; height: number } | null> {
    return await this.evaluate<{ x: number; y: number; width: number; height: number } | null>(
      `(() => {
        ${FINDER}
        const el = __autopilotFind(${JSON.stringify(selector.strategy)}, ${JSON.stringify(selector.locator)});
        if (!el) return null;
        el.scrollIntoView({ block: "center", inline: "center" });
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) return null;
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      })()`,
      null,
    );
  }

  private async clickTargetBox(selector: WebSelector): Promise<{ x: number; y: number; width: number; height: number } | null> {
    return await this.evaluate<{ x: number; y: number; width: number; height: number } | null>(
      `(() => {
        ${FINDER}
        ${CLICK_HELPERS}
        const el = __autopilotClickTarget(${JSON.stringify(selector.strategy)}, ${JSON.stringify(selector.locator)});
        if (!el) return null;
        el.scrollIntoView({ block: "center", inline: "center" });
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) return null;
        window.__autopilotClickSeen = false;
        el.addEventListener("click", () => { window.__autopilotClickSeen = true; }, { capture: true, once: true });
        const x = Math.max(1, Math.min(window.innerWidth - 1, r.x));
        const y = Math.max(1, Math.min(window.innerHeight - 1, r.y));
        const right = Math.max(x + 1, Math.min(window.innerWidth - 1, r.x + r.width));
        const bottom = Math.max(y + 1, Math.min(window.innerHeight - 1, r.y + r.height));
        return { x, y, width: right - x, height: bottom - y };
      })()`,
      null,
    );
  }

  private async domClick(selector: WebSelector): Promise<boolean> {
    return await this.evaluate<boolean>(
      `(() => {
        ${FINDER}
        ${CLICK_HELPERS}
        const el = __autopilotClickTarget(${JSON.stringify(selector.strategy)}, ${JSON.stringify(selector.locator)});
        if (!el) return false;
        el.scrollIntoView({ block: "center", inline: "center" });
        if (typeof el.focus === "function") el.focus({ preventScroll: true });
        el.click();
        return true;
      })()`,
      false,
    );
  }

  private async viewportSize(): Promise<{ width: number; height: number }> {
    return await this.evaluate<{ width: number; height: number }>(
      `({ width: window.innerWidth || ${this.launch.viewportWidth}, height: window.innerHeight || ${this.launch.viewportHeight} })`,
      { width: this.launch.viewportWidth, height: this.launch.viewportHeight },
    );
  }

  private async pageSignature(): Promise<string> {
    return await this.evaluate<string>(
      `location.href + "#" + document.title + "#" + document.querySelectorAll("*").length + "#" + (document.body ? document.body.innerText.length : 0)`,
      "",
    );
  }

  private async evaluate<T>(expression: string, fallback: T): Promise<T> {
    try {
      const result = await this.cdp.send<{ result?: { value?: T } }>("Runtime.evaluate", {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      return result.result && "value" in result.result ? (result.result.value as T) : fallback;
    } catch {
      return fallback;
    }
  }
}
