import { XMLParser } from "fast-xml-parser";
import type { Platform, UiElement } from "../types.js";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  preserveOrder: true,
  allowBooleanAttributes: true,
  trimValues: true,
});

type PreservedNode = Record<string, unknown> & { ":@"?: Record<string, string> };

function attr(node: PreservedNode, name: string): string | undefined {
  const a = node[":@"];
  if (!a) return undefined;
  const v = a[`@_${name}`];
  return v === undefined || v === "" ? undefined : String(v);
}

function tagOf(node: PreservedNode): string | undefined {
  for (const key of Object.keys(node)) {
    if (key === ":@" || key === "#text") continue;
    return key;
  }
  return undefined;
}

function childrenOf(node: PreservedNode, tag: string): PreservedNode[] {
  const value = node[tag];
  return Array.isArray(value) ? (value as PreservedNode[]) : [];
}

function asBool(v: string | undefined): boolean | undefined {
  if (v === undefined) return undefined;
  return v === "true";
}

/**
 * Centre point of an element, from either platform's bounds format.
 *
 * Android reports "[x1,y1][x2,y2]"; iOS is captured above as
 * "x,y,width,height". Everything that works from an element's POSITION -
 * tapping a control no selector can single out, matching a caption to the
 * field beside it - depends on this, so it has to understand both. Parsing
 * only the Android form would leave those behaviours silently dead on iOS.
 */
export function boundsCenter(bounds?: string): { x: number; y: number } | null {
  if (!bounds) return null;
  const android = bounds.match(/\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]/);
  if (android) {
    const [, x1, y1, x2, y2] = android.map(Number);
    return { x: Math.round((x1 + x2) / 2), y: Math.round((y1 + y2) / 2) };
  }
  const parts = bounds.split(",").map((p) => Number(p.trim()));
  if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
    const [x, y, width, height] = parts;
    return { x: Math.round(x + width / 2), y: Math.round(y + height / 2) };
  }
  return null;
}

/** @deprecated Use {@link boundsCenter}, which also handles iOS. */
export const androidBoundsCenter = boundsCenter;

/** The element's box, in either platform's bounds format. */
export function boundsBox(
  bounds?: string,
): { left: number; top: number; right: number; bottom: number } | null {
  if (!bounds) return null;
  const android = bounds.match(/\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]/);
  if (android) {
    const [, x1, y1, x2, y2] = android.map(Number);
    return { left: x1, top: y1, right: x2, bottom: y2 };
  }
  const parts = bounds.split(",").map((p) => Number(p.trim()));
  if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
    const [x, y, width, height] = parts;
    return { left: x, top: y, right: x + width, bottom: y + height };
  }
  return null;
}

function isInteresting(el: Omit<UiElement, "index">): boolean {
  return Boolean(
    el.hint ||
      el.text ||
      el.contentDesc ||
      el.resourceId ||
      el.accessibilityId ||
      el.name ||
      el.clickable,
  );
}

/**
 * Flatten an Appium page-source XML document into a compact, indexed list of
 * the elements worth showing the planner (and worth turning into selectors).
 */
export function parsePageSource(xml: string, platform: Platform): UiElement[] {
  let tree: PreservedNode[];
  try {
    tree = parser.parse(xml) as PreservedNode[];
  } catch {
    return [];
  }

  const out: Omit<UiElement, "index">[] = [];

  const walk = (nodes: PreservedNode[]): void => {
    for (const node of nodes) {
      const tag = tagOf(node);
      if (!tag) continue;

      let el: Omit<UiElement, "index"> | null = null;

      if (platform === "Android") {
        el = {
          platform,
          className: attr(node, "class") || tag,
          text: attr(node, "text"),
          contentDesc: attr(node, "content-desc"),
          resourceId: attr(node, "resource-id"),
          accessibilityId: attr(node, "content-desc"), // a11y id == content-desc on Android
          // The grey prompt an empty input shows. Web-view forms routinely give
          // their fields no id, description or text, leaving this as the only
          // thing that says what the field is for.
          hint: attr(node, "hint"),
          bounds: attr(node, "bounds"),
          clickable: asBool(attr(node, "clickable")),
          enabled: asBool(attr(node, "enabled")),
          focused: asBool(attr(node, "focused")),
        };
      } else {
        // iOS XCUIElementType* nodes
        const type = attr(node, "type") || tag;
        el = {
          platform,
          className: type,
          text: attr(node, "value") || attr(node, "label"),
          contentDesc: attr(node, "label"),
          name: attr(node, "name"),
          accessibilityId: attr(node, "name"),
          value: attr(node, "value"),
          bounds:
            attr(node, "x") !== undefined
              ? `${attr(node, "x")},${attr(node, "y")},${attr(node, "width")},${attr(node, "height")}`
              : undefined,
          clickable: type.includes("Button") || type.includes("Cell") || type.includes("Link"),
          enabled: asBool(attr(node, "enabled")),
        };
      }

      if (el && isInteresting(el)) {
        out.push(el);
      }

      walk(childrenOf(node, tag));
    }
  };

  walk(tree);

  return out.map((el, index) => ({ ...el, index }));
}

// iOS rect "x,y,w,h" -> centre point.
export function iosRectCenter(rect?: string): { x: number; y: number } | null {
  if (!rect) return null;
  const parts = rect.split(",").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return null;
  const [x, y, w, h] = parts;
  return { x: Math.round(x + w / 2), y: Math.round(y + h / 2) };
}
