import { useState, type ReactNode } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Globe,
  KeyRound,
  Loader2,
  Monitor,
  Plus,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  Wand2,
} from "lucide-react";
import type { FormState } from "../../App";
import type {
  BrowserName,
  DeviceConfig,
  ServerDefaults,
  UiPathAuthMode,
} from "../../lib/types";
import {
  listUiPathModels,
  validateUiPath,
  type UiPathValidation,
} from "../../lib/api";
import {
  Button,
  Card,
  Combobox,
  type ComboOption,
  Eyebrow,
  Field,
  Pill,
  Tabs,
  TextField,
} from "../ui";

const CURATED_MODELS = [
  "gpt-4o-mini-2024-07-18",
  "gpt-4o-2024-08-06",
  "gpt-4o-2024-11-20",
  "gpt-4.1-2025-04-14",
  "gpt-4.1-mini-2025-04-14",
  "o3-mini-2025-01-31",
  "anthropic.claude-3-5-sonnet-20241022-v2:0",
  "anthropic.claude-3-7-sonnet-20250219-v1:0",
  "gemini-2.5-pro",
  "gemini-2.5-flash",
];
const DEFAULT_LLM_MODEL = CURATED_MODELS[0];

function modelGroup(model: string): string {
  if (model.startsWith("anthropic")) return "Anthropic (Bedrock)";
  if (model.includes("gemini")) return "Google Vertex AI";
  if (model.includes("llama")) return "Meta Llama";
  if (/^(gpt|o\d)/.test(model)) return "OpenAI";
  return "Other";
}
const GROUP_ORDER = ["OpenAI", "Anthropic (Bedrock)", "Google Vertex AI", "Meta Llama", "Other"];
function toModelOptions(models: string[]): ComboOption[] {
  return [...models]
    .sort((a, b) => {
      const ga = GROUP_ORDER.indexOf(modelGroup(a));
      const gb = GROUP_ORDER.indexOf(modelGroup(b));
      return ga !== gb ? ga - gb : a.localeCompare(b);
    })
    .map((m) => ({ value: m, label: m, group: modelGroup(m) }));
}

const BROWSER_OPTIONS: ComboOption[] = [
  { value: "edge", label: "Microsoft Edge" },
  { value: "chrome", label: "Google Chrome" },
];

export interface ConnState {
  validation: UiPathValidation | null;
  models?: string[] | null;
}

