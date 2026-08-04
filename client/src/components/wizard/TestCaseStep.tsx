import { useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  GripVertical,
  ListChecks,
  Package,
  Play,
  Plus,
  Smartphone,
  Tag,
  Trash2,
} from "lucide-react";
import type { FormState } from "../../App";
import type { AndroidBuild, DeviceConfig, FarmApp, IosBuild } from "../../lib/types";
import { Button, Card, Eyebrow, Field, Pill, Tabs, TextArea, TextField } from "../ui";
import { AppPicker } from "../AppPicker";

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
  const a = form.app;
  const setA = (patch: Partial<typeof a>) => set({ app: { ...a, ...patch } });
  const setAndroid = (patch: Partial<AndroidBuild>) =>
    setA({ android: { buildId: "", ...a.android, ...patch } });
  const setIos = (patch: Partial<IosBuild>) => setA({ ios: { buildId: "", ...a.ios, ...patch } });
  const onPickAndroid = (app: FarmApp) =>
    setA({ android: { ...a.android, buildId: app.appId }, appName: a.appName || app.name });
  const onPickIos = (app: FarmApp) =>
    setA({ ios: { ...a.ios, buildId: app.appId }, appName: a.appName || app.name });
  const steps = form.testSteps;

  const updateStep = (index: number, value: string) => {
    const next = [...steps];
    next[index] = value;
    set({ testSteps: next });
  };
  const addStep = () => set({ testSteps: [...steps, ""] });
  const removeStep = (index: number) =>
    set({ testSteps: steps.filter((_, i) => i !== index) });
  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= steps.length) return;
    const next = [...steps];
    [next[index], next[target]] = [next[target], next[index]];
    set({ testSteps: next });
  };

  const [stepMode, setStepMode] = useState<"list" | "bulk">("list");
  const setBulk = (text: string) => set({ testSteps: text.split("\n") });

  // Derive which app fields to show from the SELECTED pooled devices.
  const selectedDevices = selected.map((i) => devicePool[i]).filter(Boolean) as DeviceConfig[];
  const hasNative = selectedDevices.some((d) => d.connectionTarget !== "browser");
  const hasBrowser = selectedDevices.some((d) => d.connectionTarget === "browser");
  const hasAndroidNative = selectedDevices.some(
    (d) => d.connectionTarget !== "browser" && d.platform === "Android",
  );
  const hasIosNative = selectedDevices.some(
    (d) => d.connectionTarget !== "browser" && d.platform === "iOS",
  );
  const allSelected = devicePool.length > 0 && selected.length === devicePool.length;

  const deviceSummary = (d: DeviceConfig) =>
    d.connectionTarget === "browser"
      ? `${d.browser ? d.browser : d.platform === "iOS" ? "Safari" : "Chrome"} browser`
      : "Native app";

  const androidReady = !hasAndroidNative || Boolean(a.android?.buildId?.trim());
  const iosReady = !hasIosNative || Boolean(a.ios?.buildId?.trim());
  const browserReady = !hasBrowser || Boolean(a.startUrl?.trim());

  const validSteps = steps.map((s) => s.trim()).filter(Boolean).length;
  const canRun =
    validSteps > 0 && selectedDevices.length > 0 && androidReady && iosReady && browserReady;
  const missing: string[] = [];
  if (selectedDevices.length === 0) missing.push("at least one device selected");
  if (validSteps === 0) missing.push("at least one test step");
  if (!androidReady) missing.push("an Android build id (.apk/.aab)");
  if (!iosReady) missing.push("an iOS build id (.ipa)");
  if (!browserReady) missing.push("a start URL (for browser devices)");

  return (
    <div className="space-y-6">
      {/* Test case identity */}
      <Card className="p-6">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#182128] dark:bg-[#22303a] text-[#FA4616]">
            <Tag className="h-5 w-5" />
          </span>
          <div>
            <Eyebrow>Step 2 · Test case</Eyebrow>
            <h2 className="text-xl font-semibold text-[#182128] dark:text-[#e6edf1]">Name this test case</h2>
          </div>
        </div>
        <Field
          label="Test case name"
          hint="used as the run identifier in the runs list, logs and the downloaded .xaml/.json"
        >
          <TextField
            value={form.title}
            onChange={(e) => set({ title: e.target.value })}
            placeholder="e.g. Login smoke - valid credentials"
            className="max-w-xl"
          />
        </Field>
      </Card>

      {/* Device selection from the run pool */}
      <Card className="p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#182128] dark:bg-[#22303a] text-[#FA4616]">
              <Smartphone className="h-5 w-5" />
            </span>
            <div>
              <Eyebrow>Step 2 · Devices</Eyebrow>
              <h2 className="text-xl font-semibold text-[#182128] dark:text-[#e6edf1]">Pick devices to run on</h2>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {devicePool.length > 0 ? (
              <button
                type="button"
                onClick={() => onSelectAll(!allSelected)}
                className="text-sm font-semibold text-[#0BA2B3] dark:text-[#22c0d0] hover:text-[#0a8a99]"
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
          <p className="rounded-2xl border border-dashed border-[#e3e6e8] dark:border-[#28333c] bg-[#fafbfb] dark:bg-[#1d2830] px-4 py-6 text-center text-sm text-[#667880] dark:text-[#9aabb4]">
            No devices in the run pool. Go back to Connect and add one or more devices.
          </p>
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {devicePool.map((d, i) => {
              const isOn = selected.includes(i);
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => onToggleSelected(i)}
                  className={`flex items-center gap-3 rounded-2xl border p-3 text-left transition ${
                    isOn
                      ? "border-[#FA4616] bg-[#fff6f3] dark:bg-[#2c1812] ring-1 ring-[#FA4616]/20"
                      : "border-[#eceff1] dark:border-[#28333c] bg-white dark:bg-[#161f27] hover:border-[#d9d9d9] dark:hover:border-[#33414c]"
                  }`}
                >
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                      isOn ? "bg-[#FA4616] text-white" : "bg-[#f1f3f4] dark:bg-[#1d2830] text-[#9aa7ad] dark:text-[#71808a]"
                    }`}
                  >
                    {isOn ? (
                      <CheckCircle2 className="h-5 w-5" />
                    ) : (
                      <Smartphone className="h-4 w-4" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[#182128] dark:text-[#e6edf1]">
                      {d.deviceName || "device"}
                    </p>
                    <p className="truncate text-xs text-[#667880] dark:text-[#9aabb4]">
                      {d.platform} {d.osVersion} · {deviceSummary(d)}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </Card>

      {/* App under test - fields shown depend on the selected devices' targets */}
      <Card className="p-6">
        <div className="mb-5 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#182128] dark:bg-[#22303a] text-[#FA4616]">
            <Package className="h-5 w-5" />
          </span>
          <div>
            <Eyebrow>Step 2 · Application</Eyebrow>
            <h2 className="text-xl font-semibold text-[#182128] dark:text-[#e6edf1]">App under test</h2>
          </div>
        </div>

        {selectedDevices.length === 0 ? (
          <p className="text-sm text-[#667880] dark:text-[#9aabb4]">Select at least one device above to configure the app.</p>
        ) : (
          <div className="space-y-6">
            {hasNative ? (
              <Field label="App name" hint="shown on dashboards and the device-farm session">
                <TextField
                  value={a.appName ?? ""}
                  onChange={(e) => setA({ appName: e.target.value })}
                  placeholder="ACME Shopping"
                  className="max-w-md"
                />
              </Field>
            ) : null}

            {hasAndroidNative ? (
              <div className="rounded-2xl border border-[#eceff1] dark:border-[#28333c] bg-[#fafbfc] dark:bg-[#1d2830] p-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#667880] dark:text-[#9aabb4]">
                  Android build (.apk / .aab) - shared by all Android devices
                </p>
                <div className="grid gap-4 md:grid-cols-3">
                  <Field label="Build id" hint="bs://… , storage:… or lt://… (uploaded build)">
                    <TextField
                      value={a.android?.buildId ?? ""}
                      onChange={(e) => setAndroid({ buildId: e.target.value })}
                      placeholder="bs://<hashed-app-id>"
                    />
                  </Field>
                  <Field label="App package" hint="optional">
                    <TextField
                      value={a.android?.appPackage ?? ""}
                      onChange={(e) => setAndroid({ appPackage: e.target.value })}
                      placeholder="com.acme.shopping"
                    />
                  </Field>
                  <Field label="App activity" hint="optional - leave blank if unsure">
                    <TextField
                      value={a.android?.appActivity ?? ""}
                      onChange={(e) => setAndroid({ appActivity: e.target.value })}
                      placeholder=".MainActivity"
                    />
                  </Field>
                </div>
                {form.farm.provider !== "custom" ? (
                  <div className="mt-4">
                    <AppPicker
                      farm={form.farm}
                      platform="Android"
                      currentAppId={a.android?.buildId ?? ""}
                      onPick={onPickAndroid}
                    />
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-[#667880] dark:text-[#9aabb4]">
                    For a custom Appium hub, enter the app reference your hub expects in the Build id
                    field above (e.g. a path on the Appium host or a URL).
                  </p>
                )}
              </div>
            ) : null}

            {hasIosNative ? (
              <div className="rounded-2xl border border-[#eceff1] dark:border-[#28333c] bg-[#fafbfc] dark:bg-[#1d2830] p-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#667880] dark:text-[#9aabb4]">
                  iOS build (.ipa) - shared by all iOS devices
                </p>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Build id" hint="bs://… , storage:… or lt://… (uploaded build)">
                    <TextField
                      value={a.ios?.buildId ?? ""}
                      onChange={(e) => setIos({ buildId: e.target.value })}
                      placeholder="bs://<hashed-app-id>"
                    />
                  </Field>
                  <Field label="Bundle id" hint="optional">
                    <TextField
                      value={a.ios?.bundleId ?? ""}
                      onChange={(e) => setIos({ bundleId: e.target.value })}
                      placeholder="com.acme.shopping"
                    />
                  </Field>
                </div>
                {form.farm.provider !== "custom" ? (
                  <div className="mt-4">
                    <AppPicker
                      farm={form.farm}
                      platform="iOS"
                      currentAppId={a.ios?.buildId ?? ""}
                      onPick={onPickIos}
                    />
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-[#667880] dark:text-[#9aabb4]">
                    For a custom Appium hub, enter the app reference your hub expects in the Build id
                    field above (e.g. a path on the Appium host or a URL).
                  </p>
                )}
              </div>
            ) : null}

            {hasBrowser ? (
              <Field label="Start URL" hint="opened on the device browser (shared across Android + iOS)">
                <TextField
                  value={a.startUrl ?? ""}
                  onChange={(e) => setA({ startUrl: e.target.value })}
                  placeholder="https://www.saucedemo.com"
                  className="max-w-md"
                />
              </Field>
            ) : null}
          </div>
        )}
      </Card>

      <Card className="p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#182128] dark:bg-[#22303a] text-[#FA4616]">
              <ListChecks className="h-5 w-5" />
            </span>
            <div>
              <Eyebrow>Step 2 · Test case</Eyebrow>
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
          One action per step. The agent reads the live screen and maps each step to a single
          mobile action with a captured UiPath selector.
        </p>

        {stepMode === "bulk" ? (
          <div>
            <TextArea
              rows={Math.max(8, steps.length + 1)}
              value={steps.join("\n")}
              onChange={(e) => setBulk(e.target.value)}
              placeholder={`Paste your steps - one per line, ONE action per step. e.g.\n\nEnter "standard_user" into the username field\nEnter "secret_sauce" into the password field\nTap the Login button\nWait for the Products page to appear\n\nUnique data per run (the word 'random' alone will NOT vary):\n\nEnter the passport number R{{digits:7}}\nEnter the email {{email}}\n\nOptional steps and conditions:\n\nOptional: Tap the "Allow" button\n\nIf "OTP incorrect" is displayed\n  Tap "Request A New OTP"\n  Enter the OTP 0000\nEnd if`}
              className="font-mono text-[13px] leading-6"
            />
            <p className="mt-2 text-xs text-[#9aa7ad] dark:text-[#71808a]">
              Each non-empty line is treated as one step. Blank lines are ignored.
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-2.5">
              {steps.map((step, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 rounded-2xl border border-[#eceff1] dark:border-[#28333c] bg-white dark:bg-[#161f27] p-2.5"
                >
                  <span className="mt-1.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#fff1ec] dark:bg-[#2c1812] text-xs font-semibold text-[#A33200] dark:text-[#ff8a5c]">
                    {i + 1}
                  </span>
                  <TextArea
                    rows={1}
                    value={step}
                    onChange={(e) => updateStep(i, e.target.value)}
                    placeholder={`e.g. Tap the "Log in" button`}
                    className="flex-1"
                  />
                  <div className="flex flex-col gap-1 pt-0.5">
                    <button
                      type="button"
                      onClick={() => move(i, -1)}
                      className="text-[#aab4b9] dark:text-[#71808a] hover:text-[#182128] dark:hover:text-[#e6edf1]"
                      title="Move up"
                    >
                      <GripVertical className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeStep(i)}
                      className="text-[#d98b8b] dark:text-[#c8767e] hover:text-[#c0334b] dark:hover:text-[#ff7d8a]"
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
              className="mt-3 inline-flex items-center gap-2 rounded-full border border-dashed border-[#d9d9d9] dark:border-[#28333c] px-4 py-2 text-sm font-semibold text-[#667880] dark:text-[#9aabb4] transition hover:border-[#FA4616] hover:text-[#A33200] dark:hover:text-[#ff8a5c]"
            >
              <Plus className="h-4 w-4" />
              Add step
            </button>
          </>
        )}
      </Card>

      {error ? (
        <div className="flex items-center gap-2 rounded-2xl border border-[#ffd0d6] dark:border-[#4a242b] bg-[#fff0f2] dark:bg-[#2c1519] px-4 py-3 text-sm text-[#c0334b] dark:text-[#ff7d8a]">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      ) : !canRun ? (
        <div className="flex items-center gap-2 rounded-2xl border border-[#ffe6b3] dark:border-[#4a3f1c] bg-[#fff7e6] dark:bg-[#2a2410] px-4 py-3 text-sm text-[#9a6700] dark:text-[#e0b341]">
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
            ? "Starting…"
            : selectedDevices.length > 1
              ? `Run on ${selectedDevices.length} devices in parallel`
              : "Launch run"}
        </Button>
      </div>
    </div>
  );
}
