import { useState } from "react";
import {
  AppWindow,
  ArrowRight,
  CheckCircle2,
  Globe,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Trash2,
  TriangleAlert,
  Wand2,
} from "lucide-react";
import type { FormState } from "../../App";
import type {
  ConnectionTarget,
  DeviceCatalog,
  DeviceConfig,
  FarmProvider,
  Platform,
  ServerDefaults,
  UiPathAuthMode,
} from "../../lib/types";
import {
  listFarmDevices,
  listUiPathModels,
  validateUiPath,
  type UiPathValidation,
} from "../../lib/api";
import { hostedWithoutBackend } from "../../lib/bridge";
import { useBridgeActive } from "../BridgeMedia";
import {
  AtomLoader,
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

// Curated set of current, valid LLM Gateway models (exact normalized-API
// names). Fixed list - we don't pull the tenant's full catalog of legacy models.
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
const PROVIDER_OPTIONS: ComboOption[] = [
  { value: "browserstack", label: "BrowserStack App Automate" },
  { value: "saucelabs", label: "Sauce Labs Real Device Cloud" },
  { value: "lambdatest", label: "LambdaTest Real Device Cloud" },
  { value: "custom", label: "Custom Appium endpoint (self-hosted)" },
];
const REGION_OPTIONS = ["us-west-1", "us-east-4", "eu-central-1"];
// Device location presets. Two independent things are set together:
//  * geo   - the IP country the provider routes through (backend geo-gating)
//  * gps   - the coordinates the device reports, which is what an app's
//            "use my current location" actually reads
interface LocationPreset {
  value: string;
  label: string;
  geo?: string;
  gps?: string;
  /** Continent heading in the dropdown. */
  region?: string;
}
const LOCATION_PRESETS: LocationPreset[] = [
  { value: "", label: "Data-centre default (no override)" },
  { value: "za-cape-town", label: "Cape Town, South Africa", geo: "ZA", gps: "-33.9249,18.4241", region: "Africa" },
  { value: "za-n1-city-goodwood", label: "N1 City (Goodwood), Cape Town", geo: "ZA", gps: "-33.8903,18.5567", region: "Africa" },
  { value: "za-johannesburg", label: "Johannesburg, South Africa", geo: "ZA", gps: "-26.2041,28.0473", region: "Africa" },
  { value: "za-pretoria", label: "Pretoria, South Africa", geo: "ZA", gps: "-25.7479,28.2293", region: "Africa" },
  { value: "za-durban", label: "Durban, South Africa", geo: "ZA", gps: "-29.8587,31.0218", region: "Africa" },
  { value: "za-port-elizabeth", label: "Port Elizabeth, South Africa", geo: "ZA", gps: "-33.9608,25.6022", region: "Africa" },
  { value: "za-bloemfontein", label: "Bloemfontein, South Africa", geo: "ZA", gps: "-29.0852,26.1596", region: "Africa" },
  { value: "ng-lagos", label: "Lagos, Nigeria", geo: "NG", gps: "6.5244,3.3792", region: "Africa" },
  { value: "ke-nairobi", label: "Nairobi, Kenya", geo: "KE", gps: "-1.2921,36.8219", region: "Africa" },
  { value: "eg-cairo", label: "Cairo, Egypt", geo: "EG", gps: "30.0444,31.2357", region: "Africa" },
  { value: "ma-casablanca", label: "Casablanca, Morocco", geo: "MA", gps: "33.5731,-7.5898", region: "Africa" },
  { value: "gh-accra", label: "Accra, Ghana", geo: "GH", gps: "5.6037,-0.187", region: "Africa" },
  { value: "tz-dar-es-salaam", label: "Dar es Salaam, Tanzania", geo: "TZ", gps: "-6.7924,39.2083", region: "Africa" },
  { value: "et-addis-ababa", label: "Addis Ababa, Ethiopia", geo: "ET", gps: "9.032,38.7469", region: "Africa" },
  { value: "tn-tunis", label: "Tunis, Tunisia", geo: "TN", gps: "36.8065,10.1815", region: "Africa" },
  { value: "gb-london", label: "London, United Kingdom", geo: "GB", gps: "51.5072,-0.1276", region: "Europe" },
  { value: "gb-manchester", label: "Manchester, United Kingdom", geo: "GB", gps: "53.4808,-2.2426", region: "Europe" },
  { value: "ie-dublin", label: "Dublin, Ireland", geo: "IE", gps: "53.3498,-6.2603", region: "Europe" },
  { value: "de-berlin", label: "Berlin, Germany", geo: "DE", gps: "52.52,13.405", region: "Europe" },
  { value: "de-frankfurt", label: "Frankfurt, Germany", geo: "DE", gps: "50.1109,8.6821", region: "Europe" },
  { value: "fr-paris", label: "Paris, France", geo: "FR", gps: "48.8566,2.3522", region: "Europe" },
  { value: "nl-amsterdam", label: "Amsterdam, Netherlands", geo: "NL", gps: "52.3676,4.9041", region: "Europe" },
  { value: "es-madrid", label: "Madrid, Spain", geo: "ES", gps: "40.4168,-3.7038", region: "Europe" },
  { value: "es-barcelona", label: "Barcelona, Spain", geo: "ES", gps: "41.3874,2.1686", region: "Europe" },
  { value: "it-rome", label: "Rome, Italy", geo: "IT", gps: "41.9028,12.4964", region: "Europe" },
  { value: "it-milan", label: "Milan, Italy", geo: "IT", gps: "45.4642,9.19", region: "Europe" },
  { value: "pt-lisbon", label: "Lisbon, Portugal", geo: "PT", gps: "38.7223,-9.1393", region: "Europe" },
  { value: "se-stockholm", label: "Stockholm, Sweden", geo: "SE", gps: "59.3293,18.0686", region: "Europe" },
  { value: "no-oslo", label: "Oslo, Norway", geo: "NO", gps: "59.9139,10.7522", region: "Europe" },
  { value: "dk-copenhagen", label: "Copenhagen, Denmark", geo: "DK", gps: "55.6761,12.5683", region: "Europe" },
  { value: "fi-helsinki", label: "Helsinki, Finland", geo: "FI", gps: "60.1699,24.9384", region: "Europe" },
  { value: "pl-warsaw", label: "Warsaw, Poland", geo: "PL", gps: "52.2297,21.0122", region: "Europe" },
  { value: "ch-zurich", label: "Zurich, Switzerland", geo: "CH", gps: "47.3769,8.5417", region: "Europe" },
  { value: "at-vienna", label: "Vienna, Austria", geo: "AT", gps: "48.2082,16.3738", region: "Europe" },
  { value: "be-brussels", label: "Brussels, Belgium", geo: "BE", gps: "50.8503,4.3517", region: "Europe" },
  { value: "cz-prague", label: "Prague, Czechia", geo: "CZ", gps: "50.0755,14.4378", region: "Europe" },
  { value: "hu-budapest", label: "Budapest, Hungary", geo: "HU", gps: "47.4979,19.0402", region: "Europe" },
  { value: "ro-bucharest", label: "Bucharest, Romania", geo: "RO", gps: "44.4268,26.1025", region: "Europe" },
  { value: "gr-athens", label: "Athens, Greece", geo: "GR", gps: "37.9838,23.7275", region: "Europe" },
  { value: "tr-istanbul", label: "Istanbul, Turkey", geo: "TR", gps: "41.0082,28.9784", region: "Europe" },
  { value: "us-new-york", label: "New York, United States", geo: "US", gps: "40.7128,-74.006", region: "Americas" },
  { value: "us-san-francisco", label: "San Francisco, United States", geo: "US", gps: "37.7749,-122.4194", region: "Americas" },
  { value: "us-los-angeles", label: "Los Angeles, United States", geo: "US", gps: "34.0522,-118.2437", region: "Americas" },
  { value: "us-chicago", label: "Chicago, United States", geo: "US", gps: "41.8781,-87.6298", region: "Americas" },
  { value: "us-dallas", label: "Dallas, United States", geo: "US", gps: "32.7767,-96.797", region: "Americas" },
  { value: "us-seattle", label: "Seattle, United States", geo: "US", gps: "47.6062,-122.3321", region: "Americas" },
  { value: "us-miami", label: "Miami, United States", geo: "US", gps: "25.7617,-80.1918", region: "Americas" },
  { value: "ca-toronto", label: "Toronto, Canada", geo: "CA", gps: "43.6532,-79.3832", region: "Americas" },
  { value: "ca-vancouver", label: "Vancouver, Canada", geo: "CA", gps: "49.2827,-123.1207", region: "Americas" },
  { value: "ca-montreal", label: "Montreal, Canada", geo: "CA", gps: "45.5019,-73.5674", region: "Americas" },
  { value: "mx-mexico-city", label: "Mexico City, Mexico", geo: "MX", gps: "19.4326,-99.1332", region: "Americas" },
  { value: "br-sao-paulo", label: "Sao Paulo, Brazil", geo: "BR", gps: "-23.5505,-46.6333", region: "Americas" },
  { value: "br-rio-de-janeiro", label: "Rio de Janeiro, Brazil", geo: "BR", gps: "-22.9068,-43.1729", region: "Americas" },
  { value: "ar-buenos-aires", label: "Buenos Aires, Argentina", geo: "AR", gps: "-34.6037,-58.3816", region: "Americas" },
  { value: "cl-santiago", label: "Santiago, Chile", geo: "CL", gps: "-33.4489,-70.6693", region: "Americas" },
  { value: "co-bogota", label: "Bogota, Colombia", geo: "CO", gps: "4.711,-74.0721", region: "Americas" },
  { value: "pe-lima", label: "Lima, Peru", geo: "PE", gps: "-12.0464,-77.0428", region: "Americas" },
  { value: "in-bengaluru", label: "Bengaluru, India", geo: "IN", gps: "12.9716,77.5946", region: "Asia-Pacific" },
  { value: "in-mumbai", label: "Mumbai, India", geo: "IN", gps: "19.076,72.8777", region: "Asia-Pacific" },
  { value: "in-delhi", label: "Delhi, India", geo: "IN", gps: "28.6139,77.209", region: "Asia-Pacific" },
  { value: "in-hyderabad", label: "Hyderabad, India", geo: "IN", gps: "17.385,78.4867", region: "Asia-Pacific" },
  { value: "in-chennai", label: "Chennai, India", geo: "IN", gps: "13.0827,80.2707", region: "Asia-Pacific" },
  { value: "in-pune", label: "Pune, India", geo: "IN", gps: "18.5204,73.8567", region: "Asia-Pacific" },
  { value: "in-kolkata", label: "Kolkata, India", geo: "IN", gps: "22.5726,88.3639", region: "Asia-Pacific" },
  { value: "sg-singapore", label: "Singapore", geo: "SG", gps: "1.3521,103.8198", region: "Asia-Pacific" },
  { value: "jp-tokyo", label: "Tokyo, Japan", geo: "JP", gps: "35.6762,139.6503", region: "Asia-Pacific" },
  { value: "jp-osaka", label: "Osaka, Japan", geo: "JP", gps: "34.6937,135.5023", region: "Asia-Pacific" },
  { value: "kr-seoul", label: "Seoul, South Korea", geo: "KR", gps: "37.5665,126.978", region: "Asia-Pacific" },
  { value: "hk-hong-kong", label: "Hong Kong", geo: "HK", gps: "22.3193,114.1694", region: "Asia-Pacific" },
  { value: "tw-taipei", label: "Taipei, Taiwan", geo: "TW", gps: "25.033,121.5654", region: "Asia-Pacific" },
  { value: "cn-shanghai", label: "Shanghai, China", geo: "CN", gps: "31.2304,121.4737", region: "Asia-Pacific" },
  { value: "au-sydney", label: "Sydney, Australia", geo: "AU", gps: "-33.8688,151.2093", region: "Asia-Pacific" },
  { value: "au-melbourne", label: "Melbourne, Australia", geo: "AU", gps: "-37.8136,144.9631", region: "Asia-Pacific" },
  { value: "au-brisbane", label: "Brisbane, Australia", geo: "AU", gps: "-27.4698,153.0251", region: "Asia-Pacific" },
  { value: "au-perth", label: "Perth, Australia", geo: "AU", gps: "-31.9505,115.8605", region: "Asia-Pacific" },
  { value: "nz-auckland", label: "Auckland, New Zealand", geo: "NZ", gps: "-36.8485,174.7633", region: "Asia-Pacific" },
  { value: "id-jakarta", label: "Jakarta, Indonesia", geo: "ID", gps: "-6.2088,106.8456", region: "Asia-Pacific" },
  { value: "my-kuala-lumpur", label: "Kuala Lumpur, Malaysia", geo: "MY", gps: "3.139,101.6869", region: "Asia-Pacific" },
  { value: "th-bangkok", label: "Bangkok, Thailand", geo: "TH", gps: "13.7563,100.5018", region: "Asia-Pacific" },
  { value: "ph-manila", label: "Manila, Philippines", geo: "PH", gps: "14.5995,120.9842", region: "Asia-Pacific" },
  { value: "vn-hanoi", label: "Hanoi, Vietnam", geo: "VN", gps: "21.0285,105.8542", region: "Asia-Pacific" },
  { value: "vn-ho-chi-minh-city", label: "Ho Chi Minh City, Vietnam", geo: "VN", gps: "10.8231,106.6297", region: "Asia-Pacific" },
  { value: "bd-dhaka", label: "Dhaka, Bangladesh", geo: "BD", gps: "23.8103,90.4125", region: "Asia-Pacific" },
  { value: "pk-karachi", label: "Karachi, Pakistan", geo: "PK", gps: "24.8607,67.0011", region: "Asia-Pacific" },
  { value: "lk-colombo", label: "Colombo, Sri Lanka", geo: "LK", gps: "6.9271,79.8612", region: "Asia-Pacific" },
  { value: "ae-dubai", label: "Dubai, UAE", geo: "AE", gps: "25.2048,55.2708", region: "Middle East" },
  { value: "ae-abu-dhabi", label: "Abu Dhabi, UAE", geo: "AE", gps: "24.4539,54.3773", region: "Middle East" },
  { value: "sa-riyadh", label: "Riyadh, Saudi Arabia", geo: "SA", gps: "24.7136,46.6753", region: "Middle East" },
  { value: "sa-jeddah", label: "Jeddah, Saudi Arabia", geo: "SA", gps: "21.4858,39.1925", region: "Middle East" },
  { value: "qa-doha", label: "Doha, Qatar", geo: "QA", gps: "25.2854,51.531", region: "Middle East" },
  { value: "kw-kuwait-city", label: "Kuwait City, Kuwait", geo: "KW", gps: "29.3759,47.9774", region: "Middle East" },
  { value: "bh-manama", label: "Manama, Bahrain", geo: "BH", gps: "26.2285,50.586", region: "Middle East" },
  { value: "om-muscat", label: "Muscat, Oman", geo: "OM", gps: "23.588,58.3829", region: "Middle East" },
  { value: "jo-amman", label: "Amman, Jordan", geo: "JO", gps: "31.9454,35.9284", region: "Middle East" },
  { value: "il-tel-aviv", label: "Tel Aviv, Israel", geo: "IL", gps: "32.0853,34.7818", region: "Middle East" },
];

// Which preset matches the device's current geo/gps pair.
function presetValue(geo?: string, gps?: string): string {
  const found = LOCATION_PRESETS.find(
    (p) => (p.geo ?? "") === (geo ?? "") && (p.gps ?? "") === (gps ?? ""),
  );
  return found?.value ?? (geo || gps ? "custom" : "");
}

// LambdaTest data centres. The device pool differs per centre, so this also
// selects the `region` capability used when the session is created.
const LAMBDATEST_REGIONS: ComboOption[] = [
  { value: "us", label: "US" },
  { value: "eu", label: "EU (Europe)" },
  { value: "ap", label: "AP (Asia-Pacific)" },
];

// The farm `region` field is shared with Sauce (us-west-1 etc.), so map
// whatever is there onto one of LambdaTest's three data centres.
function lambdaRegionValue(region?: string): string {
  const r = (region ?? "").toLowerCase();
  if (r.startsWith("eu")) return "eu";
  if (r.startsWith("ap") || r.startsWith("as")) return "ap";
  return "us";
}

export interface ConnState {
  validation: UiPathValidation | null;
  catalog: DeviceCatalog | null;
  // The models this tenant's LLM Gateway actually exposes (fetched on validate).
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
  onSetTarget,
  onPlatformSignIn,
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
  onSetTarget: (target: ConnectionTarget, browser?: string) => void;
  // Present when running with UiPath platform OAuth config (Coded App /
  // coded-apps-dev plugin): one click signs in and fills bearer auth.
  onPlatformSignIn?: () => void;
}) {
  const u = form.uipath;
  const f = form.farm;
  const d = form.device;
  const target: ConnectionTarget = d.connectionTarget ?? "app";

  // Persisted across wizard navigation (lives in App), so coming back keeps the
  // validation, the tenant's model list, and the loaded device catalog.
  const { validation, catalog, models } = connState;
  const setValidation = (v: UiPathValidation | null) =>
    setConnState((s) => ({ ...s, validation: v }));
  const setCatalog = (c: DeviceCatalog | null) => setConnState((s) => ({ ...s, catalog: c }));
  const setModels = (m: string[] | null) => setConnState((s) => ({ ...s, models: m }));

  const [validating, setValidating] = useState(false);
  const [modelsLoading, setModelsLoading] = useState(false);
  const bridgeOn = useBridgeActive();

  // Editing UiPath fields invalidates a previous validation. Changing only the
  // model keeps the fetched model list (the connection itself is unchanged).
  const setU = (patch: Partial<typeof u>) => {
    const onlyModel = Object.keys(patch).length === 1 && "llmModel" in patch;
    if (!onlyModel) setValidation(null);
    set({ uipath: { ...u, ...patch } });
  };
  const setF = (patch: Partial<typeof f>) => set({ farm: { ...f, ...patch } });
  const setD = (patch: Partial<typeof d>) => set({ device: { ...d, ...patch } });

  const [loadingDevices, setLoadingDevices] = useState(false);
  const [deviceError, setDeviceError] = useState<string | null>(null);

  // Cascade is OS -> version -> device (versions/devices come from a catalog).
  const osList: Platform[] = catalog
    ? (["Android", "iOS"] as Platform[]).filter((os) => Object.keys(catalog[os]).length)
    : [];
  const versionsForOs = (cat: DeviceCatalog, os: Platform): string[] => {
    const set = new Set<string>();
    Object.values(cat[os] ?? {}).forEach((vs) => vs.forEach((v) => set.add(v)));
    return Array.from(set).sort((a, b) => parseFloat(b) - parseFloat(a));
  };
  const devicesForVersion = (cat: DeviceCatalog, os: Platform, version: string): string[] =>
    Object.keys(cat[os] ?? {})
      .filter((name) => (cat[os][name] ?? []).includes(version))
      .sort();

  const currentVersions = catalog ? versionsForOs(catalog, d.platform) : [];
  const currentDevices = catalog ? devicesForVersion(catalog, d.platform, d.osVersion) : [];
  const deviceReady = Boolean(d.deviceName?.trim() && d.osVersion?.trim());
  const isCustom = f.provider === "custom";

  // Pick a valid OS -> version -> device tuple from a freshly loaded catalog.
  const selectFromCatalog = (cat: DeviceCatalog, os: Platform) => {
    const useOs = Object.keys(cat[os] ?? {}).length
      ? os
      : Object.keys(cat.Android).length
        ? "Android"
        : "iOS";
    const versions = versionsForOs(cat, useOs);
    const version = versions[0] ?? "";
    const devices = devicesForVersion(cat, useOs, version);
    setD({ platform: useOs, osVersion: version, deviceName: devices[0] ?? "" });
  };

  const loadDevices = async () => {
    setLoadingDevices(true);
    setDeviceError(null);
    try {
      const cat = await listFarmDevices(f);
      setCatalog(cat);
      selectFromCatalog(cat, d.platform);
    } catch (error) {
      setDeviceError(error instanceof Error ? error.message : "Failed to load devices.");
    } finally {
      setLoadingDevices(false);
    }
  };

  const onPlatform = (platform: Platform) => {
    if (catalog) selectFromCatalog(catalog, platform);
    else setD({ platform });
  };
  const onVersion = (version: string) => {
    const devices = catalog ? devicesForVersion(catalog, d.platform, version) : [];
    setD({ osVersion: version, deviceName: devices[0] ?? "" });
  };
  const onDevice = (name: string) => setD({ deviceName: name });

  const farmHasServerCreds =
    f.provider === "browserstack"
      ? defaults?.farm.hasBrowserstack
      : f.provider === "saucelabs"
        ? defaults?.farm.hasSauce
        : false; // lambdatest / custom: credentials are always entered here
  const uipathServerCreds =
    u.mode === "bearer" ? defaults?.uipath.hasBearer : defaults?.uipath.hasClientCredentials;

  // UiPath auth is mandatory and must be validated: without a working LLM
  // Gateway connection the agent can't interpret screens.
  const uipathConfigured =
    Boolean(u.orgName?.trim() && u.tenantName?.trim()) &&
    (u.mode === "bearer"
      ? Boolean(u.bearerToken?.trim())
      : Boolean(u.clientId?.trim() && u.clientSecret?.trim()));
  const canValidate = uipathConfigured || Boolean(uipathServerCreds);
  const uipathValidated = Boolean(validation?.ok);

  // Use the tenant's actual working models once fetched; curated list as a
  // fallback (before validation, or if the probe returns nothing).
  const modelOptions = toModelOptions(models && models.length ? models : CURATED_MODELS);

  const validateConnection = async () => {
    setValidating(true);
    try {
      const v = await validateUiPath(u);
      setValidation(v);
      // On a good connection, load the models that ACTUALLY work for this
      // tenant in the background (the probe takes a few seconds).
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

  const blockers: string[] = [];
  if (!uipathValidated) blockers.push("a validated UiPath connection");
  if (devicePool.length === 0) blockers.push("at least one device added to the run");
  const canContinue = blockers.length === 0;

  return (
    <div className="space-y-6">
      <HeroCard />

      {hostedWithoutBackend() && !bridgeOn ? <BridgeSetupBanner /> : null}

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
          <div className="flex flex-wrap items-center gap-3">
            {onPlatformSignIn ? (
              <Button type="button" variant="secondary" onClick={onPlatformSignIn}>
                <KeyRound className="h-4 w-4" />
                Sign in with UiPath
              </Button>
            ) : null}
            {bridgeOn ? <Pill tone="emerald">Engine extension active</Pill> : null}
            {uipathServerCreds ? (
              <Pill tone="emerald">Configured server-side - fields optional</Pill>
            ) : (
              <Pill tone="grey">Used for LLM Gateway planning</Pill>
            )}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          <Field label="Base URL">
            <TextField
              value={u.baseUrl}
              onChange={(e) => setU({ baseUrl: e.target.value })}
              placeholder="https://cloud.uipath.com"
            />
          </Field>
          <Field label="Organization">
            <TextField
              value={u.orgName}
              onChange={(e) => setU({ orgName: e.target.value })}
              placeholder="my-org"
            />
          </Field>
          <Field label="Tenant">
            <TextField
              value={u.tenantName}
              onChange={(e) => setU({ tenantName: e.target.value })}
              placeholder="DefaultTenant"
            />
          </Field>

          {u.mode === "clientCredentials" ? (
            <>
              <Field label="Client ID">
                <TextField
                  value={u.clientId}
                  onChange={(e) => setU({ clientId: e.target.value })}
                  placeholder="External app client id"
                />
              </Field>
              <Field label="Client Secret">
                <TextField
                  type="password"
                  value={u.clientSecret}
                  onChange={(e) => setU({ clientSecret: e.target.value })}
                  placeholder="••••••••"
                />
              </Field>
              <Field label="Scope">
                <TextField
                  value={u.scope}
                  onChange={(e) => setU({ scope: e.target.value })}
                  placeholder="OR.Execution ConversationalAgents"
                />
              </Field>
            </>
          ) : (
            <Field label="Bearer / PAT token" className="sm:col-span-2">
              <TextField
                type="password"
                value={u.bearerToken}
                onChange={(e) => setU({ bearerToken: e.target.value })}
                placeholder="Paste a UiPath bearer token or PAT"
              />
            </Field>
          )}

          <Field
            label="LLM model"
            hint={
              modelsLoading
                ? "Checking which models work for this tenant…"
                : models && models.length
                  ? `${models.length} models available for this tenant`
                  : "Used by the LLM Gateway to plan each action"
            }
          >
            <Combobox
              value={u.llmModel || DEFAULT_LLM_MODEL}
              options={modelOptions}
              onChange={(v) => setU({ llmModel: v })}
              searchPlaceholder="Search models…"
            />
          </Field>
        </div>

        <p className="mt-4 flex items-center gap-2 text-xs text-[#667880] dark:text-[#9aabb4]">
          <Wand2 className="h-3.5 w-3.5 text-[#0BA2B3]" />
          UiPath authentication is required - validate it to unlock device selection.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-[#eceff1] dark:border-[#28333c] pt-4">
          <Button onClick={validateConnection} disabled={!canValidate || validating}>
            {validating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            {validating ? "Validating…" : "Validate connection"}
          </Button>
          {validation ? (
            validation.ok ? (
              validation.llm ? (
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-[#0f8a5f] dark:text-[#3fb88a]">
                  <CheckCircle2 className="h-4 w-4" />
                  Connected - LLM Gateway reachable{validation.model ? ` (${validation.model})` : ""}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-[#9a6700] dark:text-[#e0b341]">
                  <TriangleAlert className="h-4 w-4" />
                  Authenticated, but LLM Gateway not reachable
                  {validation.error ? `: ${validation.error.slice(0, 120)}` : ""}
                </span>
              )
            ) : (
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-[#c0334b] dark:text-[#ff7d8a]">
                <TriangleAlert className="h-4 w-4" />
                {validation.error || "Could not connect to UiPath."}
              </span>
            )
          ) : null}
        </div>
      </Card>

      <Card className="p-6">
        <div className="mb-5 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#182128] dark:bg-[#22303a] text-[#FA4616]">
            <Smartphone className="h-5 w-5" />
          </span>
          <div>
            <Eyebrow>Step 2 · Device</Eyebrow>
            <h2 className="text-xl font-semibold text-[#182128] dark:text-[#e6edf1]">Device farm &amp; run pool</h2>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          <Field label="Provider">
            <Combobox
              value={f.provider}
              options={PROVIDER_OPTIONS}
              onChange={(v) => setF({ provider: v as FarmProvider })}
            />
          </Field>
          {isCustom ? (
            <Field
              label="Appium hub URL"
              hint="your self-hosted Appium / grid endpoint"
              className="lg:col-span-2 2xl:col-span-3"
            >
              <TextField
                value={f.hubUrl ?? ""}
                onChange={(e) => setF({ hubUrl: e.target.value })}
                placeholder="http://your-host:4723/wd/hub"
              />
            </Field>
          ) : null}
          <Field label={isCustom ? "Username (optional)" : "Username / user"}>
            <TextField
              value={f.username}
              onChange={(e) => setF({ username: e.target.value })}
              placeholder={
                isCustom ? "basic-auth user" : farmHasServerCreds ? "Configured server-side" : "farm username"
              }
            />
          </Field>
          <Field label={isCustom ? "Access key (optional)" : "Access key"}>
            <TextField
              type="password"
              value={f.accessKey}
              onChange={(e) => setF({ accessKey: e.target.value })}
              placeholder={isCustom ? "basic-auth key" : farmHasServerCreds ? "••••••••" : "farm access key"}
            />
          </Field>
          {f.provider === "saucelabs" ? (
            <Field label="Region">
              <Combobox
                value={f.region ?? ""}
                options={REGION_OPTIONS}
                onChange={(v) => setF({ region: v })}
              />
            </Field>
          ) : null}
          {f.provider === "lambdatest" ? (
            <Field label="Data centre" hint="device availability differs per region">
              <Combobox
                value={lambdaRegionValue(f.region)}
                options={LAMBDATEST_REGIONS}
                onChange={(v) => setF({ region: v })}
              />
            </Field>
          ) : null}
        </div>

        {/* Device selection - load from the farm, then pick OS → version → device */}
        <div className="mt-6 rounded-2xl border border-[#eceff1] dark:border-[#28333c] bg-[#fafbfc] dark:bg-[#1d2830] p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#667880] dark:text-[#9aabb4]">
                Device selection
              </p>
              {catalog ? (
                <Pill tone="emerald">
                  {Object.keys(catalog.Android).length + Object.keys(catalog.iOS).length} devices
                </Pill>
              ) : null}
            </div>
            {!isCustom ? (
              <Button
                type="button"
                variant={catalog ? "secondary" : "primary"}
                onClick={loadDevices}
                disabled={loadingDevices || !uipathValidated}
              >
                {loadingDevices ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                {catalog ? "Reload devices" : "Load devices"}
              </Button>
            ) : null}
          </div>

          {!uipathValidated ? (
            <p className="flex items-center gap-2 text-sm text-[#9a6700] dark:text-[#e0b341]">
              <TriangleAlert className="h-4 w-4 shrink-0" />
              Validate the UiPath connection above to unlock device selection.
            </p>
          ) : isCustom ? (
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="OS / Platform">
                <Combobox
                  value={d.platform}
                  options={["Android", "iOS"]}
                  onChange={(v) => setD({ platform: v as Platform })}
                />
              </Field>
              <Field label="Device name" hint="as your Appium hub expects it">
                <TextField
                  value={d.deviceName}
                  onChange={(e) => setD({ deviceName: e.target.value })}
                  placeholder={d.platform === "Android" ? "Pixel 7" : "iPhone 15"}
                />
              </Field>
              <Field label="OS version">
                <TextField
                  value={d.osVersion}
                  onChange={(e) => setD({ osVersion: e.target.value })}
                  placeholder={d.platform === "Android" ? "14" : "17"}
                />
              </Field>
            </div>
          ) : loadingDevices ? (
            <div className="flex items-center justify-center py-8">
              <AtomLoader size={84} label="Fetching devices from your farm…" />
            </div>
          ) : catalog ? (
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="OS / Platform">
                <Combobox
                  value={d.platform}
                  options={osList}
                  onChange={(v) => onPlatform(v as Platform)}
                />
              </Field>
              <Field label="OS version" hint={`${currentVersions.length} versions`}>
                <Combobox
                  value={d.osVersion}
                  options={currentVersions}
                  onChange={onVersion}
                  searchPlaceholder="Search versions…"
                />
              </Field>
              <Field label="Device" hint={`${currentDevices.length} on ${d.platform} ${d.osVersion}`}>
                <Combobox
                  value={d.deviceName}
                  options={currentDevices}
                  onChange={onDevice}
                  searchPlaceholder="Search devices…"
                />
              </Field>
            </div>
          ) : (
            <p className="text-sm leading-6 text-[#667880] dark:text-[#9aabb4]">
              Add your farm credentials above, then click{" "}
              <span className="font-semibold text-[#A33200] dark:text-[#ff8a5c]">Load devices</span> to pick a real OS →
              version → device. No farm credentials? A bundled simulated device is used so you can
              still generate a workflow.
            </p>
          )}

          {deviceError ? <p className="mt-3 text-xs text-[#c0334b] dark:text-[#ff7d8a]">{deviceError}</p> : null}

          {/* Connection target for this device, then add it to the run pool */}
          {uipathValidated && deviceReady ? (
            <div className="mt-4 border-t border-[#eceff1] dark:border-[#28333c] pt-4">
              <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#667880] dark:text-[#9aabb4]">
                How to drive the devices in this run
              </p>
              <p className="mb-2 text-xs text-[#9aa7ad] dark:text-[#71808a]">
                One choice for the whole test case - a test case can't mix native and web. Changing
                it applies to every device in the pool.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <TargetCard
                  active={target === "app"}
                  onClick={() => onSetTarget("app")}
                  icon={<AppWindow className="h-5 w-5" />}
                  title="Native app"
                  desc="Drive an installed .apk / .ipa. Selectors: UiPath mobile <mbl/>."
                />
                <TargetCard
                  active={target === "browser"}
                  onClick={() => onSetTarget("browser")}
                  icon={<Globe className="h-5 w-5" />}
                  title="Mobile browser"
                  desc="Open a URL on the device browser. Selectors: UiPath web <webctrl/>."
                />
              </div>
              {target === "browser" ? (
                <div className="mt-3 max-w-xs">
                  <Field
                    label="Mobile browser"
                    hint={d.platform === "iOS" ? "iOS only supports Safari" : undefined}
                  >
                    {d.platform === "iOS" ? (
                      <div className="rounded-2xl border border-[#dfe3e6] dark:border-[#28333c] bg-[#f5f6f7] dark:bg-[#1d2830] px-4 py-2.5 text-sm text-[#667880] dark:text-[#9aabb4]">
                        Safari
                      </div>
                    ) : (
                      <Combobox
                        value={d.browser || "chrome"}
                        options={[
                          { value: "chrome", label: "Chrome" },
                          { value: "samsung", label: "Samsung Internet" },
                        ]}
                        onChange={(v) => onSetTarget("browser", v)}
                      />
                    )}
                  </Field>
                </div>
              ) : null}

              {/* IP geolocation - apps that gate on country need this. */}
              {f.provider === "browserstack" || f.provider === "lambdatest" ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Field
                    label="Device location"
                    hint="sets the IP country AND the GPS the app reads"
                  >
                    <Combobox
                      value={presetValue(d.geoLocation, d.gpsCoordinates)}
                      options={LOCATION_PRESETS.map((p) => ({ value: p.value, label: p.label, group: p.region }))}
                      onChange={(v) => {
                        const preset = LOCATION_PRESETS.find((p) => p.value === v);
                        setD({ geoLocation: preset?.geo, gpsCoordinates: preset?.gps });
                      }}
                      searchPlaceholder="Search locations…"
                    />
                  </Field>
                  <Field
                    label="GPS coordinates"
                    hint='"latitude,longitude" - override the preset if needed'
                  >
                    <TextField
                      value={d.gpsCoordinates ?? ""}
                      onChange={(e) => setD({ gpsCoordinates: e.target.value || undefined })}
                      placeholder="-33.9249,18.4241"
                    />
                  </Field>
                </div>
              ) : null}

              <div className="mt-4 flex items-center justify-between gap-3">
                <Button type="button" onClick={onAddDevice}>
                  <Plus className="h-4 w-4" />
                  Add device to run
                </Button>
                <Pill tone={devicePool.length ? "emerald" : "grey"}>
                  {devicePool.length} in run pool
                </Pill>
              </div>
            </div>
          ) : null}
        </div>

        {devicePool.length > 0 ? (
          <div className="mt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#667880] dark:text-[#9aabb4]">
              Devices in this run ({devicePool.length})
            </p>
            <div className="space-y-2">
              {devicePool.map((dev, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-3 rounded-xl border border-[#eceff1] dark:border-[#28333c] bg-white dark:bg-[#161f27] px-3 py-2"
                >
                  <span className="min-w-0 truncate text-sm text-[#182128] dark:text-[#e6edf1]">
                    <span className="font-medium">{dev.deviceName || "device"}</span>
                    <span className="text-[#667880] dark:text-[#9aabb4]">
                      {" "}
                      · {dev.platform} {dev.osVersion} ·{" "}
                      {dev.connectionTarget === "browser"
                        ? `Browser (${dev.platform === "iOS" ? "Safari" : dev.browser || "Chrome"})`
                        : "Native app"}
                      {dev.geoLocation || dev.gpsCoordinates
                        ? ` · 📍 ${[dev.geoLocation, dev.gpsCoordinates].filter(Boolean).join(" ")}`
                        : ""}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => onRemoveDevice(i)}
                    className="text-[#d98b8b] dark:text-[#c8767e] hover:text-[#c0334b] dark:hover:text-[#ff7d8a]"
                    title="Remove from run"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
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

// Shown when this Coded App can't see the engine extension. The extension IS
// the backend (it plans, drives devices and builds the workflow), so nothing
// else needs installing. Disappears as soon as the extension answers.
function BridgeSetupBanner() {
  return (
    <div className="rounded-2xl border border-[#f0d9a8] dark:border-[#4a3d20] bg-[#fdf6e7] dark:bg-[#2a2416] p-5">
      <p className="flex items-center gap-2 text-sm font-semibold text-[#9a6700] dark:text-[#e0b341]">
        <TriangleAlert className="h-4 w-4 shrink-0" />
        Autopilot engine extension not detected
      </p>
      <p className="mt-1 text-sm leading-6 text-[#7a6a45] dark:text-[#c9b98a]">
        This app runs its automation engine inside a companion browser extension - no server, no
        local setup. Install it once:
      </p>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm leading-6 text-[#7a6a45] dark:text-[#c9b98a]">
        <li>
          Open <code className="font-mono text-[12px]">chrome://extensions</code> and enable{" "}
          <span className="font-semibold">Developer mode</span>.
        </li>
        <li>
          Click <span className="font-semibold">Load unpacked</span> and select the{" "}
          <code className="font-mono text-[12px]">extension/</code> folder.
        </li>
        <li>
          <span className="font-semibold">Reload this page</span> - extensions only attach to pages
          opened after install. A green &ldquo;Engine extension active&rdquo; pill appears below when
          it&apos;s connected.
        </li>
      </ol>
    </div>
  );
}

function HeroCard() {
  return (
    <Card className="overflow-hidden">
      <div className="grid items-stretch gap-6 p-6 lg:grid-cols-[1.5fr_1fr] lg:p-8">
        <div className="flex flex-col justify-center">
          <Eyebrow>UiPath Mobile Test Autopilot</Eyebrow>
          <h1 className="mt-3 text-3xl font-semibold leading-tight text-[#182128] dark:text-[#e6edf1] lg:text-4xl">
            Describe a mobile test. Get a UiPath workflow with real selectors.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#667880] dark:text-[#9aabb4]">
            Connect UiPath and a cloud device, write your steps in plain English, and watch an
            agent drive the app on a real device - capturing UiPath mobile selectors for every
            action and assembling a ready-to-import <code className="text-[#A33200] dark:text-[#ff8a5c]">.xaml</code>{" "}
            workflow.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Pill tone="orange">LLM Gateway planning</Pill>
            <Pill tone="slate">BrowserStack · Sauce Labs · LambdaTest</Pill>
            <Pill tone="blue">Android &amp; iOS</Pill>
            <Pill tone="emerald">Parallel batches</Pill>
            <Pill tone="navy">.xaml output</Pill>
          </div>
        </div>
        <div className="metric-grid relative flex flex-col rounded-3xl border border-[#eceff1] dark:border-[#28333c] bg-white/70 dark:bg-[#0d141a]/85 p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#FA4616]">
            How it works
          </p>
          <ol className="mt-4 flex flex-1 flex-col justify-center gap-4 text-sm">
            {[
              "Connect UiPath + device farm",
              "Write natural-language steps",
              "Agent runs them on a device",
              "Download the UiPath workflow",
            ].map((label, i) => (
              <li key={label} className="flex items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#fff1ec] dark:bg-[#2c1812] text-sm font-semibold text-[#A33200] dark:text-[#ff8a5c]">
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

function TargetCard({
  active,
  onClick,
  icon,
  title,
  desc,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-start gap-3 rounded-2xl border p-4 text-left transition ${
        active
          ? "border-[#FA4616] bg-[#fff1ec] dark:bg-[#2c1812] agent-glow"
          : "border-[#eceff1] dark:border-[#28333c] bg-white dark:bg-[#161f27] hover:border-[#0BA2B3]"
      }`}
    >
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
          active ? "bg-[#FA4616] text-white" : "bg-[#f5f6f7] dark:bg-[#1d2830] text-[#667880] dark:text-[#9aabb4]"
        }`}
      >
        {icon}
      </span>
      <span>
        <span className="block text-sm font-semibold text-[#182128] dark:text-[#e6edf1]">{title}</span>
        <span className="mt-0.5 block text-xs leading-5 text-[#667880] dark:text-[#9aabb4]">{desc}</span>
      </span>
    </button>
  );
}
