import { useEffect, useState, type ReactNode } from "react";
import {
  Boxes,
  Dices,
  GitBranch,
  Chrome,
  KeyRound,
  Puzzle,
  ShieldCheck,
  Smartphone,
  Workflow,
  X,
} from "lucide-react";

/** Slide-over documentation: how to connect, which scopes, what's supported. */
export function HelpPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    // Don't let the page behind scroll while the drawer is open.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close help"
        onClick={onClose}
        className="absolute inset-0 bg-[#0b0f12]/40 backdrop-blur-[2px]"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Help and documentation"
        className="drawer-in relative flex h-full w-full max-w-2xl flex-col border-l border-[#e6e9eb] bg-white shadow-2xl dark:border-[#28333c] dark:bg-[#0d141a]"
      >
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-[#eceff1] px-6 py-4 dark:border-[#28333c]">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#FA4616]">
              Documentation
            </p>
            <h2 className="text-lg font-semibold text-[#182128] dark:text-[#e6edf1]">
              Setting up Mobile Test Autopilot
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#e1e4e6] text-[#667880] transition hover:border-[#FA4616] hover:text-[#A33200] dark:border-[#28333c] dark:text-[#9aabb4] dark:hover:text-[#ff8a5c]"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="scrollbar-thin flex-1 overflow-y-auto px-6 py-5">
          <Section icon={<Puzzle className="h-4 w-4" />} title="1 · Install the engine extension">
            <P>
              The automation engine runs inside a browser extension - there is no server to host and
              nothing to install on your machine beyond the extension itself.
            </P>
            <Steps
              items={[
                <>
                  Open <Code>chrome://extensions</Code> and turn on{" "}
                  <B>Developer mode</B> (top-right).
                </>,
                <>
                  Click <B>Load unpacked</B> and select the project&apos;s <Code>extension/</Code>{" "}
                  folder.
                </>,
                <>
                  <B>Reload this page.</B> Extensions only attach to tabs opened after they are
                  loaded. A green <B>&ldquo;Engine extension active&rdquo;</B> pill appears on the
                  Connect step.
                </>,
              ]}
            />
          </Section>

          <Section icon={<KeyRound className="h-4 w-4" />} title="2 · Connect UiPath">
            <P>
              UiPath authentication is required: the LLM Gateway is what reads each screen and
              decides the next action. Two ways to authenticate:
            </P>
            <Table
              head={["Mode", "What you provide"]}
              rows={[
                [
                  <B>Client credentials</B>,
                  <>
                    Org, tenant, <Code>clientId</Code> and <Code>clientSecret</Code> from an{" "}
                    <B>External Application</B> (Admin → External Applications). Exchanged at{" "}
                    <Code>/identity_/connect/token</Code>.
                  </>,
                ],
                [
                  <B>Bearer / PAT</B>,
                  <>
                    A personal access token or a bearer token pasted directly - handy for a quick
                    demo, but it expires sooner.
                  </>,
                ],
              ]}
            />
            <P>
              Fill <B>Base URL</B> (e.g. <Code>https://cloud.uipath.com</Code> or your staging URL),{" "}
              <B>Organization</B>, <B>Tenant</B>, then press <B>Validate connection</B>. On success
              the app probes which LLM models your tenant actually accepts and lists them.
            </P>
          </Section>

          <Section icon={<ShieldCheck className="h-4 w-4" />} title="3 · Required scopes">
            <P>
              When you create the External Application, grant it these{" "}
              <B>application scopes</B>. Copy the list into the scope field on the Connect step
              (space-separated):
            </P>
            <Code block>OR.Execution ConversationalAgents</Code>
            <Table
              head={["Scope", "Why it's needed"]}
              rows={[
                [
                  <Code>OR.Execution</Code>,
                  "Base Orchestrator execution scope - lets the token call tenant services.",
                ],
                [
                  <Code>ConversationalAgents</Code>,
                  "Grants access to the LLM Gateway chat-completions endpoint used to plan each step.",
                ],
              ]}
            />
            <Callout>
              If validation succeeds but reports <B>&ldquo;LLM Gateway not reachable&rdquo;</B>, the
              token is valid but lacks gateway access - add{" "}
              <Code>ConversationalAgents</Code> to the external app and re-validate. The app
              automatically tries the gateway paths{" "}
              <Code>llmgateway_</Code>, <Code>orchestrator_/llm</Code> and{" "}
              <Code>agenthub_/llm</Code>, so you do not need to know which one your tenant uses.
            </Callout>
          </Section>

          <Section icon={<Smartphone className="h-4 w-4" />} title="4 · Connect a device cloud">
            <P>
              Pick a provider and enter its credentials, then <B>Load devices</B> and choose OS →
              version → device. Add one or more devices to the run pool (several devices = a
              parallel batch).
            </P>
            <Table
              head={["Provider", "Credentials", "Build id"]}
              rows={[
                [
                  <B>BrowserStack</B>,
                  <>
                    Username + access key
                    <br />
                    <Muted>Account → Settings</Muted>
                  </>,
                  <Code>bs://…</Code>,
                ],
                [
                  <B>Sauce Labs</B>,
                  <>
                    Username + access key, plus a region
                    <br />
                    <Muted>us-west-1 / us-east-4 / eu-central-1</Muted>
                  </>,
                  <Code>storage:…</Code>,
                ],
                [
                  <B>LambdaTest</B>,
                  <>
                    Username + access key, plus a data centre
                    <br />
                    <Muted>Access Key button, top-right of the dashboard</Muted>
                  </>,
                  <Code>lt://…</Code>,
                ],
                [
                  <B>Custom Appium</B>,
                  <>
                    Your own hub URL
                    <br />
                    <Muted>http://host:4723/wd/hub</Muted>
                  </>,
                  <Muted>n/a - enter device manually</Muted>,
                ],
              ]}
            />
            <P>
              <B>Device location.</B> Farms run devices from a few data centres, so an app that
              geo-gates content (or its backend) can misbehave or crash when the device&apos;s IP is in
              the wrong country. Set <B>Device location</B> to the ISO country you need - it maps to
              the provider&apos;s IP-geolocation capability. Supported on BrowserStack and LambdaTest.
            </P>
            <P>
              <B>No credentials?</B> Leave them blank and the run uses a bundled simulated device -
              the whole flow, including a downloadable workflow, works end to end for a demo.
            </P>
          </Section>

          <Section icon={<Boxes className="h-4 w-4" />} title="5 · App under test">
            <P>
              For a <B>native app</B> run, upload your <Code>.apk</Code> / <Code>.aab</Code> /{" "}
              <Code>.ipa</Code> from the App &amp; Test Case step (or paste an existing build id).
              Builds are per platform and shared by every device of that platform in the run.
            </P>
            <P>
              For a <B>mobile browser</B> run, provide a start URL instead - the agent opens it in
              Chrome (Android) or Safari (iOS). A test case is either native or web, not both.
            </P>
          </Section>

          <Section icon={<GitBranch className="h-4 w-4" />} title="6 · Conditional & optional steps">
            <P>
              Real flows have screens that only sometimes appear. Two forms handle that, and both
              count as <B>skipped</B> rather than failed when they don&apos;t apply:
            </P>
            <Code block>{`Optional: Tap the "Allow" button

If "OTP incorrect" is displayed
  Tap "Request A New OTP"
  Enter the OTP 0000
End if

If "Allow" is displayed, tap "Allow"`}</Code>
            <Table
              head={["Form", "Behaviour"]}
              rows={[
                [
                  <Code>Optional: …</Code>,
                  "Runs the step; if its target isn't on screen the step is skipped instead of reported as a problem.",
                ],
                [
                  <>
                    <Code>If …</Code> / <Code>End if</Code>
                  </>,
                  "Everything between them runs only when the condition matches the live screen. The condition is checked once per block.",
                ],
                [
                  <Code>If …, do X</Code>,
                  "Single-line form - one guarded step, no End if needed.",
                ],
              ]}
            />
            <Callout>
              Conditions are matched against what&apos;s actually on screen, so{" "}
              <B>quote the visible text</B> - <Code>If &quot;OTP incorrect&quot; is displayed</Code>{" "}
              is reliable; <Code>If there is an error</Code> is not.
            </Callout>
          </Section>

          <Section icon={<Dices className="h-4 w-4" />} title="7 · Unique test data">
            <P>
              Writing <B>&ldquo;enter a random passport number&rdquo;</B> does <B>not</B> produce a
              random value - the planner just types a literal, so every run reuses the same identity.
              Apps that de-duplicate on passport/ID, email or phone then treat the second run as a
              returning customer. Use a token instead:
            </P>
            <Code block>{`Enter the passport number R{{digits:7}}
Enter the mobile number 87{{digits:7#phone}}
Enter the email {{email}}
Enter the first name {{firstName}}
Enter the last name {{lastName}}`}</Code>
            <Table
              head={["Token", "Expands to"]}
              rows={[
                [<Code>{"{{digits:N}}"}</Code>, "N random digits."],
                [<Code>{"{{letters:N}}"}</Code>, "N random capital letters."],
                [<Code>{"{{alnum:N}}"}</Code>, "N random letters/digits."],
                [<Code>{"{{email}}"}</Code>, "A unique address at example.com."],
                [
                  <>
                    <Code>{"{{firstName}}"}</Code> / <Code>{"{{lastName}}"}</Code>
                  </>,
                  "A random name.",
                ],
                [
                  <>
                    <Code>{"{{uuid}}"}</Code> / <Code>{"{{timestamp}}"}</Code>
                  </>,
                  "A unique id / the current epoch ms.",
                ],
              ]}
            />
            <Callout>
              The same token text keeps the same value for the whole run, so{" "}
              <Code>{"{{email}}"}</Code> in two steps matches. Add a <Code>#suffix</Code> when you
              need a second, different value: <Code>{"{{digits:7#phone}}"}</Code>.
            </Callout>
          </Section>

          <Section icon={<Workflow className="h-4 w-4" />} title="8 · What you get">
            <P>
              Write one action per step in plain English (&ldquo;tap the search field&rdquo;,
              &ldquo;type running shoes&rdquo;). For each step the agent reads the live screen, asks
              the LLM Gateway for the single best action, executes it, and records the resolved
              selector plus before/after screenshots.
            </P>
            <Table
              head={["Output", "Details"]}
              rows={[
                [
                  <B>Workflow (.xaml)</B>,
                  <>
                    One mobile activity per step inside a <Code>MobileDeviceConnection</Code> scope.
                    Confirm the activity package version in Studio before importing.
                  </>,
                ],
                [
                  <B>Selector catalog</B>,
                  <>
                    Native: UiPath mobile <Code>&lt;mbl/&gt;</Code>. Web: UiPath{" "}
                    <Code>&lt;webctrl/&gt;</Code>. Attribute-based and exact.
                  </>,
                ],
                [<B>Action log (.json)</B>, "Every planned action, outcome and captured text."],
              ]}
            />
          </Section>

          <Section icon={<Chrome className="h-4 w-4" />} title="Troubleshooting">
            <Table
              head={["Symptom", "Fix"]}
              rows={[
                [
                  <B>&ldquo;Engine extension not detected&rdquo;</B>,
                  "Load the extension, then reload this page - it only attaches to tabs opened after install.",
                ],
                [
                  <B>&ldquo;App metadata not found&rdquo;</B>,
                  "The page tried to reach a backend that isn't there. Same fix: install the extension and reload.",
                ],
                [
                  <B>Authenticated, gateway unreachable</B>,
                  <>
                    Add <Code>ConversationalAgents</Code> to the external app&apos;s scopes and
                    re-validate.
                  </>,
                ],
                [
                  <B>Device list is empty</B>,
                  "Check the farm credentials and region/data centre - the list is fetched live from the provider.",
                ],
                [
                  <B>Steps say &ldquo;needs attention&rdquo;</B>,
                  "The planner couldn't confidently match an element. Rephrase the step to name the visible label or field.",
                ],
              ]}
            />
          </Section>
        </div>
      </aside>
    </div>
  );
}

