import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Braces,
  Check,
  Copy,
  Download,
  FileCode2,
  Gauge,
  Info,
  ListTree,
  RotateCcw,
  Workflow,
} from "lucide-react";
import type { SelectorCatalogEntry, SessionState } from "../../lib/types";
import {
  actionLogUrl,
  getCatalog,
  stepElementShotUrl,
  stepScreenshotUrl,
  workflowCodedUrl,
  workflowXamlUrl,
} from "../../lib/api";
import { apiFetch, downloadDoc } from "../../lib/bridge";
import { BridgeImg, MediaLink } from "../BridgeMedia";
import { Button, Card, Eyebrow, Pill, Tabs } from "../ui";

type Panel = "catalog" | "xaml" | "csharp" | "json";

export function WorkflowStep({
  session,
  onBack,
  onRestart,
  onReplay,
}: {
  session: SessionState | null;
  onBack: () => void;
  onRestart: () => void;
  // Re-run the captured selectors with no LLM planning, to time the automation.
  onReplay?: () => void;
}) {
  const [panel, setPanel] = useState<Panel>("catalog");
  const [catalog, setCatalog] = useState<SelectorCatalogEntry[]>([]);
  const [actionLog, setActionLog] = useState<unknown>(null);
  const [xaml, setXaml] = useState<string>("");
  const [csharp, setCsharp] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const download = (url: string, name: string) => {
    setDownloadError(null);
    void downloadDoc(url, name).catch((e: unknown) =>
      setDownloadError(e instanceof Error ? e.message : "Download failed."),
    );
  };

  useEffect(() => {
    if (!session) return;
    void getCatalog(session.id)
      .then((d) => {
        setCatalog(d.catalog);
        setActionLog(d.actionLog);
      })
      .catch(() => undefined);
    void apiFetch(workflowXamlUrl(session.id))
      .then((r) => r.text())
      .then(setXaml)
      .catch(() => undefined);
    void apiFetch(workflowCodedUrl(session.id))
      .then((r) => r.text())
      .then(setCsharp)
      .catch(() => undefined);
  }, [session]);

  if (!session) {
    return (
      <Card className="p-8 text-center text-sm text-[#667880] dark:text-[#9aabb4]">No session to summarize.</Card>
    );
  }

  const withSelectors = catalog.filter((c) => c.selector).length;
  // Wall-clock of the agent-driven run, for comparison against a replay.
  const times = session.steps.flatMap((s) => [s.startedAt, s.finishedAt]).filter(Boolean) as number[];
  const agentMs = times.length >= 2 ? Math.max(...times) - Math.min(...times) : null;

  const copy = (text: string) => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const panelText =
    panel === "xaml"
      ? xaml
      : panel === "csharp"
        ? csharp
        : panel === "json"
          ? JSON.stringify(actionLog, null, 2)
          : "";

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#182128] dark:bg-[#22303a] text-[#FA4616]">
              <Workflow className="h-5 w-5" />
            </span>
            <div>
              <Eyebrow>Step 4 · Output</Eyebrow>
              <h2 className="text-xl font-semibold text-[#182128] dark:text-[#e6edf1]">UiPath workflow generated</h2>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() =>
                download(workflowXamlUrl(session.id), `workflow-${session.id}.xaml`)
              }
            >
              <Download className="h-4 w-4" />
              Download .xaml
            </Button>
            <Button
              variant="secondary"
              title="Mobile Device Manager opens the device - so it shows in the MDM device view - and every action is a raw Appium HTTP call on that same session."
              onClick={() =>
                download(
                  workflowCodedUrl(session.id, "hybrid"),
                  `workflow-${session.id}-mdm-http.cs`,
                )
              }
            >
              <Download className="h-4 w-4" />
              Coded (MDM + HTTP)
            </Button>
            <Button
              variant="secondary"
              title="MDM connection plus UiPath mobile activities for every action - full MDM step logging and screenshots."
              onClick={() =>
                download(workflowCodedUrl(session.id, "mdm"), `workflow-${session.id}-mdm.cs`)
              }
            >
              <Download className="h-4 w-4" />
              Coded (MDM activities)
            </Button>
            <Button
              variant="secondary"
              title="Standalone: creates its own Appium session. No packages needed, but the run is not visible in MDM."
              onClick={() =>
                download(workflowCodedUrl(session.id, "http"), `workflow-${session.id}-appium.cs`)
              }
            >
              <Download className="h-4 w-4" />
              Coded (raw Appium)
            </Button>
            <Button
              variant="secondary"
              onClick={() => download(actionLogUrl(session.id), `actionlog-${session.id}.json`)}
            >
              <Download className="h-4 w-4" />
              Action log (.json)
            </Button>
          </div>
        </div>

        {onReplay ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#eceff1] bg-[#fafbfc] px-4 py-3 dark:border-[#28333c] dark:bg-[#161f27]">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#182128] dark:text-[#e6edf1]">
                Measure execution speed
              </p>
              <p className="text-xs leading-5 text-[#667880] dark:text-[#9aabb4]">
                Re-runs these exact selectors on the same device with no LLM planning - how fast the
                generated automation actually is.
                {agentMs != null ? ` This agent-driven run took ${fmtDuration(agentMs)}.` : ""}
              </p>
            </div>
            <Button variant="secondary" onClick={onReplay}>
              <Gauge className="h-4 w-4" />
              Replay at full speed
            </Button>
          </div>
        ) : null}

        {downloadError ? (
          <p className="mt-3 text-right text-xs text-[#c0334b] dark:text-[#ff7d8a]">
            {downloadError}
          </p>
        ) : null}

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <Stat label="Steps" value={`${catalog.length}`} />
          <Stat label="Selectors captured" value={`${withSelectors}`} />
          <Stat label="Target" value={session.target === "browser" ? "Mobile web" : session.platform} />
        </div>
      </Card>

      <div className="flex items-start gap-2 rounded-2xl border border-[#cceefe] dark:border-[#1d3947] bg-[#f3fbff] dark:bg-[#0e2129] px-4 py-3 text-sm text-[#1E6482] dark:text-[#6db3d6]">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        {session.target === "browser" ? (
          <span>
            Selectors use UiPath web (<code>&lt;html/&gt;&lt;webctrl/&gt;</code>) format and are exact.
            The <code>.xaml</code> uses UI Automation web activities - confirm the package version in
            Studio before importing.
          </span>
        ) : (
          <span>
            Selectors use UiPath mobile (<code>&lt;mbl/&gt;</code>) format and are exact. The{" "}
            <code>.xaml</code> targets <code>UiPath.Mobile.Automation.Activities</code> - confirm the
            package version in Studio before importing.
          </span>
        )}
      </div>

      <Card className="p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Tabs<Panel>
            value={panel}
            onChange={setPanel}
            options={[
              { value: "catalog", label: "Selector catalog" },
              { value: "xaml", label: "Workflow XAML" },
              { value: "csharp", label: "Coded (C# / MDM + HTTP)" },
              { value: "json", label: "Action log" },
            ]}
          />
          {panel !== "catalog" ? (
            <Button variant="secondary" onClick={() => copy(panelText)}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          ) : null}
        </div>

        {panel === "catalog" ? <CatalogTable rows={catalog} sessionId={session.id} /> : null}
        {panel === "xaml" ? (
          <CodeBlock icon={<FileCode2 className="h-4 w-4" />} text={xaml} />
        ) : null}
        {panel === "csharp" ? (
          <CodeBlock icon={<Braces className="h-4 w-4" />} text={csharp} />
        ) : null}
        {panel === "json" ? (
          <CodeBlock icon={<ListTree className="h-4 w-4" />} text={panelText} />
        ) : null}
      </Card>

      <div className="flex items-center justify-between">
        <Button variant="secondary" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          Back to run
        </Button>
        <Button variant="dark" onClick={onRestart}>
          <RotateCcw className="h-4 w-4" />
          New test
        </Button>
      </div>
    </div>
  );
}

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  return s < 60 ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#eceff1] dark:border-[#28333c] bg-white dark:bg-[#161f27] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#667880] dark:text-[#9aabb4]">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-[#182128] dark:text-[#e6edf1]">{value}</p>
    </div>
  );
}

