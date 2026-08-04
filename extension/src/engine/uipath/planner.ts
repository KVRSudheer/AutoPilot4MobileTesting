import type { PlannedAction, Platform, UiElement } from "../types.js";
import type { ResolvedToken } from "./auth.js";
import { chatComplete, type ChatMessage } from "./llmGateway.js";

const SYSTEM_PROMPT = `You are a mobile UI automation planner for a test-authoring tool.
You are given ONE natural-language test step and a JSON list of the elements currently visible on a mobile screen.
Return EXACTLY ONE mobile action that accomplishes (or progresses) the step - never more than one.

Respond with STRICT JSON only (no markdown, no prose) using this schema:
{
  "actionType": "tap" | "setText" | "swipe" | "pressKey" | "getText" | "assertExists",
  "targetIndex": <number>,   // index of the chosen element from the list, or -1 if none applies
  "text": <string>,          // required for setText (the value to type)
  "direction": "up"|"down"|"left"|"right", // required for swipe
  "key": <string>,           // for pressKey, e.g. "BACK","ENTER","HOME"
  "reason": <string>,        // one short sentence explaining the choice
  "confidence": <number 0..1>
}

Rules:
- Pick the single best element by its visible text, content-desc/label, resource-id or accessibility id.
- For typing, choose actionType "setText" and put the value in "text".
- For checking that something is present, use "assertExists". Steps phrased as
  "wait for X", "wait until X appears" or "verify X is displayed" are all
  "assertExists" against X - the runtime polls for up to 15s, so this is how a
  test waits for a screen that appears after a network call (OTP, dashboards).
- A step targets a specific element (tap/setText/getText/assertExists). If that element is NOT in the visible list, do NOT return a swipe to hunt for it. Return the step's intended action with "targetIndex": -1 - the runtime will scroll and ask you again on the new screen.
- Use actionType "swipe" ONLY when the test step ITSELF explicitly asks to scroll, swipe, drag or pull (then set "direction"). Never use a swipe to "reveal" the target of a tap/type/verify step.
- "direction" is the FINGER movement, not the page movement. "up" drags upward and
  therefore reveals content FURTHER DOWN the screen. So a step saying "scroll down"
  or "scroll to the bottom" must use "direction": "up"; "scroll up" uses "down".
- Prefer clickable/enabled elements for "tap".
- Only choose an element that CLEARLY matches the step by its identifier (text, content-desc/label, aria-label, id, name, resource-id or accessibility id). NEVER guess - if no element clearly matches (e.g. you'd be picking "the first link/button" or an element with no distinguishing identifier), return "targetIndex": -1 instead. A wrong tap silently breaks the flow, so -1 (let the runtime retry) is always better than a guess.`;

function compactElements(elements: UiElement[]): string {
  // Trim to the fields the model needs; cap to keep the prompt small.
  const slim = elements.slice(0, 60).map((e) => ({
    i: e.index,
    type: e.className?.split(".").pop() ?? e.className,
    text: e.text || undefined,
    desc: e.contentDesc || undefined,
    id: e.resourceId || e.htmlId || undefined,
    a11y: e.accessibilityId || e.name || undefined,
    test: e.testId || undefined,
    placeholder: e.placeholder || undefined,
    clickable: e.clickable || undefined,
  }));
  return JSON.stringify(slim);
}

// Extract a JSON object from a model reply (tolerating code fences / prose).
function extractJsonObject(raw: string): Record<string, unknown> {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  const json = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
  return JSON.parse(json) as Record<string, unknown>;
}

function parseAction(raw: string): PlannedAction {
  const obj = extractJsonObject(raw) as Partial<PlannedAction>;

  const actionType = (obj.actionType ?? "tap") as PlannedAction["actionType"];
  return {
    actionType,
    targetIndex: typeof obj.targetIndex === "number" ? obj.targetIndex : -1,
    text: obj.text,
    direction: obj.direction,
    key: obj.key,
    reason: obj.reason ?? "Planned by UiPath LLM Gateway.",
    confidence: typeof obj.confidence === "number" ? obj.confidence : undefined,
  };
}

export async function planActionWithLlm(
  auth: ResolvedToken,
  params: { model: string; step: string; elements: UiElement[]; platform: Platform },
): Promise<PlannedAction> {
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `Platform: ${params.platform}\nTest step: "${params.step}"\n\nVisible elements (JSON):\n${compactElements(
        params.elements,
      )}\n\nReturn the single best action as strict JSON.`,
    },
  ];

  const result = await chatComplete(auth, messages, {
    model: params.model,
    temperature: 0,
    jsonMode: true,
  });

  return parseAction(result.content);
}

// A semantic verdict for a "verify/assert" step - whether the screen actually
// confirms the assertion, rather than just "some matched element exists".
export interface AssertionVerdict {
  satisfied: boolean;
  targetIndex: number;
  reason: string;
}