// --- Small presentational helpers -------------------------------------------
function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="mb-7 last:mb-2">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#182128] dark:text-[#e6edf1]">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#182128] text-[#FA4616] dark:bg-[#22303a]">
          {icon}
        </span>
        {title}
      </h3>
      <div className="space-y-2 pl-9">{children}</div>
    </section>
  );
}

function P({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-6 text-[#667880] dark:text-[#9aabb4]">{children}</p>;
}

function B({ children }: { children: ReactNode }) {
  return <span className="font-semibold text-[#182128] dark:text-[#e6edf1]">{children}</span>;
}

function Muted({ children }: { children: ReactNode }) {
  return <span className="text-xs text-[#9aa7ad] dark:text-[#71808a]">{children}</span>;
}

function Code({ children, block }: { children: ReactNode; block?: boolean }) {
  if (block) {
    return (
      <pre className="scrollbar-thin overflow-x-auto rounded-xl bg-[#0f161b] px-4 py-3 font-mono text-[12px] leading-6 text-[#ffb08c]">
        {children}
      </pre>
    );
  }
  return (
    <code className="rounded bg-[#f5f6f7] px-1.5 py-0.5 font-mono text-[12px] text-[#A33200] dark:bg-[#1d2830] dark:text-[#ff8a5c]">
      {children}
    </code>
  );
}

function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="list-decimal space-y-1.5 pl-5 text-sm leading-6 text-[#667880] marker:font-semibold marker:text-[#FA4616] dark:text-[#9aabb4]">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ol>
  );
}

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="scrollbar-thin overflow-x-auto rounded-xl border border-[#eceff1] dark:border-[#28333c]">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="bg-[#fafbfc] dark:bg-[#161f27]">
            {head.map((h) => (
              <th
                key={h}
                className="px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#667880] dark:text-[#9aabb4]"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-[#eceff1] align-top dark:border-[#28333c]">
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-2.5 text-sm leading-6 text-[#667880] dark:text-[#9aabb4]">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Callout({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-[#cceefe] bg-[#f3fbff] px-4 py-3 text-sm leading-6 text-[#1E6482] dark:border-[#1d3947] dark:bg-[#0e2129] dark:text-[#6db3d6]">
      {children}
    </div>
  );
}
