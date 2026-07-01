import type { FarmCredentials } from "../types.js";

export interface FarmApp {
  appId: string; // value to put in the `app` capability (bs://… or storage:…)
  name: string;
  customId?: string;
  uploadedAt?: string;
  platform?: "Android" | "iOS";
}

function inferPlatform(name: string, kind?: string): "Android" | "iOS" | undefined {
  const k = (kind ?? "").toLowerCase();
  if (k.includes("android")) return "Android";
  if (k.includes("ios")) return "iOS";
  const n = name.toLowerCase();
  if (n.endsWith(".apk") || n.endsWith(".aab")) return "Android";
  if (n.endsWith(".ipa")) return "iOS";
  return undefined;
}

function sauceStorageHost(region?: string): string {
  const r = (region || "us-west-1").trim();
  if (r.startsWith("eu")) return "api.eu-central-1.saucelabs.com";
  if (r.startsWith("us-east")) return "api.us-east-4.saucelabs.com";
  return "api.us-west-1.saucelabs.com";
}

function basicAuth(user: string, key: string): string {
  return "Basic " + Buffer.from(`${user}:${key}`).toString("base64");
}

// --- List already-uploaded apps --------------------------------------------
export async function listFarmApps(creds: FarmCredentials): Promise<FarmApp[]> {
  if (!creds.username || !creds.accessKey) {
    throw new Error("Device-farm credentials are required to list apps.");
  }

  if (creds.provider === "browserstack") {
    const res = await fetch("https://api-cloud.browserstack.com/app-automate/recent_apps", {
      headers: { Authorization: basicAuth(creds.username, creds.accessKey) },
    });
    if (!res.ok) {
      throw new Error(`BrowserStack list failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
    }
    const data = (await res.json()) as
      | Array<{ app_name: string; app_url: string; custom_id?: string | null; uploaded_at?: string }>
      | { message: string };
    if (!Array.isArray(data)) return [];
    return data.map((a) => ({
      appId: a.app_url,
      name: a.app_name,
      customId: a.custom_id ?? undefined,
      uploadedAt: a.uploaded_at,
      platform: inferPlatform(a.app_name),
    }));
  }

  // Sauce Labs storage
  const host = sauceStorageHost(creds.region);
  const res = await fetch(`https://${host}/v1/storage/files?per_page=50`, {
    headers: { Authorization: basicAuth(creds.username, creds.accessKey) },
  });
  if (!res.ok) {
    throw new Error(`Sauce Labs list failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    items?: Array<{ id: string; name: string; kind?: string; upload_timestamp?: number }>;
  };
  return (data.items ?? []).map((f) => ({
    appId: `storage:${f.id}`,
    name: f.name,
    uploadedAt: f.upload_timestamp ? new Date(f.upload_timestamp * 1000).toISOString() : undefined,
    platform: inferPlatform(f.name, f.kind),
  }));
}

// --- Upload an app (binary buffer or public URL) ----------------------------
export async function uploadFarmApp(
  creds: FarmCredentials,
  payload: { file?: { buffer: Buffer; filename: string }; url?: string; customId?: string },
): Promise<FarmApp> {
  if (!creds.username || !creds.accessKey) {
    throw new Error("Device-farm credentials are required to upload an app.");
  }
  if (!payload.file && !payload.url) {
    throw new Error("Provide either a file or a public URL to upload.");
  }

  if (creds.provider === "browserstack") {
    const form = new FormData();
    if (payload.file) {
      form.append("file", new Blob([payload.file.buffer]), payload.file.filename);
    } else if (payload.url) {
      form.append("url", payload.url);
    }
    if (payload.customId) form.append("custom_id", payload.customId);

    const res = await fetch("https://api-cloud.browserstack.com/app-automate/upload", {
      method: "POST",
      headers: { Authorization: basicAuth(creds.username, creds.accessKey) },
      body: form,
    });
    if (!res.ok) {
      throw new Error(`BrowserStack upload failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
    }
    const data = (await res.json()) as { app_url?: string; custom_id?: string; error?: string };
    if (!data.app_url) throw new Error(data.error || "BrowserStack upload returned no app_url.");
    return { appId: data.app_url, name: payload.file?.filename || payload.url || data.app_url, customId: data.custom_id };
  }

  // Sauce Labs storage upload (file only; URL upload not supported the same way)
  const host = sauceStorageHost(creds.region);
  if (!payload.file) {
    throw new Error("Sauce Labs upload requires a file (URL upload is not supported).");
  }
  const form = new FormData();
  form.append("payload", new Blob([payload.file.buffer]), payload.file.filename);
  form.append("name", payload.file.filename);

  const res = await fetch(`https://${host}/v1/storage/upload`, {
    method: "POST",
    headers: { Authorization: basicAuth(creds.username, creds.accessKey) },
    body: form,
  });
  if (!res.ok) {
    throw new Error(`Sauce Labs upload failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }
  const data = (await res.json()) as { item?: { id: string; name: string } };
  if (!data.item?.id) throw new Error("Sauce Labs upload returned no file id.");
  return { appId: `storage:${data.item.id}`, name: data.item.name };
}