const VERIFY_SYSTEM_PROMPT = `You verify ONE assertion about a mobile screen for a UI test.
You are given the elements currently visible on screen (JSON) and a natural-language assertion.
Decide whether the assertion is TRUE on THIS screen right now.
Be strict and literal: "satisfied" is true ONLY when an element clearly confirms exactly what the assertion states. An element that merely shares a word is NOT confirmation - e.g. a "Register For Account" link does NOT confirm "the account dashboard is displayed", and a "Login" button does NOT confirm "the user is logged in". If the screen does not clearly show what is asserted, answer false.
Respond with STRICT JSON only (no markdown, no prose):
{ "satisfied": <boolean>, "targetIndex": <index of the element that confirms it, or -1>, "reason": <one short sentence> }`;

export async function verifyAssertion(
  auth: ResolvedToken,
  params: { model: string; step: string; elements: UiElement[]; platform: Platform },
): Promise<AssertionVerdict> {
  const messages: ChatMessage[] = [
    { role: "system", content: VERIFY_SYSTEM_PROMPT },
    {
      role: "user",
      content: `Platform: ${params.platform}\nAssertion: "${params.step}"\n\nVisible elements (JSON):\n${compactElements(
        params.elements,
      )}\n\nReturn the strict JSON verdict.`,
    },
  ];

  const result = await chatComplete(auth, messages, {
    model: params.model,
    temperature: 0,
    jsonMode: true,
  });

  const obj = extractJsonObject(result.content) as Partial<AssertionVerdict>;
  return {
    satisfied: obj.satisfied === true,
    targetIndex: typeof obj.targetIndex === "number" ? obj.targetIndex : -1,
    reason: typeof obj.reason === "string" ? obj.reason : "",
  };
}

// ---------------------------------------------------------------------------
// Deterministic heuristic planner used in simulated mode (no UiPath creds) and
// as a safety net if the LLM returns an unusable target.
// ---------------------------------------------------------------------------

const TAP_WORDS = ["tap", "click", "press", "select", "open", "choose", "go", "login", "log in", "sign in", "continue", "submit", "next", "add", "buy", "checkout"];
const TYPE_WORDS = ["type", "enter", "input", "fill", "set", "write", "search for"];
const SWIPE_WORDS = ["swipe", "scroll", "slide"];
const ASSERT_WORDS = ["verify", "assert", "see", "should", "is displayed", "is shown", "appears", "confirm", "check that", "ensure", "wait for", "wait until", "wait till", "waits for"];

function tokenScore(haystack: string | undefined, needles: string[]): number {
  if (!haystack) return 0;
  const h = haystack.toLowerCase();
  const squished = h.replace(/[^a-z0-9]/g, ""); // "Sign In" -> "signin"
  return needles.reduce((acc, n) => {
    if (n.length <= 2) return acc;
    if (h.includes(n) || squished.includes(n)) return acc + n.length;
    return acc;
  }, 0);
}

