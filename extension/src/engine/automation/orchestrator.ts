import type {
  MobileSelector,
  PlannedAction,
  RunEvent,
  SessionState,
  StepResult,
  StepStatus,
  UiElement,
} from "../types.js";
import type { DeviceDriver } from "./driver.js";
import { buildSelector } from "../workflow/selectors.js";
import { boundsCenter } from "./pageModel.js";
import { planActionHeuristic, planActionWithLlm, screenMatches, verifyAssertion } from "../uipath/planner.js";
import { getRunControl, type RetryChoice } from "./runControl.js";
import type { ResolvedToken } from "../uipath/auth.js";
import { saveSession } from "../store.js";
import { env } from "../config/env.js";

const STEP_PAUSE_MS = 650;
const MAX_SEARCH_TRIES = 4;
// "Verify / wait for X" steps: how many times to look for the element and how
// long to wait between attempts. Screens that arrive after a network call can
// take several seconds, so these are deliberately spaced rather than a tight poll.
const VERIFY_ATTEMPTS = 12;
const VERIFY_RETRY_MS = 5000;

/*
 * How long to wait for a guarded screen before deciding a condition is not met.
 *
 * These guards exist for dialogs that follow a network round-trip - "if the
 * upsell appears, dismiss it" - so the wait has to outlast the request. At 5s
 * this was a coin toss: the same script skipped the Xtra Savings pop-up on one
 * run and handled it on the next, and a skipped block leaves the modal up so
 * every later step fails against a covered screen.
 *
 * The cost of a longer wait is paid only when a condition genuinely does not
 * match, so it is bounded and predictable; the cost of being too short is a
 * run that fails for reasons that have nothing to do with the test.
 */
const CONDITION_WAIT_MS = 20_000;

