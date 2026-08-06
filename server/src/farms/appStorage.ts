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

  if (creds.provider === "lambdatest") {
    // Apps are bucketed by PLATFORM, not by device kind: /app/list?type=android
    // and ?type=ios. (`type=realDevice` is accepted but always returns an empty
    // list, and `app_type` is rejected outright.)
    const auth = basicAuth(creds.username, creds.accessKey);
    const fetchType = async (type: "android" | "ios"): Promise<FarmApp[]> => {
      const res = await fetch(`https://manual-api.lambdatest.com/app/list?type=${type}`, {
        headers: { Authorization: auth },
      });
      if (!res.ok) {
        throw new Error(
          `LambdaTest list failed (${res.status}): ${(await res.text()).slice(0, 200)}`,
        );
      }
      const payload = (await res.json()) as { data?: Array<Record<string, unknown>> };
      return (payload.data ?? [])
        .map((a) => {
          // Builds are referenced as lt://<app_id>; the API returns the bare id.
          const rawId = String(a.app_url ?? a.app_id ?? "");
          return {
            appId: rawId && !rawId.startsWith("lt://") ? `lt://${rawId}` : rawId,
            name: String(a.name ?? a.app_name ?? rawId),
            uploadedAt: a.created_at ? String(a.created_at) : undefined,
            // The bucket itself is the platform - more reliable than the filename.
            platform: type === "ios" ? ("iOS" as const) : ("Android" as const),
          };
        })
        .filter((a) => a.appId);
    };

    const [android, ios] = await Promise.all([fetchType("android"), fetchType("ios")]);
    return [...android, ...ios];
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

  if (creds.provider === "lambdatest") {
    // Multipart: `appFile` for a binary or `url` for a public link, plus a
    // display `name`. The platform is inferred by LambdaTest from the binary,
    // so no type field is sent.
    const form = new FormData();
    if (payload.file) {
      form.append("appFile", new Blob([payload.file.buffer]), payload.file.filename);
    } else if (payload.url) {
      form.append("url", payload.url);
    }
    if (payload.customId) form.append("custom_id", payload.customId);
    form.append("name", payload.file?.filename || payload.customId || "autopilot-app");

    const res = await fetch("https://manual-api.lambdatest.com/app/upload/realDevice", {
      method: "POST",
      headers: { Authorization: basicAuth(creds.username, creds.accessKey) },
      body: form,
    });
    if (!res.ok) {
      throw new Error(`LambdaTest upload failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
    }
    const data = (await res.json()) as { app_id?: string; app_url?: string; name?: string; message?: string };
    const appId = data.app_url || (data.app_id ? `lt://${data.app_id}` : "");
    if (!appId) throw new Error(data.message || "LambdaTest upload returned no app id.");
    return { appId, name: data.name || payload.file?.filename || appId };
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
