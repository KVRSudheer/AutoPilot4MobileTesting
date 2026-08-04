import type { FarmCredentials } from "../types.js";
import { lambdaTestRegion } from "./lambdatest.js";

// OS -> device name -> available OS versions (sorted desc).
export interface DeviceCatalog {
  Android: Record<string, string[]>;
  iOS: Record<string, string[]>;
}

function basicAuth(user: string, key: string): string {
  return "Basic " + btoa(`${user}:${key}`);
}

function sauceApiHost(region?: string): string {
  const r = (region || "us-west-1").trim();
  if (r.startsWith("eu")) return "api.eu-central-1.saucelabs.com";
  if (r.startsWith("us-east")) return "api.us-east-4.saucelabs.com";
  return "api.us-west-1.saucelabs.com";
}

function addEntry(cat: DeviceCatalog, os: string, name: string, version: string): void {
  const key = os.includes("android") ? "Android" : os.includes("ios") ? "iOS" : null;
  if (!key || !name) return;
  const list = (cat[key][name] ??= []);
  if (version && !list.includes(version)) list.push(version);
}

function sortCatalog(cat: DeviceCatalog): DeviceCatalog {
  for (const os of ["Android", "iOS"] as const) {
    for (const name of Object.keys(cat[os])) {
      cat[os][name].sort((a, b) => parseFloat(b) - parseFloat(a));
    }
  }
  return cat;
}

async function sauceDevices(creds: FarmCredentials): Promise<DeviceCatalog> {
  const host = sauceApiHost(creds.region);
  const auth = basicAuth(creds.username ?? "", creds.accessKey ?? "");

  // /v1/rdc/devices is a GLOBAL catalog with no region field, so we intersect
  // it with /devices/available (region-scoped) to only list devices that are
  // actually bookable in this data center.
  const [res, availRes] = await Promise.all([
    fetch(`https://${host}/v1/rdc/devices`, { headers: { Authorization: auth } }),
    fetch(`https://${host}/v1/rdc/devices/available`, { headers: { Authorization: auth } }).catch(
      () => null,
    ),
  ]);
  if (!res.ok) {
    throw new Error(`Sauce device list failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
  const data = (await res.json()) as unknown;
  const items = (Array.isArray(data) ? data : ((data as { entities?: unknown[] }).entities ?? [])) as Array<
    Record<string, unknown>
  >;

  let available: Set<string> | null = null;
  if (availRes && availRes.ok) {
    const av = (await availRes.json()) as unknown;
    if (Array.isArray(av)) available = new Set(av.map((x) => String(x)));
  }

  const cat: DeviceCatalog = { Android: {}, iOS: {} };
  for (const d of items) {
    const id = String(d.id ?? "");
    // Region filter: keep only devices present in this data center's pool.
    if (available && id && !available.has(id)) continue;
    const os = String(d.os ?? "").toLowerCase();
    const name = String(d.name ?? d.deviceName ?? "");
    const version = String(d.osVersion ?? d.os_version ?? "");
    addEntry(cat, os, name, version);
  }
  return sortCatalog(cat);
}

// BrowserStack App Automate has no simple authed JSON device list, so we ship a
// curated set of popular, currently-supported devices/versions.
function browserStackDevices(): DeviceCatalog {
  return sortCatalog({
    Android: {
      "Google Pixel 8 Pro": ["14.0"],
      "Google Pixel 8": ["14.0"],
      "Google Pixel 7": ["13.0"],
      "Google Pixel 6": ["12.0"],
      "Samsung Galaxy S23 Ultra": ["13.0"],
      "Samsung Galaxy S22 Ultra": ["12.0"],
      "Samsung Galaxy S21": ["12.0", "11.0"],
      "Samsung Galaxy A52": ["11.0"],
      "OnePlus 11R": ["13.0"],
      "Xiaomi Redmi Note 11": ["11.0"],
    },
    iOS: {
      "iPhone 15 Pro Max": ["17"],
      "iPhone 15": ["17"],
      "iPhone 14 Pro": ["16"],
      "iPhone 14": ["16"],
      "iPhone 13": ["15", "16"],
      "iPhone 12": ["14", "16"],
      "iPhone SE 2022": ["15"],
      "iPad Pro 12.9 2022": ["16"],
    },
  });
}

// LambdaTest publishes its real-device pool as a flat JSON list.
async function lambdaTestDevices(creds: FarmCredentials): Promise<DeviceCatalog> {
  const region = lambdaTestRegion(creds.region).toLowerCase();
  const res = await fetch(
    `https://mobile-api.lambdatest.com/mobile-automation/api/v1/list?region=${region}`,
    { headers: { Authorization: basicAuth(creds.username ?? "", creds.accessKey ?? "") } },
  );
  if (!res.ok) {
    throw new Error(
      `LambdaTest device list failed (${res.status}): ${(await res.text()).slice(0, 200)}`,
    );
  }
  const data = (await res.json()) as unknown;

  const cat: DeviceCatalog = { Android: {}, iOS: {} };

  // The payload is either {android:[…], ios:[…]} or a flat array of devices;
  // each entry carries a device name plus one or more OS versions.
  const ingest = (osHint: string, entries: unknown): void => {
    if (!Array.isArray(entries)) return;
    for (const raw of entries as Array<Record<string, unknown>>) {
      // The live API returns `platformName` ("android" | "ios" | "tvos" | …);
      // without it every device falls back to the hint and iOS lands under
      // Android. Non-mobile platforms are dropped by addEntry.
      const os = String(
        raw.platformName ?? raw.platform ?? raw.os ?? raw.osName ?? osHint,
      ).toLowerCase();
      const name = String(raw.deviceName ?? raw.device_name ?? raw.name ?? "");
      const versions = raw.versions ?? raw.version ?? raw.osVersion ?? raw.platformVersion;
      if (Array.isArray(versions)) {
        for (const v of versions) {
          const version = typeof v === "object" && v ? String((v as Record<string, unknown>).version ?? "") : String(v);
          addEntry(cat, os, name, version);
        }
      } else if (versions != null) {
        addEntry(cat, os, name, String(versions));
      }
    }
  };

  if (Array.isArray(data)) {
    ingest("android", data);
  } else if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    ingest("android", obj.android ?? obj.Android);
    ingest("ios", obj.ios ?? obj.iOS);
    // Some responses nest everything under `devices`.
    ingest("android", obj.devices);
  }
  return sortCatalog(cat);
}

export async function listFarmDevices(creds: FarmCredentials): Promise<DeviceCatalog> {
  if (creds.provider === "custom") {
    // No device-list API for a self-hosted hub - the user enters device + OS manually.
    return { Android: {}, iOS: {} };
  }
  if (creds.provider === "saucelabs") {
    if (!creds.username || !creds.accessKey) {
      throw new Error("Sauce Labs username and access key are required to list devices.");
    }
    return sauceDevices(creds);
  }
  if (creds.provider === "lambdatest") {
    if (!creds.username || !creds.accessKey) {
      throw new Error("LambdaTest username and access key are required to list devices.");
    }
    return lambdaTestDevices(creds);
  }
  // BrowserStack - curated list (works without credentials).
  return browserStackDevices();
}