function labelForLog(el: UiElement): string {
  return (
    el.text || el.contentDesc || el.accessibilityId || el.name || el.resourceId || el.htmlId ||
    el.placeholder || el.className || `element #${el.index}`
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/*
 * Android system permission dialogs.
 *
 * These belong to the OS, not the app under test, and they sit on top of it -
 * so while one is up, NOTHING of the app is on screen and every step fails
 * with "element not found" no matter how good its selector is. Android 13+
 * prompts for notifications on first launch, and `autoGrantPermissions` does
 * not cover it (verified on a real device: the dialog was still up 25s in,
 * with autoGrantPermissions set).
 *
 * Prompts also queue - notifications, then location - so dismissal repeats.
 */
const PERMISSION_DIALOG_MARKERS = [
  "permissioncontroller:id/",
  "packageinstaller:id/permission",
];

// Most-permissive-first: prefer a full grant, then a foreground/one-time grant,
// so a location prompt does not silently become "denied" and break the app.
const PERMISSION_ALLOW_IDS = [
  "com.android.permissioncontroller:id/permission_allow_button",
  "com.android.packageinstaller:id/permission_allow_button",
  "com.android.permissioncontroller:id/permission_allow_foreground_only_button",
  "com.android.permissioncontroller:id/permission_allow_one_time_button",
];

function isPermissionDialog(elements: UiElement[]): boolean {
  return elements.some((e) =>
    PERMISSION_DIALOG_MARKERS.some((m) => (e.resourceId ?? "").includes(m)),
  );
}

/**
 * Clear any stacked system permission dialogs and return the app's own screen.
 * Returns the elements to plan against - re-captured when a dialog was cleared.
 */
async function clearPermissionDialogs(
  driver: DeviceDriver,
  elements: UiElement[],
  emit: (event: RunEvent) => void,
  maxPrompts = 4,
): Promise<UiElement[]> {
  let current = elements;
  for (let i = 0; i < maxPrompts && isPermissionDialog(current); i += 1) {
    const allow = current.find((e) => PERMISSION_ALLOW_IDS.includes(e.resourceId ?? ""));
    if (!allow) {
      emit({
        type: "log",
        level: "warn",
        message:
          "A system permission dialog is on screen but its Allow button was not found - the app is blocked behind it.",
        at: Date.now(),
      });
      return current;
    }
    const prompt = current.find((e) => (e.resourceId ?? "").endsWith("permission_message"))?.text;
    emit({
      type: "log",
      level: "info",
      message: `Android permission dialog${prompt ? ` - "${prompt}"` : ""}: tapping "${
        allow.text || "Allow"
      }" so the app is reachable.`,
      at: Date.now(),
    });
    try {
      await driver.tap(buildSelector(allow, current));
    } catch (error) {
      emit({
        type: "log",
        level: "warn",
        message: `Could not dismiss the permission dialog: ${
          error instanceof Error ? error.message : String(error)
        }`,
        at: Date.now(),
      });
      return current;
    }
    await delay(1200);
    current = await driver.captureElements();
  }
  return current;
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
  // Replay: each step already carries the action + selector captured on a
  // previous run, so skip planning entirely and just execute them.
  replay?: boolean;
}

export async function runAutomation(args: RunArgs): Promise<SessionState> {
  const { session, driver, auth, llmModel, emit, replay = false } = args;
  const control = getRunControl(session.id);

  session.status = "running";
  saveSession(session);
  emit({ type: "session", session });

  // Stream a near-live screen feed alongside the step run.
  const stopFrames = startLiveFrames(driver, emit);
  try {
  // Guard results per conditional group, so a block's condition is evaluated
  // once and every step in it follows that verdict.
  const groupVerdict = new Map<number, boolean>();

  for (let i = 0; i < session.steps.length; i += 1) {
    const step = session.steps[i];
    session.currentStep = i;

    // --- Conditional block: evaluate the guard against the live screen ------
    if (step.condition) {
      const key = step.conditionGroup ?? -1;
      if (!groupVerdict.has(key)) {
        // Poll briefly: guarded screens are usually dialogs that appear a beat
        // after the previous action, so a single capture would miss them and
        // wrongly skip the block.
        let met = false;
        const deadline = Date.now() + CONDITION_WAIT_MS;
        for (;;) {
          try {
            met = screenMatches(step.condition, await driver.captureElements());
          } catch {
            met = false; // couldn't read the screen
          }
          if (met || Date.now() >= deadline) break;
          await delay(600);
        }
        groupVerdict.set(key, met);
        emit({
          type: "log",
          level: "info",
          message: met
            ? `✓ Condition met (${step.condition}) - running the guarded steps.`
            : `⤳ Condition not met (${step.condition}) - skipping the guarded steps.`,
          at: Date.now(),
        });
      }
      if (!groupVerdict.get(key)) {
        step.status = "skipped";
        step.message = `Skipped: condition not met (${step.condition}).`;
        emit({ type: "step", step });
        emit({ type: "session", session });
        continue;
      }
    }

    // --- Stop requested: end the run here, keeping what we captured ---------
    if (control.stopped) {
      emit({ type: "log", level: "warn", message: "■ Stopped by the operator.", at: Date.now() });
      break;
    }

    // --- Pause requested between steps -------------------------------------
    if (control.pausePending) {
      const choice = await pauseHere(session, step, [], "Paused by the operator.", control, emit, driver);
      if (choice.kind === "stop") break;
    }

    step.status = "running";
    step.startedAt = Date.now();
    emit({ type: "step", step });
    emit({ type: "session", session });
    emit({ type: "log", level: "info", message: `▶ Step ${i + 1}: ${step.description}`, at: Date.now() });

    // Run the step; if it doesn't pass and pause-on-failure is on, hold here
    // and let the operator retry it (optionally against a chosen element).
    let forceElement: UiElement | undefined;
    let forceContext: UiElement[] | undefined;
    for (;;) {
      try {
        await runStep({ step, driver, auth, llmModel, session, emit, replay, forceElement, forceContext });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        step.status = "failed";
        step.message = message;
        emit({ type: "log", level: "error", message: `Step ${i + 1} failed: ${message}`, at: Date.now() });
      }

      const outcome = step.status as StepStatus;
      const failed = outcome === "failed" || outcome === "needs-attention";
      if (!failed || !control.pauseOnFailure || control.stopped) break;

      // Clear any OS permission dialog first: otherwise the operator is asked
      // to choose from the dialog's buttons rather than the app's own screen,
      // and whatever they pick cannot be found once the dialog goes away.
      const candidates = await driver
        .captureElements()
        .then((els) => clearPermissionDialogs(driver, els, emit))
        .catch(() => [] as UiElement[]);
      const choice = await pauseHere(
        session,
        step,
        candidates,
        step.message || `Step ${i + 1} did not pass.`,
        control,
        emit,
        driver,
      );
      if (choice.kind === "stop" || choice.kind === "skip") break;
      // Resolve against the exact list the operator picked from.
      forceContext = candidates;
      forceElement =
        choice.targetIndex != null ? candidates[choice.targetIndex] : undefined;
      step.status = "running";
      step.message = undefined;
      emit({ type: "step", step });
      emit({
        type: "log",
        level: "info",
        message: `↻ Retrying step ${i + 1}${forceElement ? ` on "${labelForLog(forceElement)}"` : ""}…`,
        at: Date.now(),
      });
    }
    if (control.stopped) {
      emit({ type: "log", level: "warn", message: "■ Stopped by the operator.", at: Date.now() });
      break;
    }

    // An `Optional:` step that couldn't find its target is a skip, not a
    // problem to report - that's the whole point of marking it optional.
    // (widened: runStep mutates step.status, which TS can't narrow through)
    const settled = step.status as StepStatus;
    if (step.optional && (settled === "needs-attention" || settled === "failed")) {
      step.status = "skipped";
      step.message = "Skipped: optional step, target not on screen.";
      emit({
        type: "log",
        level: "info",
        message: `⤳ Optional step skipped (not on screen): ${step.description}`,
        at: Date.now(),
      });
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

/**
 * Hold the run at a pause point: publish the paused state (with the elements
 * on screen so the UI can offer a target) and wait for the operator.
 */
/**
 * How often to touch the device while a run is paused.
 *
 * Appium closes a session that receives no commands for `newCommandTimeout`.
 * A person reading a candidate list and deciding takes minutes, so without
 * this the session is reaped mid-decision and EVERY later step fails with
 * "Unable to find the session info for particular sessionId" - which reads as
 * a selector fault and is impossible to diagnose from the UI. Observed for
 * real: a 7m42s pause killed the session, and the operator's retry then
 * reported a plainly visible control as gone.
 */
const PAUSE_KEEPALIVE_MS = 60_000;

async function pauseHere(
  session: SessionState,
  step: StepResult,
  candidates: UiElement[],
  reason: string,
  control: ReturnType<typeof getRunControl>,
  emit: (event: RunEvent) => void,
  driver?: DeviceDriver,
): Promise<RetryChoice> {
  const previous = session.status;
  session.status = "paused";
  saveSession(session);
  emit({ type: "session", session });
  emit({ type: "paused", step, candidates, reason });
  emit({ type: "log", level: "warn", message: `⏸ ${reason} Waiting for the operator…`, at: Date.now() });

  // Cheapest command that still counts as activity.
  const keepalive = driver
    ? setInterval(() => {
        void driver.screenSignature().catch(() => undefined);
      }, PAUSE_KEEPALIVE_MS)
    : undefined;

  let choice: RetryChoice;
  try {
    choice = await control.waitForResume(candidates);
  } finally {
    if (keepalive) clearInterval(keepalive);
  }

  session.status = previous === "paused" ? "running" : previous;
  saveSession(session);
  emit({ type: "resumed" });
  emit({ type: "session", session });
  return choice;
}

async function runStep(ctx: {
  step: StepResult;
  driver: DeviceDriver;
  auth: ResolvedToken | null;
  llmModel: string;
  session: SessionState;
  emit: (event: RunEvent) => void;
  replay?: boolean;
  // The operator picked this element from the paused step's candidates. Carry
  // the ELEMENT, not its index: the retry re-reads the screen and the tree can
  // shift, so an index from the old snapshot may point at something else.
  forceElement?: UiElement;
  forceContext?: UiElement[];
}): Promise<void> {
  const { step, driver, auth, llmModel, session, emit, replay, forceElement, forceContext } = ctx;

  step.beforeScreenshot = await driver.takeScreenshot();

  // --- Replay: execute the recorded action/selector, no screen read, no LLM.
  if (replay && step.action) {
    const started = Date.now();
    const targeted = isTargeted(step.action);
    if (targeted && !step.selector) {
      step.status = "needs-attention";
      step.message = "No selector was recorded for this step - nothing to replay.";
      return;
    }
    await executeAction(driver, step.action, step.selector, step);
    step.afterScreenshot = await driver.takeScreenshot();
    step.status = "passed";
    step.outcome = {
      dispatched: true,
      effect: "unverified",
      detail: `replayed in ${Date.now() - started}ms`,
      durationMs: Date.now() - started,
    };
    emit({
      type: "log",
      level: "info",
      message: `↻ replayed ${step.action.actionType}${step.selector ? ` → ${step.selector.mbl}` : ""} (${Date.now() - started}ms)`,
      at: Date.now(),
    });
    return;
  }

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
  // An OS permission dialog covers the app entirely, so clear it before
  // planning - otherwise the planner reasons about the dialog, not the app.
  elements = await clearPermissionDialogs(driver, elements, emit);
  let action = await planOnce(elements);

  /*
   * The planner reports "I cannot find the target" as an assertExists whose
   * message says the control is missing. Taken at face value that turns an
   * instruction into an observation: "Enter X into the Name on Card field"
   * becomes "check the Name on Card field exists", fails, and never tries.
   *
   * The step text is unambiguous about intent, so restore it. Only assertExists
   * is reconsidered, and only when the wording clearly asks for something else,
   * so a real "Wait for X to appear" - where both agree - is untouched.
   */
  if (action.actionType === "assertExists" && !isWaitStep(step.description)) {
    const intent = planActionHeuristic(step.description, elements);
    /*
     * The leading verb decides. "Tap 'Enter CVV' button" is a tap on a control
     * whose LABEL happens to contain a typing word - read as a setText it would
     * type the literal "Enter CVV" into whatever field it found, which is
     * exactly what nearly happened on the card form.
     */
    if (/^\s*(tap|click|press|touch|select|choose|tick|check|toggle)\b/i.test(step.description)) {
      intent.actionType = "tap";
      intent.text = undefined;
    }
    if (intent.actionType !== "assertExists") {
      emit({
        type: "log",
        level: "info",
        message: `The planner reported the target missing; the step asks to ${
          intent.actionType === "setText" ? "type" : intent.actionType
        }, so that is what will be attempted.`,
        at: Date.now(),
      });
      action = {
        ...action,
        actionType: intent.actionType,
        text: intent.text ?? action.text,
        direction: intent.direction ?? action.direction,
        key: intent.key ?? action.key,
      };
    }
  }

  // Operator override: keep the planned action type/text, but target exactly
  // the element they picked (resolved from the snapshot they were shown).
  if (forceElement) {
    elements = forceContext && forceContext.length ? forceContext : elements;
    const at = elements.findIndex((e) => e.index === forceElement.index);

    /*
     * When the planner cannot find a target it reports the fact, which comes
     * back as an assertExists ("There is no 'Add New Card' button visible").
     * Inheriting that verdict made an operator's pick do nothing: the step
     * merely re-checked that the chosen element exists and never touched it.
     *
     * Picking a target on a step that asks for an interaction IS the intent to
     * interact, so re-derive the action from the step text. Only assertExists
     * is overridden - a correctly planned tap/setText/swipe is left alone.
     */
    if (action.actionType === "assertExists") {
      const intent = planActionHeuristic(step.description, elements);
      if (intent.actionType !== "assertExists") {
        emit({
          type: "log",
          level: "info",
          message: `The planner had reported the target missing; the step asks to ${intent.actionType === "setText" ? "type" : intent.actionType}, so performing that on the chosen element.`,
          at: Date.now(),
        });
        action = {
          ...action,
          actionType: intent.actionType,
          text: intent.text ?? action.text,
          direction: intent.direction ?? action.direction,
          key: intent.key ?? action.key,
        };
      }
    }

    action = {
      ...action,
      targetIndex: at >= 0 ? at : forceElement.index,
      reason: `Target chosen by the operator: ${labelForLog(forceElement)}.`,
      confidence: 1,
    };
    emit({ type: "log", level: "info", message: action.reason, at: Date.now() });
  }

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
    // The identifier rule exists to stop the PLANNER acting on a guess. An
    // operator pointing at a specific control is not guessing, and the controls
    // that most need pointing at - a web-view input, a bare ViewGroup - are
    // exactly the ones carrying no identifier. Their position is acted on
    // instead, further down.
    if (forceElement) return el;
    return hasIdentifier(el) ? el : undefined;
  };
  const unresolved = (): boolean => {
    if (isTargeted(action)) return !resolvedTarget();
    if (action.actionType === "swipe" && !scrollStep) return true;
    return false;
  };

  /*
   * An operator's pick is the answer, not a suggestion.
   *
   * The search below re-reads the screen and RE-PLANS, which would throw the
   * choice away and go back to whatever the planner thinks. Worse, a field with
   * no identifier never counts as "resolved", so choosing one sent the run into
   * settle-and-scroll and then failed - after the operator had already pointed
   * straight at it. When a target has been chosen, act on that target.
   */
  let tries = forceElement ? MAX_SEARCH_TRIES : 0;
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

  // Verify steps get their own spaced retries: if the element isn't in the
  // captured tree yet, re-read the whole screen rather than giving up.
  if (action.actionType === "assertExists" && unresolved()) {
    for (let attempt = 2; attempt <= VERIFY_ATTEMPTS && unresolved(); attempt += 1) {
      emit({
        type: "log",
        level: "info",
        message: `Not on screen yet - re-checking in ${VERIFY_RETRY_MS / 1000}s (attempt ${attempt}/${VERIFY_ATTEMPTS})…`,
        at: Date.now(),
      });
      await delay(VERIFY_RETRY_MS);
      elements = await driver.captureElements();
      action = await planOnce(elements);
    }
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
        step.selector = buildSelector(confEl, elements);
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
    let target = resolvedTarget();

    /*
     * A form whose inputs carry no identifier defeats the planner: every field
     * is an indistinguishable EditText, so none can be "confidently
     * identified" and the step stalls. The step itself says which one it
     * means - "into the 'Name on Card' field" - so find that caption on screen
     * and take the field beside it.
     *
     * Without this, three card fields resolved to whatever was nearest after
     * the last tap: the card number and the expiry both went into the SAME
     * input, silently overwriting each other.
     */
    if (!target && action.actionType === "setText") {
      const name = fieldNameFromStep(step.description);
      const caption = name ? captionFor(name, elements) : undefined;
      const input = caption ? inputForLabel(caption, elements) : undefined;
      if (input) {
        emit({
          type: "log",
          level: "info",
          message: `No input here carries an identifier, so "${name}" was matched to its caption and the field beside it will be used.`,
          at: Date.now(),
        });
        target = input;
      }
    }

    if (!target) {
      step.status = "needs-attention";
      step.message =
        "Could not confidently identify the element for this step - no on-screen element with a stable identifier matched it.";
      step.afterScreenshot = await driver.takeScreenshot();
      return;
    }
    /*
     * Typing needs an input, not a caption. If the target cannot take text,
     * redirect to the field it labels - that is what "enter X into the Name on
     * Card field" means, whether the caption was chosen by the planner (which
     * only targets elements carrying an identifier, and a bare EditText carries
     * none) or by an operator reading the same list.
     */
    if (action.actionType === "setText" && !isEditableElement(target)) {
      const input = inputForLabel(target, elements);
      if (input) {
        emit({
          type: "log",
          level: "info",
          message: `"${labelForLog(target)}" is a label, not an input - typing into the field beside it instead.`,
          at: Date.now(),
        });
        target = input;
      }
    }

    const selector = buildSelector(target, elements);
    step.element = target;
    step.selector = selector;

    /*
     * A field with no id, description or text - the shape web-view forms use -
     * cannot be singled out by any selector: its class alone matches every
     * other input on the form. Focus it by position, then type as key events,
     * which land wherever the caret is.
     */
    if (
      action.actionType === "setText" &&
      isEditableElement(target) &&
      !hasIdentifier(target) &&
      driver.target === "app"
    ) {
      /*
       * The soft keyboard resizes the form, so coordinates read while it was up
       * point at the wrong row once it closes - on a card form that silently
       * typed the card number into the name field. Close it FIRST, re-read the
       * screen, and use the position the field has with the keyboard down.
       */
      await driver.dismissKeyboard().catch(() => undefined);
      await delay(600);
      const settled = await driver.captureElements().catch(() => elements);
      const here = settled.find((e) => sameElement(e, target)) ?? target;
      const centre = centreOf(here);
      if (centre) {
        const text = action.text ?? "";
        emit({
          type: "log",
          level: "info",
          message: `This input carries no identifier, so focusing it at (${centre.x}, ${centre.y}) and typing "${text}".`,
          at: Date.now(),
        });
        const t0 = Date.now();
        await driver.tapAt(centre.x, centre.y);
        await delay(500);
        await driver.typeIntoFocused(text);
        // Leave the keyboard down so the next step sees the same layout this
        // one measured, and so the button under the form stays reachable.
        await driver.dismissKeyboard().catch(() => undefined);
        await delay(400);
        step.status = "passed";
        step.outcome = {
          dispatched: true,
          effect: "unverified",
          detail: `Focused the field at (${centre.x}, ${centre.y}) and typed "${text}".`,
          durationMs: Date.now() - t0,
        };
        step.afterScreenshot = await driver.takeScreenshot();
        return;
      }
    }

    /*
     * A control carrying no identifier cannot be reached by any selector - its
     * class alone matches every sibling, so the driver acts on the first one
     * rather than this one (on a real screen, 15 of them). Its POSITION is
     * unambiguous, so tap that, and do it before any selector work: the
     * chosen element is the answer, so nothing should re-validate it.
     */
    if (action.actionType === "tap" && !hasIdentifier(target) && driver.target === "app") {
      const centre = centreOf(target);
      if (centre) {
        emit({
          type: "log",
          level: "info",
          message: `"${labelForLog(target)}" carries no identifier, so tapping its position (${centre.x}, ${centre.y}).`,
          at: Date.now(),
        });
        const t0 = Date.now();
        await driver.tapAt(centre.x, centre.y);
        step.status = "passed";
        step.outcome = {
          dispatched: true,
          effect: "applied",
          detail: `Tapped at (${centre.x}, ${centre.y}).`,
          durationMs: Date.now() - t0,
        };
        step.afterScreenshot = await driver.takeScreenshot();
        return;
      }
    }

    /*
     * An operator-chosen target came from a snapshot taken when the run paused,
     * and the screen can move on in the meantime (a modal auto-dismisses, a
     * toast disappears). So the selector is checked first.
     *
     * But "the selector did not resolve" is NOT the same as "the element is
     * gone", and conflating them produced the worst failure this tool had:
     * telling the operator the control they could plainly see was "no longer on
     * screen". So when the selector misses, look for the same element in a
     * FRESH capture. If it is still there, the selector is at fault, not the
     * screen - tap its position, which cannot be misbuilt. Only when the
     * element is really absent is the step failed, and then the message says so
     * truthfully.
     */
    if (forceElement && !(await driver.exists(selector))) {
      const label = labelForLog(forceElement);
      const fresh = await driver.captureElements().catch(() => [] as UiElement[]);
      const still = fresh.find((e) => sameElement(e, forceElement));
      const centre = still ? boundsCenter(still.bounds) : null;

      if (still && centre && action.actionType === "tap" && driver.target === "app") {
        emit({
          type: "log",
          level: "warn",
          message: `"${label}" is on screen but its selector (${selector.strategy}: ${selector.locator}) did not resolve - tapping its position (${centre.x}, ${centre.y}) instead.`,
          at: Date.now(),
        });
        const t0 = Date.now();
        await driver.tapAt(centre.x, centre.y);
        step.status = "passed";
        step.outcome = {
          dispatched: true,
          effect: "applied",
          detail: `Selector did not resolve; tapped at (${centre.x}, ${centre.y}).`,
          durationMs: Date.now() - t0,
        };
        step.afterScreenshot = await driver.takeScreenshot();
        return;
      }

      step.status = "needs-attention";
      step.message = still
        ? `"${label}" is on screen but neither its selector (${selector.strategy}: ${selector.locator}) nor its position could be used.`
        : `"${label}" is no longer on screen - it changed while the run was paused. Pick again from the current screen.`;
      step.outcome = {
        dispatched: false,
        effect: "no-change",
        detail: step.message,
        durationMs: 0,
      };
      emit({ type: "log", level: "warn", message: step.message, at: Date.now() });
      step.afterScreenshot = await driver.takeScreenshot();
      return;
    }

    // Capture a screenshot cropped to just this element (the "field" image).
    const shot = await driver.captureElementShot(selector);
    if (shot) step.elementShot = shot;

    await executeAction(driver, action, selector, step, emit);
    step.afterScreenshot = await driver.takeScreenshot();
    return;
  }

  // Non-targeted action (a real scroll/swipe gesture step, or pressKey).
  await executeAction(driver, action, undefined, step, emit);
  step.afterScreenshot = await driver.takeScreenshot();
}

/**
 * Is this step genuinely an assertion - "wait for X", "verify X is displayed"?
 *
 * Distinguishes a step that MEANS to check from one the planner merely reported
 * as unfindable, so only the latter has its action reconsidered.
 */
function isWaitStep(description: string): boolean {
  return /\b(wait|verify|assert|confirm|check|should\s+(be|see)|is\s+displayed|appears?)\b/i.test(
    description,
  );
}

/** Can text be typed into this element? */
function isEditableElement(el: UiElement): boolean {
  const tag = (el.tag || el.className || "").toLowerCase();
  return (
    tag.endsWith(".edittext") ||
    tag === "input" ||
    tag === "textarea" ||
    /edit|textfield|searchfield|textbox/i.test(el.className || "")
  );
}

function centreOf(el: UiElement): { x: number; y: number } | null {
  return boundsCenter(el.bounds);
}

/**
 * The field name a step names: "Enter X into the 'Name on Card' field".
 *
 * On a form whose inputs carry no identifier, this is the ONLY thing that says
 * which of them the step means - the inputs are mutually indistinguishable, so
 * position alone would just pick the nearest one to wherever the last tap left
 * the screen.
 */
function fieldNameFromStep(description: string): string | undefined {
  const quoted = description.match(/into\s+(?:a\s+|the\s+)?['"]([^'"]+)['"]/i);
  if (quoted) return quoted[1].trim();
  const plain = description.match(/into\s+(?:a\s+|the\s+)?(.+?)\s+field\b/i);
  if (plain) return plain[1].replace(/['"]/g, "").trim();
  return undefined;
}

/** The on-screen caption for that field name, if one is showing. */
function captionFor(name: string, all: UiElement[]): UiElement | undefined {
  // Captions are commonly decorated - "Name on Card *", "Email Address," - so
  // compare on letters and digits only.
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const want = norm(name);
  if (!want) return undefined;
  let loose: UiElement | undefined;
  for (const el of all) {
    for (const value of [el.text, el.contentDesc, el.accessibilityId]) {
      if (!value) continue;
      const got = norm(value);
      if (got === want) return el;
      if (!loose && (got.includes(want) || want.includes(got)) && got.length > 3) loose = el;
    }
  }
  return loose;
}

/**
 * The input a label belongs to.
 *
 * Web-view forms expose the value field as a bare EditText with no id, no
 * description and no text, while the caption beside it is a separate View that
 * DOES carry text. Targeting needs an identifier, so both the planner and an
 * operator reading the candidate list land on the caption - and typing into a
 * caption fails with "Cannot set the element to …".
 *
 * The field is whichever editable element sits closest to the label, measured
 * between bounds centres. Order in the tree is not relied on: this app emits
 * the input BEFORE its caption, other apps do the reverse.
 */
function inputForLabel(label: UiElement, all: UiElement[]): UiElement | undefined {
  const from = centreOf(label);
  if (!from) return undefined;
  let best: { el: UiElement; distance: number } | undefined;
  for (const el of all) {
    if (el.index === label.index || !isEditableElement(el)) continue;
    const to = centreOf(el);
    if (!to) continue;
    // Vertical distance dominates: a form is a column, and the caption for a
    // field is far nearer to it than to the next field along.
    const distance = Math.abs(to.y - from.y) * 3 + Math.abs(to.x - from.x);
    if (!best || distance < best.distance) best = { el, distance };
  }
  return best?.el;
}

/**
 * Is this the same on-screen control as `ref`, in a capture taken later?
 *
 * Indices shift between captures, so identity is compared on the attributes the
 * app controls. Used to tell "the selector failed" apart from "the element is
 * gone" when an operator-chosen target does not resolve.
 */
function sameElement(candidate: UiElement, ref: UiElement): boolean {
  const same = (a?: string, b?: string) => (a ?? "") === (b ?? "");
  return (
    same(candidate.resourceId, ref.resourceId) &&
    same(candidate.contentDesc, ref.contentDesc) &&
    same(candidate.text, ref.text) &&
    same(candidate.className, ref.className)
  );
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
  // Optional so callers that don't stream (replay) can omit it.
  emit?: (event: RunEvent) => void,
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
      /*
       * Close the soft keyboard after every entry.
       *
       * It covers the lower third of the screen, so whatever the next step
       * needs - the button under the form, the next field down - is either
       * hidden or reported at a position that shifts the moment it closes. On
       * the card form that put the card number into the name field and left
       * "Add Card" unreachable. The read-back above happens first, since the
       * field has to be inspected while it is still focused.
       */
      await driver.dismissKeyboard().catch(() => undefined);
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
      // Spaced retries so a screen that renders late still passes, and each
      // attempt is visible in the log rather than one silent long poll.
      let present = false;
      for (let attempt = 1; attempt <= VERIFY_ATTEMPTS; attempt += 1) {
        present = await driver.exists(selector!);
        if (present) {
          if (attempt > 1) {
            emit?.({
              type: "log",
              level: "info",
              message: `Found on attempt ${attempt}/${VERIFY_ATTEMPTS}.`,
              at: Date.now(),
            });
          }
          break;
        }
        if (attempt < VERIFY_ATTEMPTS) {
          emit?.({
            type: "log",
            level: "info",
            message: `Not present (attempt ${attempt}/${VERIFY_ATTEMPTS}) - retrying in ${VERIFY_RETRY_MS / 1000}s…`,
            at: Date.now(),
          });
          await delay(VERIFY_RETRY_MS);
        }
      }
      step.status = present ? "passed" : "needs-attention";
      if (!present) step.message = "Expected element was not present.";
      step.outcome = {
        dispatched: true,
        effect: present ? "applied" : "no-change",
        detail: present
          ? "Element is present on screen."
          : `Element did not appear after ${VERIFY_ATTEMPTS} attempts ${VERIFY_RETRY_MS / 1000}s apart.`,
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
      // The soft keyboard commonly covers the button below a field it just
      // filled, and scrolling won't reveal it - close it and retry first.
      await driver.dismissKeyboard().catch(() => undefined);
      try {
        await run();
        return;
      } catch {
        /* still not reachable - fall through to scrolling */
      }
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
