import type { MobileConnectionInfo, SessionState, StepResult } from "../types.js";

function escAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
function escText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function elementText(step: StepResult): string {
  return (
    step.element?.text ||
    step.element?.contentDesc ||
    step.element?.accessibilityId ||
    step.element?.name ||
    step.element?.resourceId ||
    step.element?.htmlId ||
    ""
  );
}

function friendlyName(step: StepResult): string {
  const a = step.action;
  const t = elementText(step);
  switch (a?.actionType) {
    case "tap":
      return `Tap ${t || "element"}`;
    case "setText":
      return `Set Text ${t || "field"}`;
    case "getText":
      return `Get Text ${t || "element"}`;
    case "assertExists":
      return `Element Exists ${t || "element"}`;
    case "swipe":
      return `Swipe ${a.direction ?? "up"}`;
    case "pressKey":
      return `Press ${a.key ?? "Back"}`;
    default:
      return step.description;
  }
}

// Secure fields can't be reliably read back (value is masked) - skip read-back.
function isPasswordField(step: StepResult): boolean {
  const e = step.element;
  if (!e) return /password|passcode|pwd/i.test(step.description);
  if ((e.inputType || "").toLowerCase() === "password") return true;
  if (/securetextfield/i.test(e.className || "")) return true;
  const hay = [e.htmlId, e.name, e.resourceId, e.contentDesc, e.accessibilityId, e.placeholder, e.text]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return /password|passcode|pwd|secure/.test(hay) || /password/i.test(step.description);
}

const ANDROID_KEYCODES: Record<string, number> = {
  BACK: 4,
  HOME: 3,
  ENTER: 66,
  TAB: 61,
  DEL: 67,
  SEARCH: 84,
  MENU: 82,
};

// W3C pointer-action payload for a swipe (Appium POST /session/{id}/actions).
function swipeActionsJson(direction: string): string {
  const cx = 540;
  const cy = 1200;
  const half = 350;
  let fx = cx;
  let fy = cy;
  let tx = cx;
  let ty = cy;
  if (direction === "up") {
    fy = cy + half;
    ty = cy - half;
  } else if (direction === "down") {
    fy = cy - half;
    ty = cy + half;
  } else if (direction === "left") {
    fx = cx + half;
    tx = cx - half;
  } else {
    fx = cx - half;
    tx = cx + half;
  }
  return `{"actions":[{"type":"pointer","id":"finger1","parameters":{"pointerType":"touch"},"actions":[{"type":"pointerMove","duration":0,"x":${fx},"y":${fy}},{"type":"pointerDown","button":0},{"type":"pause","duration":100},{"type":"pointerMove","duration":350,"x":${tx},"y":${ty}},{"type":"pointerUp","button":0}]}]}`;
}

// Appium press-keycode payload (POST /session/{id}/appium/device/press_keycode).
function pressKeycodeJson(key: string): string {
  const code = ANDROID_KEYCODES[(key || "BACK").toUpperCase()] ?? 4;
  return `{"keycode":${code}}`;
}

