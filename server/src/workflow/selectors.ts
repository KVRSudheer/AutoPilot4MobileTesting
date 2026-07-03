import type { BrowserName, UiElement, UiPathAnchorSelector, WebSelector } from "../types.js";

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/'/g, "&apos;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function xpathLit(value: string): string {
  if (!value.includes("'")) return `'${value}'`;
  if (!value.includes('"')) return `"${value}"`;
  return "concat('" + value.split("'").join("',\"'\",'") + "')";
}

const SAFE_CSS_ID = /^[A-Za-z][\w-]*$/;
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;
const FIELD_TAGS = new Set(["input", "textarea", "select"]);
const NON_TEXT_INPUT_TYPES = new Set(["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"]);
const TEXT_ANCHOR_TAGS = new Set(["label", "legend", "span", "div", "p", "a", "button", "h1", "h2", "h3", "h4"]);

function browserApp(browser?: BrowserName): string {
  return browser === "chrome" ? "chrome.exe" : browser === "edge" ? "msedge.exe" : "browser";
}

function cleanSelectorValue(value?: string): string {
  return (value ?? "").replace(CONTROL_CHARS, "").replace(/\s+/g, " ").trim();
}

function shortPattern(value: string): string {
  return value.length > 80 ? `${value.slice(0, 77).trim()}*` : value;
}

function isFieldElement(el: UiElement): boolean {
  return FIELD_TAGS.has(cleanSelectorValue(el.tag || el.className).toLowerCase());
}

function isTextEntryField(el: UiElement): boolean {
  const tag = cleanSelectorValue(el.tag || el.className).toLowerCase();
  if (tag === "textarea" || tag === "select") return true;
  if (tag !== "input") return false;
  const type = cleanSelectorValue(el.inputType).toLowerCase();
  return !NON_TEXT_INPUT_TYPES.has(type);
}

function hasSemanticValue(value: string): boolean {
  return /address|city|company|email|first|last|login|mail|name|pass|phone|role|search|state|street|submit|user|zip/i.test(value);
}

function isLikelyDynamicFieldAttribute(el: UiElement, value: string): boolean {
  const clean = cleanSelectorValue(value);
  if (!clean || !isFieldElement(el) || hasSemanticValue(clean)) return false;

  const pageTitle = cleanSelectorValue(el.pageTitle);
  if (/rpa challenge/i.test(pageTitle)) return /^[A-Za-z0-9_-]{4,12}$/.test(clean);

  return /^[A-Za-z0-9]{5,8}$/.test(clean) && /[A-Z]/.test(clean) && /[a-z]/.test(clean);
}

function webctrlXml(attrs: string[]): string {
  return `<webctrl ${attrs.join(" ")} />`;
}

function selectorXmlFromParts(browser: BrowserName | undefined, pageTitle: string, parts: string[]): string {
  const htmlAttrs = [`app='${browserApp(browser)}'`];
  if (pageTitle) htmlAttrs.push(`title='${esc(shortPattern(pageTitle))}'`);
  return `<html ${htmlAttrs.join(" ")} />${parts.join("")}`;
}

function selectorXml(browser: BrowserName | undefined, pageTitle: string, attrs: string[]): string {
  return selectorXmlFromParts(browser, pageTitle, [webctrlXml(attrs)]);
}

function selectorBase(el: UiElement, browser: BrowserName | undefined, attrs: string[]): Omit<WebSelector, "strategy" | "locator"> {
  const title = cleanSelectorValue(el.pageTitle);
  return {
    platform: el.platform,
    kind: "web" as const,
    mbl: selectorXml(browser, title, attrs),
  };
}

