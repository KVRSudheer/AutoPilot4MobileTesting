import { useCallback, useEffect, useState } from "react";
import { AppShell, type NavItem } from "./components/AppShell";
import { ConnectStep, type ConnState } from "./components/wizard/ConnectStep";
import { TestCaseStep } from "./components/wizard/TestCaseStep";
import { RunStep } from "./components/wizard/RunStep";
import { WorkflowStep } from "./components/wizard/WorkflowStep";
import { BatchStep } from "./components/wizard/BatchStep";
import { createBatch, createSession, getDefaults, type BatchInfo } from "./lib/api";
import type {
  AppConfig,
  ConnectionTarget,
  DeviceConfig,
  FarmCredentials,
  RunStatus,
  ServerDefaults,
  SessionRequest,
  SessionState,
  UiPathAuthConfig,
} from "./lib/types";

export interface FormState {
  uipath: UiPathAuthConfig;
  farm: FarmCredentials;
  device: DeviceConfig;
  title: string;
  app: AppConfig;
  testSteps: string[];
}

// A launched test case. Each run streams independently in the background and
// is either a single-device session or a parallel batch of device-sessions.
interface RunInstance {
  id: string; // session id (single) or batch id (batch)
  title: string;
  kind: "single" | "batch";
  createdAt: number;
  session?: SessionState;
  batch?: BatchInfo;
  // The exact requests that launched this run (one per device) - kept so the
  // run can be re-run on all or specific devices.
  requests: SessionRequest[];
}

type View = "connect" | "compose" | "run";

const DEFAULT_APP: AppConfig = { appName: "", startUrl: "" };

const DEFAULT_FORM: FormState = {
  uipath: {
    mode: "clientCredentials",
    baseUrl: "https://cloud.uipath.com",
    orgName: "",
    tenantName: "",
    clientId: "",
    clientSecret: "",
    scope: "OR.Execution",
    bearerToken: "",
    llmModel: "gpt-4o-mini-2024-07-18",
  },
  farm: { provider: "browserstack", username: "", accessKey: "", region: "us-west-1", hubUrl: "" },
  device: { platform: "Android", deviceName: "", osVersion: "", connectionTarget: "app" },
  title: "",
  app: { ...DEFAULT_APP },
  testSteps: [""],
};

