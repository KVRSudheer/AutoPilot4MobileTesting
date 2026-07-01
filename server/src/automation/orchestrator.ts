import type {
  MobileSelector,
  PlannedAction,
  RunEvent,
  SessionState,
  StepResult,
  UiElement,
} from "../types.js";
import type { DeviceDriver } from "./driver.js";
import { buildSelector } from "../workflow/selectors.js";
import { planActionHeuristic, planActionWithLlm, verifyAssertion } from "../uipath/planner.js";
import type { ResolvedToken } from "../uipath/auth.js";
import { saveSession } from "../store.js";
import { env } from "../config/env.js";

const STEP_PAUSE_MS = 650;
const MAX_SEARCH_TRIES = 4;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Poll the device screen on an interval and emit it as a live frame, so the UI
// shows a near-live feed rather than only per-step snapshots. Single-flight
// (never overlaps an in-flight command) and best-effort (skips errors). Returns
// a stop function.
function startLiveFrames(
  driver: DeviceDriver,
  emit: (event: RunEvent) => void,
): () => void {
  const intervalMs = env.farm.liveFrameMs;
  if (!intervalMs) return () => undefined;
  let busy = false;
  let stopped = false;
  const timer = setInterval(() => {
    if (busy || stopped) return;
    busy = true;
    void driver
      .takeScreenshot()
      .then((image) => {
        if (!stopped) emit({ type: "frame", image, at: Date.now() });
      })
      .catch(() => undefined)
      .finally(() => {
        busy = false;
      });
  }, intervalMs);
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

interface RunArgs {
  session: SessionState;
  driver: DeviceDriver;
  auth: ResolvedToken | null;
  llmModel: string;
  emit: (event: RunEvent) => void;
}

export async function runAutomation(args: RunArgs): Promise<SessionState> {
  const { session, driver, auth, llmModel, emit } = args;

  session.status = "running";
  saveSession(session);
  emit({ type: "session", session });

  // Stream a near-live screen feed alongside the step run.
  const stopFrames = startLiveFrames(driver, emit);
  try {
  for (let i = 0; i < session.steps.length; i += 1) {
    const step = session.steps[i];
    session.currentStep = i;
    step.status = "running";
    step.startedAt = Date.now();
    emit({ type: "step", step });
    emit({ type: "session", session });
    emit({ type: "log", level: "info", message: `▶ Step ${i + 1}: ${step.description}`, at: Date.now() });

    try {
      await runStep({ step, driver, auth, llmModel, session, emit });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      step.status = "failed";
      step.message = message;
      emit({ type: "log", level: "error", message: `Step ${i + 1} failed: ${message}`, at: Date.now() });
    }

    step.finishedAt = Date.now();
    emit({ type: "step", step });
    emit({ type: "session", session });

    // Per-step result line in the session log (so the log covers the whole run,
    // not just the connection phase).
    const detail =
      step.action?.actionType === "setText"
        ? `typed "${step.action.text ?? ""}"`
        : step.action?.actionType ?? "";
    const target = step.selector?.mbl ? ` → ${step.selector.mbl}` : "";
    const captured = step.capturedText ? ` (captured: "${step.capturedText}")` : "";
    const note = step.message ? ` - ${step.message}` : "";
    // Surface whether the device accepted + applied the action.
    const device = step.outcome
      ? ` · device: ${step.outcome.dispatched ? "accepted" : "rejected"}, ${step.outcome.effect}`
      : "";
    const finalStatus: string = step.status;
    const level: "info" | "warn" | "error" =
      finalStatus === "passed" ? "info" : finalStatus === "failed" ? "error" : "warn";
    emit({
      type: "log",
      level,
      message: `Step ${i + 1} ${step.status}: ${detail}${target}${captured}${device}${note}`.trim(),
      at: Date.now(),
    });

    await delay(STEP_PAUSE_MS);
  }

  session.status = "completed";
  session.currentStep = session.steps.length;
  saveSession(session);
  emit({ type: "done", session });
  } finally {
    stopFrames();
  }

  try {
    await driver.quit();
  } catch {
    /* ignore */
  }

  return session;
}

async function runStep(ctx: {
  step: StepResult;
  driver: DeviceDriver;
  auth: ResolvedToken | null;
  llmModel: string;
  session: SessionState;
  emit: (event: RunEvent) => void;
}): Promise<void> {
  const { step, driver, auth, llmModel, session, emit } = ctx;

  step.beforeScreenshot = await driver.takeScreenshot();

  // Plan a single action against the given elements (LLM, else heuristic).
  const planOnce = async (els: UiElement[]): Promise<PlannedAction> => {
    if (auth) {
      try {
        const a = await planActionWithLlm(auth, {
          model: llmModel,
          step: step.description,
          elements: els,
          platform: driver.platform,
        });
        session.llmLive = true;
        if (isTargeted(a) && (a.targetIndex < 0 || a.targetIndex >= els.length)) {
          const fallback = planActionHeuristic(step.description, els);
          return { ...fallback, reason: a.reason || fallback.reason };
        }
        return a;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        emit({ type: "log", level: "warn", message: `LLM Gateway unavailable, using heuristic planner: ${message}`, at: Date.now() });
        return planActionHeuristic(step.description, els);
      }
    }
    return planActionHeuristic(step.description, els);
  };

  let elements = await driver.captureElements();
  let action = await planOnce(elements);

  // --- Resolve the step's target ------------------------------------------
  // The first read may miss the target: dynamic content (dialogs, SPA
  // hydration) can still be rendering, or the element is off-screen. The
  // target must also resolve to an element with a STABLE identifier - a
  // tag-only match (e.g. web <a> with no id/name/text) is a guess that would
  // hit the first such element and silently do the wrong thing.
  const scrollStep = isScrollStep(step.description);
  const resolvedTarget = (): UiElement | undefined => {
    if (action.targetIndex < 0 || action.targetIndex >= elements.length) return undefined;
    const el = elements[action.targetIndex];
    return hasIdentifier(el) ? el : undefined;
  };
  const unresolved = (): boolean => {
    if (isTargeted(action)) return !resolvedTarget();
    if (action.actionType === "swipe" && !scrollStep) return true;
    return false;
  };

  let tries = 0;
  while (unresolved() && tries < MAX_SEARCH_TRIES) {
    tries += 1;
    if (tries <= 2 && action.actionType !== "swipe") {
      // First, let dynamic content (dialogs / hydration) settle and re-read the
      // SAME screen - don't scroll away from a target that's about to appear.
      emit({
        type: "log",
        level: "info",
        message: `Target not ready - waiting for the screen to settle (${tries}/${MAX_SEARCH_TRIES})…`,
        at: Date.now(),
      });
      await delay(700);
    } else {
      // Then scroll to reveal genuinely off-screen targets.
      const dir = action.actionType === "swipe" ? action.direction ?? "up" : "up";
      emit({
        type: "log",
        level: "info",
        message: `Target not on screen - scrolling to find it (${tries}/${MAX_SEARCH_TRIES})…`,
        at: Date.now(),
      });
      await driver.swipe(dir);
    }
    elements = await driver.captureElements();
    action = await planOnce(elements);
  }

  step.action = action;
  step.reason = action.reason;
  emit({ type: "step", step });

  // A scroll-to-find swipe that survived the search means the target was never
  // located - that is NOT a passing step (the step's real action never ran).
  if (action.actionType === "swipe" && !scrollStep) {
    step.status = "needs-attention";
    step.message =
      "Could not locate the element this step refers to - scrolled but it never appeared on screen.";
    step.afterScreenshot = await driver.takeScreenshot();
    return;
  }

  // Verify steps: a "verify X is displayed" assertion is SCREEN-LEVEL, not just
  // "did some matched element exist". Use a strict semantic check so we don't
  // pass on a loosely-related element (e.g. a "Register For Account" link
  // confirming "the account dashboard is displayed"). LLM only; on any error we
  // fall through to the element-existence path below.
  if (action.actionType === "assertExists" && auth) {
    try {
      const vt0 = Date.now();
      const verdict = await verifyAssertion(auth, {
        model: llmModel,
        step: step.description,
        elements,
        platform: driver.platform,
      });
      step.reason = verdict.reason || step.reason;
      const confEl =
        verdict.targetIndex >= 0 && verdict.targetIndex < elements.length
          ? elements[verdict.targetIndex]
          : undefined;
      if (confEl) {
        step.element = confEl;
        step.selector = buildSelector(confEl);
        const shot = await driver.captureElementShot(step.selector);
        if (shot) step.elementShot = shot;
      }
      if (verdict.satisfied) {
        step.status = "passed";
      } else {
        step.status = "needs-attention";
        step.message = verdict.reason || "The current screen does not confirm this verification.";
      }
      step.outcome = {
        dispatched: true,
        effect: verdict.satisfied ? "applied" : "no-change",
        detail:
          verdict.reason ||
          (verdict.satisfied
            ? "The screen confirms the assertion."
            : "The screen does not confirm the assertion."),
        durationMs: Date.now() - vt0,
      };
      step.afterScreenshot = await driver.takeScreenshot();
      return;
    } catch (error) {
      emit({
        type: "log",
        level: "warn",
        message: `Verification check unavailable, using element existence: ${
          error instanceof Error ? error.message : String(error)
        }`,
        at: Date.now(),
      });
      // fall through to the element-existence path
    }
  }

  // A targeted step must resolve to a confidently-identified element. If the
  // best the planner could do is a tag-only guess, flag it - never tap a
  // random element (which silently does the wrong thing and gets stuck).
  if (isTargeted(action)) {
    const target = resolvedTarget();
    if (!target) {
      step.status = "needs-attention";
      step.message =
        "Could not confidently identify the element for this step - no on-screen element with a stable identifier matched it.";
      step.afterScreenshot = await driver.takeScreenshot();
      return;
    }
    const selector = buildSelector(target);
    step.element = target;
    step.selector = selector;
    // Capture a screenshot cropped to just this element (the "field" image).
    const shot = await driver.captureElementShot(selector);
    if (shot) step.elementShot = shot;
    await executeAction(driver, action, selector, step);
    step.afterScreenshot = await driver.takeScreenshot();
    return;
  }

  // Non-targeted action (a real scroll/swipe gesture step, or pressKey).
  await executeAction(driver, action, undefined, step);
  step.afterScreenshot = await driver.takeScreenshot();
}

// An element is a confident target only if it carries some stable identifier;
// a bare tag match would resolve to the first such element on the page.
function hasIdentifier(el: UiElement): boolean {
  const has = (s?: string) => Boolean(s && s.trim());
  return (
    has(el.text) ||
    has(el.contentDesc) ||
    has(el.resourceId) ||
    has(el.accessibilityId) ||
    has(el.name) ||
    has(el.htmlId) ||
    has(el.testId) ||
    has(el.ariaLabel) ||
    has(el.placeholder)
  );
}

function isTargeted(action: PlannedAction): boolean {
  return (
    action.actionType === "tap" ||
    action.actionType === "setText" ||
    action.actionType === "getText" ||
    action.actionType === "assertExists"
  );
}

// A step is genuinely a scroll/gesture step (so a swipe action satisfies it),
// vs a tap/type/verify step where a swipe is only a scroll-to-find attempt.
function isScrollStep(description: string): boolean {
  return /\b(scroll|swipe|slide|drag|fling|pull)\b/i.test(description);
}

async function executeAction(
  driver: DeviceDriver,
  action: PlannedAction,
  selector: MobileSelector | undefined,
  step: StepResult,
): Promise<void> {
  const needsTarget =
    action.actionType === "tap" ||
    action.actionType === "setText" ||
    action.actionType === "getText" ||
    action.actionType === "assertExists";

  if (needsTarget && !selector) {
    step.status = "needs-attention";
    step.message = "No matching element was found on screen for this step.";
    return;
  }

  const t0 = Date.now();
  switch (action.actionType) {
    case "tap": {
      const sigBefore = await driver.screenSignature();
      await withScrollRetry(driver, selector!, async () => {
        await driver.tap(selector!);
      }, step);
      if (step.status === "needs-attention") {
        step.outcome = {
          dispatched: false,
          effect: "no-change",
          detail: step.message || "The device could not perform the tap.",
          durationMs: Date.now() - t0,
        };
        break;
      }
      await delay(400); // give the screen a moment to react
      const sigAfter = await driver.screenSignature();
      const changed = Boolean(sigBefore) && sigBefore !== sigAfter;
      step.status = "passed";
      step.outcome = {
        dispatched: true,
        effect: changed ? "applied" : "no-change",
        detail: changed
          ? "Device accepted the tap and the screen changed."
          : "Device accepted the tap, but nothing on screen changed - the control may be disabled or the tap had no effect.",
        durationMs: Date.now() - t0,
      };
      break;
    }

    case "setText": {
      await driver.setText(selector!, action.text ?? "");
      const want = action.text ?? "";
      const got = await driver.getFieldValue(selector!);
      const applied = Boolean(want) && got.includes(want);
      step.status = "passed";
      step.outcome = {
        dispatched: true,
        effect: applied ? "applied" : got ? "no-change" : "unverified",
        detail: applied
          ? `Device accepted the input - the field now contains "${got}".`
          : got
            ? `Field contains "${got}" (expected "${want}").`
            : "Input sent, but the field could not be read back to confirm.",
        durationMs: Date.now() - t0,
      };
      break;
    }

    case "swipe":
      await driver.swipe(action.direction ?? "up");
      step.status = "passed";
      step.outcome = {
        dispatched: true,
        effect: "unverified",
        detail: `Sent a ${action.direction ?? "up"} swipe.`,
        durationMs: Date.now() - t0,
      };
      break;

    case "pressKey":
      await driver.pressKey(action.key ?? "BACK");
      step.status = "passed";
      step.outcome = {
        dispatched: true,
        effect: "unverified",
        detail: `Sent key "${action.key ?? "BACK"}".`,
        durationMs: Date.now() - t0,
      };
      break;

    case "getText": {
      step.capturedText = await driver.getText(selector!);
      step.status = "passed";
      step.outcome = {
        dispatched: true,
        effect: "applied",
        detail: `Read text: "${step.capturedText}".`,
        durationMs: Date.now() - t0,
      };
      break;
    }

    case "assertExists": {
      const present = await driver.exists(selector!);
      step.status = present ? "passed" : "needs-attention";
      if (!present) step.message = "Expected element was not present.";
      step.outcome = {
        dispatched: true,
        effect: present ? "applied" : "no-change",
        detail: present ? "Element is present on screen." : "Element was not found on screen.",
        durationMs: Date.now() - t0,
      };
      break;
    }

    default:
      step.status = "needs-attention";
      step.message = `Unsupported action: ${action.actionType}`;
  }
}

// One scroll-and-retry if the element isn't found - keeps the run resilient
// without breaking the "one action per step" contract.
async function withScrollRetry(
  driver: DeviceDriver,
  selector: MobileSelector,
  run: () => Promise<void>,
  step: StepResult,
): Promise<void> {
  try {
    await run();
  } catch (error) {
    const exists = await driver.exists(selector).catch(() => false);
    if (!exists) {
      await driver.swipe("up").catch(() => undefined);
      try {
        await run();
        return;
      } catch {
        step.status = "needs-attention";
        step.message =
          error instanceof Error ? `Could not interact: ${error.message}` : "Could not interact with element.";
        return;
      }
    }
    throw error;
  }
}
