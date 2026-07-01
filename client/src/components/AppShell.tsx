import type { ReactNode } from "react";
import { Moon, Plus, Settings2, Smartphone, Sparkles, Sun } from "lucide-react";
import { useTheme } from "../lib/theme";
import type { RunStatus } from "../lib/types";

export interface NavItem {
  id: string;
  label: string;
  kind: "setup" | "compose" | "run";
  status?: RunStatus["state"];
  disabled?: boolean;
}

export function AppShell({
  items,
  activeId,
  onSelect,
  children,
}: {
  items: NavItem[];
  activeId: string;
  onSelect: (id: string) => void;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-[#ececec] bg-white/80 backdrop-blur-md dark:border-[#28333c] dark:bg-[#0d141a]/85">
        <div className="flex w-full flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center lg:justify-between lg:px-10 2xl:px-16">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onSelect("connect")}
              title="Home"
              aria-label="Go to home"
              className="flex items-center rounded-md transition hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FA4616]"
            >
              <img src="/uipath-logo.svg" alt="UiPath" className="h-7 w-auto dark:hidden" />
              <img
                src="/uipath-logo-white.svg"
                alt="UiPath"
                className="hidden h-7 w-auto dark:block"
              />
            </button>
            <span className="h-6 w-px bg-[#e0e3e5] dark:bg-[#28333c]" />
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#182128] text-[#FA4616] dark:bg-[#22303a]">
                <Sparkles className="h-4 w-4" />
              </span>
              <div className="leading-tight">
                <p className="text-sm font-semibold text-[#182128] dark:text-[#e6edf1]">
                  Mobile Test Autopilot
                </p>
                <p className="text-[11px] text-[#667880] dark:text-[#9aabb4]">
                  Agentic workflow authoring for UiPath
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <WorkspaceNav items={items} activeId={activeId} onSelect={onSelect} />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="w-full px-5 py-6 lg:px-10 lg:py-8 2xl:px-16">{children}</main>

      <footer className="w-full px-5 pb-8 lg:px-10 2xl:px-16">
        <p className="text-center text-xs text-[#9aa7ad] dark:text-[#71808a]">
          Powered by the UiPath SDK · LLM Gateway · BrowserStack &amp; Sauce Labs · Appium
        </p>
      </footer>
    </div>
  );
}

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#e1e4e6] bg-white text-[#667880] transition hover:border-[#FA4616] hover:text-[#A33200] dark:border-[#28333c] dark:bg-[#161f27] dark:text-[#9aabb4] dark:hover:border-[#FA4616] dark:hover:text-[#ff8a5c]"
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

const STATUS_DOT: Record<RunStatus["state"], string> = {
  connecting: "bg-[#0BA2B3]",
  running: "bg-[#FA4616] live-dot",
  done: "bg-[#0f8a5f] dark:bg-[#3fb88a]",
  error: "bg-[#c0334b] dark:bg-[#ff7d8a]",
};

function WorkspaceNav({
  items,
  activeId,
  onSelect,
}: {
  items: NavItem[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <nav className="flex max-w-full items-center gap-1.5 overflow-x-auto scrollbar-thin">
      {items.map((item) => {
        const active = item.id === activeId;
        const base =
          "flex shrink-0 items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-semibold transition";
        const tone = active
          ? "bg-[#fff1ec] text-[#A33200] dark:bg-[#2c1812] dark:text-[#ff8a5c]"
          : item.disabled
            ? "cursor-not-allowed text-[#c4ccd0] dark:text-[#4d5862]"
            : "text-[#667880] hover:bg-[#f5f6f7] dark:text-[#9aabb4] dark:hover:bg-[#1d2830]";
        return (
          <button
            key={item.id}
            type="button"
            disabled={item.disabled}
            onClick={() => !item.disabled && onSelect(item.id)}
            className={`${base} ${tone}`}
            title={item.label}
          >
            {item.kind === "setup" ? <Settings2 className="h-3.5 w-3.5 shrink-0" /> : null}
            {item.kind === "compose" ? <Plus className="h-3.5 w-3.5 shrink-0" /> : null}
            {item.kind === "run" ? (
              item.status ? (
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[item.status]}`}
                  aria-hidden
                />
              ) : (
                <Smartphone className="h-3.5 w-3.5 shrink-0" />
              )
            ) : null}
            <span className="max-w-[160px] truncate">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
