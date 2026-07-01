import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search } from "lucide-react";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-[28px] border border-[#e7eaec] bg-white panel-shadow dark:border-[#28333c] dark:bg-[#161f27] ${className}`}
    >
      {children}
    </section>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#FA4616]">
      {children}
    </p>
  );
}

type Tone = "orange" | "navy" | "blue" | "slate" | "emerald" | "amber" | "rose" | "grey";

const TONE_CLASSES: Record<Tone, string> = {
  orange:
    "border-[#ffd9cc] bg-[#fff1ec] text-[#A33200] dark:border-[#4a2417] dark:bg-[#2c1812] dark:text-[#ff8a5c]",
  navy: "border-[#182128] bg-[#182128] text-white dark:border-[#33414c] dark:bg-[#22303a]",
  blue: "border-[#b8eaee] bg-[#e8f8fa] text-[#0BA2B3] dark:border-[#1c4049] dark:bg-[#0e2830] dark:text-[#22c0d0]",
  slate:
    "border-[#CCEEFE] bg-[#f3fbff] text-[#1E6482] dark:border-[#1d3947] dark:bg-[#0e2129] dark:text-[#6db3d6]",
  emerald:
    "border-[#bdebd2] bg-[#eafaf1] text-[#0f8a5f] dark:border-[#1d4738] dark:bg-[#0f2a20] dark:text-[#3fb88a]",
  amber:
    "border-[#ffe6b3] bg-[#fff7e6] text-[#9a6700] dark:border-[#4a3f1c] dark:bg-[#2a2410] dark:text-[#e0b341]",
  rose: "border-[#ffd0d6] bg-[#fff0f2] text-[#c0334b] dark:border-[#4a242b] dark:bg-[#2c1519] dark:text-[#ff7d8a]",
  grey: "border-[#e1e4e6] bg-[#f5f6f7] text-[#667880] dark:border-[#28333c] dark:bg-[#1d2830] dark:text-[#9aabb4]",
};

export function Pill({
  children,
  tone = "grey",
  className = "",
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${TONE_CLASSES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "dark";
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";
  const variants = {
    primary:
      "border border-[#FA4616] bg-[#FA4616] text-white shadow-[0_12px_24px_rgba(250,70,22,0.24)] hover:bg-[#e63f11]",
    secondary:
      "border border-[#d9d9d9] bg-white text-[#182128] hover:border-[#0BA2B3] hover:bg-[#f3fbff] dark:border-[#33414c] dark:bg-[#161f27] dark:text-[#e6edf1] dark:hover:border-[#0BA2B3] dark:hover:bg-[#0e2129]",
    ghost:
      "text-[#667880] hover:text-[#182128] dark:text-[#9aabb4] dark:hover:text-[#e6edf1]",
    dark: "border border-[#182128] bg-[#182128] text-white hover:bg-[#0f161b] dark:border-[#33414c] dark:bg-[#22303a] dark:hover:bg-[#2a3a44]",
  };
  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#667880] dark:text-[#9aabb4]">
        {label}
      </span>
      {children}
      {hint ? <span className="text-xs text-[#9aa7ad] dark:text-[#71808a]">{hint}</span> : null}
    </label>
  );
}

const inputClass =
  "w-full rounded-2xl border border-[#dfe3e6] bg-white px-4 py-2.5 text-sm text-[#182128] outline-none transition placeholder:text-[#aab4b9] focus:border-[#FA4616] focus:ring-2 focus:ring-[#fa46161f] dark:border-[#33414c] dark:bg-[#11181e] dark:text-[#e6edf1] dark:placeholder:text-[#71808a]";

export function TextField({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${inputClass} ${className}`} {...props} />;
}

export function TextArea({ className = "", ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${inputClass} resize-y ${className}`} {...props} />;
}

export function SelectField({
  children,
  className = "",
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`${inputClass} cursor-pointer ${className}`} {...props}>
      {children}
    </select>
  );
}

