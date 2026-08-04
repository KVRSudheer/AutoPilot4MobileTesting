import type { MobileSelector, SessionState, StepResult } from "../types.js";

type GeneratedValue = NonNullable<SessionState["generatedData"]>[number];

/**
 * Turn a recorded string into a C# expression, swapping any {{token}}-generated
 * substring for a call that regenerates it at run time.
 *
 * Without this the export hard-codes the values this run happened to use, so
 * re-running it re-submits the same passport/email/phone - which apps that
 * de-duplicate on those fields reject.
 */
export function csTextExpression(
  text: string,
  generated: GeneratedValue[],
  template?: string,
): string {
  const hits = generated
    // Only this step's tokens: a short generated value (e.g. a 2-digit number)
    // could otherwise coincide with text in an unrelated step and be swapped.
    .filter((g) => (template ? template.includes(g.token) : true))
    .filter((g) => g.value && text.includes(g.value))
    .sort((a, b) => b.value.length - a.value.length);
  if (hits.length === 0) return csString(text);

  const parts: string[] = [];
  let rest = text;
  for (const g of hits) {
    const at = rest.indexOf(g.value);
    if (at < 0) continue;
    if (at > 0) parts.push(csString(rest.slice(0, at)));
    parts.push(generatorCall(g));
    rest = rest.slice(at + g.value.length);
  }
  if (rest) parts.push(csString(rest));
  return parts.join(" + ");
}

function generatorCall(g: GeneratedValue): string {
  const n = Number(g.arg) || g.value.length;
  switch (g.kind) {
    case "digits":
      return `RandomDigits(${n})`;
    case "letters":
      return `RandomLetters(${n})`;
    case "alnum":
      return `RandomAlnum(${n})`;
    case "email":
      return `RandomEmail()`;
    case "firstname":
      return `RandomFirstName()`;
    case "lastname":
      return `RandomLastName()`;
    case "uuid":
      return `Guid.NewGuid().ToString("N")`;
    case "timestamp":
      return `DateTimeOffset.UtcNow.ToUnixTimeMilliseconds().ToString()`;
    case "dob":
      return `RandomDateOfBirth(${csString(g.arg || "dd/MM/yyyy")})`;
    case "date":
      return `DateTime.Now.ToString(${csString(g.arg || "dd/MM/yyyy")})`;
    case "nameoncard":
      return `RandomFirstName() + " " + RandomLastName()`;
    case "cardnumber":
      // Fixed on purpose: sandboxes decline PANs outside their test set.
      return csString(g.arg || "4111111111111111");
    case "expiry":
      return `DateTime.Today.AddYears(3).ToString(${csString(g.arg || "MM/yy")})`;
    case "cvv":
      return `RandomDigits(${Number(g.arg) || 3})`;
    default:
      return csString(g.value);
  }
}

// Helper methods emitted only when the workflow actually needs them.
export const GENERATOR_SOURCE: Record<string, string[]> = {
  RandomDigits: [
    'private static string RandomDigits(int n) =>',
    '    string.Concat(Enumerable.Range(0, n).Select(_ => _rng.Next(0, 10).ToString()));',
  ],
  RandomLetters: [
    'private static string RandomLetters(int n) =>',
    '    string.Concat(Enumerable.Range(0, n).Select(_ => (char)(\'A\' + _rng.Next(0, 26))));',
  ],
  RandomAlnum: [
    'private static string RandomAlnum(int n)',
    '{',
    '    const string pool = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";',
    '    return string.Concat(Enumerable.Range(0, n).Select(_ => pool[_rng.Next(pool.Length)]));',
    '}',
  ],
  RandomEmail: [
    'private static string RandomEmail() =>',
    '    $"autopilot.{Guid.NewGuid():N}".Substring(0, 18) + "@example.com";',
  ],
  RandomFirstName: [
    'private static readonly string[] _firstNames = { "Ayanda", "Thabo", "Lerato", "Sipho", "Nadia", "Kayla", "Riaan", "Zanele", "Devan", "Imke" };',
    'private static string RandomFirstName() => _firstNames[_rng.Next(_firstNames.Length)];',
  ],
  RandomLastName: [
    'private static readonly string[] _lastNames = { "Naidoo", "Botha", "Mkhize", "Pillay", "Venter", "Dlamini", "Fourie", "Khumalo", "Jacobs", "Nel" };',
    'private static string RandomLastName() => _lastNames[_rng.Next(_lastNames.Length)];',
  ],
  RandomDateOfBirth: [
    '// Always 18+ today: pick a day in the window ending the day before the',
    '// 18th-birthday cut-off (subtracting years alone can leave a 17-year-old).',
    'private static string RandomDateOfBirth(string format)',
    '{',
    '    var latest = DateTime.Today.AddYears(-18).AddDays(-1);',
    '    var earliest = DateTime.Today.AddYears(-70);',
    '    var span = (latest - earliest).Days;',
    '    return earliest.AddDays(_rng.Next(0, Math.Max(1, span))).ToString(format);',
    '}',
  ],
};

