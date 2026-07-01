import type {
  ConnectionTarget,
  MobileSelector,
  Platform,
  SwipeDirection,
  UiElement,
} from "../types.js";
import { parsePageSource } from "./pageModel.js";

// Driver abstraction so the orchestrator works identically against a live
// webdriverio session (native app or mobile browser) or the simulated session.
export interface DeviceDriver {
  readonly platform: Platform;
  readonly target: ConnectionTarget;
  captureElements(): Promise<UiElement[]>;
  navigateTo(url: string): Promise<void>; // browser target: open a URL
  currentUrl(): Promise<string>; // browser target: the page the browser is on ("" if unknown)
  takeScreenshot(): Promise<string>; // full image src (data: URL)
  tap(selector: MobileSelector): Promise<void>;
  setText(selector: MobileSelector, text: string): Promise<void>;
  swipe(direction: SwipeDirection): Promise<void>;
  pressKey(key: string): Promise<void>;
  getText(selector: MobileSelector): Promise<string>;
  getFieldValue(selector: MobileSelector): Promise<string>; // current value of an input
  captureElementShot(selector: MobileSelector): Promise<string>; // screenshot cropped to the element ("" if unsupported)
  exists(selector: MobileSelector): Promise<boolean>;
  screenSignature(): Promise<string>; // cheap fingerprint to detect screen changes
  quit(): Promise<void>;
}

// Minimal structural type for the bits of the webdriverio Browser we use.
interface WdElement {
  elementId?: string;
  click(): Promise<void>;
  setValue(value: string): Promise<void>;
  getText(): Promise<string>;
  getValue?(): Promise<string>;
  getAttribute?(name: string): Promise<string | null>;
  isExisting(): Promise<boolean>;
  waitForExist(opts?: { timeout?: number }): Promise<void>;
}
interface WdBrowser {
  $(selector: string): Promise<WdElement> | WdElement;
  url(u: string): Promise<void>;
  getPageSource(): Promise<string>;
  takeScreenshot(): Promise<string>;
  getWindowSize(): Promise<{ width: number; height: number }>;
  action(
    type: "pointer",
    opts?: { parameters?: { pointerType?: "touch" | "mouse" | "pen" } },
  ): WdActionChain;
  pressKeyCode?(code: number): Promise<void>;
  execute<T>(script: string | ((...a: never[]) => T), ...args: unknown[]): Promise<T>;
  takeElementScreenshot?(elementId: string): Promise<string>;
  deleteSession(): Promise<void>;
}
interface WdActionChain {
  move(opts: { duration?: number; x: number; y: number }): WdActionChain;
  down(opts?: Record<string, unknown>): WdActionChain;
  up(opts?: Record<string, unknown>): WdActionChain;
  pause(ms: number): WdActionChain;
  perform(): Promise<void>;
}

function toWdSelector(selector: MobileSelector): string {
  switch (selector.strategy) {
    case "accessibility id":
      return `~${selector.locator}`;
    case "id":
      return `id=${selector.locator}`;
    case "-android uiautomator":
      return `android=${selector.locator}`;
    case "css":
    case "xpath":
      return selector.locator;
    default:
      return selector.locator;
  }
}

const ANDROID_KEYCODES: Record<string, number> = {
  BACK: 4,
  HOME: 3,
  ENTER: 66,
  TAB: 61,
  DEL: 67,
  SEARCH: 84,
};

// JS injected into the mobile browser to extract interactive elements +
// a stable-ish CSS path for each. Far more reliable than parsing HTML text.
const WEB_EXTRACT_JS = `
const out = [];
const sel = 'a,button,input,textarea,select,[role="button"],[role="link"],[onclick],[data-test],label,h1,h2,h3';
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
  };
  // Drop identifier-less noise (e.g. empty icon/nav anchors). Always keep fields.
  const signal = o.id||o.name||o.dataTest||o.text||o.ariaLabel||o.placeholder||o.title||o.href;
  if (!isField && !signal) return;
  out.push(o);
});
return out;
`;

