import { useEffect, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Download,
  Layers,
  Plus,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";
import type { BatchInfo } from "../../lib/api";
import { actionLogUrl, workflowXamlUrl } from "../../lib/api";
import { useBatchStream, type RunStreamLite } from "../../lib/sse";
import type { RunStatus, StepResult } from "../../lib/types";
import { Button, Card, DeviceFrame, Eyebrow, Pill } from "../ui";
import { RunStep } from "./RunStep";

function latestShot(steps: StepResult[]): string | undefined {
  for (let i = steps.length - 1; i >= 0; i -= 1) {
    if (steps[i].afterScreenshot) return steps[i].afterScreenshot;
    if (steps[i].beforeScreenshot) return steps[i].beforeScreenshot;
  }
  return undefined;
}

export function BatchStep({
  batch,
  onRestart,
  onStatus,
  onRerun,
}: {
  batch: BatchInfo;
  onRestart: () => void;
  onStatus?: (status: RunStatus) => void;
  // Re-run the whole batch (no args) or specific device indices.
  onRerun?: (indices?: number[]) => void;
}) {
  const { runs, order, batchDone } = useBatchStream(batch.batchId, batch.sessions);
  const list = order.map((id) => runs[id]).filter(Boolean) as RunStreamLite[];
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const completedRuns = list.filter((r) => r.finished).length;
  const startedRuns = list.filter((r) => r.steps.some((s) => s.status !== "pending")).length;
  const attentionRuns = list.filter((r) =>
    r.steps.some((s) => s.status === "needs-attention" || s.status === "failed"),
  ).length;
  const batchState: RunStatus["state"] = batchDone
    ? "done"
    : startedRuns > 0
      ? "running"
      : "connecting";
  useEffect(() => {
    onStatus?.({
      state: batchState,
      passed: completedRuns,
      attention: attentionRuns,
      total: list.length,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchState, completedRuns, attentionRuns, list.length]);

  // Detail view for a single run (full device + steps + logs), reusing RunStep.
  if (selectedRunId) {
    const run = runs[selectedRunId];
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setSelectedRunId(null)}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#FA4616] hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to all runs
        </button>
        {run ? (
          <RunStep
            session={run.session}
            onBack={() => setSelectedRunId(null)}
            onViewWorkflow={() => window.open(workflowXamlUrl(selectedRunId), "_blank")}
          />
        ) : null}
      </div>
    );
  }

  const completed = list.filter((r) => r.finished).length;
  const totalPassed = list.reduce(
    (n, r) => n + r.steps.filter((s) => s.status === "passed").length,
    0,
  );
  const totalAttention = list.reduce(
    (n, r) =>
      n + r.steps.filter((s) => s.status === "needs-attention" || s.status === "failed").length,
    0,
  );

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#182128] dark:bg-[#22303a] text-[#FA4616]">
              <Layers className="h-5 w-5" />
            </span>
            <div>
              <Eyebrow>{batch.sessions[0]?.title || "Parallel batch"}</Eyebrow>
              <h2 className="text-xl font-semibold text-[#182128] dark:text-[#e6edf1]">
                {batchDone ? "Batch complete" : "Running in parallel…"}
              </h2>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone="grey">
              {completed} / {list.length} runs complete
            </Pill>
            <Pill tone="emerald">{totalPassed} passed</Pill>
            {totalAttention > 0 ? <Pill tone="amber">{totalAttention} need attention</Pill> : null}
            <Pill tone="slate">
              {batch.maxParallel >= list.length ? "all in parallel" : `max ${batch.maxParallel} at once`}
            </Pill>
            {onRerun && batchDone ? (
              <Button variant="secondary" onClick={() => onRerun()}>
                <RotateCcw className="h-4 w-4" />
                Re-run all
              </Button>
            ) : null}
            <Button variant="dark" onClick={onRestart}>
              <Plus className="h-4 w-4" />
              New test
            </Button>
          </div>
        </div>
        <p className="mt-3 text-xs text-[#9aa7ad] dark:text-[#71808a]">
          Click any run to open its full device screen, steps and logs.
          {onRerun ? " Re-run all devices, or just one from its tile." : ""}
        </p>
      </Card>

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {list.map((run, i) => (
          <RunTile
            key={run.session.id}
            run={run}
            onOpen={() => setSelectedRunId(run.session.id)}
            onRerun={onRerun ? () => onRerun([i]) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

function RunTile({
  run,
  onOpen,
  onRerun,
}: {
  run: RunStreamLite;
  onOpen: () => void;
  onRerun?: () => void;
}) {
  // While running, show the live feed; once done, the last step screenshot.
  const shot = (!run.finished && run.liveFrame) || latestShot(run.steps);
  const passed = run.steps.filter((s) => s.status === "passed").length;
  const attention = run.steps.filter(
    (s) => s.status === "needs-attention" || s.status === "failed",
  ).length;
  const total = run.steps.length;
  const connecting = !run.finished && !shot;

  return (
    <Card className="flex flex-col gap-3 p-4">
      <button type="button" onClick={onOpen} className="flex items-start justify-between gap-2 text-left">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[#182128] dark:text-[#e6edf1]">{run.session.deviceLabel}</p>
          <p className="truncate text-xs text-[#667880] dark:text-[#9aabb4]">{run.session.title}</p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-[#aab4b9] dark:text-[#71808a]" />
      </button>

      <button type="button" onClick={onOpen} className="block">
        <DeviceFrame
          src={shot}
          busy={connecting}
          maxW={210}
          maxH={300}
          placeholder={connecting ? "Connecting…" : "Waiting…"}
        />
      </button>

      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <Pill tone={run.finished ? "emerald" : run.session.mode === "live" ? "blue" : "amber"}>
          {run.finished ? "Done" : run.session.status === "running" ? "Running" : "Connecting"}
        </Pill>
        <Pill tone="emerald">
          <CheckCircle2 className="h-3 w-3" />
          {passed}
        </Pill>
        {attention > 0 ? (
          <Pill tone="amber">
            <TriangleAlert className="h-3 w-3" />
            {attention}
          </Pill>
        ) : null}
        <Pill tone="grey">{total} steps</Pill>
      </div>

      {run.finished ? (
        <div className="flex flex-wrap gap-2">
          <a href={workflowXamlUrl(run.session.id)} download className="flex-1">
            <Button className="w-full px-3 py-2 text-xs">
              <Download className="h-3.5 w-3.5" />
              .xaml
            </Button>
          </a>
          <a href={actionLogUrl(run.session.id)} download className="flex-1">
            <Button variant="secondary" className="w-full px-3 py-2 text-xs">
              <Download className="h-3.5 w-3.5" />
              log
            </Button>
          </a>
        </div>
      ) : null}

      {onRerun && run.finished ? (
        <Button variant="secondary" onClick={onRerun} className="w-full px-3 py-2 text-xs">
          <RotateCcw className="h-3.5 w-3.5" />
          Re-run this device
        </Button>
      ) : null}
    </Card>
  );
}