/**
 * Generate a UiPath **Coded Workflow** (C#) that reproduces the run using the
 * raw Appium .NET client instead of UiPath Mobile Automation activities -
 * i.e. the same WebDriver calls the Autopilot engine itself made.
 *
 * Requires the `Appium.WebDriver` NuGet package in the Studio project.
 * Credentials are never emitted: they are read from environment variables at
 * run time (or swap in UiPath Assets).
 */

export function csString(value: string): string {
  // C# verbatim-safe: escape backslashes and quotes for a normal string literal.
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, "\\n")}"`;
}

export function pascal(value: string): string {
  const cleaned = (value || "MobileTest").replace(/[^a-zA-Z0-9]+/g, " ").trim();
  const parts = cleaned.split(/\s+/).map((p) => p.charAt(0).toUpperCase() + p.slice(1));
  const name = parts.join("") || "MobileTest";
  return /^[0-9]/.test(name) ? `T${name}` : name;
}

/**
 * The Appium .NET locator call for a captured selector. Appium.WebDriver v5
 * renamed MobileBy -> AppiumBy.
 */
function byExpression(sel: MobileSelector): string {
  switch (sel.strategy) {
    case "accessibility id":
      return `AppiumBy.AccessibilityId(${csString(sel.locator)})`;
    case "id":
      return `AppiumBy.Id(${csString(sel.locator)})`;
    case "-android uiautomator":
      return `AppiumBy.AndroidUIAutomator(${csString(sel.locator)})`;
    case "css":
      return `By.CssSelector(${csString(sel.locator)})`;
    case "xpath":
    default:
      return `By.XPath(${csString(sel.locator)})`;
  }
}

// Per-provider: the vendor capability bucket's credential key names and the
// environment variables the generated code reads them from.
interface CredentialConvention {
  userKey: string;
  keyKey: string;
  userEnv: string;
  keyEnv: string;
}
function credentialsFor(provider: string): CredentialConvention {
  switch (provider) {
    case "browserstack":
      return {
        userKey: "userName",
        keyKey: "accessKey",
        userEnv: "BROWSERSTACK_USERNAME",
        keyEnv: "BROWSERSTACK_ACCESS_KEY",
      };
    case "saucelabs":
      return {
        userKey: "username",
        keyKey: "accessKey",
        userEnv: "SAUCE_USERNAME",
        keyEnv: "SAUCE_ACCESS_KEY",
      };
    case "lambdatest":
      return {
        userKey: "username",
        keyKey: "accessKey",
        userEnv: "LT_USERNAME",
        keyEnv: "LT_ACCESS_KEY",
      };
    default:
      return {
        userKey: "username",
        keyKey: "accessKey",
        userEnv: "APPIUM_USERNAME",
        keyEnv: "APPIUM_ACCESS_KEY",
      };
  }
}

const ANDROID_KEYCODES: Record<string, string> = {
  BACK: "AndroidKeyCode.Back",
  HOME: "AndroidKeyCode.Home",
  ENTER: "AndroidKeyCode.Enter",
  TAB: "AndroidKeyCode.Tab",
  DEL: "AndroidKeyCode.Del",
  SEARCH: "AndroidKeyCode.Search",
};