export function Tabs<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="inline-flex rounded-full border border-[#e1e4e6] bg-[#f5f6f7] p-1 dark:border-[#28333c] dark:bg-[#1d2830]">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
            value === opt.value
              ? "bg-white text-[#182128] shadow-[0_4px_12px_rgba(24,33,40,0.08)] dark:bg-[#22303a] dark:text-[#e6edf1] dark:shadow-[0_4px_12px_rgba(0,0,0,0.4)]"
              : "text-[#667880] hover:text-[#182128] dark:text-[#9aabb4] dark:hover:text-[#e6edf1]"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function DeviceFrame({
  src,
  caption,
  placeholder = "Waiting for device…",
  busy = false,
  maxW = 440,
  maxH = 600,
}: {
  src?: string;
  caption?: string;
  placeholder?: string;
  busy?: boolean;
  maxW?: number;
  maxH?: number;
}) {
  // The frame conforms to the device's real screen resolution: we read the
  // screenshot's natural dimensions and size the frame to that aspect ratio,
  // capped so phones aren't too tall and tablets aren't too small (dynamic).
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const aspectNum = dims ? dims.w / dims.h : 9 / 19.5;
  const aspect = dims ? `${dims.w} / ${dims.h}` : "9 / 19.5";

  // Fit the screen within a max width and max height; whichever binds wins.
  let displayW = maxW;
  if (displayW / aspectNum > maxH) displayW = Math.round(maxH * aspectNum);
  displayW = Math.min(displayW, maxW);
  const borderW = maxW <= 280 ? 6 : 10;

  return (
    <div className="flex w-full flex-col items-center gap-2">
      <div
        className="max-w-full rounded-[1.6rem] bg-[#182128] soft-shadow"
        style={{ width: displayW, borderWidth: borderW, borderColor: "#182128", borderStyle: "solid" }}
      >
        <div
          className="w-full overflow-hidden rounded-[1.3rem] bg-[#0b0f12]"
          style={{ aspectRatio: aspect }}
        >
          {src ? (
            <img
              src={src}
              alt="device screen"
              onLoad={(e) => {
                const t = e.currentTarget;
                if (t.naturalWidth && t.naturalHeight) setDims({ w: t.naturalWidth, h: t.naturalHeight });
              }}
              className="block h-full w-full object-contain"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-5 px-6 text-center text-sm text-[#aab4b9]">
              {busy ? <AtomLoader size={108} dark /> : null}
              <span>{placeholder}</span>
            </div>
          )}
        </div>
      </div>
      {caption || dims ? (
        <span className="text-xs text-[#667880] dark:text-[#9aabb4]">
          {caption}
          {caption && dims ? " · " : ""}
          {dims ? `${dims.w}×${dims.h}` : ""}
        </span>
      ) : null}
    </div>
  );
}

// UiPath-style orbiting atom loader.
export function AtomLoader({
  size = 96,
  label,
  dark = false,
}: {
  size?: number;
  label?: string;
  dark?: boolean;
}) {
  const orbits = [
    { dur: "2.6s", tilt: 0, color: "#FA4616" },
    { dur: "3.8s", tilt: 60, color: "#0BA2B3" },
    { dur: "5.2s", tilt: 120, color: "#1E6482" },
  ];
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative" style={{ width: size, height: size }}>
        {orbits.map((o, i) => (
          <div key={i} className="absolute inset-0" style={{ transform: `rotate(${o.tilt}deg)` }}>
            <div
              className="absolute inset-0 rounded-[50%] border"
              style={{
                borderColor: `${o.color}59`,
                transform: "scaleY(0.4)",
                animation: `atom-orbit ${o.dur} linear infinite`,
              }}
            >
              <span
                className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{
                  width: size * 0.09,
                  height: size * 0.09,
                  background: o.color,
                  boxShadow: `0 0 ${size * 0.1}px ${o.color}`,
                }}
              />
            </div>
          </div>
        ))}
        <span
          className="atom-core absolute left-1/2 top-1/2 rounded-full bg-[#FA4616]"
          style={{
            width: size * 0.16,
            height: size * 0.16,
            boxShadow: `0 0 ${size * 0.18}px #FA4616`,
          }}
        />
      </div>
      {label ? (
        <p
          className={`text-sm font-medium ${
            dark ? "text-[#cfd8dc]" : "text-[#667880] dark:text-[#9aabb4]"
          }`}
        >
          {label}
        </p>
      ) : null}
    </div>
  );
}

