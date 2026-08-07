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

/**
 * The stable part of an Android content-description.
 *
 * This app labels form fields as "<what it is>, <what it currently holds>":
 * "Address Name, Home", "House Number, 56", "Street Name, Darling St". Only the
 * part before the comma survives the field being typed into, so matching that
 * prefix identifies the field by NAME while ignoring its value.
 */
function stableDescription(el: UiElement): string | undefined {
  const desc = (el.contentDesc ?? "").trim();
  if (!desc) return undefined;
  const comma = desc.indexOf(",");
  const prefix = comma > 0 ? desc.slice(0, comma) : desc;
  return prefix.trim() || undefined;
}

function uiaLit(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * How many elements on this screen share `el`'s value for `key`.
 *
 * Used to tighten a selector ONLY where it is genuinely ambiguous. A labelled
 * control is commonly a Button wrapping a TextView that repeats the same text
 * or description, so matching on that value alone returns both and the driver
 * acts on whichever comes first - which on the card form meant a 764ms element
 * screenshot of the wrong node and a collapsed sheet.
 *
 * Adding the class unconditionally would tighten selectors that work today, so
 * it is added only when the count proves it is needed. Without the surrounding
 * screen (`all`), nothing can be proven, so nothing is changed.
 */
function sharedWith(
  el: UiElement,
  all: UiElement[] | undefined,
  key: (e: UiElement) => string | undefined,
): number {
  const value = key(el);
  if (!all || !value) return 1;
  return all.filter((e) => key(e) === value).length;
}

function buildAndroidSelector(el: UiElement, all?: UiElement[]): MobileSelector {
  /*
   * Selector policy.
   *
   * The <mbl> names the CONTROL, not just an id: className says what kind of
   * widget it is, so `<mbl android:className='android.widget.Button'
   * id='modal-primary-action' text='Continue Browsing' />` is readable and
   * distinguishes the Button from the TextView beside it that shares the same
   * label. Attribute names are the ones Studio recognises - `id` for the
   * resource-id, `accessibilityId` for the content-desc.
   *
   * What must NOT go in is a whole content-description that embeds the field's
   * live value ("House Number, 56"): it stops matching the moment the field
   * holds something else. Where such a description is the only way to tell
   * duplicates apart, only its stable prefix is used, wildcarded.
   *
   * Positional `idx`/`instance()` is a last resort: it silently targets the
   * wrong control as soon as the screen reorders.
   */
  const cls = el.className ? `android:className='${esc(el.className)}'` : "";
  const parts = (...attrs: Array<string | false | undefined>) =>
    `<mbl ${attrs.filter(Boolean).join(" ")} />`;

  if (el.resourceId) {
    const id = `id='${esc(el.resourceId)}'`;
    // A bare (non package-qualified) id must not use Appium's `id` strategy:
    // it prefixes the app package when the value has no ":id/", so a hybrid
    // testID like "modal-primary-action" is looked up as
    // "<package>:id/modal-primary-action" and never matches - the element is
    // on screen, yet the tap fails with "could not be located".
    // UiSelector().resourceId() matches the attribute exactly.
    const bare = !el.resourceId.includes(":id/");
    const group = all?.filter((e) => e.resourceId === el.resourceId) ?? [el];

    if (group.length > 1) {
      // Prefer a real attribute over a position. The field's own name is in
      // the stable part of its description, so match on that.
      const mine = stableDescription(el);
      const unique =
        mine !== undefined &&
        group.filter((e) => stableDescription(e) === mine).length === 1;
      if (unique) {
        return {
          platform: "Android",
          kind: "mobile",
          // Wildcard: everything after the field name is its current value.
          mbl: parts(cls, id, `accessibilityId='${esc(mine)}*'`),
          strategy: "-android uiautomator",
          locator: `new UiSelector().resourceId("${uiaLit(el.resourceId)}").descriptionStartsWith("${uiaLit(mine)}")`,
        };
      }
      // Nothing distinguishes them but position.
      const { ordinal } = duplicatePosition(el, all, (e) => e.resourceId);
      return {
        platform: "Android",
        kind: "mobile",
        mbl: parts(cls, id, `idx='${ordinal + 1}'`),
        strategy: "-android uiautomator",
        locator: `new UiSelector().resourceId("${uiaLit(el.resourceId)}").instance(${ordinal})`,
      };
    }

    /*
     * A unique id already identifies the element, so nothing else is added.
     * In particular NOT the visible text: labels routinely carry live data
     * ("ENTER THE ONE-TIME PIN (OTP) SENT TO +27879330396" embeds the phone
     * number), and an attribute that changes between runs turns a working
     * selector into a failing one. className stays because a widget's type
     * does not change and it says which control this is.
     */
    if (bare) {
      return {
        platform: "Android",
        kind: "mobile",
        mbl: parts(cls, id),
        strategy: "-android uiautomator",
        locator: `new UiSelector().resourceId("${uiaLit(el.resourceId)}")`,
      };
    }
    return {
      platform: "Android",
      kind: "mobile",
      mbl: parts(cls, id),
      strategy: "id",
      locator: el.resourceId,
    };
  }
  if (el.contentDesc) {
    const stable = stableDescription(el);
    // A description carrying a live value is matched on its stable prefix only.
    const volatile = stable !== undefined && stable !== el.contentDesc.trim();
    if (volatile && stable) {
      return {
        platform: "Android",
        kind: "mobile",
        mbl: parts(cls, `accessibilityId='${esc(stable)}*'`),
        strategy: "-android uiautomator",
        locator: `new UiSelector().descriptionStartsWith("${uiaLit(stable)}")`,
      };
    }
    // A control and the view inside it often carry the SAME description, so
    // `~desc` returns both and the driver acts on whichever comes first. Only
    // when that is actually the case is the class added, which needs the
    // uiautomator strategy - the accessibility-id strategy cannot express one.
    if (sharedWith(el, all, (e) => e.contentDesc) > 1 && el.className) {
      return {
        platform: "Android",
        kind: "mobile",
        mbl: parts(cls, `accessibilityId='${esc(el.contentDesc)}'`),
        strategy: "-android uiautomator",
        locator: `new UiSelector().className("${uiaLit(el.className)}").description("${uiaLit(el.contentDesc)}")`,
      };
    }
    return {
      platform: "Android",
      kind: "mobile",
      mbl: parts(cls, `accessibilityId='${esc(el.contentDesc)}'`),
      strategy: "accessibility id",
      locator: el.contentDesc,
    };
  }
  if (el.text) {
    // Add the class only when the text alone is ambiguous - see sharedWith.
    const locator =
      sharedWith(el, all, (e) => e.text) > 1 && el.className
        ? `new UiSelector().className("${uiaLit(el.className)}").text("${uiaLit(el.text)}")`
        : `new UiSelector().text("${uiaLit(el.text)}")`;
    return {
      platform: "Android",
      kind: "mobile",
      mbl: parts(cls, `text='${esc(el.text)}'`),
      strategy: "-android uiautomator",
      locator,
    };
  }
  // Nothing but a class name. This matches many elements, so the orchestrator
  // taps such a target by its bounds instead of by selector.
  return {
    platform: "Android",
    kind: "mobile",
    mbl: parts(cls),
    strategy: "-android uiautomator",
    locator: `new UiSelector().className("${uiaLit(el.className)}")`,
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