function swipeBody(direction: string): string[] {
  // W3C pointer sequence - the same gesture the engine performs.
  const map: Record<string, [string, string]> = {
    up: ["cx", "cy - dy"],
    down: ["cx", "cy + dy"],
    left: ["cx - dx", "cy"],
    right: ["cx + dx", "cy"],
  };
  const [tx, ty] = map[direction] ?? map.up;
  return [
    `var size = driver.Manage().Window.Size;`,
    `int cx = size.Width / 2, cy = size.Height / 2;`,
    `int dx = (int)(size.Width * 0.3), dy = (int)(size.Height * 0.3);`,
    `var finger = new PointerInputDevice(PointerKind.Touch, "finger");`,
    `var swipe = new ActionSequence(finger);`,
    `swipe.AddAction(finger.CreatePointerMove(CoordinateOrigin.Viewport, cx, cy, TimeSpan.Zero));`,
    `swipe.AddAction(finger.CreatePointerDown(MouseButton.Left));`,
    `swipe.AddAction(finger.CreatePause(TimeSpan.FromMilliseconds(120)));`,
    `swipe.AddAction(finger.CreatePointerMove(CoordinateOrigin.Viewport, ${tx}, ${ty}, TimeSpan.FromMilliseconds(300)));`,
    `swipe.AddAction(finger.CreatePointerUp(MouseButton.Left));`,
    `driver.PerformActions(new List<ActionSequence> { swipe });`,
  ];
}

/** C# lines for one step. */
/** W3C locator strategy for a captured selector (what POST /element takes). */
function w3cStrategy(sel: MobileSelector): string {
  switch (sel.strategy) {
    case "accessibility id":
      return "accessibility id";
    case "id":
      return "id";
    case "-android uiautomator":
      return "-android uiautomator";
    case "css":
      return "css selector";
    case "xpath":
    default:
      return "xpath";
  }
}

// Raw keycodes: the HTTP API takes numbers, not the client library's constants.
// "Verify / wait for X" steps in the export mirror the agent's policy.
const VERIFY_ATTEMPTS = 12;
const VERIFY_DELAY_S = 5;

const ANDROID_KEYCODE_NUMBERS: Record<string, number> = {
  BACK: 4,
  HOME: 3,
  ENTER: 66,
  TAB: 61,
  DEL: 67,
  SEARCH: 84,
};

/** C# lines for one step, against the raw WebDriver helper. */
function stepLines(
  step: StepResult,
  isAndroid: boolean,
  isWeb: boolean,
  generated: GeneratedValue[],
): string[] {
  const a = step.action;
  const sel = step.selector;
  const n = step.index + 1;
  const out: string[] = [];

  out.push(`// Step ${n}: ${step.description.replace(/\r?\n/g, " ")}`);
  if (step.reason) out.push(`// Planner: ${step.reason.replace(/\r?\n/g, " ")}`);
  if (!a) {
    out.push(`// (no action was planned for this step)`);
    return out;
  }
  if (sel) out.push(`// Selector (UiPath): ${sel.mbl.replace(/\r?\n/g, " ")}`);

  const find = (v: MobileSelector) =>
    `wd.FindElement(${csString(w3cStrategy(v))}, ${csString(v.locator)})`;

  switch (a.actionType) {
    case "tap":
      if (!sel) break;
      out.push(`wd.Click(${find(sel)});`);
      break;

    case "setText":
      if (!sel) break;
      out.push(
        `wd.SendKeys(${find(sel)}, ${csTextExpression(a.text ?? "", generated, step.descriptionTemplate)});`,
      );
      break;

    case "getText": {
      if (!sel) break;
      out.push(`string text${n} = wd.GetText(${find(sel)});`);
      out.push(`Log($"Step ${n} captured: {text${n}}");`);
      if (step.capturedText) {
        out.push(`// Recorded run captured: ${step.capturedText.replace(/\r?\n/g, " ").slice(0, 120)}`);
      }
      break;
    }

    case "assertExists": {
      if (!sel) break;
      // Same policy as the agent: VERIFY_ATTEMPTS attempts, VERIFY_DELAY_S apart.
      out.push(
        `if (!wd.WaitForPresent(${csString(w3cStrategy(sel))}, ${csString(sel.locator)}, attempts: ${VERIFY_ATTEMPTS}, delaySeconds: ${VERIFY_DELAY_S}))`,
      );
      out.push(
        `    throw new Exception(${csString(`Step ${n} failed: element not found - ${step.description}`)});`,
      );
      break;
    }

    case "swipe":
      if (isWeb) {
        const dir = a.direction ?? "up";
        const js =
          dir === "up"
            ? "window.scrollBy(0, Math.round(window.innerHeight * 0.6))"
            : dir === "down"
              ? "window.scrollBy(0, -Math.round(window.innerHeight * 0.6))"
              : dir === "left"
                ? "window.scrollBy(Math.round(window.innerWidth * 0.6), 0)"
                : "window.scrollBy(-Math.round(window.innerWidth * 0.6), 0)";
        out.push(`wd.ExecuteScript(${csString(js)});`);
      } else {
        out.push(`wd.Swipe(${csString(a.direction ?? "up")});`);
      }
      break;

    case "pressKey": {
      const key = (a.key ?? "BACK").toUpperCase();
      if (isAndroid) {
        out.push(`wd.PressKeyCode(${ANDROID_KEYCODE_NUMBERS[key] ?? 4}); // ${key}`);
      } else {
        out.push(`wd.MobileCommand("mobile: pressButton", ${csString(key.toLowerCase())});`);
      }
      break;
    }
  }
  return out;
}

