import { useRef, useState } from "react";
import {
  CheckCircle2,
  CloudUpload,
  FolderSearch,
  Link2,
  Loader2,
  RefreshCw,
  Smartphone,
} from "lucide-react";
import type { FarmApp, FarmCredentials, Platform } from "../lib/types";
import { listFarmApps, uploadFarmApp } from "../lib/api";
import { Button, Pill, TextField } from "./ui";

type Mode = "browse" | "upload";

export function AppPicker({
  farm,
  platform,
  currentAppId,
  onPick,
}: {
  farm: FarmCredentials;
  platform: Platform;
  currentAppId: string;
  onPick: (app: FarmApp) => void;
}) {
  const [mode, setMode] = useState<Mode>("browse");
  const [apps, setApps] = useState<FarmApp[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const providerLabel = farm.provider === "browserstack" ? "BrowserStack" : "Sauce Labs";
  // Only show apps that match the selected platform (apps with unknown
  // platform are always shown).
  const visibleApps = apps ? apps.filter((a) => !a.platform || a.platform === platform) : null;

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      setApps(await listFarmApps(farm));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load apps.");
    } finally {
      setLoading(false);
    }
  };

  const doUpload = async (source: { file?: File; url?: string }) => {
    setLoading(true);
    setError(null);
    try {
      const app = await uploadFarmApp(farm, source);
      onPick(app);
      setApps((prev) => (prev ? [app, ...prev] : [app]));
      setUrl("");
      if (fileRef.current) fileRef.current.value = "";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setLoading(false);
    }
  };

  const hasCreds = Boolean(farm.username && farm.accessKey);

  return (
    <div className="rounded-2xl border border-[#eceff1] dark:border-[#28333c] bg-[#fafbfc] dark:bg-[#1d2830] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-full border border-[#e1e4e6] dark:border-[#28333c] bg-white dark:bg-[#161f27] p-1">
          <button
            type="button"
            onClick={() => setMode("browse")}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              mode === "browse" ? "bg-[#182128] text-white" : "text-[#667880] dark:text-[#9aabb4]"
            }`}
          >
            <FolderSearch className="h-3.5 w-3.5" />
            Browse uploaded
          </button>
          <button
            type="button"
            onClick={() => setMode("upload")}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              mode === "upload" ? "bg-[#182128] text-white" : "text-[#667880] dark:text-[#9aabb4]"
            }`}
          >
            <CloudUpload className="h-3.5 w-3.5" />
            Upload new
          </button>
        </div>
        <Pill tone={hasCreds ? "slate" : "amber"}>{providerLabel}</Pill>
      </div>

      {!hasCreds ? (
        <p className="text-xs text-[#9a6700] dark:text-[#e0b341]">
          Enter your {providerLabel} username and access key on the Connect step to browse or upload
          apps. (Or paste a {farm.provider === "browserstack" ? "bs://" : "storage:"} id manually
          above.)
        </p>
      ) : mode === "browse" ? (
        <div>
          <Button variant="secondary" onClick={refresh} disabled={loading} type="button">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {apps ? "Refresh list" : "Load my apps"}
          </Button>
          {error ? <p className="mt-2 text-xs text-[#c0334b] dark:text-[#ff7d8a]">{error}</p> : null}
          {visibleApps && visibleApps.length === 0 ? (
            <p className="mt-2 text-xs text-[#667880] dark:text-[#9aabb4]">
              No {platform} apps found{apps && apps.length ? " for this platform" : " yet"} - switch
              the OS on the Connect step, or use “Upload new”.
            </p>
          ) : null}
          {visibleApps && visibleApps.length > 0 ? (
            <div className="scrollbar-thin mt-3 max-h-56 space-y-1.5 overflow-y-auto pr-1">
              {visibleApps.map((app) => {
                const selected = app.appId === currentAppId;
                return (
                  <button
                    key={app.appId}
                    type="button"
                    onClick={() => onPick(app)}
                    className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left transition ${
                      selected
                        ? "border-[#FA4616] bg-[#fff1ec] dark:bg-[#2c1812]"
                        : "border-[#eceff1] dark:border-[#28333c] bg-white dark:bg-[#161f27] hover:border-[#0BA2B3]"
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <Smartphone className="h-4 w-4 shrink-0 text-[#667880] dark:text-[#9aabb4]" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-[#182128] dark:text-[#e6edf1]">
                          {app.name}
                        </span>
                        <span className="block truncate font-mono text-[11px] text-[#9aa7ad] dark:text-[#71808a]">
                          {app.appId}
                        </span>
                      </span>
                    </span>
                    {selected ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-[#FA4616]" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept={platform === "iOS" ? ".ipa,.zip" : ".apk,.aab,.zip"}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void doUpload({ file: f });
              }}
              className="block w-full text-xs text-[#667880] dark:text-[#9aabb4] file:mr-3 file:rounded-full file:border-0 file:bg-[#182128] file:px-4 file:py-2 file:text-xs file:font-semibold file:text-white hover:file:bg-[#0f161b]"
            />
          </div>
          {farm.provider === "browserstack" ? (
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex-1 min-w-[220px]">
                <TextField
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="…or a public URL to the .apk/.ipa"
                />
              </div>
              <Button
                variant="secondary"
                type="button"
                disabled={loading || !url.trim()}
                onClick={() => void doUpload({ url: url.trim() })}
              >
                <Link2 className="h-4 w-4" />
                Upload URL
              </Button>
            </div>
          ) : null}
          {loading ? (
            <p className="flex items-center gap-2 text-xs text-[#1E6482] dark:text-[#6db3d6]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Uploading to {providerLabel}…
            </p>
          ) : null}
          {error ? <p className="text-xs text-[#c0334b] dark:text-[#ff7d8a]">{error}</p> : null}
        </div>
      )}
    </div>
  );
}
