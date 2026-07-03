import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Check,
  Copy,
  Download,
  FileCode2,
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
  workflowXamlUrl,
} from "../../lib/api";
import { Button, Card, Eyebrow, Pill, Tabs } from "../ui";

type Panel = "catalog" | "xaml" | "json";

export function WorkflowStep({
  session,
  onBack,
  onRestart,
}: {
  session: SessionState | null;
  onBack: () => void;
  onRestart: () => void;
}) {
  const [panel, setPanel] = useState<Panel>("catalog");
  const [catalog, setCatalog] = useState<SelectorCatalogEntry[]>([]);
  const [actionLog, setActionLog] = useState<unknown>(null);
  const [xaml, setXaml] = useState<string>("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!session) return;
    void getCatalog(session.id)
      .then((d) => {
        setCatalog(d.catalog);
        setActionLog(d.actionLog);
      })
      .catch(() => undefined);
    void fetch(workflowXamlUrl(session.id))
      .then((r) => r.text())
      .then(setXaml)
      .catch(() => undefined);
  }, [session]);

  if (!session) {
    return (
      <Card className="p-8 text-center text-sm text-[#667880] dark:text-[#9aabb4]">No session to summarize.</Card>
    );
  }

  const withSelectors = catalog.filter((c) => c.selector).length;

  const copy = (text: string) => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const panelText = panel === "xaml" ? xaml : panel === "json" ? JSON.stringify(actionLog, null, 2) : "";

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
            <a href={workflowXamlUrl(session.id)} download>
              <Button>
                <Download className="h-4 w-4" />
                Download .xaml
              </Button>
            </a>
            <a href={actionLogUrl(session.id)} download>
              <Button variant="secondary">
                <Download className="h-4 w-4" />
                Action log (.json)
              </Button>
            </a>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <Stat label="Steps" value={`${catalog.length}`} />
          <Stat label="Selectors captured" value={`${withSelectors}`} />
          <Stat label="Target" value={session.browserLabel || "Desktop web"} />
        </div>
      </Card>

      <div className="flex items-start gap-2 rounded-2xl border border-[#cceefe] dark:border-[#1d3947] bg-[#f3fbff] dark:bg-[#0e2129] px-4 py-3 text-sm text-[#1E6482] dark:text-[#6db3d6]">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Selectors use UiPath web (<code>&lt;html/&gt;&lt;webctrl/&gt;</code>) format and are exact.
          Confirm the UI Automation package version in Studio before importing the generated workflow.
        </span>
      </div>

      <Card className="p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Tabs<Panel>
            value={panel}
            onChange={setPanel}
            options={[
              { value: "catalog", label: "Selector catalog" },
              { value: "xaml", label: "Workflow XAML" },
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
                  <a
                    href={
                      row.hasScreenshot
                        ? stepScreenshotUrl(sessionId, row.step - 1)
                        : stepElementShotUrl(sessionId, row.step - 1)
                    }
                    target="_blank"
                    rel="noreferrer"
                    title="Open full screen for context"
                    className="mt-2 block w-fit"
                  >
                    <img
                      src={stepElementShotUrl(sessionId, row.step - 1)}
                      alt={`Step ${row.step} element`}
                      loading="lazy"
                      className="max-h-24 w-auto max-w-[260px] rounded-md border border-[#e7eaec] bg-white object-contain p-1 transition hover:ring-2 hover:ring-[#FA4616] dark:border-[#28333c] dark:bg-[#0b0f12]"
                    />
                  </a>
                ) : row.hasScreenshot ? (
                  <a
                    href={stepScreenshotUrl(sessionId, row.step - 1)}
                    target="_blank"
                    rel="noreferrer"
                    title="Open full interaction screenshot"
                    className="mt-2 block w-fit"
                  >
                    <img
                      src={stepScreenshotUrl(sessionId, row.step - 1)}
                      alt={`Step ${row.step} screen`}
                      loading="lazy"
                      className="h-40 w-auto rounded-lg border border-[#e7eaec] bg-[#0b0f12] object-contain transition hover:ring-2 hover:ring-[#FA4616] dark:border-[#28333c]"
                    />
                  </a>
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