/** Render the recorded capabilities as a C# dictionary literal. */
function capabilityLines(caps: Record<string, unknown>, cred: CredentialConvention): string[] {
  const lines: string[] = ["var caps = new Dictionary<string, object>", "{"];
  const nested: string[] = [];
  for (const [key, value] of Object.entries(caps)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "object" && !Array.isArray(value)) {
      nested.push(`    [${csString(key)}] = new Dictionary<string, object>`);
      nested.push(`    {`);
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (v === undefined || v === null) continue;
        nested.push(`        [${csString(k)}] = ${csLiteral(v)},`);
      }
      // Credentials are injected at run time, never written into the file.
      nested.push(`        [${csString(cred.userKey)}] = FarmUser,`);
      nested.push(`        [${csString(cred.keyKey)}] = FarmKey,`);
      nested.push(`    },`);
    } else {
      lines.push(`    [${csString(key)}] = ${csLiteral(value)},`);
    }
  }
  return [...lines, ...nested, "};"];
}

function csLiteral(v: unknown): string {
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return String(v);
  return csString(String(v));
}

// The whole WebDriver client, emitted inline so the workflow has NO NuGet
// dependency - it is the same HTTP protocol the Autopilot agent itself speaks.
const WEBDRIVER_CLIENT: string[] = [
  "/// <summary>",
  "/// Minimal W3C WebDriver / Appium client over HttpClient - the same HTTP",
  "/// calls the Autopilot agent made when it recorded this test. Deliberately",
  "/// dependency-free: no Appium.WebDriver package, nothing to version-match.",
  "/// </summary>",
  "private sealed class WebDriver : IDisposable",
  "{",
  '    private const string ElementKey = "element-6066-11e4-a52e-4f735466cecf";',
  "    private readonly HttpClient _http;",
  "    private readonly string _baseUrl;",
  "    public string SessionId { get; private set; }",
  "    // False when the session belongs to a Mobile Device Manager connection:",
  "    // MDM opened it and MDM closes it, so this client must not delete it.",
  "    private bool _ownsSession = true;",
  "",
  "    private WebDriver(string hubUrl, HttpClient http)",
  "    {",
  "        _baseUrl = hubUrl.TrimEnd('/');",
  "        _http = http;",
  "    }",
  "",
  "    public static WebDriver Create(string hubUrl, Dictionary<string, object> capabilities, int connectTimeoutSeconds = 300)",
  "    {",
  "        var http = new HttpClient { Timeout = TimeSpan.FromSeconds(connectTimeoutSeconds) };",
  "        var wd = new WebDriver(hubUrl, http);",
  "        var payload = new Dictionary<string, object>",
  "        {",
  '            ["capabilities"] = new Dictionary<string, object>',
  "            {",
  '                ["alwaysMatch"] = capabilities,',
  '                ["firstMatch"] = new object[] { new Dictionary<string, object>() },',
  "            },",
  "        };",
  '        var res = wd.Send(HttpMethod.Post, "/session", payload);',
  '        wd.SessionId = res?["value"]?["sessionId"]?.GetValue<string>()',
  '                       ?? res?["sessionId"]?.GetValue<string>();',
  "        if (string.IsNullOrEmpty(wd.SessionId))",
  '            throw new Exception("The hub did not return a sessionId.");',
  "        return wd;",
  "    }",
  "",
  "    /// <summary>",
  "    /// Attach to a session someone else already opened - here, the one the",
  "    /// UiPath Mobile Device Manager connection created. Nothing is created and",
  "    /// nothing is torn down, so the device stays visible in the MDM view while",
  "    /// these HTTP calls drive it.",
  "    /// </summary>",
  "    public static WebDriver Attach(string hubUrl, string sessionId, string user, string accessKey, int timeoutSeconds = 300)",
  "    {",
  "        if (string.IsNullOrEmpty(sessionId))",
  '            throw new Exception("No session id: the MDM connection did not report one.");',
  "        var http = new HttpClient { Timeout = TimeSpan.FromSeconds(timeoutSeconds) };",
  "        // Session creation passes credentials inside the capabilities; requests",
  "        // against an existing session have to authenticate per call instead.",
  "        if (!string.IsNullOrEmpty(user))",
  "        {",
  '            var basic = Convert.ToBase64String(Encoding.UTF8.GetBytes($"{user}:{accessKey}"));',
  '            http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Basic", basic);',
  "        }",
  "        var wd = new WebDriver(hubUrl, http);",
  "        wd.SessionId = sessionId;",
  "        wd._ownsSession = false;",
  "        return wd;",
  "    }",
  "",
  "    private JsonNode Send(HttpMethod method, string path, object body)",
  "    {",
  "        var req = new HttpRequestMessage(method, _baseUrl + path);",
  "        if (body != null)",
  "        {",
  "            req.Content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, \"application/json\");",
  "        }",
  "        var res = _http.SendAsync(req).GetAwaiter().GetResult();",
  "        var text = res.Content.ReadAsStringAsync().GetAwaiter().GetResult();",
  "        JsonNode node = null;",
  "        if (!string.IsNullOrWhiteSpace(text))",
  "        {",
  "            try { node = JsonNode.Parse(text); } catch { /* some hubs return empty bodies */ }",
  "        }",
  "        if (!res.IsSuccessStatusCode)",
  "        {",
  '            var msg = node?["value"]?["message"]?.GetValue<string>() ?? text;',
  '            throw new Exception($"WebDriver {method} {path} failed ({(int)res.StatusCode}): {msg}");',
  "        }",
  "        return node;",
  "    }",
  "",
  '    private string Sess(string path) => $"/session/{SessionId}{path}";',
  "",
  "    /// <summary>Poll for an element and return its id.</summary>",
  "    public string FindElement(string using_, string value, int timeoutSeconds = 15)",
  "    {",
  "        var deadline = DateTime.UtcNow.AddSeconds(timeoutSeconds);",
  "        for (;;)",
  "        {",
  "            try",
  "            {",
  '                var res = Send(HttpMethod.Post, Sess("/element"), new Dictionary<string, object> { ["using"] = using_, ["value"] = value });',
  '                var v = res?["value"];',
  "                var id = v?[ElementKey]?.GetValue<string>();",
  "                if (id == null && v is JsonObject obj && obj.Count > 0)",
  "                {",
  "                    id = obj.First().Value?.GetValue<string>();",
  "                }",
  "                if (!string.IsNullOrEmpty(id)) return id;",
  "            }",
  "            catch (Exception) when (DateTime.UtcNow < deadline) { /* not there yet */ }",
  "            if (DateTime.UtcNow >= deadline)",
  '                throw new Exception($"Element not found: {using_}={value}");',
  "            Thread.Sleep(500);",
  "        }",
  "    }",
  "",
  "    /// <summary>Spaced presence check - mirrors the agent's verify policy.</summary>",
  `    public bool WaitForPresent(string using_, string value, int attempts = ${VERIFY_ATTEMPTS}, int delaySeconds = ${VERIFY_DELAY_S})`,
  "    {",
  "        for (var attempt = 1; attempt <= attempts; attempt++)",
  "        {",
  "            try { FindElement(using_, value, 0); return true; }",
  "            catch { /* not present on this attempt */ }",
  "            if (attempt < attempts) Thread.Sleep(delaySeconds * 1000);",
  "        }",
  "        return false;",
  "    }",
  "",
  '    public void Click(string elementId) => Send(HttpMethod.Post, Sess($"/element/{elementId}/click"), new Dictionary<string, object>());',
  "",
  "    public void SendKeys(string elementId, string text)",
  "    {",
  '        try { Send(HttpMethod.Post, Sess($"/element/{elementId}/clear"), new Dictionary<string, object>()); }',
  "        catch { /* some fields refuse clear; typing still works */ }",
  '        Send(HttpMethod.Post, Sess($"/element/{elementId}/value"), new Dictionary<string, object> { ["text"] = text });',
  "    }",
  "",
  '    public string GetText(string elementId) => Send(HttpMethod.Get, Sess($"/element/{elementId}/text"), null)?["value"]?.GetValue<string>() ?? "";',
  "",
  "    public void PressKeyCode(int keycode) =>",
  '        Send(HttpMethod.Post, Sess("/appium/device/press_keycode"), new Dictionary<string, object> { ["keycode"] = keycode });',
  "",
  "    public void MobileCommand(string command, string name) =>",
  '        Send(HttpMethod.Post, Sess("/execute/sync"), new Dictionary<string, object>',
  "        {",
  '            ["script"] = command,',
  '            ["args"] = new object[] { new Dictionary<string, object> { ["name"] = name } },',
  "        });",
  "",
  "    public JsonNode ExecuteScript(string script) =>",
  '        Send(HttpMethod.Post, Sess("/execute/sync"), new Dictionary<string, object> { ["script"] = script, ["args"] = new object[0] });',
  "",
  "    /// <summary>Touch drag. `direction` is the finger movement.</summary>",
  "    public void Swipe(string direction)",
  "    {",
  '        var rect = Send(HttpMethod.Get, Sess("/window/rect"), null)?["value"];',
  '        int w = rect?["width"]?.GetValue<int>() ?? 390, h = rect?["height"]?.GetValue<int>() ?? 844;',
  "        int cx = w / 2, cy = h / 2, dx = (int)(w * 0.3), dy = (int)(h * 0.3);",
  "        int tx = cx, ty = cy;",
  '        if (direction == "up") ty = cy - dy;',
  '        else if (direction == "down") ty = cy + dy;',
  '        else if (direction == "left") tx = cx - dx;',
  "        else tx = cx + dx;",
  '        Send(HttpMethod.Post, Sess("/actions"), new Dictionary<string, object>',
  "        {",
  '            ["actions"] = new object[]',
  "            {",
  "                new Dictionary<string, object>",
  "                {",
  '                    ["type"] = "pointer",',
  '                    ["id"] = "finger1",',
  '                    ["parameters"] = new Dictionary<string, object> { ["pointerType"] = "touch" },',
  '                    ["actions"] = new object[]',
  "                    {",
  '                        new Dictionary<string, object> { ["type"] = "pointerMove", ["duration"] = 0, ["x"] = cx, ["y"] = cy, ["origin"] = "viewport" },',
  '                        new Dictionary<string, object> { ["type"] = "pointerDown", ["button"] = 0 },',
  '                        new Dictionary<string, object> { ["type"] = "pause", ["duration"] = 120 },',
  '                        new Dictionary<string, object> { ["type"] = "pointerMove", ["duration"] = 300, ["x"] = tx, ["y"] = ty, ["origin"] = "viewport" },',
  '                        new Dictionary<string, object> { ["type"] = "pointerUp", ["button"] = 0 },',
  "                    },",
  "                },",
  "            },",
  "        });",
  "    }",
  "",
  "    public void Navigate(string url) =>",
  '        Send(HttpMethod.Post, Sess("/url"), new Dictionary<string, object> { ["url"] = url });',
  "",
  "    /// <summary>GPS the app reads for \"use my current location\".</summary>",
  "    public void SetLocation(double latitude, double longitude) =>",
  '        Send(HttpMethod.Post, Sess("/location"), new Dictionary<string, object>',
  "        {",
  '            ["location"] = new Dictionary<string, object> { ["latitude"] = latitude, ["longitude"] = longitude, ["altitude"] = 0 },',
  "        });",
  "",
  "    public void Quit()",
  "    {",
  "        if (string.IsNullOrEmpty(SessionId)) return;",
  "        // An MDM-owned session is closed by disposing its Connection, not here.",
  "        if (!_ownsSession) { SessionId = null; return; }",
  '        try { Send(HttpMethod.Delete, Sess(""), null); } catch { /* ignore teardown errors */ }',
  "        SessionId = null;",
  "    }",
  "",
  "    public void Dispose() { Quit(); _http.Dispose(); }",
  "}",
];