// Human-readable message text never uses double quotes (they confuse the VB
// argument parser / read oddly in logs) - use single quotes instead.
function singleQuote(text: string): string {
  return text.replace(/"/g, "'");
}

function logMsg(display: string, message: string, level: "Info" | "Warn" | "Error" = "Info"): string {
  return `        <ui:LogMessage DisplayName="${escAttr(display)}" Level="${level}" Message="${escAttr(singleQuote(message))}" />`;
}

function verifyXml(title: string, expression: string, outputMessage: string): string {
  const t = escAttr(singleQuote(title));
  // Expression keeps its real quotes (it's a VB expression, e.g. Contains("x")).
  return `        <uta:VerifyExpression AlternativeVerificationTitle="${t}" ContinueOnFailure="True" DisplayName="Verify - ${t}" Expression="${escAttr(expression)}" OutputMessageFormat="${escAttr(singleQuote(outputMessage))}" TakeScreenshotInCaseOfFailingAssertion="True" TakeScreenshotInCaseOfSucceedingAssertion="False" />`;
}

// VB string literal (quotes doubled).
function vb(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

interface Rendered {
  xml: string;
  vars: string[]; // <Variable .../> declarations
}

function renderStep(step: StepResult): Rendered {
  const n = step.index + 1;
  const a = step.action;
  const comment = `        <!-- Step ${n}: ${escText(step.description)} -->`;
  const before = logMsg(`Log - Step ${n} start`, `Step ${n}: ${step.description}`);

  if (!a) {
    return { xml: `${comment}\n${before}`, vars: [] };
  }

  const display = escAttr(friendlyName(step));
  const pieces: string[] = [comment, before];
  const vars: string[] = [];

  switch (a.actionType) {
    case "tap": {
      pieces.push(`        <uma:Tap DisplayName="${display}" RequiresInitialization="False" TapType="Single">
          <uma:Tap.Target>
${innerTarget(step)}          </uma:Tap.Target>
        </uma:Tap>`);
      pieces.push(logMsg(`Log - Step ${n} done`, `Step ${n} done: tapped ${friendlyName(step)}`));
      break;
    }
    case "setText": {
      const value = a.text ?? "";
      pieces.push(`        <uma:SetText ClearText="False" DisplayName="${display}" RequiresInitialization="False" SendNewLine="False" TapBefore="Long" Text="${escAttr(value)}">
          <uma:SetText.Target>
${innerTarget(step)}          </uma:SetText.Target>
        </uma:SetText>`);
      // Read the value back and verify it landed (skipped for masked/secure fields).
      if (value && !isPasswordField(step)) {
        const cv = `setTextCheck_${n}`;
        vars.push(`        <Variable x:TypeArguments="x:String" Name="${cv}" />`);
        pieces.push(`        <uma:GetText DisplayName="Read back ${escAttr(elementText(step) || "field")}" RequiresInitialization="False" Text="[${cv}]">
          <uma:GetText.Target>
${innerTarget(step)}          </uma:GetText.Target>
        </uma:GetText>`);
        pieces.push(
          verifyXml(
            `Step ${n} text entered`,
            `[${cv}.Contains(${vb(value)})]`,
            `Step ${n}: field should contain "${value}"`,
          ),
        );
      }
      pieces.push(logMsg(`Log - Step ${n} done`, `Step ${n} done: entered text into ${friendlyName(step)}`));
      break;
    }
    case "getText": {
      const v = `getText_${n}`;
      vars.push(`        <Variable x:TypeArguments="x:String" Name="${v}" />`);
      pieces.push(`        <uma:GetText DisplayName="${display}" RequiresInitialization="False" Text="[${v}]">
          <uma:GetText.Target>
${innerTarget(step)}          </uma:GetText.Target>
        </uma:GetText>`);
      const expected = step.capturedText?.trim();
      if (expected) {
        pieces.push(
          verifyXml(
            `Step ${n} captured text`,
            `[${v} = ${vb(expected)}]`,
            `Step ${n}: expected captured text "${expected}"`,
          ),
        );
      } else {
        pieces.push(
          verifyXml(
            `Step ${n} captured text`,
            `[Not String.IsNullOrEmpty(${v})]`,
            `Step ${n}: captured text should not be empty`,
          ),
        );
      }
      pieces.push(logMsg(`Log - Step ${n} done`, `Step ${n} done: captured text from ${friendlyName(step)}`));
      break;
    }
    case "assertExists": {
      const v = `exists_${n}`;
      vars.push(`        <Variable x:TypeArguments="x:Boolean" Name="${v}" />`);
      pieces.push(`        <uma:ElementExists DisplayName="${display}" Exists="[${v}]" RequiresInitialization="False">
          <uma:ElementExists.Target>
${innerTarget(step)}          </uma:ElementExists.Target>
        </uma:ElementExists>`);
      pieces.push(
        verifyXml(
          `Step ${n} - ${step.description}`,
          `[${v}]`,
          `Step ${n}: ${step.description}`,
        ),
      );
      break;
    }
    case "swipe":
    case "pressKey": {
      // No dedicated mobile activity for this gesture - drive the Appium session
      // directly via an HTTP Request (W3C actions for swipe, press_keycode for
      // hardware keys). Set appiumServerUrl + appiumSessionId of the live
      // session, and add a Content-Type: application/json header in Studio.
      const isSwipe = a.actionType === "swipe";
      const what = isSwipe ? `swipe ${a.direction ?? "up"}` : `press ${a.key ?? "Back"}`;
      const suffix = isSwipe ? "/actions" : "/appium/device/press_keycode";
      const endpoint = `[appiumServerUrl + "/session/" + appiumSessionId + "${suffix}"]`;
      const body = isSwipe ? swipeActionsJson(a.direction ?? "up") : pressKeycodeJson(a.key ?? "BACK");
      pieces.push(logMsg(`Log - Step ${n} gesture`, `Step ${n}: ${what} via Appium HTTP call`));
      pieces.push(`        <!-- Add header Content-Type: application/json on this request before running -->
        <uw:HttpClient DisplayName="HTTP - ${escAttr(what)}" EndPoint="${escAttr(endpoint)}" Method="Post">
          <uw:HttpClient.Body>${escText(body)}</uw:HttpClient.Body>
        </uw:HttpClient>`);
      pieces.push(logMsg(`Log - Step ${n} done`, `Step ${n} done: ${what}`));
      break;
    }
  }

  return { xml: pieces.join("\n"), vars };
}

// Target block for SetText/GetText/ElementExists (umm:Target indented).
// Strip the data: prefix - umm:Target.ImageBase64 wants raw base64.
function rawBase64(dataUrl?: string): string {
  return (dataUrl ?? "").replace(/^data:image\/\w+;base64,/, "");
}

function innerTarget(step: StepResult): string {
  const sel = escAttr(step.selector?.mbl ?? "");
  const friendly = escAttr(friendlyName(step));
  const text = escAttr(elementText(step));
  // Embed the captured element image into the target (as UiPath does) so the
  // activity shows the field/element image in Studio.
  const img = rawBase64(step.elementShot);
  const imgAttr = img ? ` ImageBase64="${img}"` : "";
  return `            <umm:Target Accuracy="0.8" FriendlyName="${friendly}" FullSelector="${sel}" FullSelectorArgument="${sel}"${imgAttr} Occurence="0" SearchSteps="Selector, FuzzySelector" Text="${text}">
              <umm:Target.TapOffset>
                <umm:TapOffset OffsetX="0" OffsetXArgument="0" OffsetY="0" OffsetYArgument="0" TapOffsetType="DeviceIndependentPixels" />
              </umm:Target.TapOffset>
            </umm:Target>
`;
}

function appiumUrlTemplate(provider: string): string {
  switch (provider) {
    case "saucelabs":
      return "https://USERNAME:ACCESSKEY@ondemand.REGION.saucelabs.com/wd/hub";
    case "browserstack":
      return "https://USERNAME:ACCESSKEY@hub-cloud.browserstack.com/wd/hub";
    default:
      return "http://YOUR-APPIUM-HOST:4723/wd/hub";
  }
}

function connectionArguments(m: MobileConnectionInfo): string {
  const args: string[] = [
    `        <InArgument x:TypeArguments="x:String" x:Key="platformName">${escText(m.platformName)}</InArgument>`,
    `        <InArgument x:TypeArguments="x:String" x:Key="platformVersion">${escText(m.platformVersion)}</InArgument>`,
    `        <InArgument x:TypeArguments="x:String" x:Key="deviceName">${escText(m.deviceName)}</InArgument>`,
    `        <InArgument x:TypeArguments="x:String" x:Key="automationName">${escText(m.automationName)}</InArgument>`,
  ];
  if (m.app) {
    args.push(`        <InArgument x:TypeArguments="x:String" x:Key="app">${escText(m.app)}</InArgument>`);
  }
  if (m.browserName) {
    args.push(`        <InArgument x:TypeArguments="x:String" x:Key="browserName">${escText(m.browserName)}</InArgument>`);
  }
  if (m.provider === "saucelabs") {
    args.push(
      `        <InArgument x:TypeArguments="x:String" x:Key="sauce:options">{ "username": "YOUR_SAUCE_USER", "accessKey": "YOUR_SAUCE_KEY", "appiumVersion": "latest" }</InArgument>`,
    );
  } else if (m.provider === "browserstack") {
    args.push(
      `        <InArgument x:TypeArguments="x:String" x:Key="bstack:options">{ "userName": "YOUR_BS_USER", "accessKey": "YOUR_BS_KEY" }</InArgument>`,
    );
  }
  return args.join("\n");
}

const NAMESPACES = `  <TextExpression.NamespacesForImplementation>
    <sco:Collection x:TypeArguments="x:String">
      <x:String>System.Activities</x:String>
      <x:String>System.Activities.Statements</x:String>
      <x:String>System.Activities.Expressions</x:String>
      <x:String>Microsoft.VisualBasic</x:String>
      <x:String>Microsoft.VisualBasic.Activities</x:String>
      <x:String>System</x:String>
      <x:String>System.Collections.Generic</x:String>
      <x:String>System.Collections.ObjectModel</x:String>
      <x:String>System.Linq</x:String>
      <x:String>System.Xml.Linq</x:String>
      <x:String>UiPath.Core</x:String>
      <x:String>UiPath.Core.Activities</x:String>
      <x:String>UiPath.MobileAutomation.Activities</x:String>
      <x:String>UiPath.MobileAutomation.Models</x:String>
      <x:String>UiPath.Testing.Activities</x:String>
    </sco:Collection>
  </TextExpression.NamespacesForImplementation>`;

function references(hasHttp: boolean): string {
  const list = [
    "Microsoft.VisualBasic",
    "mscorlib",
    "System",
    "System.Activities",
    "System.Core",
    "System.Linq",
    "System.ObjectModel",
    "System.Private.CoreLib",
    "System.Xaml",
    "System.Xml",
    "System.Xml.Linq",
    "UiPath.System.Activities",
    "UiPath.Testing.Activities",
    "UiPath.MobileAutomation.Activities",
    "UiPath.MobileAutomation",
  ];
  if (hasHttp) list.push("UiPath.Web.Activities");
  const refs = list.map((r) => `      <AssemblyReference>${r}</AssemblyReference>`).join("\n");
  return `  <TextExpression.ReferencesForImplementation>
    <sco:Collection x:TypeArguments="AssemblyReference">
${refs}
    </sco:Collection>
  </TextExpression.ReferencesForImplementation>`;
}

/**
 * Generate a UiPath Mobile Automation test workflow (.xaml) from a completed
 * run. Uses the real mobile-testing activities (uma:Tap / SetText / GetText /
 * ElementExists inside a uma:MobileDeviceConnection scope), Log Message
 * activities around every step, and Verify Expression assertions to validate
 * behaviour. Gestures with no dedicated activity (swipe / hardware key) are
 * driven via an HTTP Request activity.
 *
 * NOTE: requires the UiPath.MobileAutomation + UiPath.Testing activity packages
 * (and UiPath.Web.Activities only when the test contains swipe/key steps).
 * Fill the Appium URL + credentials in the Mobile Device Connection before
 * running - we never embed credentials in the generated file.
 */
export function buildXaml(session: SessionState): string {
  const className = "MobileTest";
  const m: MobileConnectionInfo = session.mobile ?? {
    platformName: session.platform,
    platformVersion: "",
    deviceName: session.deviceLabel.split("·")[0]?.trim() || "device",
    automationName: session.platform === "Android" ? "UiAutomator2" : "XCUITest",
    provider: session.provider,
  };

  const rendered = session.steps.map(renderStep);
  const body = rendered.map((r) => r.xml).join("\n");
  const vars = rendered.flatMap((r) => r.vars);
  const hasHttp = session.steps.some(
    (s) => s.action?.actionType === "swipe" || s.action?.actionType === "pressKey",
  );
  // The HTTP gesture activities reference the live Appium session.
  if (hasHttp) {
    vars.unshift(
      `        <Variable x:TypeArguments="x:String" Name="appiumServerUrl" />`,
      `        <Variable x:TypeArguments="x:String" Name="appiumSessionId" />`,
    );
  }

  const startPageAttr = m.startUrl ? ` StartPage="${escAttr(m.startUrl)}"` : "";
  const variablesBlock = vars.length
    ? `        <Sequence.Variables>\n${vars.join("\n")}\n        </Sequence.Variables>\n`
    : "";

  const uwNs = hasHttp
    ? `\n  xmlns:uw="clr-namespace:UiPath.Web.Activities;assembly=UiPath.Web.Activities"`
    : "";

  return `<?xml version="1.0" encoding="utf-8"?>
<!-- Generated by UiPath Mobile Test Autopilot - UiPath Mobile Automation test -->
<!-- Test case: ${escText(session.title)} -->
<!-- Device: ${escText(session.deviceLabel)} via ${escText(session.provider)} -->
<!-- BEFORE RUNNING: set the Appium URL + credentials on the Mobile Device      -->
<!-- Connection below (credentials are intentionally NOT embedded here).        -->
<!-- Requires packages: UiPath.MobileAutomation.Activities, UiPath.Testing.Activities${hasHttp ? ", UiPath.Web.Activities" : ""}. -->
<Activity mc:Ignorable="sap sap2010" x:Class="${className}"
  xmlns="http://schemas.microsoft.com/netfx/2009/xaml/activities"
  xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
  xmlns:sap="http://schemas.microsoft.com/netfx/2009/xaml/activities/presentation"
  xmlns:sap2010="http://schemas.microsoft.com/netfx/2010/xaml/activities/presentation"
  xmlns:sco="clr-namespace:System.Collections.ObjectModel;assembly=System.Private.CoreLib"
  xmlns:ui="clr-namespace:UiPath.Core.Activities;assembly=UiPath.System.Activities"
  xmlns:uma="clr-namespace:UiPath.MobileAutomation.Activities;assembly=UiPath.MobileAutomation.Activities"
  xmlns:umm="clr-namespace:UiPath.MobileAutomation.Models;assembly=UiPath.MobileAutomation"
  xmlns:uta="clr-namespace:UiPath.Testing.Activities;assembly=UiPath.Testing.Activities"${uwNs}
  xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml">
  <Sequence DisplayName="${escAttr(session.title)}">
    <uma:MobileDeviceConnection AppiumUrl="${escAttr(appiumUrlTemplate(m.provider))}" DisplayName="Mobile Device Connection - ${escAttr(m.deviceName)}"${startPageAttr} SingleInstanceForDevelopment="True" UseExistingOpenConnection="True" WaitForPageUpdateDevelopment="True">
      <uma:MobileDeviceConnection.Arguments>
${connectionArguments(m)}
      </uma:MobileDeviceConnection.Arguments>
      <uma:MobileDeviceConnection.Body>
        <ActivityAction x:TypeArguments="x:Object">
          <ActivityAction.Argument>
            <DelegateInArgument x:TypeArguments="x:Object" Name="UiPathScopeContext" />
          </ActivityAction.Argument>
          <Sequence DisplayName="Test Steps">
${variablesBlock}${body}
          </Sequence>
        </ActivityAction>
      </uma:MobileDeviceConnection.Body>
    </uma:MobileDeviceConnection>
  </Sequence>
${NAMESPACES}
${references(hasHttp)}
</Activity>`;
}
