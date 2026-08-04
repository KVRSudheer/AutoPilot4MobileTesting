import type { MobileSelector, UiElement } from "../types.js";

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/'/g, "&apos;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Build a UiPath mobile selector (<mbl .../>) plus the runtime locator strategy
 * the driver should use to find this element.
 *
 * UiPath mobile selectors are attribute-based (NO XPath). We prefer the most
 * stable attribute available for each platform.
 */
/**
 * Build a selector for `el`.
 *
 * `all` is the rest of the screen. Pass it whenever available: apps that give
 * several controls the SAME identifier (e.g. every input on a form exposed as
 * "…:id/undefined-input") otherwise produce a selector that matches all of
 * them, and the driver silently acts on the first - typing every field's value
 * into the first box. With `all` we detect that and qualify the selector with
 * the element's position among its duplicates.
 */
export function buildSelector(el: UiElement, all?: UiElement[]): MobileSelector {
  if (el.kind === "web") {
    return buildWebSelector(el);
  }
  if (el.platform === "Android") {
    return buildAndroidSelector(el, all);
  }
  return buildIosSelector(el, all);
}

/**
 * Position of `el` among the elements sharing the same value for `key`, and
 * how many share it. ordinal is 0-based (Appium's `instance()` convention).
 */
function duplicatePosition(
  el: UiElement,
  all: UiElement[] | undefined,
  key: (e: UiElement) => string | undefined,
): { ordinal: number; count: number } {
  const value = key(el);
  if (!all || !value) return { ordinal: 0, count: 1 };
  const matches = all.filter((e) => key(e) === value);
  const ordinal = Math.max(0, matches.findIndex((e) => e.index === el.index));
  return { ordinal, count: matches.length };
}

// Quote a value safely for an XPath literal (handles embedded quotes).
function xpathLit(value: string): string {
  if (!value.includes("'")) return `'${value}'`;
  if (!value.includes('"')) return `"${value}"`;
  return "concat('" + value.split("'").join("',\"'\",'") + "')";
}

const SAFE_CSS_ID = /^[A-Za-z][\w-]*$/;

// Build a UiPath WEB selector (<html .../><webctrl .../>) for mobile-browser
// automation, plus a runtime locator the driver can use in a W3C web session.
// IMPORTANT: web sessions only support CSS / XPath - never Appium id=/~ prefixes
// and never bare [attr=] attribute selectors (webdriverio mis-parses them).
function buildWebSelector(el: UiElement): MobileSelector {
  const tag = el.tag || el.className || "*";
  const aaname = el.text || el.ariaLabel || el.name || "";
  // Lean UiPath selector: tag + the SINGLE most-stable attribute available
  // (id > name > visible-text > placeholder). The runtime locator below is
  // unchanged, so element matching behaves exactly as before.
  const attrs: string[] = [`tag='${esc(tag.toUpperCase())}'`];
  if (el.htmlId) attrs.push(`id='${esc(el.htmlId)}'`);
  else if (el.name) attrs.push(`name='${esc(el.name)}'`);
  else if (aaname) attrs.push(`aaname='${esc(aaname)}'`);
  else if (el.placeholder) attrs.push(`placeholder='${esc(el.placeholder)}'`);
  const mbl = `<html app='chrome' /><webctrl ${attrs.join(" ")} />`;
  const base = { platform: el.platform, kind: "web" as const, mbl };

  // 1) id -> CSS #id (verified working); odd chars -> xpath by @id
  if (el.htmlId && SAFE_CSS_ID.test(el.htmlId)) {
    return { ...base, strategy: "css", locator: `#${el.htmlId}` };
  }
  if (el.htmlId) {
    return { ...base, strategy: "xpath", locator: `//*[@id=${xpathLit(el.htmlId)}]` };
  }
  // 2) data-test / data-testid -> xpath (very common, stable test hooks)
  if (el.testId) {
    return { ...base, strategy: "xpath", locator: `//*[@data-test=${xpathLit(el.testId)} or @data-testid=${xpathLit(el.testId)}]` };
  }
  // 3) name -> xpath by @name (CSS [name=] is unreliable in webdriverio)
  if (el.name) {
    return { ...base, strategy: "xpath", locator: `//${tag}[@name=${xpathLit(el.name)}]` };
  }
  // 4) visible text / accessible name -> xpath. Preferred over a computed CSS
  // path because text is stable, whereas CSS paths often include volatile
  // framework classes (e.g. Angular's ng-untouched -> ng-touched after typing).
  if (aaname) {
    return {
      ...base,
      strategy: "xpath",
      locator: `//${tag}[normalize-space()=${xpathLit(aaname)} or normalize-space(.)=${xpathLit(aaname)}]`,
    };
  }
  // 5) last resort: computed CSS path from the page
  if (el.cssPath) {
    return { ...base, strategy: "css", locator: el.cssPath };
  }
  return { ...base, strategy: "css", locator: tag };
}