export default function App() {
  const [defaults, setDefaults] = useState<ServerDefaults | null>(null);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [view, setView] = useState<View>("connect");
  // Devices collected on the Connect screen; selected/run on the compose screen.
  const [devicePool, setDevicePool] = useState<DeviceConfig[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  // Launched runs (the workspace) + their live status for the nav.
  const [runs, setRuns] = useState<RunInstance[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [runStatuses, setRunStatuses] = useState<Record<string, RunStatus>>({});
  // Persisted connection state so it survives navigating away from Connect.
  const [connState, setConnState] = useState<ConnState>({ validation: null, catalog: null });

  useEffect(() => {
    void getDefaults()
      .then((d) => {
        setDefaults(d);
        setForm((prev) => ({
          ...prev,
          uipath: {
            ...prev.uipath,
            baseUrl: d.uipath.baseUrl || prev.uipath.baseUrl,
            orgName: d.uipath.orgName || prev.uipath.orgName,
            tenantName: d.uipath.tenantName || prev.uipath.tenantName,
            scope: d.uipath.scope || prev.uipath.scope,
            llmModel: d.uipath.llmModel || prev.uipath.llmModel,
            mode: d.uipath.hasBearer && !d.uipath.hasClientCredentials ? "bearer" : prev.uipath.mode,
          },
          farm: { ...prev.farm, provider: d.farm.provider || prev.farm.provider },
        }));
      })
      .catch(() => setDefaults(null));
  }, []);

  const set = (partial: Partial<FormState>) => setForm((prev) => ({ ...prev, ...partial }));

  const connectDone = Boolean(connState.validation?.ok) && devicePool.length > 0;

  const buildRequest = (device: DeviceConfig): SessionRequest => ({
    uipath: form.uipath,
    farm: form.farm,
    device,
    app: form.app,
    testSteps: form.testSteps.map((s) => s.trim()).filter(Boolean),
    title: form.title.trim() || undefined,
  });

  // The connection target (native app vs mobile browser) is a TEST-CASE level
  // choice - one test case can't mix native and web (different steps/selectors).
  // So it applies to every device in the run: set it on the template AND
  // re-stamp the whole pool.
  const setTarget = (target: ConnectionTarget, browser?: string) => {
    const browserFor = (platform: DeviceConfig["platform"], prev?: string) =>
      target === "browser" && platform === "Android" ? (browser ?? prev ?? "chrome") : undefined;
    setForm((prev) => ({
      ...prev,
      device: {
        ...prev.device,
        connectionTarget: target,
        browser: browserFor(prev.device.platform, prev.device.browser),
      },
    }));
    setDevicePool((p) =>
      p.map((dv) => ({
        ...dv,
        connectionTarget: target,
        browser: browserFor(dv.platform, dv.browser),
      })),
    );
  };

  // --- Connect screen: build the device run pool -----------------------------
  const addDevice = () => setDevicePool((p) => [...p, { ...form.device }]);
  const removeDevice = (i: number) => {
    setDevicePool((p) => p.filter((_, idx) => idx !== i));
    setSelected((s) => s.filter((idx) => idx !== i).map((idx) => (idx > i ? idx - 1 : idx)));
  };

  const goCompose = () => {
    // Default to all devices only on first entry; preserve an existing choice
    // when re-opening compose (e.g. after peeking at a running run).
    setSelected((s) => (s.length ? s : devicePool.map((_, i) => i)));
    setView("compose");
  };

  // --- Compose screen: choose devices for this test case ---------------------
  const toggleSelected = (i: number) =>
    setSelected((s) => (s.includes(i) ? s.filter((x) => x !== i) : [...s, i]));
  const setAllSelected = (all: boolean) => setSelected(all ? devicePool.map((_, i) => i) : []);

  // Clear the per-test-case fields (keep the workspace: creds + device pool).
  const resetCompose = () => {
    setForm((prev) => ({ ...prev, title: "", app: { ...DEFAULT_APP }, testSteps: [""] }));
    setSelected(devicePool.map((_, i) => i));
  };

  // Create a run (single session or parallel batch) from a set of requests and
  // make it the active view. Returns the new run, or null on failure.
  const launch = async (reqs: SessionRequest[], title: string): Promise<RunInstance | null> => {
    if (!reqs.length) return null;
    setCreating(true);
    setCreateError(null);
    try {
      let instance: RunInstance;
      if (reqs.length === 1) {
        const created = await createSession(reqs[0]);
        instance = {
          id: created.id,
          title: created.title,
          kind: "single",
          createdAt: Date.now(),
          session: created,
          requests: reqs,
        };
      } else {
        const info = await createBatch(reqs);
        instance = {
          id: info.batchId,
          title: title || info.sessions[0]?.title || "Untitled run",
          kind: "batch",
          createdAt: Date.now(),
          batch: info,
          requests: reqs,
        };
      }
      setRuns((prev) => [...prev, instance]);
      setActiveRunId(instance.id);
      setView("run");
      return instance;
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Failed to start the run.");
      return null;
    } finally {
      setCreating(false);
    }
  };

  const runSelected = async () => {
    const devices = selected.map((i) => devicePool[i]).filter(Boolean);
    if (!devices.length) return;
    const created = await launch(devices.map(buildRequest), form.title.trim());
    if (created) resetCompose();
  };

  // Re-run an existing run's exact requests - all devices, or a subset.
  const rerun = (reqs: SessionRequest[]) => {
    if (reqs.length) void launch(reqs, reqs[0]?.title?.trim() || "Re-run");
  };

  // Stable status reporter (deduped) so RunHosts don't loop.
  const reportRunStatus = useCallback((id: string, status: RunStatus) => {
    setRunStatuses((prev) => {
      const cur = prev[id];
      if (
        cur &&
        cur.state === status.state &&
        cur.passed === status.passed &&
        cur.attention === status.attention &&
        cur.total === status.total
      ) {
        return prev;
      }
      return { ...prev, [id]: status };
    });
  }, []);

  const selectNav = (id: string) => {
    if (id === "connect") setView("connect");
    else if (id === "compose") {
      if (connectDone) goCompose(); // preserves selection on re-entry (seeds only if empty)
    } else {
      setActiveRunId(id);
      setView("run");
    }
  };

  const navItems: NavItem[] = [
    { id: "connect", label: "Connect", kind: "setup" },
    { id: "compose", label: "New test", kind: "compose", disabled: !connectDone },
    ...runs.map<NavItem>((r) => ({
      id: r.id,
      label: r.title || "Untitled run",
      kind: "run",
      status: runStatuses[r.id]?.state,
    })),
  ];
  const activeId = view === "run" ? (activeRunId ?? "connect") : view;

  return (
    <AppShell items={navItems} activeId={activeId} onSelect={selectNav}>
      <div className={view === "connect" ? "fade-in-up" : "hidden"}>
        <ConnectStep
          form={form}
          set={set}
          defaults={defaults}
          onNext={goCompose}
          connState={connState}
          setConnState={setConnState}
          devicePool={devicePool}
          onAddDevice={addDevice}
          onRemoveDevice={removeDevice}
          onSetTarget={setTarget}
        />
      </div>

      <div className={view === "compose" ? "fade-in-up" : "hidden"}>
        <TestCaseStep
          form={form}
          set={set}
          onBack={() => setView("connect")}
          onRun={runSelected}
          creating={creating}
          error={createError}
          devicePool={devicePool}
          selected={selected}
          onToggleSelected={toggleSelected}
          onSelectAll={setAllSelected}
        />
      </div>

      {/* All launched runs stay mounted so they keep streaming in the
          background; only the active one is visible. */}
      {runs.map((run) => (
        <div
          key={run.id}
          className={view === "run" && activeRunId === run.id ? "fade-in-up" : "hidden"}
        >
          <RunHost
            run={run}
            onNewTest={goCompose}
            onStatus={reportRunStatus}
            onRerun={rerun}
          />
        </div>
      ))}
    </AppShell>
  );
}

function RunHost({
  run,
  onNewTest,
  onStatus,
  onRerun,
}: {
  run: RunInstance;
  onNewTest: () => void;
  onStatus: (id: string, status: RunStatus) => void;
  onRerun: (reqs: SessionRequest[]) => void;
}) {
  const [sub, setSub] = useState<"run" | "workflow">("run");
  const report = useCallback((s: RunStatus) => onStatus(run.id, s), [run.id, onStatus]);

  if (run.kind === "batch" && run.batch) {
    return (
      <BatchStep
        batch={run.batch}
        onRestart={onNewTest}
        onStatus={report}
        onRerun={(indices) =>
          onRerun(
            indices && indices.length
              ? indices.map((i) => run.requests[i]).filter(Boolean)
              : run.requests,
          )
        }
      />
    );
  }
  if (run.session) {
    return sub === "run" ? (
      <RunStep
        session={run.session}
        onBack={onNewTest}
        onViewWorkflow={() => setSub("workflow")}
        onStatus={report}
        onRerun={() => onRerun(run.requests)}
      />
    ) : (
      <WorkflowStep session={run.session} onBack={() => setSub("run")} onRestart={onNewTest} />
    );
  }
  return null;
}