export function ConnectStep({
  form,
  set,
  defaults,
  onNext,
  connState,
  setConnState,
  devicePool,
  onAddDevice,
  onRemoveDevice,
}: {
  form: FormState;
  set: (partial: Partial<FormState>) => void;
  defaults: ServerDefaults | null;
  onNext: () => void;
  connState: ConnState;
  setConnState: (updater: (prev: ConnState) => ConnState) => void;
  devicePool: DeviceConfig[];
  onAddDevice: () => void;
  onRemoveDevice: (index: number) => void;
}) {
  const u = form.uipath;
  const d = form.device;
  const { validation, models } = connState;
  const setValidation = (v: UiPathValidation | null) =>
    setConnState((s) => ({ ...s, validation: v }));
  const setModels = (m: string[] | null) => setConnState((s) => ({ ...s, models: m }));

  const [validating, setValidating] = useState(false);
  const [modelsLoading, setModelsLoading] = useState(false);

  const setU = (patch: Partial<typeof u>) => {
    const onlyModel = Object.keys(patch).length === 1 && "llmModel" in patch;
    if (!onlyModel) setValidation(null);
    set({ uipath: { ...u, ...patch } });
  };
  const setD = (patch: Partial<typeof d>) =>
    set({
      device: {
        ...d,
        platform: "Desktop",
        connectionTarget: "browser",
        ...patch,
      },
    });

  const uipathServerCreds =
    u.mode === "bearer" ? defaults?.uipath.hasBearer : defaults?.uipath.hasClientCredentials;
  const uipathConfigured =
    Boolean(u.orgName?.trim() && u.tenantName?.trim()) &&
    (u.mode === "bearer"
      ? Boolean(u.bearerToken?.trim())
      : Boolean(u.clientId?.trim() && u.clientSecret?.trim()));
  const canValidate = uipathConfigured || Boolean(uipathServerCreds);
  const uipathValidated = Boolean(validation?.ok);
  const modelOptions = toModelOptions(models && models.length ? models : CURATED_MODELS);

  const validateConnection = async () => {
    setValidating(true);
    try {
      const v = await validateUiPath(u);
      setValidation(v);
      if (v.ok) {
        setModelsLoading(true);
        listUiPathModels(u)
          .then((m) => {
            if (m.length) setModels(m);
          })
          .catch(() => undefined)
          .finally(() => setModelsLoading(false));
      }
    } catch {
      setValidation({ ok: false, error: "Validation request failed." });
    } finally {
      setValidating(false);
    }
  };

  const browser = (d.browser || "edge") as BrowserName;
  const viewportWidth = d.viewportWidth || defaults?.browser.viewportWidth || 1440;
  const viewportHeight = d.viewportHeight || defaults?.browser.viewportHeight || 900;
  const browserTitle = browser === "edge" ? "Microsoft Edge" : "Google Chrome";
  const environmentReady =
    Boolean(d.deviceName?.trim()) &&
    Boolean(browser) &&
    (!d.headless || (viewportWidth >= 640 && viewportHeight >= 480));

  const blockers: string[] = [];
  if (!uipathValidated) blockers.push("a validated UiPath connection");
  if (devicePool.length === 0) blockers.push("at least one browser environment");
  const canContinue = blockers.length === 0;

  return (
    <div className="space-y-6">
      <HeroCard />

      <Card className="p-6">
        <div className="mb-5 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#182128] dark:bg-[#22303a] text-[#FA4616]">
            <KeyRound className="h-5 w-5" />
          </span>
          <div>
            <Eyebrow>Step 1 · Authentication</Eyebrow>
            <h2 className="text-xl font-semibold text-[#182128] dark:text-[#e6edf1]">UiPath connection</h2>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Tabs<UiPathAuthMode>
            value={u.mode}
            onChange={(mode) => setU({ mode })}
            options={[
              { value: "clientCredentials", label: "Client credentials" },
              { value: "bearer", label: "Bearer / PAT token" },
            ]}
          />
          {uipathServerCreds ? (
            <Pill tone="emerald">Configured server-side</Pill>
          ) : (
            <Pill tone="grey">Used for LLM Gateway planning</Pill>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          <Field label="Base URL">
            <TextField value={u.baseUrl} onChange={(e) => setU({ baseUrl: e.target.value })} />
          </Field>
          <Field label="Organization">
            <TextField value={u.orgName} onChange={(e) => setU({ orgName: e.target.value })} />
          </Field>
          <Field label="Tenant">
            <TextField value={u.tenantName} onChange={(e) => setU({ tenantName: e.target.value })} />
          </Field>

          {u.mode === "clientCredentials" ? (
            <>
              <Field label="Client ID">
                <TextField value={u.clientId ?? ""} onChange={(e) => setU({ clientId: e.target.value })} />
              </Field>
              <Field label="Client Secret">
                <TextField
                  type="password"
                  value={u.clientSecret ?? ""}
                  onChange={(e) => setU({ clientSecret: e.target.value })}
                />
              </Field>
              <Field label="Scope">
                <TextField value={u.scope ?? ""} onChange={(e) => setU({ scope: e.target.value })} />
              </Field>
            </>
          ) : (
            <Field label="Bearer / PAT token" className="sm:col-span-2">
              <TextField
                type="password"
                value={u.bearerToken ?? ""}
                onChange={(e) => setU({ bearerToken: e.target.value })}
              />
            </Field>
          )}

          <Field
            label="LLM model"
            hint={
              modelsLoading
                ? "Checking tenant models..."
                : models && models.length
                  ? `${models.length} models available`
                  : "Used to plan each browser action"
            }
          >
            <Combobox
              value={u.llmModel || DEFAULT_LLM_MODEL}
              options={modelOptions}
              onChange={(v) => setU({ llmModel: v })}
              searchPlaceholder="Search models..."
            />
          </Field>
        </div>

        <p className="mt-4 flex items-center gap-2 text-xs text-[#667880] dark:text-[#9aabb4]">
          <Wand2 className="h-3.5 w-3.5 text-[#0BA2B3]" />
          Validate UiPath to enable browser environment setup.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-[#eceff1] pt-4 dark:border-[#28333c]">
          <Button onClick={validateConnection} disabled={!canValidate || validating}>
            {validating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            {validating ? "Validating..." : "Validate connection"}
          </Button>
          {validation ? (
            validation.ok ? (
              validation.llm ? (
                <Status tone="ok" icon={<CheckCircle2 className="h-4 w-4" />}>
                  Connected - LLM Gateway reachable{validation.model ? ` (${validation.model})` : ""}
                </Status>
              ) : (
                <Status tone="warn" icon={<TriangleAlert className="h-4 w-4" />}>
                  Authenticated, but LLM Gateway not reachable
                  {validation.error ? `: ${validation.error.slice(0, 120)}` : ""}
                </Status>
              )
            ) : (
              <Status tone="error" icon={<TriangleAlert className="h-4 w-4" />}>
                {validation.error || "Could not connect to UiPath."}
              </Status>
            )
          ) : null}
        </div>
      </Card>

      <Card className="p-6">
        <div className="mb-5 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#182128] dark:bg-[#22303a] text-[#FA4616]">
            <Monitor className="h-5 w-5" />
          </span>
          <div>
            <Eyebrow>Step 2 · Browser</Eyebrow>
            <h2 className="text-xl font-semibold text-[#182128] dark:text-[#e6edf1]">Desktop browser environments</h2>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          <Field label="Browser">
            <Combobox
              value={browser}
              options={BROWSER_OPTIONS}
              onChange={(v) =>
                setD({
                  browser: v as BrowserName,
                  deviceName: v === "edge" ? "Local Edge" : "Local Chrome",
                })
              }
            />
          </Field>
          <Field label="Run mode">
            <Tabs<"visible" | "headless">
              value={d.headless ? "headless" : "visible"}
              onChange={(v) =>
                setD(
                  v === "headless"
                    ? { headless: true, viewportWidth, viewportHeight }
                    : { headless: false, viewportWidth: undefined, viewportHeight: undefined },
                )
              }
              options={[
                { value: "visible", label: "Visible" },
                { value: "headless", label: "Headless" },
              ]}
            />
          </Field>
          <Field label="Environment name">
            <TextField
              value={d.deviceName ?? ""}
              onChange={(e) => setD({ deviceName: e.target.value })}
              placeholder={`${browserTitle} desktop`}
            />
          </Field>
          {d.headless ? (
            <>
              <Field label="Viewport width">
                <TextField
                  type="number"
                  min={640}
                  value={viewportWidth}
                  onChange={(e) => setD({ viewportWidth: Number(e.target.value) || 1440 })}
                />
              </Field>
              <Field label="Viewport height">
                <TextField
                  type="number"
                  min={480}
                  value={viewportHeight}
                  onChange={(e) => setD({ viewportHeight: Number(e.target.value) || 900 })}
                />
              </Field>
            </>
          ) : (
            <Field label="Window size">
              <div className="rounded-xl border border-[#eceff1] bg-[#f8fafb] px-4 py-3 text-sm font-medium text-[#4b5f68] dark:border-[#28333c] dark:bg-[#111a21] dark:text-[#b6c3ca]">
                Maximized
              </div>
            </Field>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#eceff1] pt-4 dark:border-[#28333c]">
          <Pill tone={environmentReady ? "emerald" : "amber"}>
            {environmentReady ? `${browserTitle} ready` : "Complete browser environment"}
          </Pill>
          <Button type="button" onClick={onAddDevice} disabled={!uipathValidated || !environmentReady}>
            <Plus className="h-4 w-4" />
            Add browser to run
          </Button>
        </div>

        {devicePool.length > 0 ? (
          <div className="mt-4 space-y-2">
            {devicePool.map((env, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-3 rounded-xl border border-[#eceff1] bg-white px-3 py-2 dark:border-[#28333c] dark:bg-[#161f27]"
              >
                <span className="min-w-0 truncate text-sm text-[#182128] dark:text-[#e6edf1]">
                  <span className="font-medium">{env.deviceName || "Browser"}</span>
                  <span className="text-[#667880] dark:text-[#9aabb4]">
                    {" "}
                    - {env.browser === "chrome" ? "Chrome" : "Edge"} - {env.headless ? `${env.viewportWidth || 1440}x${env.viewportHeight || 900} - headless` : "maximized"}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => onRemoveDevice(i)}
                  className="text-[#d98b8b] hover:text-[#c0334b] dark:text-[#c8767e] dark:hover:text-[#ff7d8a]"
                  title="Remove from run"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </Card>

      <div className="flex flex-wrap items-center justify-end gap-3">
        {!canContinue ? (
          <span className="text-xs text-[#9a6700] dark:text-[#e0b341]">
            To continue, add {blockers.join(" and ")}.
          </span>
        ) : null}
        <Button onClick={onNext} disabled={!canContinue}>
          Continue to test case
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function Status({
  tone,
  icon,
  children,
}: {
  tone: "ok" | "warn" | "error";
  icon: ReactNode;
  children: ReactNode;
}) {
  const color =
    tone === "ok"
      ? "text-[#0f8a5f] dark:text-[#3fb88a]"
      : tone === "warn"
        ? "text-[#9a6700] dark:text-[#e0b341]"
        : "text-[#c0334b] dark:text-[#ff7d8a]";
  return <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${color}`}>{icon}{children}</span>;
}

function HeroCard() {
  return (
    <Card className="overflow-hidden">
      <div className="grid items-stretch gap-6 p-6 lg:grid-cols-[1.5fr_1fr] lg:p-8">
        <div className="flex flex-col justify-center">
          <Eyebrow>UiPath Browser Test Autopilot</Eyebrow>
          <h1 className="mt-3 text-3xl font-semibold leading-tight text-[#182128] dark:text-[#e6edf1] lg:text-4xl">
            Describe a desktop browser test. Get a UiPath workflow with web selectors.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#667880] dark:text-[#9aabb4]">
            Connect UiPath, choose Chrome or Edge, write your steps in plain English, and watch the
            agent drive a desktop browser while capturing UiPath web selectors for every action.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Pill tone="orange">LLM Gateway planning</Pill>
            <Pill tone="blue">Chrome &amp; Edge</Pill>
            <Pill tone="emerald">Parallel browser runs</Pill>
            <Pill tone="navy">.xaml output</Pill>
          </div>
        </div>
        <div className="metric-grid relative flex flex-col rounded-3xl border border-[#eceff1] bg-white/70 p-6 dark:border-[#28333c] dark:bg-[#0d141a]/85">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#FA4616]">
            How it works
          </p>
          <ol className="mt-4 flex flex-1 flex-col justify-center gap-4 text-sm">
            {[
              "Connect UiPath",
              "Pick Chrome or Edge",
              "Agent drives the page",
              "Download the UiPath workflow",
            ].map((label, i) => (
              <li key={label} className="flex items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#fff1ec] text-sm font-semibold text-[#A33200] dark:bg-[#2c1812] dark:text-[#ff8a5c]">
                  {i + 1}
                </span>
                <span className="font-medium text-[#182128] dark:text-[#e6edf1]">{label}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </Card>
  );
}
