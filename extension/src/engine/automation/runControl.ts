import type { UiElement } from "../types.js";

/**
 * Interactive control for a running session: stop it, pause it, pause
 * automatically when a step fails, and retry the paused step against an
 * element the operator picked themselves.
 *
 * One instance per run. The orchestrator polls it between steps and at the
 * pause points; the API layer mutates it from client commands.
 */
export type RetryChoice =
  | { kind: "retry"; targetIndex?: number } // re-run the step (optionally forcing an element)
  | { kind: "skip" } // accept the outcome and move on
  | { kind: "stop" };

export class RunControl {
  private stopRequested = false;
  private pauseRequested = false;
  /** Resolves when the operator resumes a pause. */
  private resumeWaiters: Array<(choice: RetryChoice) => void> = [];
  /**
   * A resume that arrived before the loop began waiting. The client can POST
   * resume in the window between the "paused" event being published and the
   * loop registering its waiter; without latching it here that signal is lost
   * and the run blocks forever.
   */
  private pendingChoice: RetryChoice | null = null;
  /** Elements from the step currently paused, so the UI can offer a choice. */
  candidates: UiElement[] = [];
  /** Pause the run whenever a step doesn't pass. On by default: a stalled step
   * is nearly always worth inspecting, and resuming is one click. */
  pauseOnFailure = true;
  /** True while the run is actually sitting at a pause point. */
  paused = false;

  stop(): void {
    this.stopRequested = true;
    // Release a pause so the loop can observe the stop.
    this.settle({ kind: "stop" });
  }

  requestPause(): void {
    this.pauseRequested = true;
  }

  /** Resume a pause, telling the loop what to do with the paused step. */
  resume(choice: RetryChoice): void {
    this.pauseRequested = false;
    if (this.resumeWaiters.length > 0) {
      this.settle(choice);
    } else {
      this.pendingChoice = choice; // latch it for the imminent pause
    }
  }

  private settle(choice: RetryChoice): void {
    const waiters = this.resumeWaiters;
    this.resumeWaiters = [];
    this.paused = false;
    for (const w of waiters) w(choice);
  }

  get stopped(): boolean {
    return this.stopRequested;
  }

  get pausePending(): boolean {
    return this.pauseRequested;
  }

  /**
   * Block until the operator resumes. Returns their choice; a stop resolves
   * immediately so the loop can unwind.
   */
  waitForResume(candidates: UiElement[] = []): Promise<RetryChoice> {
    if (this.stopRequested) return Promise.resolve({ kind: "stop" });
    if (this.pendingChoice) {
      const choice = this.pendingChoice;
      this.pendingChoice = null;
      this.paused = false;
      return Promise.resolve(choice);
    }
    this.candidates = candidates;
    this.paused = true;
    return new Promise<RetryChoice>((resolve) => {
      this.resumeWaiters.push(resolve);
    });
  }
}

const controls = new Map<string, RunControl>();

export function getRunControl(sessionId: string): RunControl {
  let c = controls.get(sessionId);
  if (!c) {
    c = new RunControl();
    controls.set(sessionId, c);
  }
  return c;
}

export function peekRunControl(sessionId: string): RunControl | undefined {
  return controls.get(sessionId);
}

export function disposeRunControl(sessionId: string): void {
  controls.delete(sessionId);
}
