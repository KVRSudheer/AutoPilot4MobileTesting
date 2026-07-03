import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Camera,
  CheckCircle2,
  CircleDot,
  Loader2,
  RotateCcw,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import type { ActionOutcome, RunStatus, SessionState, StepResult, StepStatus } from "../../lib/types";
import { useRunStream } from "../../lib/sse";
import { BrowserFrame, Button, Card, Eyebrow, Pill } from "../ui";

export function RunStep({
  session,
  onBack,
  onViewWorkflow,
  onStatus,
  onRerun,
}: {
  session: SessionState | null;
  onBack: () => void;
  onViewWorkflow: () => void;
  onStatus?: (status: RunStatus) => void;
  onRerun?: () => void;
}) {
  const { session: live, steps, logs, finished, error, liveFrame } = useRunStream(session?.id ?? null);
  const current = live ?? session;
  const logRef = useRef<HTMLDivElement>(null);
  // Which step's screenshot to show. null = auto-follow the running/last step.
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [logs.length]);

  // Reset the manual selection whenever a new session starts.
  useEffect(() => {
    setSelectedIdx(null);
  }, [session?.id]);

  // Roll up live status for the workspace nav.
  const passedCount = steps.filter((s) => s.status === "passed").length;
  const attentionCount = steps.filter(
    (s) => s.status === "needs-attention" || s.status === "failed",
  ).length;
  const runState: RunStatus["state"] = error
    ? "error"
    : finished
      ? "done"
      : current?.status === "running"
        ? "running"
        : "connecting";
  useEffect(() => {
    onStatus?.({ state: runState, passed: passedCount, attention: attentionCount, total: steps.length });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runState, passedCount, attentionCount, steps.length]);

  if (!session) {
    return (
      <Card className="p-8 text-center text-sm text-[#667880] dark:text-[#9aabb4]">
        No active session. Go back and launch a run.
      </Card>
    );
  }

  const runningStep = steps.find((s) => s.status === "running");
  const passed = steps.filter((s) => s.status === "passed").length;
  const attention = steps.filter((s) => s.status === "needs-attention" || s.status === "failed").length;

  // Browser frame follows the running step (or last with a shot) unless the
  // user clicked a specific step to inspect it.
  const followIdx = runningStep?.index ?? lastShotIdx(steps);
  const shownIdx = selectedIdx ?? followIdx;
  const shownStep = shownIdx != null ? steps.find((s) => s.index === shownIdx) : undefined;
  // Live mode: not finished, not inspecting a specific step, and a fresh frame
  // is streaming - show the live feed instead of the last step snapshot.
  const liveMode = selectedIdx == null && !finished && Boolean(liveFrame);
  const shownShot = liveMode
    ? liveFrame!
    : shownStep?.afterScreenshot || shownStep?.beforeScreenshot || pickScreenshot(steps);
  const shownPhase = shownStep?.afterScreenshot ? "after" : "before";

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <span className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-[#182128] dark:bg-[#22303a] text-[#FA4616]">
              <Bot className="h-5 w-5" />
              {!finished ? (
                <span className="live-dot absolute inset-0 rounded-2xl" aria-hidden />
              ) : null}
            </span>
            <div>
              <Eyebrow>Step 3 · Automation</Eyebrow>
              <h2 className="text-xl font-semibold text-[#182128] dark:text-[#e6edf1]">
                {finished ? "Run complete" : "Agent is driving the browser..."}
              </h2>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone="blue">Local browser</Pill>
            <Pill tone={current?.llmLive ? "emerald" : "grey"}>
              {current?.llmLive ? "UiPath LLM Gateway" : "Heuristic planner"}
            </Pill>
            <Pill tone="navy">{current?.browserLabel || "Desktop browser"}</Pill>
            <Pill tone="slate">{current?.browser?.startUrl || "Desktop web"}</Pill>
            <Pill tone="navy">{current?.llmModel}</Pill>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <Pill tone="emerald">{passed} passed</Pill>
          {attention > 0 ? <Pill tone="amber">{attention} need attention</Pill> : null}
          <Pill tone="grey">
            {Math.min(current?.currentStep ?? 0, steps.length)} / {steps.length}
          </Pill>
        </div>
      </Card>

      {error ? (
        <div className="flex items-center gap-2 rounded-2xl border border-[#ffd0d6] dark:border-[#4a242b] bg-[#fff0f2] dark:bg-[#2c1519] px-4 py-3 text-sm text-[#c0334b] dark:text-[#ff7d8a]">
          <XCircle className="h-4 w-4" />
          {error}
        </div>
      ) : null}

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <Card className="flex shrink-0 flex-col items-center p-5 lg:w-auto">
          <BrowserFrame
            src={shownShot}
            busy={!finished && !shownShot}
            placeholder={
              `Starting local ${current?.browserLabel || "desktop browser"}...`
            }
            caption={
              liveMode
                ? runningStep
                  ? `● Live · running step ${runningStep.index + 1}`
                  : "● Live"
                : shownStep
                  ? `Step ${shownStep.index + 1} · ${shownPhase}${
                      selectedIdx == null && runningStep ? " (live)" : ""
                    }`
                  : finished
                    ? "Final screen"
                    : "Live view"
            }
          />
          {selectedIdx != null ? (
            <button
              type="button"
              onClick={() => setSelectedIdx(null)}
              className="mt-1 text-xs font-semibold text-[#FA4616] hover:underline"
            >
              ← Back to live view
            </button>
          ) : null}
        </Card>

        <Card className="min-w-0 flex-1 p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-[#667880] dark:text-[#9aabb4]">
              Agent activity
            </h3>
            <span className="text-xs text-[#9aa7ad] dark:text-[#71808a]">Click a step to view its screen</span>
          </div>
          <div className="grid gap-3">
            {steps.map((step) => (
              <ActivityRow
                key={step.index}
                step={step}
                selected={shownIdx === step.index}
                onSelect={() => setSelectedIdx(step.index)}
              />
            ))}
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-[#667880] dark:text-[#9aabb4]">
          Session log
        </h3>
        <div
          ref={logRef}
          className="scrollbar-thin max-h-[420px] min-h-[180px] overflow-y-auto rounded-2xl bg-[#0f161b] p-4 font-mono text-[13px] leading-7 text-[#cfd8dc] dark:text-[#9aabb4]"
        >
          {logs.length === 0 ? (
            <span className="text-[#667880] dark:text-[#9aabb4]">Connecting…</span>
          ) : (
            logs.map((line, i) => (
              <div key={i} className="flex gap-2">
                <span
                  className={
                    line.level === "error"
                      ? "text-[#ff8a80]"
                      : line.level === "warn"
                        ? "text-[#ffd180]"
                        : "text-[#80cbc4]"
                  }
                >
                  ●
                </span>
                <span>{line.message}</span>
              </div>
            ))
          )}
        </div>
      </Card>

      <div className="flex items-center justify-between">
        <Button variant="secondary" onClick={onBack} disabled={!finished && !error}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <div className="flex items-center gap-2">
          {onRerun && (finished || error) ? (
            <Button variant="secondary" onClick={onRerun}>
              <RotateCcw className="h-4 w-4" />
              Re-run
            </Button>
          ) : null}
          <Button onClick={onViewWorkflow} disabled={!finished}>
            View generated workflow
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function pickScreenshot(steps: StepResult[]): string | undefined {
  for (let i = steps.length - 1; i >= 0; i -= 1) {
    const s = steps[i];
    if (s.afterScreenshot) return s.afterScreenshot;
    if (s.beforeScreenshot) return s.beforeScreenshot;
  }
  return undefined;
}

function lastShotIdx(steps: StepResult[]): number | null {
  for (let i = steps.length - 1; i >= 0; i -= 1) {
    if (steps[i].afterScreenshot || steps[i].beforeScreenshot) return steps[i].index;
  }
  return null;
}

const STATUS_META: Record<
  StepStatus,
  { tone: "grey" | "blue" | "emerald" | "amber" | "rose"; Icon: typeof CheckCircle2; label: string }
> = {
  pending: { tone: "grey", Icon: CircleDot, label: "Pending" },
  running: { tone: "blue", Icon: Loader2, label: "Running" },
  passed: { tone: "emerald", Icon: CheckCircle2, label: "Passed" },
  "needs-attention": { tone: "amber", Icon: TriangleAlert, label: "Needs attention" },
  failed: { tone: "rose", Icon: XCircle, label: "Failed" },
};

function ActivityRow({
  step,
  selected,
  onSelect,
}: {
  step: StepResult;
  selected: boolean;
  onSelect: () => void;
}) {
  const meta = STATUS_META[step.status];
  const Icon = meta.Icon;
  return (
    <div
      onClick={onSelect}
      className={`cursor-pointer rounded-2xl border p-3.5 transition ${
        step.status === "running"
          ? "border-[#fcd9cc] dark:border-[#4a2417] bg-[#fff7f4] dark:bg-[#2c1812] agent-glow"
          : selected
            ? "border-[#FA4616] bg-[#fff7f4] dark:bg-[#2c1812]"
            : "border-[#eceff1] dark:border-[#28333c] bg-white dark:bg-[#161f27] hover:border-[#cfd8dc] dark:hover:border-[#28333c]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-[#f5f6f7] dark:bg-[#1d2830] text-xs font-semibold text-[#667880] dark:text-[#9aabb4]">
            {step.index + 1}
          </span>
          <div>
            <p className="text-sm font-medium text-[#182128] dark:text-[#e6edf1]">{step.description}</p>
            {step.reason ? (
              <p className="mt-1 text-xs leading-5 text-[#667880] dark:text-[#9aabb4]">
                <span className="font-semibold text-[#A33200] dark:text-[#ff8a5c]">Agent:</span> {step.reason}
              </p>
            ) : null}
            {step.capturedText ? (
              <p className="mt-1 text-xs text-[#1E6482] dark:text-[#6db3d6]">Captured: “{step.capturedText}”</p>
            ) : null}
            {step.message ? (
              <p className="mt-1 text-xs text-[#9a6700] dark:text-[#e0b341]">{step.message}</p>
            ) : null}
            {step.outcome ? <ActionOutcomeLine outcome={step.outcome} /> : null}
            {step.selector ? (
              <code className="mt-2 block break-all rounded-lg bg-[#0f161b] px-2.5 py-1.5 font-mono text-[11px] leading-5 text-[#9fe0d8]">
                {step.selector.mbl}
              </code>
            ) : null}
            {(() => {
              const shot = step.elementShot || step.afterScreenshot || step.beforeScreenshot;
              return shot ? <FieldShot src={shot} cropped={Boolean(step.elementShot)} /> : null;
            })()}
          </div>
        </div>
        <Pill tone={meta.tone}>
          <Icon className={`h-3 w-3 ${step.status === "running" ? "animate-spin" : ""}`} />
          {meta.label}
        </Pill>
      </div>
    </div>
  );
}

// A compact camera chip; hovering reveals the captured image (the cropped
// element when available, otherwise the full step screen).
function FieldShot({ src, cropped = true }: { src: string; cropped?: boolean }) {
  return (
    <span className="group relative mt-2 inline-flex">
      <span className="inline-flex items-center gap-1.5 rounded-md border border-[#e7eaec] bg-[#f5f6f7] px-2 py-1 text-[11px] font-medium text-[#667880] dark:border-[#28333c] dark:bg-[#1d2830] dark:text-[#9aabb4]">
        <Camera className="h-3.5 w-3.5" />
        {cropped ? "Field screenshot" : "Screen"}
      </span>
      <img
        src={src}
        alt="interacted element"
        className="absolute left-0 top-full z-50 mt-1 hidden max-h-72 w-auto max-w-[340px] rounded-lg border border-[#e7eaec] bg-white object-contain p-1 shadow-xl group-hover:block dark:border-[#28333c] dark:bg-[#0b0f12]"
      />
    </span>
  );
}

// Shows whether the browser accepted the command and whether it took effect.
function ActionOutcomeLine({ outcome }: { outcome: ActionOutcome }) {
  const color = !outcome.dispatched
    ? "text-[#c0334b] dark:text-[#ff7d8a]"
    : outcome.effect === "applied"
      ? "text-[#0f8a5f] dark:text-[#3fb88a]"
      : outcome.effect === "no-change"
        ? "text-[#9a6700] dark:text-[#e0b341]"
        : "text-[#667880] dark:text-[#9aabb4]";
  const tag = !outcome.dispatched
    ? "rejected by browser"
    : outcome.effect === "applied"
      ? "accepted & applied"
      : outcome.effect === "no-change"
        ? "accepted, no change"
        : "accepted";
  const secs = outcome.durationMs ? ` (${(outcome.durationMs / 1000).toFixed(1)}s)` : "";
  return (
    <p className={`mt-1 text-xs leading-5 ${color}`}>
      <span className="font-semibold">Browser:</span> {tag}
      {secs} - {outcome.detail}
    </p>
  );
}
