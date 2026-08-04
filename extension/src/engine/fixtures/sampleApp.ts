import type { Platform } from "../types.js";

// A declarative sample app ("ACME Shopping") used for simulated runs.
// One model generates BOTH the Appium-style page source XML and the SVG
// screenshot, so the selectors the app captures always match what's drawn.

export interface FxElement {
  kind: "title" | "label" | "input" | "button" | "item";
  text: string;
  resourceId?: string; // android resource-id
  accessibilityId?: string; // content-desc / a11y id / iOS name
  androidClass?: string;
  iosType?: string;
}

export interface FxScreen {
  id: string;
  appName: string;
  title: string;
  elements: FxElement[];
}

const pkg = "com.acme.shopping";

export const SAMPLE_SCREENS: FxScreen[] = [
  {
    id: "login",
    appName: "ACME Shopping",
    title: "Sign in",
    elements: [
      { kind: "title", text: "Welcome back", accessibilityId: "welcome_title" },
      { kind: "input", text: "Email", resourceId: `${pkg}:id/email_input`, accessibilityId: "email_field" },
      { kind: "input", text: "Password", resourceId: `${pkg}:id/password_input`, accessibilityId: "password_field" },
      { kind: "button", text: "Log in", resourceId: `${pkg}:id/login_button`, accessibilityId: "login_button" },
      { kind: "label", text: "Forgot password?", accessibilityId: "forgot_password" },
    ],
  },
  {
    id: "home",
    appName: "ACME Shopping",
    title: "Home",
    elements: [
      { kind: "title", text: "Featured", accessibilityId: "home_title" },
      { kind: "input", text: "Search products", resourceId: `${pkg}:id/search_box`, accessibilityId: "search_box" },
      { kind: "item", text: "Wireless Headphones", resourceId: `${pkg}:id/product_card`, accessibilityId: "product_headphones" },
      { kind: "item", text: "Smart Watch", resourceId: `${pkg}:id/product_card`, accessibilityId: "product_watch" },
      { kind: "button", text: "Cart", resourceId: `${pkg}:id/cart_tab`, accessibilityId: "cart_tab" },
    ],
  },
  {
    id: "product",
    appName: "ACME Shopping",
    title: "Product",
    elements: [
      { kind: "title", text: "Wireless Headphones", accessibilityId: "product_name" },
      { kind: "label", text: "$129.00", resourceId: `${pkg}:id/price`, accessibilityId: "product_price" },
      { kind: "button", text: "Add to cart", resourceId: `${pkg}:id/add_to_cart`, accessibilityId: "add_to_cart" },
      { kind: "button", text: "Buy now", resourceId: `${pkg}:id/buy_now`, accessibilityId: "buy_now" },
    ],
  },
  {
    id: "cart",
    appName: "ACME Shopping",
    title: "Cart",
    elements: [
      { kind: "title", text: "Your Cart", accessibilityId: "cart_title" },
      { kind: "item", text: "Wireless Headphones - $129.00", resourceId: `${pkg}:id/cart_line`, accessibilityId: "cart_line_1" },
      { kind: "label", text: "Total: $129.00", resourceId: `${pkg}:id/cart_total`, accessibilityId: "cart_total" },
      { kind: "button", text: "Checkout", resourceId: `${pkg}:id/checkout_button`, accessibilityId: "checkout_button" },
    ],
  },
  {
    id: "confirmation",
    appName: "ACME Shopping",
    title: "Order placed",
    elements: [
      { kind: "title", text: "Thank you!", accessibilityId: "confirmation_title" },
      { kind: "label", text: "Order #ACME-10293 confirmed", resourceId: `${pkg}:id/order_id`, accessibilityId: "order_id" },
      { kind: "button", text: "Continue shopping", resourceId: `${pkg}:id/continue_button`, accessibilityId: "continue_button" },
    ],
  },
];

function androidClassFor(kind: FxElement["kind"]): string {
  switch (kind) {
    case "input":
      return "android.widget.EditText";
    case "button":
      return "android.widget.Button";
    case "title":
    case "label":
      return "android.widget.TextView";
    case "item":
      return "android.view.ViewGroup";
  }
}

function iosTypeFor(kind: FxElement["kind"]): string {
  switch (kind) {
    case "input":
      return "XCUIElementTypeTextField";
    case "button":
      return "XCUIElementTypeButton";
    case "title":
    case "label":
      return "XCUIElementTypeStaticText";
    case "item":
      return "XCUIElementTypeCell";
  }
}

