import type { BrowserName, RuntimePopupAction, SessionState, StepResult } from "../types.js";

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

function xmlComment(value: string): string {
  const safe = escText(value).replace(/--/g, "- -").replace(/-$/g, "- ");
  return `        <!-- ${safe} -->`;
}

function escSelector(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/'/g, "&apos;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function singleQuote(text: string): string {
  return text.replace(/"/g, "'");
}

function vb(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function elementText(step: StepResult): string {
  return (
    step.element?.text ||
    step.element?.ariaLabel ||
    step.element?.name ||
    step.element?.htmlId ||
    step.element?.placeholder ||
    ""
  );
}

function friendlyName(step: StepResult): string {
  const label = elementText(step);
  switch (step.action?.actionType) {
    case "click":
    case "tap":
      return `Click ${label || "element"}`;
    case "setText":
      return `Type into ${label || "field"}`;
    case "getText":
      return `Get text from ${label || "element"}`;
    case "assertExists":
      return `Verify ${label || "element"}`;
    case "swipe":
      return `Scroll ${step.action.direction || "down"}`;
    case "pressKey":
      return `Press ${step.action.key || "key"}`;
    case "closeBrowser":
      return "Close browser";
    default:
      return step.description;
  }
}

function isPasswordField(step: StepResult): boolean {
  const e = step.element;
  if (!e) return /password|passcode|pwd/i.test(step.description);
  if ((e.inputType || "").toLowerCase() === "password") return true;
  const hay = [e.htmlId, e.name, e.placeholder, e.ariaLabel, e.text]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return /password|passcode|pwd|secure/.test(hay) || /password/i.test(step.description);
}

function logMsg(display: string, message: string, level: "Info" | "Warn" | "Error" = "Info"): string {
  return `        <ui:LogMessage DisplayName="${escAttr(display)}" Level="${level}" Message="${escAttr(singleQuote(message))}" />`;
}

function outArgumentXml(type: "x:String" | "x:Boolean", variable: string): string {
  return `            <OutArgument x:TypeArguments="${type}">[${variable}]</OutArgument>`;
}

function inArgumentXml(type: "x:String" | "x:Boolean", value: string): string {
  return `            <InArgument x:TypeArguments="${type}">${escText(value)}</InArgument>`;
}

function verifyXml(title: string, expression: string, outputMessage: string): string {
  const cleanTitle = singleQuote(title);
  const displayName = escAttr(`Verify - ${cleanTitle}`);
  return `        <uta:VerifyExpression DisplayName="${displayName}">
          <uta:VerifyExpression.AlternativeVerificationTitle>
${inArgumentXml("x:String", cleanTitle)}
          </uta:VerifyExpression.AlternativeVerificationTitle>
          <uta:VerifyExpression.ContinueOnFailure>
${inArgumentXml("x:Boolean", "True")}
          </uta:VerifyExpression.ContinueOnFailure>
          <uta:VerifyExpression.Expression>
${inArgumentXml("x:Boolean", expression)}
          </uta:VerifyExpression.Expression>
          <uta:VerifyExpression.OutputMessageFormat>
${inArgumentXml("x:String", singleQuote(outputMessage))}
          </uta:VerifyExpression.OutputMessageFormat>
          <uta:VerifyExpression.TakeScreenshotInCaseOfFailingAssertion>
${inArgumentXml("x:Boolean", "True")}
          </uta:VerifyExpression.TakeScreenshotInCaseOfFailingAssertion>
          <uta:VerifyExpression.TakeScreenshotInCaseOfSucceedingAssertion>
${inArgumentXml("x:Boolean", "False")}
          </uta:VerifyExpression.TakeScreenshotInCaseOfSucceedingAssertion>
        </uta:VerifyExpression>`;
}

function rawBase64(dataUrl?: string): string {
  return (dataUrl ?? "").replace(/^data:image\/\w+;base64,/, "");
}

function isTargetedAction(actionType?: string): boolean {
  return (
    actionType === "click" ||
    actionType === "tap" ||
    actionType === "setText" ||
    actionType === "getText" ||
    actionType === "assertExists"
  );
}

function isValidUiPathWebSelector(step: StepResult): boolean {
  const selector = step.selector?.mbl;
  if (!selector) return false;
  if (step.selector?.uiPathValidated === false) return false;
  return (
    selector.startsWith("<html ") &&
    selector.includes(" app='") &&
    selector.includes("/><webctrl ") &&
    /<webctrl\b[^>]*\btag='[^']+'/i.test(selector) &&
    !/=''/i.test(selector)
  );
}

function selectorSkipReason(step: StepResult): string {
  if (step.selector?.uiPathValidated === false) {
    return step.selector.uiPathValidationReason || "the selector did not validate against the live page";
  }
  return "no validated UiPath web selector was captured";
}

function anchorSelectorsXml(step: StepResult): string {
  const anchors = step.selector?.anchors?.filter((anchor) => anchor.uiPathValidated !== false && anchor.selector);
  if (!anchors?.length) return "";
  return anchors
    .map((anchor, index) =>
      xmlComment(
        `Validated anchor ${index + 1} (${anchor.relation}, ${anchor.distance}px, ${anchor.label}): ${anchor.selector}`,
      ),
    )
    .join("\n");
}

function targetXml(step: StepResult, timeoutMs = 30000): string {
  const selector = escAttr(step.selector?.mbl ?? "");
  const image = rawBase64(step.elementShot);
  const screenshot = image ? ` InformativeScreenshot="${image}"` : "";
  return `            <ui:Target ClippingRegion="{x:Null}" Element="{x:Null}" Id="{x:Null}" Selector="${selector}" TimeoutMS="${timeoutMs}" WaitForReady="COMPLETE"${screenshot} />`;
}

function hotkeyFor(key?: string): string {
  switch ((key || "").toUpperCase()) {
    case "BACK":
      return "browserback";
    case "ENTER":
      return "enter";
    case "TAB":
      return "tab";
    case "ESC":
    case "ESCAPE":
      return "esc";
    default:
      return (key || "enter").toLowerCase();
  }
}

function browserApp(browser?: BrowserName): string {
  return browser === "chrome" ? "chrome.exe" : "msedge.exe";
}

function popupTargetXml(action: RuntimePopupAction, browser?: BrowserName, timeoutMs = 500): string {
  const htmlAttrs = [`app='${browserApp(browser)}'`];
  if (action.pageTitle) htmlAttrs.push(`title='${escSelector(action.pageTitle)}'`);
  const tag = (action.tag || "BUTTON").toUpperCase();
  const label = action.label || "popup action";
  const selector = `<html ${htmlAttrs.join(" ")} /><webctrl aaname='${escSelector(label)}' tag='${escSelector(tag)}' />`;
  return `            <ui:Target ClippingRegion="{x:Null}" Element="{x:Null}" Id="{x:Null}" Selector="${escAttr(selector)}" TimeoutMS="${timeoutMs}" WaitForReady="COMPLETE" />`;
}

function popupClickXml(action: RuntimePopupAction, browser?: BrowserName): string {
  const label = action.label || "popup action";
  const display = escAttr(`Handle popup - ${singleQuote(label)}`);
  return `        <ui:Click ContinueOnError="True" DisplayName="${display}" ClickType="CLICK_SINGLE" MouseButton="BTN_LEFT" SendWindowMessages="False" SimulateClick="False">
          <ui:Click.Target>
${popupTargetXml(action, browser)}
          </ui:Click.Target>
        </ui:Click>`;
}

function popupActionKey(action: RuntimePopupAction): string {
  return [action.pageTitle ?? "", action.tag ?? "", action.label ?? ""]
    .map((value) => value.trim().toLowerCase().replace(/\s+/g, " "))
    .join("|");
}

function uniquePopupActions(actions: RuntimePopupAction[]): RuntimePopupAction[] {
  const seen = new Set<string>();
  return actions.filter((action) => {
    const key = popupActionKey(action);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function popupActionsXml(actions: RuntimePopupAction[] | undefined, browser?: BrowserName, timing = "runtime"): string {
  if (!actions?.length) return "";
  const uniqueActions = uniquePopupActions(actions);
  if (!uniqueActions.length) return "";
  return `        <Sequence DisplayName="Handle ${timing} popup actions">
${uniqueActions.map((action) => popupClickXml(action, browser)).join("\n")}
        </Sequence>`;
}

interface Rendered {
  xml: string;
  vars: string[];
}

function renderStep(step: StepResult, browser?: BrowserName): Rendered {
  const n = step.index + 1;
  const action = step.action;
  const pieces = [
    popupActionsXml(step.popupActionsBefore, browser, `popup before step ${n}`),
    `        <!-- Step ${n}: ${escText(step.description)} -->`,
    logMsg(`Log - Step ${n} start`, `Step ${n}: ${step.description}`),
  ].filter(Boolean);
  const vars: string[] = [];

  if (!action) {
    const popupAfter = popupActionsXml(step.popupActionsAfter, browser, `popup after step ${n}`);
    if (popupAfter) pieces.push(popupAfter);
    return { xml: pieces.join("\n"), vars };
  }

  if (isTargetedAction(action.actionType) && !isValidUiPathWebSelector(step)) {
    pieces.push(
      logMsg(
        `Log - Step ${n} selector skipped`,
        `Step ${n}: ${selectorSkipReason(step)}, so this target activity was not generated.`,
        "Warn",
      ),
    );
    const popupAfter = popupActionsXml(step.popupActionsAfter, browser, `popup after step ${n}`);
    if (popupAfter) pieces.push(popupAfter);
    return { xml: pieces.join("\n"), vars };
  }

  const display = escAttr(friendlyName(step));
  const anchors = anchorSelectorsXml(step);
  if (anchors) pieces.push(anchors);

  switch (action.actionType) {
    case "click":
    case "tap":
      pieces.push(`        <ui:Click DisplayName="${display}" ClickType="CLICK_SINGLE" MouseButton="BTN_LEFT" SendWindowMessages="False" SimulateClick="False">
          <ui:Click.Target>
${targetXml(step)}
          </ui:Click.Target>
        </ui:Click>`);
      pieces.push(logMsg(`Log - Step ${n} done`, `Step ${n} done: clicked ${friendlyName(step)}`));
      break;

    case "setText": {
      const value = action.text ?? "";
      pieces.push(`        <ui:TypeInto DisplayName="${display}" EmptyField="True" SendWindowMessages="False" SimulateType="False" Text="${escAttr(value)}">
          <ui:TypeInto.Target>
${targetXml(step)}
          </ui:TypeInto.Target>
        </ui:TypeInto>`);
      if (value && !isPasswordField(step)) {
        const v = `setTextCheck_${n}`;
        vars.push(`        <Variable x:TypeArguments="x:String" Name="${v}" />`);
        pieces.push(`        <ui:GetValue DisplayName="Read back ${escAttr(elementText(step) || "field")}">
          <ui:GetValue.Value>
${outArgumentXml("x:String", v)}
          </ui:GetValue.Value>
          <ui:GetValue.Target>
${targetXml(step)}
          </ui:GetValue.Target>
        </ui:GetValue>`);
        pieces.push(
          verifyXml(
            `Step ${n} text entered`,
            `[${v}.Contains(${vb(value)})]`,
            `Step ${n}: field should contain "${value}"`,
          ),
        );
      }
      pieces.push(logMsg(`Log - Step ${n} done`, `Step ${n} done: typed into ${friendlyName(step)}`));
      break;
    }

    case "getText": {
      const v = `getText_${n}`;
      vars.push(`        <Variable x:TypeArguments="x:String" Name="${v}" />`);
      pieces.push(`        <ui:GetText DisplayName="${display}">
          <ui:GetText.Value>
${outArgumentXml("x:String", v)}
          </ui:GetText.Value>
          <ui:GetText.Target>
${targetXml(step)}
          </ui:GetText.Target>
        </ui:GetText>`);
      const expected = step.capturedText?.trim();
      pieces.push(
        expected
          ? verifyXml(`Step ${n} captured text`, `[${v} = ${vb(expected)}]`, `Step ${n}: expected captured text "${expected}"`)
          : verifyXml(`Step ${n} captured text`, `[Not String.IsNullOrEmpty(${v})]`, `Step ${n}: captured text should not be empty`),
      );
      pieces.push(logMsg(`Log - Step ${n} done`, `Step ${n} done: captured text from ${friendlyName(step)}`));
      break;
    }

    case "assertExists": {
      const v = `exists_${n}`;
      vars.push(`        <Variable x:TypeArguments="x:Boolean" Name="${v}" />`);
      pieces.push(`        <ui:UiElementExists DisplayName="${display}">
          <ui:UiElementExists.Exists>
${outArgumentXml("x:Boolean", v)}
          </ui:UiElementExists.Exists>
          <ui:UiElementExists.Target>
${targetXml(step)}
          </ui:UiElementExists.Target>
        </ui:UiElementExists>`);
      pieces.push(verifyXml(`Step ${n} - ${step.description}`, `[${v}]`, `Step ${n}: ${step.description}`));
      break;
    }

    case "swipe": {
      const key = action.direction === "up" ? "pgdn" : action.direction === "down" ? "pgup" : "tab";
      pieces.push(`        <ui:SendHotkey DisplayName="${display}" Key="${escAttr(key)}" />`);
      pieces.push(logMsg(`Log - Step ${n} done`, `Step ${n} done: sent browser scroll key ${key}`));
      break;
    }

    case "pressKey":
      pieces.push(`        <ui:SendHotkey DisplayName="${display}" Key="${escAttr(hotkeyFor(action.key))}" />`);
      pieces.push(logMsg(`Log - Step ${n} done`, `Step ${n} done: pressed ${action.key || "key"}`));
      break;

    case "closeBrowser":
      pieces.push(`        <ui:CloseTab Browser="[CType(Browser, UiPath.Core.Browser)]" ContinueOnError="True" DisplayName="${display}" />`);
      pieces.push(logMsg(`Log - Step ${n} done`, `Step ${n} done: close browser requested by testcase`));
      break;
  }

  const popupAfter = popupActionsXml(step.popupActionsAfter, browser, `popup after step ${n}`);
  if (popupAfter) pieces.push(popupAfter);

  return { xml: pieces.join("\n"), vars };
}

function browserType(browser?: BrowserName): string {
  return browser === "chrome" ? "Chrome" : "Edge";
}

const NAMESPACES = `  <TextExpression.NamespacesForImplementation>
    <sco:Collection x:TypeArguments="x:String">
      <x:String>System</x:String>
      <x:String>System.Activities</x:String>
      <x:String>System.Activities.Statements</x:String>
      <x:String>System.Collections.Generic</x:String>
      <x:String>System.Collections.ObjectModel</x:String>
      <x:String>System.Linq</x:String>
      <x:String>Microsoft.VisualBasic</x:String>
      <x:String>Microsoft.VisualBasic.Activities</x:String>
      <x:String>UiPath.Core</x:String>
      <x:String>UiPath.Core.Activities</x:String>
      <x:String>UiPath.UIAutomationNext.Enums</x:String>
      <x:String>UiPath.Testing.Activities</x:String>
    </sco:Collection>
  </TextExpression.NamespacesForImplementation>`;

function references(): string {
  const refs = [
    "Microsoft.VisualBasic",
    "mscorlib",
    "System",
    "System.Activities",
    "System.Core",
    "System.Linq",
    "System.ObjectModel",
    "System.Private.CoreLib",
    "System.Xaml",
    "UiPath.System.Activities",
    "UiPath.UIAutomation.Activities",
    "UiPath.Testing.Activities",
  ]
    .map((r) => `      <AssemblyReference>${r}</AssemblyReference>`)
    .join("\n");
  return `  <TextExpression.ReferencesForImplementation>
    <sco:Collection x:TypeArguments="AssemblyReference">
${refs}
    </sco:Collection>
  </TextExpression.ReferencesForImplementation>`;
}

export function buildXaml(session: SessionState): string {
  const rendered = session.steps.map((step) => renderStep(step, session.browser?.browserName));
  const body = rendered.map((r) => r.xml).join("\n");
  const vars = rendered.flatMap((r) => r.vars);
  const variablesBlock = vars.length
    ? `        <Sequence.Variables>\n${vars.join("\n")}\n        </Sequence.Variables>\n`
    : "";
  const startUrl = session.browser?.startUrl || session.appLabel || "about:blank";
  const browser = browserType(session.browser?.browserName);

  return `<?xml version="1.0" encoding="utf-8"?>
<!-- Generated by UiPath Browser Test Autopilot - desktop browser automation -->
<!-- Test case: ${escText(session.title)} -->
<!-- Browser: ${escText(session.browserLabel || session.deviceLabel)} via ${escText(session.provider)} -->
<!-- Start URL: ${escText(startUrl)} -->
<!-- Requires packages: UiPath.UIAutomation.Activities, UiPath.System.Activities, UiPath.Testing.Activities. -->
<Activity mc:Ignorable="sap sap2010" x:Class="BrowserTest"
  xmlns="http://schemas.microsoft.com/netfx/2009/xaml/activities"
  xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
  xmlns:sap="http://schemas.microsoft.com/netfx/2009/xaml/activities/presentation"
  xmlns:sap2010="http://schemas.microsoft.com/netfx/2010/xaml/activities/presentation"
  xmlns:sco="clr-namespace:System.Collections.ObjectModel;assembly=System.Private.CoreLib"
  xmlns:ui="http://schemas.uipath.com/workflow/activities"
  xmlns:uta="clr-namespace:UiPath.Testing.Activities;assembly=UiPath.Testing.Activities"
  xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml">
  <Sequence DisplayName="${escAttr(session.title)}">
    <ui:OpenBrowser BrowserType="${escAttr(browser)}" DisplayName="Open ${escAttr(browser)}" NewSession="True" Private="False" Url="${escAttr(startUrl)}">
      <ui:OpenBrowser.Body>
        <ActivityAction x:TypeArguments="x:Object">
          <ActivityAction.Argument>
            <DelegateInArgument x:TypeArguments="x:Object" Name="Browser" />
          </ActivityAction.Argument>
          <Sequence DisplayName="Browser Test Steps">
${variablesBlock}${body}
          </Sequence>
        </ActivityAction>
      </ui:OpenBrowser.Body>
    </ui:OpenBrowser>
  </Sequence>
${NAMESPACES}
${references()}
</Activity>`;
}