function uniqueSelectors(selectors: WebSelector[]): WebSelector[] {
  const seen = new Set<string>();
  return selectors.filter((selector) => {
    const key = `${selector.mbl}|${selector.strategy}|${selector.locator}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildSelectorCandidates(el: UiElement, browser?: BrowserName): WebSelector[] {
  const tag = cleanSelectorValue(el.tag || el.className || "*");
  const tagAttr = `tag='${esc(tag.toUpperCase())}'`;
  const selectors: WebSelector[] = [];
  const add = (attrs: string[], strategy: "css" | "xpath", locator: string) => {
    selectors.push({ ...selectorBase(el, browser, [...attrs, tagAttr]), strategy, locator });
  };

  const id = cleanSelectorValue(el.htmlId);
  if (id && !isLikelyDynamicFieldAttribute(el, id)) {
    add([`id='${esc(id)}'`], SAFE_CSS_ID.test(id) ? "css" : "xpath", SAFE_CSS_ID.test(id) ? `#${id}` : `//*[@id=${xpathLit(id)}]`);
  }

  const name = cleanSelectorValue(el.name);
  if (name && !isLikelyDynamicFieldAttribute(el, name)) {
    add([`name='${esc(name)}'`], "xpath", `//${tag}[@name=${xpathLit(name)}]`);
  }

  const text = shortPattern(cleanSelectorValue(el.text));
  if (text) {
    add(
      [`aaname='${esc(text)}'`],
      "xpath",
      `//${tag}[normalize-space()=${xpathLit(text)} or normalize-space(.)=${xpathLit(text)} or @value=${xpathLit(text)}]`,
    );
  }

  const aria = shortPattern(cleanSelectorValue(el.ariaLabel));
  if (aria) {
    add(
      [`aaname='${esc(aria)}'`],
      "xpath",
      `//${tag}[@aria-label=${xpathLit(aria)} or @title=${xpathLit(aria)} or normalize-space()=${xpathLit(aria)} or normalize-space(.)=${xpathLit(aria)}]`,
    );
  }

  const href = cleanSelectorValue(el.href);
  if (href) {
    add([`href='${esc(shortPattern(href))}'`], "xpath", `//${tag}[@href=${xpathLit(href)} or @href=${xpathLit(href.replace(/^https?:\/\/[^/]+/i, ""))}]`);
  }

  if (cleanSelectorValue(el.testId)) {
    const testId = cleanSelectorValue(el.testId);
    selectors.push({
      ...selectorBase(el, browser, [tagAttr]),
      uiPathValidated: false,
      uiPathValidationReason: "data-test/data-testid is intentionally not emitted as a UiPath selector attribute.",
      strategy: "xpath",
      locator: `//*[@data-test=${xpathLit(testId)} or @data-testid=${xpathLit(testId)}]`,
    });
  }

  if (el.cssPath) {
    selectors.push({
      ...selectorBase(el, browser, [tagAttr]),
      uiPathValidated: false,
      uiPathValidationReason: "CSS path is only used at runtime and is not emitted as a UiPath selector attribute.",
      strategy: "css",
      locator: el.cssPath,
    });
  }

  if (!selectors.length) {
    selectors.push({
      ...selectorBase(el, browser, [tagAttr]),
      uiPathValidated: false,
      uiPathValidationReason: "No stable UiPath web attribute was available for this element.",
      strategy: "css",
      locator: tag,
    });
  }

  return uniqueSelectors(selectors);
}

export function buildSelector(el: UiElement, browser?: BrowserName): WebSelector {
  return buildSelectorCandidates(el, browser)[0];
}

function hasBounds(el: UiElement): el is UiElement & { x: number; y: number; width: number; height: number } {
  return (
    typeof el.x === "number" &&
    typeof el.y === "number" &&
    typeof el.width === "number" &&
    typeof el.height === "number" &&
    el.width > 0 &&
    el.height > 0
  );
}

function center(el: UiElement & { x: number; y: number; width: number; height: number }): { x: number; y: number } {
  return { x: el.x + el.width / 2, y: el.y + el.height / 2 };
}

function elementLabel(el: UiElement): string {
  return shortPattern(
    cleanSelectorValue(el.text) ||
      cleanSelectorValue(el.ariaLabel) ||
      cleanSelectorValue(el.placeholder) ||
      cleanSelectorValue(el.name) ||
      cleanSelectorValue(el.htmlId) ||
      cleanSelectorValue(el.href),
  );
}

function anchorAttrs(el: UiElement): string[] | undefined {
  const tag = cleanSelectorValue(el.tag || el.className || "");
  if (!tag) return undefined;
  const tagAttr = `tag='${esc(tag.toUpperCase())}'`;
  const label = elementLabel(el);

  if (label && TEXT_ANCHOR_TAGS.has(tag.toLowerCase())) return [`aaname='${esc(label)}'`, tagAttr];

  const id = cleanSelectorValue(el.htmlId);
  if (id && !isLikelyDynamicFieldAttribute(el, id)) return [`id='${esc(id)}'`, tagAttr];

  const name = cleanSelectorValue(el.name);
  if (name && !isLikelyDynamicFieldAttribute(el, name)) return [`name='${esc(name)}'`, tagAttr];

  const href = cleanSelectorValue(el.href);
  if (href) return [`href='${esc(shortPattern(href))}'`, tagAttr];

  return undefined;
}

function anchorRelation(
  target: UiElement & { x: number; y: number; width: number; height: number },
  anchor: UiElement & { x: number; y: number; width: number; height: number },
): UiPathAnchorSelector["relation"] {
  const targetRight = target.x + target.width;
  const targetBottom = target.y + target.height;
  const anchorRight = anchor.x + anchor.width;
  const anchorBottom = anchor.y + anchor.height;
  const verticalOverlap = Math.min(targetBottom, anchorBottom) - Math.max(target.y, anchor.y) > 0;
  const horizontalOverlap = Math.min(targetRight, anchorRight) - Math.max(target.x, anchor.x) > 0;

  if (anchorRight <= target.x && verticalOverlap) return "left";
  if (anchor.x >= targetRight && verticalOverlap) return "right";
  if (anchorBottom <= target.y && horizontalOverlap) return "above";
  if (anchor.y >= targetBottom && horizontalOverlap) return "below";

  const targetCenter = center(target);
  const anchorCenter = center(anchor);
  if (horizontalOverlap) return anchorCenter.y < targetCenter.y ? "above" : "below";
  if (verticalOverlap) return anchorCenter.x < targetCenter.x ? "left" : "right";

  return "near";
}

function anchorDistance(
  target: UiElement & { x: number; y: number; width: number; height: number },
  anchor: UiElement & { x: number; y: number; width: number; height: number },
): number {
  const a = center(anchor);
  const t = center(target);
  return Math.round(Math.hypot(a.x - t.x, a.y - t.y));
}

function isUsefulAnchor(target: UiElement, anchor: UiElement): boolean {
  if (target.index === anchor.index) return false;
  const tag = cleanSelectorValue(anchor.tag || anchor.className).toLowerCase();
  if (!TEXT_ANCHOR_TAGS.has(tag) || FIELD_TAGS.has(tag)) return false;
  const label = elementLabel(anchor);
  if (label.length < 2) return false;
  if (label.toLowerCase() === elementLabel(target).toLowerCase()) return false;
  return Boolean(anchorAttrs(anchor));
}

function anchorScore(target: UiElement, anchor: UiElement, relation: UiPathAnchorSelector["relation"], distance: number): number {
  const tag = cleanSelectorValue(anchor.tag || anchor.className).toLowerCase();
  const targetTag = cleanSelectorValue(target.tag || target.className).toLowerCase();
  const fieldTarget = FIELD_TAGS.has(targetTag);
  const tagScore = tag === "label" || tag === "legend" ? 0 : /^h[1-4]$/.test(tag) ? 20 : tag === "button" || tag === "a" ? 35 : 45;
  const relationScore =
    fieldTarget && (relation === "left" || relation === "above")
      ? 0
      : relation === "near"
        ? 30
        : relation === "below"
          ? 20
          : 10;
  const stableAttrScore = cleanSelectorValue(anchor.htmlId) || cleanSelectorValue(anchor.name) ? -15 : 0;
  return distance + tagScore + relationScore + stableAttrScore;
}

function navXml(relation: UiPathAnchorSelector["relation"]): string | undefined {
  switch (relation) {
    case "above":
      return "<nav up='1' />";
    case "below":
      return "<nav down='1' />";
    case "left":
      return "<nav right='1' />";
    case "right":
      return "<nav left='1' />";
    default:
      return undefined;
  }
}

function anchoredTargetSelectorXml(
  target: UiElement,
  anchorAttrsForSelector: string[],
  relation: UiPathAnchorSelector["relation"],
  browser: BrowserName | undefined,
  pageTitle: string,
): string | undefined {
  const nav = navXml(relation);
  if (!nav) return undefined;
  const tag = cleanSelectorValue(target.tag || target.className || "*").toUpperCase();
  return selectorXmlFromParts(browser, pageTitle, [webctrlXml(anchorAttrsForSelector), nav, webctrlXml([`tag='${esc(tag)}'`])]);
}

function anchorXPath(anchor: UiElement): string | undefined {
  const tag = cleanSelectorValue(anchor.tag || anchor.className || "*").toLowerCase() || "*";
  const label = elementLabel(anchor);
  if (!label) return undefined;
  const labelLiteral = xpathLit(label);
  return `//${tag}[normalize-space()=${labelLiteral} or normalize-space(.)=${labelLiteral} or @aria-label=${labelLiteral} or @title=${labelLiteral}]`;
}

function anchoredTargetLocator(target: UiElement, anchor: UiElement, relation: UiPathAnchorSelector["relation"]): string | undefined {
  const tag = cleanSelectorValue(target.tag || target.className || "*").toLowerCase() || "*";
  const anchorExpr = anchorXPath(anchor);
  if (!anchorExpr) return undefined;

  const locators = [
    `//${tag}[@id=${anchorExpr}/@for]`,
    `${anchorExpr}//${tag}`,
    `${anchorExpr}/ancestor::*[.//${tag}][1]//${tag}`,
  ];

  if (relation === "above") locators.push(`(${anchorExpr}/following::${tag})[1]`);
  if (relation === "below") locators.push(`(${anchorExpr}/preceding::${tag})[last()]`);
  if (relation === "left") locators.push(`(${anchorExpr}/following::${tag})[1]`);
  if (relation === "right") locators.push(`(${anchorExpr}/preceding::${tag})[last()]`);

  return `(${locators.join(" | ")})[1]`;
}

function rankedAnchorSelectors(
  target: UiElement,
  elements: UiElement[],
  browser?: BrowserName,
): Array<UiPathAnchorSelector & { score: number }> {
  if (!hasBounds(target)) return [];
  const maxDistance = isFieldElement(target) ? 320 : 460;
  const pageTitle = cleanSelectorValue(target.pageTitle);
  const targetSelector = buildSelectorCandidates(target, browser)[0]?.mbl;
  return elements
    .filter((anchor): anchor is UiElement & { x: number; y: number; width: number; height: number } => hasBounds(anchor) && isUsefulAnchor(target, anchor))
    .map((anchor): (UiPathAnchorSelector & { score: number }) | undefined => {
      const relation = anchorRelation(target, anchor);
      const distance = anchorDistance(target, anchor);
      const attrs = anchorAttrs(anchor);
      if (!attrs || distance > maxDistance) return undefined;
      const selector = selectorXml(browser, pageTitle || cleanSelectorValue(anchor.pageTitle), attrs);
      if (selector === targetSelector) return undefined;
      const targetSelectorFromAnchor = anchoredTargetSelectorXml(target, attrs, relation, browser, pageTitle || cleanSelectorValue(anchor.pageTitle));
      const scoredAnchor: UiPathAnchorSelector & { score: number } = {
        label: elementLabel(anchor),
        selector,
        relation,
        distance,
        score: anchorScore(target, anchor, relation, distance),
      };
      if (targetSelectorFromAnchor) {
        const targetLocatorFromAnchor = anchoredTargetLocator(target, anchor, relation);
        scoredAnchor.targetSelector = targetSelectorFromAnchor;
        if (targetLocatorFromAnchor) scoredAnchor.targetLocator = targetLocatorFromAnchor;
      }
      return scoredAnchor;
    })
    .filter((anchor): anchor is UiPathAnchorSelector & { score: number } => Boolean(anchor))
    .sort((a, b) => a.score - b.score);
}

export function buildAnchoredSelectorCandidates(target: UiElement, elements: UiElement[], browser?: BrowserName): WebSelector[] {
  if (!isTextEntryField(target)) return [];
  return rankedAnchorSelectors(target, elements, browser)
    .filter(
      (anchor): anchor is UiPathAnchorSelector & { score: number; targetSelector: string; targetLocator: string } =>
        Boolean(anchor.targetSelector && anchor.targetLocator),
    )
    .slice(0, 3)
    .map((anchor) => ({
      platform: target.platform,
      kind: "web" as const,
      mbl: anchor.targetSelector!,
      strategy: "xpath" as const,
      locator: anchor.targetLocator!,
      anchors: [anchor],
    }));
}

export function buildAnchorSelectors(target: UiElement, elements: UiElement[], browser?: BrowserName): UiPathAnchorSelector[] {
  const anchors = rankedAnchorSelectors(target, elements, browser);

  const seen = new Set<string>();
  return anchors
    .filter((anchor) => {
      if (seen.has(anchor.selector)) return false;
      seen.add(anchor.selector);
      return true;
    })
    .slice(0, 2)
    .map(({ score: _score, ...anchor }) => anchor);
}
