import type { SessionState } from "../types.js";

export interface SelectorCatalogEntry {
  step: number;
  description: string;
  action: string;
  status: string;
  selector?: string;
  strategy?: string;
  reason?: string;
  capturedText?: string;
  hasScreenshot?: boolean;
  hasElementShot?: boolean;
}

// A clean JSON action log - exact regardless of XAML namespace nuances.
export function buildActionLog(session: SessionState) {
  return {
    generatedBy: "UiPath Mobile Test Autopilot",
    session: {
      id: session.id,
      title: session.title,
      mode: session.mode,
      platform: session.platform,
      provider: session.provider,
      device: session.deviceLabel,
      app: session.appLabel,
      llmModel: session.llmModel,
      llmLive: session.llmLive,
    },
    steps: session.steps.map((s) => ({
      step: s.index + 1,
      description: s.description,
      status: s.status,
      action: s.action?.actionType,
      text: s.action?.text,
      direction: s.action?.direction,
      key: s.action?.key,
      reason: s.reason,
      selector: s.selector?.mbl,
      runtimeStrategy: s.selector?.strategy,
      runtimeLocator: s.selector?.locator,
      capturedText: s.capturedText,
      deviceOutcome: s.outcome,
      element: s.element
        ? {
            class: s.element.className,
            text: s.element.text,
            contentDesc: s.element.contentDesc,
            resourceId: s.element.resourceId,
            accessibilityId: s.element.accessibilityId,
          }
        : undefined,
    })),
  };
}

// A compact selector catalog for quick reference in the UI / docs.
export function buildSelectorCatalog(session: SessionState): SelectorCatalogEntry[] {
  return session.steps.map((s) => ({
    step: s.index + 1,
    description: s.description,
    action: s.action?.actionType ?? "-",
    status: s.status,
    selector: s.selector?.mbl,
    strategy: s.selector?.strategy,
    reason: s.reason,
    capturedText: s.capturedText,
    // Screenshots (fetched lazily by the UI, not inlined here).
    hasScreenshot: Boolean(s.afterScreenshot || s.beforeScreenshot),
    hasElementShot: Boolean(s.elementShot),
  }));
}