export interface ComboOption {
  value: string;
  label: string;
  group?: string;
}

// Searchable, scrollable dropdown. Shows ~5 rows at a time; the rest scroll.
export function Combobox({
  value,
  options,
  onChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  disabled = false,
}: {
  value: string;
  options: (string | ComboOption)[];
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
}) {
  const opts: ComboOption[] = options.map((o) =>
    typeof o === "string" ? { value: o, label: o } : o,
  );
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [box, setBox] = useState<{ left: number; width: number; top?: number; bottom?: number; maxH: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const measure = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const spaceAbove = r.top;
    const flipUp = spaceBelow < 240 && spaceAbove > spaceBelow;
    const maxH = Math.max(160, Math.min(280, (flipUp ? spaceAbove : spaceBelow) - 12));
    setBox(
      flipUp
        ? { left: r.left, width: r.width, bottom: window.innerHeight - r.top + 6, maxH }
        : { left: r.left, width: r.width, top: r.bottom + 6, maxH },
    );
  };

  useEffect(() => {
    if (!open) return;
    measure();
    const reposition = () => measure();
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    document.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
      document.removeEventListener("mousedown", onDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const selected = opts.find((o) => o.value === value);
  const needle = q.trim().toLowerCase();
  const filtered = needle
    ? opts.filter(
        (o) =>
          o.label.toLowerCase().includes(needle) || (o.group ?? "").toLowerCase().includes(needle),
      )
    : opts;
  const showSearch = opts.length > 6;

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
    setQ("");
  };

  let lastGroup: string | undefined;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => {
          setQ("");
          setOpen((o) => !o);
        }}
        className={`${inputClass} flex items-center justify-between gap-2 text-left ${
          disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
        }`}
      >
        <span
          className={`truncate ${
            selected ? "text-[#182128] dark:text-[#e6edf1]" : "text-[#aab4b9] dark:text-[#71808a]"
          }`}
        >
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-[#667880] transition dark:text-[#9aabb4] ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && box
        ? createPortal(
            <div
              ref={panelRef}
              style={{
                position: "fixed",
                left: box.left,
                width: box.width,
                top: box.top,
                bottom: box.bottom,
              }}
              className="z-[1000] overflow-hidden rounded-2xl border border-[#e1e4e6] bg-white shadow-[0_18px_44px_rgba(24,33,40,0.18)] dark:border-[#28333c] dark:bg-[#161f27] dark:shadow-[0_18px_44px_rgba(0,0,0,0.5)]"
            >
              {showSearch ? (
                <div className="flex items-center gap-2 border-b border-[#eceff1] px-3 py-2 dark:border-[#28333c]">
                  <Search className="h-4 w-4 text-[#aab4b9] dark:text-[#71808a]" />
                  <input
                    autoFocus
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder={searchPlaceholder}
                    className="w-full bg-transparent text-sm text-[#182128] outline-none placeholder:text-[#aab4b9] dark:text-[#e6edf1] dark:placeholder:text-[#71808a]"
                  />
                </div>
              ) : null}
              <div className="scrollbar-thin overflow-y-auto py-1" style={{ maxHeight: box.maxH }}>
                {filtered.length === 0 ? (
                  <div className="px-3 py-3 text-sm text-[#9aa7ad] dark:text-[#71808a]">No matches</div>
                ) : (
                  filtered.map((o) => {
                    const header = o.group && o.group !== lastGroup ? o.group : null;
                    lastGroup = o.group;
                    return (
                      <div key={o.value}>
                        {header ? (
                          <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9aa7ad] dark:text-[#71808a]">
                            {header}
                          </p>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => pick(o.value)}
                          className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition hover:bg-[#f5f6f7] dark:hover:bg-[#1d2830] ${
                            o.value === value
                              ? "bg-[#fff1ec] text-[#A33200] dark:bg-[#2c1812] dark:text-[#ff8a5c]"
                              : "text-[#182128] dark:text-[#e6edf1]"
                          }`}
                        >
                          <span className="truncate">{o.label}</span>
                          {o.value === value ? (
                            <Check className="h-4 w-4 shrink-0 text-[#FA4616]" />
                          ) : null}
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