interface RawWebEl {
  tag: string; id: string; name: string; type: string; text: string;
  ariaLabel: string; placeholder: string; title: string; href: string; role: string;
  dataTest: string; css: string;
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export class WebdriverDriver implements DeviceDriver {
  constructor(
    private readonly browser: WdBrowser,
    public readonly platform: Platform,
    public readonly target: ConnectionTarget,
  ) {}

  private async el(selector: MobileSelector): Promise<WdElement> {
    return await this.browser.$(toWdSelector(selector));
  }

  // Open a URL in the device browser. The W3C navigate is primary, but on some
  // iOS Safari builds (e.g. iOS 26/27) it resolves WITHOUT actually navigating
  // (stays on about:blank). So we verify we landed and, if not, force the
  // navigation via JS in the page context.
  async navigateTo(url: string): Promise<void> {
    try {
      await this.browser.url(url);
    } catch {
      /* fall through to the JS navigation below */
    }
    await this.waitForWebReady();
    if (!(await this.atHost(url))) {
      try {
        await this.browser.execute<void>(`window.location.assign(${JSON.stringify(url)})`);
      } catch {
        /* ignore - executeRun reports if the page never loaded */
      }
      await this.waitForWebReady();
    }
  }

  async currentUrl(): Promise<string> {
    try {
      return (await this.browser.execute<string>("return document.location.href")) || "";
    } catch {
      return "";
    }
  }

  // Did the browser actually land on the requested URL's host?
  private async atHost(url: string): Promise<boolean> {
    const current = await this.currentUrl();
    try {
      return Boolean(current) && new URL(current).host === new URL(url).host;
    } catch {
      return false;
    }
  }

  async captureElements(): Promise<UiElement[]> {
    if (this.target === "browser") {
      await this.waitForWebReady();
      const raw = (await this.browser.execute<RawWebEl[]>(WEB_EXTRACT_JS)) ?? [];
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
        clickable:
          e.tag === "a" || e.tag === "button" || e.role === "button" || e.role === "link",
      }));
    }
    const xml = await this.browser.getPageSource();
    return parsePageSource(xml, this.platform);
  }

  // Wait until the DOM is interactive/complete before reading the page, so we
  // never plan against a half-loaded screen.
  private async waitForWebReady(): Promise<void> {
    for (let i = 0; i < 20; i += 1) {
      try {
        const state = await this.browser.execute<string>("return document.readyState");
        if (state === "complete" || state === "interactive") {
          await delay(250); // brief settle for SPA hydration
          return;
        }
      } catch {
        return;
      }
      await delay(300);
    }
  }

  async takeScreenshot(): Promise<string> {
    const base64 = await this.browser.takeScreenshot();
    return `data:image/png;base64,${base64}`;
  }

  async tap(selector: MobileSelector): Promise<void> {
    const element = await this.el(selector);
    await element.waitForExist({ timeout: 10_000 });
    await element.click();
  }

  async setText(selector: MobileSelector, text: string): Promise<void> {
    const element = await this.el(selector);
    await element.waitForExist({ timeout: 10_000 });
    await element.setValue(text);
  }

  async getText(selector: MobileSelector): Promise<string> {
    const element = await this.el(selector);
    await element.waitForExist({ timeout: 10_000 });
    return await element.getText();
  }

  // The current value of an input - used to confirm a setText actually landed.
  async getFieldValue(selector: MobileSelector): Promise<string> {
    try {
      const element = await this.el(selector);
      if (this.target === "browser") {
        let v = element.getValue ? (await element.getValue()) ?? "" : "";
        // Some mobile browsers don't return the input value via getValue; read
        // it from the DOM directly as a fallback.
        if (!v) {
          v =
            (await this.browser.execute<string>(
              "return arguments[0] && arguments[0].value || ''",
              element,
            )) || "";
        }
        return v;
      }
      if (element.getAttribute) {
        const v = await element.getAttribute("value");
        if (v != null && v !== "") return v;
      }
      return await element.getText();
    } catch {
      return "";
    }
  }

  // Screenshot cropped to a single element (driver-side, so it's
  // chrome-independent). Returns "" if the driver can't do element screenshots.
  async captureElementShot(selector: MobileSelector): Promise<string> {
    try {
      const element = await this.el(selector);
      await element.waitForExist({ timeout: 5_000 });
      const id = element.elementId;
      if (!id || !this.browser.takeElementScreenshot) return "";
      const b64 = await this.browser.takeElementScreenshot(id);
      return b64 ? `data:image/png;base64,${b64}` : "";
    } catch {
      return "";
    }
  }

  // A cheap fingerprint of the current screen, to detect whether an action
  // (e.g. a tap) actually changed anything.
  async screenSignature(): Promise<string> {
    try {
      if (this.target === "browser") {
        return await this.browser.execute<string>(
          "return location.href + '#' + document.title + '#' + document.querySelectorAll('*').length + '#' + (document.body ? document.body.innerText.length : 0)",
        );
      }
      const src = await this.browser.getPageSource();
      return `len:${src.length}`;
    } catch {
      return "";
    }
  }

  async exists(selector: MobileSelector): Promise<boolean> {
    try {
      const element = await this.el(selector);
      return await element.isExisting();
    } catch {
      return false;
    }
  }

  async pressKey(key: string): Promise<void> {
    const code = ANDROID_KEYCODES[key?.toUpperCase()];
    if (this.platform === "Android" && code && this.browser.pressKeyCode) {
      await this.browser.pressKeyCode(code);
      return;
    }
    if (this.platform === "iOS" && key?.toUpperCase() === "HOME") {
      await this.browser.execute("mobile: pressButton", { name: "home" });
    }
  }

  async swipe(direction: SwipeDirection): Promise<void> {
    // Web: scroll via JS. A pointer drag on a web page is interpreted as a
    // mouse click-drag - it selects text instead of scrolling and looks like a
    // stray drag on screen. window.scrollBy is a clean, reliable scroll.
    if (this.target === "browser") {
      const { width, height } = await this.browser
        .getWindowSize()
        .catch(() => ({ width: 390, height: 844 }));
      const dy = Math.round(height * 0.6);
      const dx = Math.round(width * 0.6);
      // swipe "up" reveals content below -> scroll the page down (+y).
      const [bx, by] =
        direction === "up"
          ? [0, dy]
          : direction === "down"
            ? [0, -dy]
            : direction === "left"
              ? [dx, 0]
              : [-dx, 0];
      await this.browser.execute<void>(`window.scrollBy(${bx}, ${by})`);
      return;
    }

    // Native: a real touch drag (explicit touch pointer, not the default mouse).
    const { width, height } = await this.browser.getWindowSize();
    const cx = Math.round(width / 2);
    const cy = Math.round(height / 2);
    const dx = Math.round(width * 0.3);
    const dy = Math.round(height * 0.3);

    const to = { x: cx, y: cy };
    if (direction === "up") to.y = cy - dy;
    if (direction === "down") to.y = cy + dy;
    if (direction === "left") to.x = cx - dx;
    if (direction === "right") to.x = cx + dx;

    await this.browser
      .action("pointer", { parameters: { pointerType: "touch" } })
      .move({ duration: 0, x: cx, y: cy })
      .down()
      .pause(120)
      .move({ duration: 300, x: to.x, y: to.y })
      .up()
      .perform();
  }

  async quit(): Promise<void> {
    try {
      await this.browser.deleteSession();
    } catch {
      // ignore teardown errors
    }
  }
}