/**
 * @param opts.attachToMdm  Open the device through a UiPath Mobile Device
 *   Manager connection and then drive that same session over raw HTTP. The
 *   device stays visible in the MDM view (MDM owns the session) while every
 *   action is a plain Appium call, exactly as in the standalone flavour.
 */
export function buildCodedWorkflow(
  state: SessionState,
  opts: { attachToMdm?: boolean } = {},
): string {
  const attach = opts.attachToMdm === true;
  const className = pascal(state.title);
  const isAndroid = state.platform === "Android";
  const isWeb = state.target === "browser";
  const conn = state.connection;
  const hubUrl = conn?.hubUrl ?? "https://mobile-hub.lambdatest.com/wd/hub";
  const cred = credentialsFor(state.provider);
  const generated = state.generatedData ?? [];
  // Defaults for the MDM entry names; the recorded labels are the best guess.
  const mdmDeviceName = state.mobile?.deviceName || state.deviceLabel || "My Device";
  const mdmAppName = state.appLabel || "My Application";

  const caps: Record<string, unknown> = conn?.capabilities
    ? { ...conn.capabilities }
    : {
        platformName: state.platform,
        "appium:automationName":
          state.mobile?.automationName ?? (isAndroid ? "UiAutomator2" : "XCUITest"),
        "appium:deviceName": state.mobile?.deviceName ?? "",
        "appium:platformVersion": state.mobile?.platformVersion ?? "",
        ...(isWeb ? { browserName: state.mobile?.browserName ?? "chrome" } : {}),
        ...(state.mobile?.app ? { "appium:app": state.mobile.app } : {}),
      };

  const body: string[] = [];
  for (const step of state.steps) {
    if (step.status === "pending" || step.status === "skipped") continue;
    body.push(...stepLines(step, isAndroid, isWeb, generated), "");
  }

  // Emit only the generator helpers this workflow actually calls.
  const bodyText = body.join("\n");
  const usedGenerators = Object.keys(GENERATOR_SOURCE).filter((name) =>
    new RegExp(`\\b${name}\\(`).test(bodyText),
  );
  const generatorBlock = usedGenerators.length
    ? [
        "",
        "        // --- Fresh test data on every run -------------------------------",
        "        // The recorded run used one set of values; regenerating here keeps",
        "        // re-runs unique for apps that de-duplicate on these fields.",
        "        private static readonly Random _rng = new Random();",
        ...usedGenerators.flatMap((name) => ["", ...GENERATOR_SOURCE[name].map((l) => `        ${l}`)]),
      ]
    : [];

  const header = [
    "// ---------------------------------------------------------------------------",
    `// ${state.title}`,
    "// UiPath Coded Workflow - generated by UiPath Mobile Test Autopilot.",
    "//",
    `// Device   : ${state.deviceLabel}`,
    `// Provider : ${state.provider}`,
    `// Target   : ${isWeb ? "mobile browser" : "native app"}`,
    `// App      : ${state.appLabel}`,
    `// Mode     : ${state.mode}${state.mode === "simulated" ? " (recorded against the bundled sample device)" : ""}`,
    "//",
    ...(attach
      ? [
          "// The device is opened through a UiPath Mobile Device Manager connection,",
          "// so it appears in the MDM device view and the cloud dashboard shows one",
          "// session. Every action below is then a raw Appium/WebDriver HTTP call",
          "// routed to that same session id - the exact requests the Autopilot agent",
          "// made while recording this test.",
          "//",
          "// Requires the UiPath.MobileAutomation.Activities package (for the",
          "// connection only). The HTTP client is included below, so there is no",
          "// Appium.WebDriver dependency and no client-version mismatch.",
          "//",
          "// Setup:",
          "//   1. In Mobile Device Manager, configure the device connection and",
          "//      application, then match the two constants below to their names.",
          "//   2. Requests against an existing session authenticate per call, so the",
          "//      hub credentials are still needed here, via environment variables",
          "//      (or UiPath Assets):",
          `//        ${cred.userEnv} / ${cred.keyEnv}`,
        ]
      : [
          "// Drives the device by calling the Appium/WebDriver HTTP API directly - the",
          "// exact same requests the Autopilot agent made while recording this test.",
          "//",
          "// NO NuGet packages required. The WebDriver client is included below, so",
          "// there is no Appium.WebDriver dependency and no client-version mismatch.",
          "//",
          "// Setup:",
          `//   Provide credentials via environment variables (or UiPath Assets):`,
          `//     ${cred.userEnv} / ${cred.keyEnv}`,
        ]),
    "//   Selectors below are the exact ones captured on the device.",
    "// ---------------------------------------------------------------------------",
    "",
    "using System;",
    "using System.Collections.Generic;",
    "using System.Linq;",
    "using System.Net.Http;",
    ...(attach ? ["using System.Net.Http.Headers;"] : []),
    "using System.Text;",
    "using System.Text.Json;",
    "using System.Text.Json.Nodes;",
    "using System.Threading;",
    "using UiPath.CodedWorkflows;",
    ...(attach ? ["using UiPath.MobileAutomation.API.Models;"] : []),
    "",
    "namespace MobileTestAutopilot",
    "{",
    `    public class ${className} : CodedWorkflow`,
    "    {",
    `        private const string HubUrl = ${csString(hubUrl)};`,
    ...(attach
      ? [
          "",
          "        // Must match the entries configured in Mobile Device Manager.",
          `        private const string MdmDeviceName      = ${csString(mdmDeviceName)};`,
          `        private const string MdmApplicationName = ${csString(mdmAppName)};`,
        ]
      : []),
    "",
    "        // Credentials are read at run time - never hard-coded here.",
    `        private static string FarmUser => Environment.GetEnvironmentVariable(${csString(cred.userEnv)}) ?? "";`,
    `        private static string FarmKey  => Environment.GetEnvironmentVariable(${csString(cred.keyEnv)}) ?? "";`,
    "",
    "        [Workflow]",
    "        public void Execute()",
    "        {",
  ];

  // Capabilities are MDM's job when attaching, so they are only emitted for the
  // standalone flavour that creates its own session.
  const capLines = attach ? [] : capabilityLines(caps, cred).map((l) => `            ${l}`);

  const connect = attach
    ? [
        "            using (Connection connection = mobile.Connect(MdmDeviceName, MdmApplicationName))",
        "            {",
        "                // The session MDM just opened - every HTTP call below targets it.",
        "                var sessionId = connection.GetSessionIdentifier();",
        `                Log($"MDM session {sessionId} on ${state.deviceLabel}");`,
        "                using var wd = WebDriver.Attach(HubUrl, sessionId, FarmUser, FarmKey);",
      ]
    : [
        "",
        "            using var wd = WebDriver.Create(HubUrl, caps);",
        `            Log($"Session {wd.SessionId} on ${state.deviceLabel}");`,
        "",
        "            try",
        "            {",
      ];

  const preamble: string[] = [];
  const coords = (state.gpsCoordinates ?? "").split(",").map((v) => Number(v.trim()));
  if (coords.length === 2 && coords.every((c) => Number.isFinite(c))) {
    preamble.push("");
    preamble.push(`                // GPS the app reads for "use my current location".`);
    preamble.push(`                wd.SetLocation(${coords[0]}, ${coords[1]});`);
  }
  if (isWeb && state.mobile?.startUrl) {
    preamble.push("");
    preamble.push(`                wd.Navigate(${csString(state.mobile.startUrl)});`);
  }
  preamble.push("");

  const footer = [
    ...(attach
      ? [
          "            }",
          "            // No wd.Quit(): the MDM connection owns the session and closes it",
          "            // when the using block above exits.",
        ]
      : [
          "            }",
          "            finally",
          "            {",
          "                wd.Quit();",
          "            }",
        ]),
    "        }",
    "",
    "        private void Log(string message) => Console.WriteLine(message);",
    ...generatorBlock,
    "",
    ...WEBDRIVER_CLIENT.map((l) => `        ${l}`),
    "    }",
    "}",
    "",
  ];

  const indentedBody = body.map((l) => (l ? `                ${l}` : ""));
  return [...header, ...capLines, ...connect, ...preamble, ...indentedBody, ...footer].join("\n");
}