function esc(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Element layout for both page source bounds and SVG rendering.
const PHONE = { w: 360, h: 780 };
function rowY(index: number): number {
  return 150 + index * 96;
}

export function buildPageSource(screen: FxScreen, platform: Platform): string {
  if (platform === "Android") {
    const nodes = screen.elements
      .map((el, i) => {
        const y = rowY(i);
        const bounds = `[24,${y}][${PHONE.w - 24},${y + 72}]`;
        const clickable = el.kind === "button" || el.kind === "item";
        return `    <node index="${i}" class="${androidClassFor(el.kind)}" package="${pkg}" content-desc="${esc(el.accessibilityId ?? "")}" resource-id="${esc(el.resourceId ?? "")}" text="${esc(el.kind === "input" ? "" : el.text)}" clickable="${clickable}" enabled="true" focusable="${el.kind === "input"}" bounds="${bounds}" />`;
      })
      .join("\n");
    return `<?xml version="1.0" encoding="UTF-8"?>
<hierarchy rotation="0">
  <node index="0" class="android.widget.FrameLayout" package="${pkg}" bounds="[0,0][${PHONE.w},${PHONE.h}]">
${nodes}
  </node>
</hierarchy>`;
  }

  // iOS
  const nodes = screen.elements
    .map((el, i) => {
      const y = rowY(i);
      return `    <${iosTypeFor(el.kind)} type="${iosTypeFor(el.kind)}" name="${esc(el.accessibilityId ?? el.text)}" label="${esc(el.text)}" value="${esc(el.kind === "input" ? "" : el.text)}" enabled="true" visible="true" x="24" y="${y}" width="${PHONE.w - 48}" height="72" />`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<AppiumAUT>
  <XCUIElementTypeApplication type="XCUIElementTypeApplication" name="${esc(screen.appName)}" enabled="true" visible="true" x="0" y="0" width="${PHONE.w}" height="${PHONE.h}">
${nodes}
  </XCUIElementTypeApplication>
</AppiumAUT>`;
}

// Render the screen as an SVG "screenshot", returned as a data URL.
export function buildScreenshot(
  screen: FxScreen,
  platform: Platform,
  deviceLabel: string,
): string {
  const orange = "#FA4616";
  const navy = "#182128";
  const muted = "#667880";

  const rows = screen.elements
    .map((el, i) => {
      const y = rowY(i);
      if (el.kind === "title") {
        return `<text x="28" y="${y + 34}" font-family="Poppins, Segoe UI, sans-serif" font-size="26" font-weight="600" fill="${navy}">${esc(el.text)}</text>`;
      }
      if (el.kind === "label") {
        return `<text x="28" y="${y + 30}" font-family="Poppins, sans-serif" font-size="16" fill="${muted}">${esc(el.text)}</text>`;
      }
      if (el.kind === "input") {
        return `<g><rect x="24" y="${y}" rx="14" width="${PHONE.w - 48}" height="56" fill="#ffffff" stroke="#d9d9d9" stroke-width="1.5"/><text x="40" y="${y + 35}" font-family="Poppins, sans-serif" font-size="15" fill="#9aa7ad">${esc(el.text)}</text></g>`;
      }
      if (el.kind === "button") {
        const primary = i === screen.elements.length - 1 || /log in|checkout|buy|add to cart|continue/i.test(el.text);
        const fill = primary ? orange : "#ffffff";
        const stroke = primary ? orange : "#d9d9d9";
        const tcolor = primary ? "#ffffff" : navy;
        return `<g><rect x="24" y="${y}" rx="16" width="${PHONE.w - 48}" height="56" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/><text x="${PHONE.w / 2}" y="${y + 35}" text-anchor="middle" font-family="Poppins, sans-serif" font-size="16" font-weight="600" fill="${tcolor}">${esc(el.text)}</text></g>`;
      }
      // item
      return `<g><rect x="24" y="${y}" rx="16" width="${PHONE.w - 48}" height="72" fill="#ffffff" stroke="#eceff1" stroke-width="1.5"/><rect x="40" y="${y + 16}" rx="8" width="40" height="40" fill="#cceefe"/><text x="96" y="${y + 42}" font-family="Poppins, sans-serif" font-size="15" font-weight="500" fill="${navy}">${esc(el.text)}</text></g>`;
    })
    .join("\n");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PHONE.w}" height="${PHONE.h}" viewBox="0 0 ${PHONE.w} ${PHONE.h}">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#f7fbff"/></linearGradient></defs>
  <rect width="${PHONE.w}" height="${PHONE.h}" fill="url(#bg)"/>
  <rect width="${PHONE.w}" height="40" fill="${navy}"/>
  <text x="16" y="26" font-family="Poppins, sans-serif" font-size="13" fill="#ffffff">9:41</text>
  <text x="${PHONE.w - 16}" y="26" text-anchor="end" font-family="Poppins, sans-serif" font-size="12" fill="#cfd8dc">${esc(deviceLabel)}</text>
  <rect y="40" width="${PHONE.w}" height="64" fill="#ffffff"/>
  <circle cx="34" cy="72" r="12" fill="${orange}"/>
  <text x="56" y="78" font-family="Poppins, sans-serif" font-size="18" font-weight="600" fill="${navy}">${esc(screen.appName)}</text>
  <line x1="0" y1="104" x2="${PHONE.w}" y2="104" stroke="#eceff1"/>
  ${rows}
</svg>`;

  const base64 = btoa(String.fromCharCode(...new TextEncoder().encode(svg)));
  return `data:image/svg+xml;base64,${base64}`;
}