function buildAndroidSelector(el: UiElement, all?: UiElement[]): MobileSelector {
  /*
   * The selector carries EXACTLY the one attribute the agent located this
   * element with - nothing else.
   *
   * Listing extra attributes makes UiPath require all of them to match, so a
   * selector that stacked android:className + accessibilityId + id failed
   * whenever any single one drifted. That is not hypothetical here: Android
   * content-descriptions on this app embed the field's current value
   * ("House Number, 56", "Address Name, Home", "Mobile Number,"), so an
   * accessibilityId captured during recording stops matching as soon as the
   * field holds something else. The agent never needed those attributes to
   * find the element, so the exported selector does not carry them either.
   *
   * Attribute names are the ones Studio recognises: `id` for the resource-id
   * and `accessibilityId` for the content-desc (NOT "resourceid" and not
   * "content-desc").
   */

  // Runtime locator: prefer resource-id > accessibility id (content-desc) > uiautomator text.
  if (el.resourceId) {
    const id = `id='${esc(el.resourceId)}'`;
    const { ordinal, count } = duplicatePosition(el, all, (e) => e.resourceId);
    if (count > 1) {
      // Ambiguous id - qualify by position so the right control is hit. `idx`
      // is 1-based in UiPath, `instance()` 0-based in UiAutomator.
      return {
        platform: "Android",
        kind: "mobile",
        mbl: `<mbl ${id} idx='${ordinal + 1}' />`,
        strategy: "-android uiautomator",
        locator: `new UiSelector().resourceId("${el.resourceId.replace(/"/g, '\\"')}").instance(${ordinal})`,
      };
    }
    return {
      platform: "Android",
      kind: "mobile",
      mbl: `<mbl ${id} />`,
      strategy: "id",
      locator: el.resourceId,
    };
  }
  if (el.contentDesc) {
    return {
      platform: "Android",
      kind: "mobile",
      mbl: `<mbl accessibilityId='${esc(el.contentDesc)}' />`,
      strategy: "accessibility id",
      locator: el.contentDesc,
    };
  }
  if (el.text) {
    return {
      platform: "Android",
      kind: "mobile",
      mbl: `<mbl text='${esc(el.text)}' />`,
      strategy: "-android uiautomator",
      locator: `new UiSelector().text("${el.text.replace(/"/g, '\\"')}")`,
    };
  }
  return {
    platform: "Android",
    kind: "mobile",
    mbl: `<mbl android:className='${esc(el.className)}' />`,
    strategy: "-android uiautomator",
    locator: `new UiSelector().className("${el.className}")`,
  };
}

function buildIosSelector(el: UiElement, all?: UiElement[]): MobileSelector {
  // Same rule as Android: carry only the attribute actually used to locate.
  const accessibility = el.accessibilityId || el.name;
  if (accessibility) {
    return {
      platform: "iOS",
      kind: "mobile",
      mbl: `<mbl accessibilityId='${esc(accessibility)}' />`,
      strategy: "accessibility id",
      locator: accessibility,
    };
  }
  return {
    platform: "iOS",
    kind: "mobile",
    mbl: `<mbl ios:className='${esc(el.className)}' />`,
    strategy: "xpath", // iOS class chain not exposed here; placeholder
    locator: el.className,
  };
}