function CatalogTable({ rows, sessionId }: { rows: SelectorCatalogEntry[]; sessionId: string }) {
  if (rows.length === 0) {
    return <p className="text-sm text-[#667880] dark:text-[#9aabb4]">No steps recorded.</p>;
  }
  return (
    <div className="scrollbar-thin overflow-x-auto">
      <table className="w-full min-w-[680px] border-collapse text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-[0.12em] text-[#667880] dark:text-[#9aabb4]">
            <th className="px-3 py-2">#</th>
            <th className="px-3 py-2">Step</th>
            <th className="px-3 py-2">Action</th>
            <th className="px-3 py-2">Selector</th>
            <th className="px-3 py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.step} className="border-t border-[#eceff1] dark:border-[#28333c] align-top">
              <td className="px-3 py-3 text-[#667880] dark:text-[#9aabb4]">{row.step}</td>
              <td className="px-3 py-3 text-[#182128] dark:text-[#e6edf1]">{row.description}</td>
              <td className="px-3 py-3">
                <Pill tone="slate">{row.action}</Pill>
              </td>
              <td className="px-3 py-3">
                {row.selector ? (
                  <code className="block break-all font-mono text-[11px] leading-5 text-[#A33200] dark:text-[#ff8a5c]">
                    {row.selector}
                  </code>
                ) : (
                  <span className="text-[#9aa7ad] dark:text-[#71808a]">-</span>
                )}
                {row.hasElementShot ? (
                  // Cropped to just the interacted element; click to open the
                  // full-screen shot for context.
                  <MediaLink
                    href={
                      row.hasScreenshot
                        ? stepScreenshotUrl(sessionId, row.step - 1)
                        : stepElementShotUrl(sessionId, row.step - 1)
                    }
                    title="Open full screen for context"
                    className="mt-2 block w-fit"
                  >
                    <BridgeImg
                      src={stepElementShotUrl(sessionId, row.step - 1)}
                      alt={`Step ${row.step} element`}
                      loading="lazy"
                      className="max-h-24 w-auto max-w-[260px] rounded-md border border-[#e7eaec] bg-white object-contain p-1 transition hover:ring-2 hover:ring-[#FA4616] dark:border-[#28333c] dark:bg-[#0b0f12]"
                    />
                  </MediaLink>
                ) : row.hasScreenshot ? (
                  <MediaLink
                    href={stepScreenshotUrl(sessionId, row.step - 1)}
                    title="Open full interaction screenshot"
                    className="mt-2 block w-fit"
                  >
                    <BridgeImg
                      src={stepScreenshotUrl(sessionId, row.step - 1)}
                      alt={`Step ${row.step} screen`}
                      loading="lazy"
                      className="h-40 w-auto rounded-lg border border-[#e7eaec] bg-[#0b0f12] object-contain transition hover:ring-2 hover:ring-[#FA4616] dark:border-[#28333c]"
                    />
                  </MediaLink>
                ) : null}
              </td>
              <td className="px-3 py-3">
                <StatusPill status={row.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "passed"
      ? "emerald"
      : status === "needs-attention"
        ? "amber"
        : status === "failed"
          ? "rose"
          : "grey";
  return <Pill tone={tone as "emerald" | "amber" | "rose" | "grey"}>{status}</Pill>;
}

function CodeBlock({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="scrollbar-thin max-h-[460px] overflow-auto rounded-2xl bg-[#0f161b] p-4">
      <div className="mb-2 flex items-center gap-2 text-xs text-[#80cbc4]">{icon}</div>
      <pre className="whitespace-pre font-mono text-[12px] leading-6 text-[#cfd8dc] dark:text-[#9aabb4]">{text}</pre>
    </div>
  );
}
