import { useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Globe,
  GripVertical,
  ListChecks,
  Monitor,
  Play,
  Plus,
  Tag,
  Trash2,
} from "lucide-react";
import type { FormState } from "../../App";
import type { DeviceConfig } from "../../lib/types";
import { Button, Card, Eyebrow, Field, Pill, Tabs, TextArea, TextField } from "../ui";

export function TestCaseStep({
  form,
  set,
  onBack,
  onRun,
  creating,
  error,
  devicePool,
  selected,
  onToggleSelected,
  onSelectAll,
}: {
  form: FormState;
  set: (partial: Partial<FormState>) => void;
  onBack: () => void;
  onRun: () => void;
  creating: boolean;
  error: string | null;
  devicePool: DeviceConfig[];
  selected: number[];
  onToggleSelected: (index: number) => void;
  onSelectAll: (all: boolean) => void;
}) {
  const app = form.app;
  const setApp = (patch: Partial<typeof app>) => set({ app: { ...app, ...patch } });
  const steps = form.testSteps;
  const selectedBrowsers = selected.map((i) => devicePool[i]).filter(Boolean) as DeviceConfig[];
  const validSteps = steps.map((s) => s.trim()).filter(Boolean).length;
  const startUrlReady = Boolean(app.startUrl?.trim());
  const allSelected = devicePool.length > 0 && selected.length === devicePool.length;
  const canRun = selectedBrowsers.length > 0 && startUrlReady && validSteps > 0;
  const missing: string[] = [];
  if (selectedBrowsers.length === 0) missing.push("at least one browser");
  if (!startUrlReady) missing.push("a start URL");
  if (validSteps === 0) missing.push("at least one test step");

  const [stepMode, setStepMode] = useState<"list" | "bulk">("list");

  const updateStep = (index: number, value: string) => {
    const next = [...steps];
    next[index] = value;
    set({ testSteps: next });
  };
  const addStep = () => set({ testSteps: [...steps, ""] });
  const removeStep = (index: number) => set({ testSteps: steps.filter((_, i) => i !== index) });
  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= steps.length) return;
    const next = [...steps];
    [next[index], next[target]] = [next[target], next[index]];
    set({ testSteps: next });
  };
  const setBulk = (text: string) => set({ testSteps: text.split("\n") });

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#182128] text-[#FA4616] dark:bg-[#22303a]">
            <Tag className="h-5 w-5" />
          </span>
          <div>
            <Eyebrow>Step 2 · Test case</Eyebrow>
            <h2 className="text-xl font-semibold text-[#182128] dark:text-[#e6edf1]">Name this browser test</h2>
          </div>
        </div>
        <Field label="Test case name" hint="used in the runs list, logs and downloaded .xaml/.json">
          <TextField
            value={form.title}
            onChange={(e) => set({ title: e.target.value })}
            placeholder="e.g. Login smoke - valid credentials"
            className="max-w-xl"
          />
        </Field>
      </Card>

      <Card className="p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#182128] text-[#FA4616] dark:bg-[#22303a]">
              <Monitor className="h-5 w-5" />
            </span>
            <div>
              <Eyebrow>Step 2 · Browsers</Eyebrow>
              <h2 className="text-xl font-semibold text-[#182128] dark:text-[#e6edf1]">Choose browser environments</h2>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {devicePool.length > 0 ? (
              <button
                type="button"
                onClick={() => onSelectAll(!allSelected)}
                className="text-sm font-semibold text-[#0BA2B3] hover:text-[#0a8a99] dark:text-[#22c0d0]"
              >
                {allSelected ? "Clear all" : "Select all"}
              </button>
            ) : null}
            <Pill tone={selected.length ? "slate" : "amber"}>
              {selected.length} of {devicePool.length} selected
            </Pill>
          </div>
        </div>

        {devicePool.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-[#e3e6e8] bg-[#fafbfb] px-4 py-6 text-center text-sm text-[#667880] dark:border-[#28333c] dark:bg-[#1d2830] dark:text-[#9aabb4]">
            No browser environments are ready. Go back to Connect and add Chrome or Edge.
          </p>
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {devicePool.map((browser, i) => {
              const isOn = selected.includes(i);
              return (
                <button
                  key={`${browser.deviceName}-${i}`}
                  type="button"
                  onClick={() => onToggleSelected(i)}
                  className={`flex items-center gap-3 rounded-2xl border p-3 text-left transition ${
                    isOn
                      ? "border-[#FA4616] bg-[#fff6f3] ring-1 ring-[#FA4616]/20 dark:bg-[#2c1812]"
                      : "border-[#eceff1] bg-white hover:border-[#d9d9d9] dark:border-[#28333c] dark:bg-[#161f27] dark:hover:border-[#33414c]"
                  }`}
                >
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                      isOn
                        ? "bg-[#FA4616] text-white"
                        : "bg-[#f1f3f4] text-[#9aa7ad] dark:bg-[#1d2830] dark:text-[#71808a]"
                    }`}
                  >
                    {isOn ? <CheckCircle2 className="h-5 w-5" /> : <Monitor className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[#182128] dark:text-[#e6edf1]">
                      {browser.deviceName || "Browser"}
                    </p>
                    <p className="truncate text-xs text-[#667880] dark:text-[#9aabb4]">
                      {browser.browser === "chrome" ? "Chrome" : "Edge"} -{" "}
                      {browser.headless ? `${browser.viewportWidth || 1440}x${browser.viewportHeight || 900} - headless` : "maximized"}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </Card>

      <Card className="p-6">
        <div className="mb-5 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#182128] text-[#FA4616] dark:bg-[#22303a]">
            <Globe className="h-5 w-5" />
          </span>
          <div>
            <Eyebrow>Step 2 · Site</Eyebrow>
            <h2 className="text-xl font-semibold text-[#182128] dark:text-[#e6edf1]">Open a desktop web page</h2>
          </div>
        </div>
        <Field label="Start URL" hint="opened before the first automation step">
          <TextField
            value={app.startUrl ?? ""}
            onChange={(e) => setApp({ startUrl: e.target.value })}
            placeholder="https://www.saucedemo.com"
            className="max-w-xl"
          />
        </Field>
      </Card>

      <Card className="p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#182128] text-[#FA4616] dark:bg-[#22303a]">
              <ListChecks className="h-5 w-5" />
            </span>
            <div>
              <Eyebrow>Step 2 · Actions</Eyebrow>
              <h2 className="text-xl font-semibold text-[#182128] dark:text-[#e6edf1]">Steps in plain English</h2>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Tabs<"list" | "bulk">
              value={stepMode}
              onChange={setStepMode}
              options={[
                { value: "list", label: "List" },
                { value: "bulk", label: "Bulk paste" },
              ]}
            />
            <Pill tone={validSteps ? "slate" : "amber"}>{validSteps} steps</Pill>
          </div>
        </div>

        <p className="mb-4 text-sm text-[#667880] dark:text-[#9aabb4]">
          One browser action per step. The agent reads the page, clicks or types as needed, and
          captures UiPath web selectors.
        </p>

        {stepMode === "bulk" ? (
          <div>
            <TextArea
              rows={Math.max(8, steps.length + 1)}
              value={steps.join("\n")}
              onChange={(e) => setBulk(e.target.value)}
              placeholder={`Paste your steps - one per line.\n\nEnter "standard_user" into the username field\nEnter "secret_sauce" into the password field\nClick the Login button\nVerify the Products page is shown`}
              className="font-mono text-[13px] leading-6"
            />
            <p className="mt-2 text-xs text-[#9aa7ad] dark:text-[#71808a]">
              Each non-empty line becomes one step.
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-2.5">
              {steps.map((step, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 rounded-2xl border border-[#eceff1] bg-white p-2.5 dark:border-[#28333c] dark:bg-[#161f27]"
                >
                  <span className="mt-1.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#fff1ec] text-xs font-semibold text-[#A33200] dark:bg-[#2c1812] dark:text-[#ff8a5c]">
                    {i + 1}
                  </span>
                  <TextArea
                    rows={1}
                    value={step}
                    onChange={(e) => updateStep(i, e.target.value)}
                    placeholder="e.g. Click the Login button"
                    className="flex-1"
                  />
                  <div className="flex flex-col gap-1 pt-0.5">
                    <button
                      type="button"
                      onClick={() => move(i, -1)}
                      className="text-[#aab4b9] hover:text-[#182128] dark:text-[#71808a] dark:hover:text-[#e6edf1]"
                      title="Move up"
                    >
                      <GripVertical className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeStep(i)}
                      className="text-[#d98b8b] hover:text-[#c0334b] dark:text-[#c8767e] dark:hover:text-[#ff7d8a]"
                      title="Remove step"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={addStep}
              className="mt-3 inline-flex items-center gap-2 rounded-full border border-dashed border-[#d9d9d9] px-4 py-2 text-sm font-semibold text-[#667880] transition hover:border-[#FA4616] hover:text-[#A33200] dark:border-[#28333c] dark:text-[#9aabb4] dark:hover:text-[#ff8a5c]"
            >
              <Plus className="h-4 w-4" />
              Add step
            </button>
          </>
        )}
      </Card>

      {error ? (
        <div className="flex items-center gap-2 rounded-2xl border border-[#ffd0d6] bg-[#fff0f2] px-4 py-3 text-sm text-[#c0334b] dark:border-[#4a242b] dark:bg-[#2c1519] dark:text-[#ff7d8a]">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      ) : !canRun ? (
        <div className="flex items-center gap-2 rounded-2xl border border-[#ffe6b3] bg-[#fff7e6] px-4 py-3 text-sm text-[#9a6700] dark:border-[#4a3f1c] dark:bg-[#2a2410] dark:text-[#e0b341]">
          <AlertCircle className="h-4 w-4 shrink-0" />
          To launch, add {missing.join(" and ")}.
        </div>
      ) : null}

      <div className="flex items-center justify-between">
        <Button variant="secondary" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <Button onClick={onRun} disabled={creating || !canRun}>
          <Play className="h-4 w-4" />
          {creating
            ? "Starting..."
            : selectedBrowsers.length > 1
              ? `Run on ${selectedBrowsers.length} browsers in parallel`
              : "Launch browser run"}
        </Button>
      </div>
    </div>
  );
}