function extractQuoted(step: string): string | undefined {
  const m = step.match(/["'“”']([^"'“”']{1,80})["'“”']/);
  return m?.[1];
}

function keywords(step: string): string[] {
  return step
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(
      (w) =>
        w.length > 2 &&
        !["the", "and", "tap", "click", "with", "into", "field", "button", "screen", "page", "enter", "type", "then", "should", "that", "verify", "shown", "show"].includes(w),
    );
}

// Keyword-match strength from an element's identifiers ONLY (no clickable
// bias). This is the score the tap/assert thresholds use, so an element with
// no real match can never "pass" on a tiebreak alone.
function scoreElement(el: UiElement, words: string[]): number {
  return (
    tokenScore(el.text, words) * 3 +
    tokenScore(el.placeholder, words) * 3 +
    tokenScore(el.contentDesc, words) * 3 +
    tokenScore(el.testId, words) * 3 +
    tokenScore(el.accessibilityId, words) * 2 +
    tokenScore(el.name, words) * 2 +
    tokenScore(el.ariaLabel, words) * 2 +
    tokenScore(el.htmlId, words) * 2 +
    tokenScore(el.href, words) * 1.5 +
    tokenScore(el.resourceId, words)
  );
}

/**
 * Is the thing described by `condition` on screen right now?
 *
 * Used to evaluate `If …` guards. Deterministic and local (no LLM round-trip):
 * a quoted phrase must appear in some element's visible text/identifier;
 * otherwise fall back to keyword scoring with a conservative threshold so a
 * vague condition doesn't match everything.
 */
export function screenMatches(condition: string, elements: UiElement[]): boolean {
  const quoted = extractQuoted(condition);
  if (quoted) {
    const needle = quoted.toLowerCase();
    return elements.some((el) =>
      [el.text, el.contentDesc, el.accessibilityId, el.name, el.ariaLabel, el.placeholder, el.resourceId, el.testId]
        .some((v) => (v ?? "").toLowerCase().includes(needle)),
    );
  }
  const words = keywords(condition);
  if (words.length === 0) return false;
  // Every keyword must be found somewhere on screen (across elements), which
  // keeps "the OTP incorrect dialog" from matching a screen with only "OTP".
  const haystack = elements
    .flatMap((el) => [el.text, el.contentDesc, el.accessibilityId, el.name, el.ariaLabel, el.placeholder, el.resourceId, el.testId])
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return words.every((w) => haystack.includes(w));
}

function bestElement(
  step: string,
  elements: UiElement[],
): { el: UiElement; score: number } | null {
  const words = keywords(step);
  let best: UiElement | undefined;
  let bestKw = -1;
  let bestTotal = -1;
  for (const el of elements) {
    const kw = scoreElement(el, words);
    // clickable is only a tiny tiebreak among real keyword matches
    const total = kw + (el.clickable ? 0.01 : 0);
    if (total > bestTotal) {
      bestTotal = total;
      bestKw = kw;
      best = el;
    }
  }
  return best ? { el: best, score: bestKw } : null;
}

const NON_EDITABLE_INPUT = new Set([
  "button",
  "submit",
  "reset",
  "checkbox",
  "radio",
  "image",
  "file",
  "range",
  "color",
]);

// Elements a user can actually type into.
function isEditable(el: UiElement): boolean {
  const tag = (el.tag || el.className || "").toLowerCase();
  if (tag.includes("textarea") || /edit|textfield|searchfield|textbox/i.test(el.className)) {
    return true;
  }
  if (tag === "input" || tag.endsWith(".edittext")) {
    return !el.inputType || !NON_EDITABLE_INPUT.has(el.inputType.toLowerCase());
  }
  return false;
}

function labelOf(el: UiElement): string {
  return (
    el.text ||
    el.placeholder ||
    el.contentDesc ||
    el.accessibilityId ||
    el.testId ||
    el.name ||
    el.htmlId ||
    el.resourceId ||
    el.className ||
    "element"
  );
}

export function planActionHeuristic(step: string, elements: UiElement[]): PlannedAction {
  const lower = step.toLowerCase();
  const swipe = tokenScore(lower, SWIPE_WORDS);
  const type = tokenScore(lower, TYPE_WORDS);
  const assert = tokenScore(lower, ASSERT_WORDS);
  const tap = tokenScore(lower, TAP_WORDS);

  if (swipe >= Math.max(type, assert, tap) && swipe > 0) {
    // `direction` is the FINGER movement, so dragging "up" reveals content
    // further down the page - which is what a person means by "scroll down".
    // Honour that intent for "scroll" wording, while a literal "swipe down"
    // (pull-to-refresh) still gestures downward.
    const scrolling = /\bscroll\b/.test(lower);
    const direction = lower.includes("left")
      ? "left"
      : lower.includes("right")
        ? "right"
        : lower.includes("down")
          ? scrolling
            ? "up"
            : "down"
          : lower.includes("up")
            ? scrolling
              ? "down"
              : "up"
            : "up";
    return {
      actionType: "swipe",
      targetIndex: -1,
      direction: direction as PlannedAction["direction"],
      reason: `Step asks to scroll/swipe; performing a ${direction} swipe.`,
      confidence: 0.6,
    };
  }

  // --- Text entry: only ever target a real editable input ------------------
  if (type > 0) {
    const value =
      extractQuoted(step) ??
      step.replace(/^.*?(?:type|enter|input|fill|set|write|search for)\s+/i, "").trim();
    const inputs = elements.filter(isEditable);
    const match = bestElement(step, inputs);
    const field = match?.el ?? inputs[0];
    if (!field) {
      return {
        actionType: "assertExists",
        targetIndex: -1,
        reason: "No editable input field was found on the current screen for this step.",
        confidence: 0.2,
      };
    }
    return {
      actionType: "setText",
      targetIndex: field.index,
      text: value,
      reason: `Typing "${value}" into the "${labelOf(field)}" field.`,
      confidence: match && match.score > 0 ? 0.8 : 0.5,
    };
  }

  const match = bestElement(step, elements);

  // --- Verification --------------------------------------------------------
  if (assert > tap) {
    if (match && match.score > 0) {
      return {
        actionType: "assertExists",
        targetIndex: match.el.index,
        reason: `Verifying "${labelOf(match.el)}" exists.`,
        confidence: 0.7,
      };
    }
    return {
      actionType: "assertExists",
      targetIndex: -1,
      reason: "No element matching this verification was found on the current screen.",
      confidence: 0.2,
    };
  }

  // --- Tap: require a real keyword match; never tap a random element -------
  if (match && match.score > 0) {
    return {
      actionType: "tap",
      targetIndex: match.el.index,
      reason: `Best match for the step is "${labelOf(match.el)}"; tapping it.`,
      confidence: Math.min(0.9, 0.5 + match.score / 12),
    };
  }

  return {
    actionType: "assertExists",
    targetIndex: -1,
    reason: "No element confidently matched this step on the current screen.",
    confidence: 0.2,
  };
}
