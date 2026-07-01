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
export function buildSelector(el: UiElement): MobileSelector {
  if (el.kind === "web") {
    return buildWebSelector(el);
  }
  if (el.platform === "Android") {
    return buildAndroidSelector(el);
  }
  return buildIosSelector(el);
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

function buildAndroidSelector(el: UiElement): MobileSelector {
  // Lean selector: className + the single most-stable identifier.
  const attrs: string[] = [];
  if (el.className) attrs.push(`android:className='${esc(el.className)}'`);
  if (el.resourceId) attrs.push(`resourceid='${esc(el.resourceId)}'`);
  else if (el.contentDesc) attrs.push(`content-desc='${esc(el.contentDesc)}'`);
  else if (el.text) attrs.push(`text='${esc(el.text)}'`);
  const mbl = `<mbl ${attrs.join(" ")} />`;

  // Runtime locator: prefer resource-id > accessibility id (content-desc) > uiautomator text.
  if (el.resourceId) {
    return { platform: "Android", kind: "mobile", mbl, strategy: "id", locator: el.resourceId };
  }
  if (el.contentDesc) {
    return {
      platform: "Android",
      kind: "mobile",
      mbl,
      strategy: "accessibility id",
      locator: el.contentDesc,
    };
  }
  if (el.text) {
    return {
      platform: "Android",
      kind: "mobile",
      mbl,
      strategy: "-android uiautomator",
      locator: `new UiSelector().text("${el.text.replace(/"/g, '\\"')}")`,
    };
  }
  return {
    platform: "Android",
    kind: "mobile",
    mbl,
    strategy: "-android uiautomator",
    locator: `new UiSelector().className("${el.className}")`,
  };
}

function buildIosSelector(el: UiElement): MobileSelector {
  // Lean selector: className + the single most-stable identifier.
  const attrs: string[] = [];
  if (el.className) attrs.push(`ios:className='${esc(el.className)}'`);
  if (el.accessibilityId) attrs.push(`accessibilityId='${esc(el.accessibilityId)}'`);
  else if (el.name) attrs.push(`name='${esc(el.name)}'`);
  else if (el.contentDesc) attrs.push(`label='${esc(el.contentDesc)}'`);
  const mbl = `<mbl ${attrs.join(" ")} />`;

  if (el.accessibilityId || el.name) {
    return {
      platform: "iOS",
      kind: "mobile",
      mbl,
      strategy: "accessibility id",
      locator: (el.accessibilityId || el.name) as string,
    };
  }
  return {
    platform: "iOS",
    kind: "mobile",
    mbl,
    strategy: "xpath", // iOS class chain not exposed here; placeholder
    locator: el.className,
  };
}
