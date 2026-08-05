/**
 * Parses the plain-English step list into steps that may be conditional.
 *
 * Supported shapes (all case-insensitive, trailing ":" optional):
 *
 *   If "OTP incorrect" is displayed          <- opens a guarded block
 *     Tap "Request A New OTP"
 *     Enter the OTP 0000
 *   End if                                   <- closes it
 *
 *   If "Allow" is displayed, tap "Allow"     <- single guarded step (inline)
 *
 *   Optional: Tap the "Skip" button          <- run it, but skip (don't fail)
 *                                              when the target isn't there
 *
 * Everything else is an ordinary step. Blocks don't nest - an `If` inside a
 * block is treated as the start of a new block (the previous one closes).
 */

const FIRST_NAMES = ["Ayanda", "Thabo", "Lerato", "Sipho", "Nadia", "Kayla", "Riaan", "Zanele", "Devan", "Imke"];
const LAST_NAMES = ["Naidoo", "Botha", "Mkhize", "Pillay", "Venter", "Dlamini", "Fourie", "Khumalo", "Jacobs", "Nel"];

function randInt(max: number): number {
  return Math.floor(Math.random() * max);
}
function pick(list: string[]): string {
  return list[randInt(list.length)];
}
/**
 * Format a date with dd/MM/yyyy-style placeholders:
 *   yyyy | yy | MM (month) | dd | HH | mm (minutes) | ss
 *
 * `MM` is the month and `mm` the minutes, per convention - but a date-only
 * pattern written "dd/mm/yyyy" clearly means the month, so accept that rather
 * than silently emitting a minute value into a date field.
 */
function formatDate(d: Date, pattern: string): string {
  const p2 = (n: number) => String(n).padStart(2, "0");
  const month = p2(d.getMonth() + 1);
  const hasTime = /HH|ss/.test(pattern || "");
  let out = (pattern || "dd/MM/yyyy")
    .replace(/yyyy/g, String(d.getFullYear()))
    .replace(/yy/g, p2(d.getFullYear() % 100))
    .replace(/MM/g, month);
  if (!hasTime) out = out.replace(/mm/g, month);
  return out
    .replace(/dd/g, p2(d.getDate()))
    .replace(/HH/g, p2(d.getHours()))
    .replace(/mm/g, p2(d.getMinutes()))
    .replace(/ss/g, p2(d.getSeconds()));
}

/**
 * A date of birth that is always 18+ TODAY.
 *
 * Subtracting years from the current year is not enough: a birthday later in
 * the year than today still leaves the person a year younger (e.g. born
 * 2008-11-20 is 17 on 2026-07-28). Pick a point in the window that ends one
 * day before the 18th birthday cut-off instead.
 */
function adultBirthDate(): Date {
  const now = new Date();
  const latest = new Date(now.getFullYear() - 18, now.getMonth(), now.getDate() - 1);
  const earliest = new Date(now.getFullYear() - 70, now.getMonth(), now.getDate());
  const span = latest.getTime() - earliest.getTime();
  return new Date(earliest.getTime() + Math.floor(Math.random() * span));
}

function repeatRandom(n: number, alphabet: string): string {
  let out = "";
  for (let i = 0; i < n; i += 1) out += alphabet[randInt(alphabet.length)];
  return out;
}

/**
 * Expand {{…}} tokens into freshly generated values.
 *
 * Apps that de-duplicate on identity fields (passport/ID, email, phone) reject
 * a re-run that reuses the same values, so tests need genuinely unique data
 * each time. Writing "enter a random passport number" does NOT achieve that -
 * the planner just types a literal - so use a token instead:
 *
 *   Enter the passport number R{{digits:7}}
 *   Enter the email {{email}}
 *   Enter the first name {{firstName}}
 *   Enter the date of birth {{dob}}          (always 18+ years old)
 *   Enter today's date {{date:yyyy-MM-dd}}
 *
 * Card payment fields:
 *   {{nameOnCard}}                           (e.g. "Lerato Pillay")
 *   {{cardNumber}}                           (Visa test PAN 4111…1111 by
 *                                             default; pass another as
 *                                             {{cardNumber:5555555555554444}})
 *   {{expiry}}                               (3 years out, MM/yy)
 *   {{cvv}}                                  (3 digits; {{cvv:4}} for Amex)
 *
 * The same token text expands to the same value for the whole run, so an email
 * used in two steps matches. Add a #suffix to force a distinct value:
 * {{digits:7}} and {{digits:7#other}}.
 *
 * Tokens INVENT data - they are not variable substitution, so {{ProductName}}
 * is not a thing: there is no "ProductName" kind to generate, and an unknown
 * token is left visible rather than guessed at, so it gets typed as raw
 * "{{…}}" text.
 *
 * For a value that must match real app content (a product to search for, an
 * item to pick from a list), supply the candidates and let the run vary
 * between them:
 *
 *   Enter the {{oneOf:Nescafe Gold 200g|Jacobs Kronung 200g}} into the …
 *   Tap the {{oneOf:60 MIN}} button          <- one value = a named constant
 */
/** A token that was expanded, so exports can regenerate it themselves. */
export interface GeneratedValue {
  token: string; // e.g. "{{digits:7}}"
  kind: string; // digits | email | dob | …
  arg: string; // length or format
  value: string; // what this run used
}

/**
 * Re-point a recorded string at freshly generated values.
 *
 * A replay reuses the recorded actions, so without this it would retype the
 * exact passport/email/phone the first run submitted - which apps that
 * de-duplicate on those fields reject. `oldGen` and `newGen` come from parsing
 * the SAME script twice, so entry i in one corresponds to entry i in the other.
 *
 * `template` is the step's pre-expansion text and scopes the swap to this
 * step's own tokens: a short value (e.g. a 2-digit number) could otherwise
 * coincide with text belonging to an unrelated step.
 */
export function regenerateRecordedText(
  text: string,
  template: string | undefined,
  oldGen: GeneratedValue[],
  newGen: GeneratedValue[],
): string {
  let out = text;
  for (let i = 0; i < oldGen.length; i += 1) {
    const before = oldGen[i];
    const after = newGen[i];
    // Only swap when the two parses line up, so a mismatched script cannot
    // splice one token's value into another's place.
    if (!after || before.token !== after.token) continue;
    if (template && !template.includes(before.token)) continue;
    if (!before.value || !out.includes(before.value)) continue;
    out = out.replace(before.value, after.value);
  }
  return out;
}

export function expandTokens(lines: string[]): string[] {
  return expandTokensWithData(lines).lines;
}

export function expandTokensWithData(lines: string[]): {
  lines: string[];
  generated: GeneratedValue[];
} {
  const memo = new Map<string, string>();
  const generate = (token: string, kind: string, arg: string): string => {
    const cached = memo.get(token);
    if (cached !== undefined) return cached;
    const n = Number(arg) || 0;
    let value: string;
    switch (kind.toLowerCase()) {
      case "digits":
        value = repeatRandom(n || 6, "0123456789");
        break;
      case "letters":
        value = repeatRandom(n || 6, "ABCDEFGHIJKLMNOPQRSTUVWXYZ");
        break;
      case "alnum":
        value = repeatRandom(n || 8, "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789");
        break;
      case "email":
        value = `autopilot.${repeatRandom(8, "abcdefghijklmnopqrstuvwxyz0123456789")}@example.com`;
        break;
      case "firstname":
        value = pick(FIRST_NAMES);
        break;
      case "lastname":
        value = pick(LAST_NAMES);
        break;
      case "uuid":
        value = `${repeatRandom(8, "0123456789abcdef")}-${repeatRandom(4, "0123456789abcdef")}-${repeatRandom(12, "0123456789abcdef")}`;
        break;
      case "timestamp":
        value = String(Date.now());
        break;
      case "date":
        // Today, in the requested format: {{date:dd/MM/yyyy}}
        value = formatDate(new Date(), arg || "dd/MM/yyyy");
        break;
      case "dob":
        // A date of birth guaranteed to be 18+: {{dob}} or {{dob:yyyy-MM-dd}}
        value = formatDate(adultBirthDate(), arg || "dd/MM/yyyy");
        break;
      case "nameoncard":
        value = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
        break;
      case "cardnumber":
        // A payment sandbox only accepts its published test PANs - a randomly
        // generated Luhn-valid number is declined - so default to the standard
        // Visa test card and let a specific one be passed as the argument:
        // {{cardnumber}} or {{cardnumber:5555555555554444}}
        value = arg || "4111111111111111";
        break;
      case "expiry": {
        // Comfortably in the future so the card never expires mid-suite.
        const later = new Date();
        later.setFullYear(later.getFullYear() + 3);
        value = formatDate(later, arg || "MM/yy");
        break;
      }
      case "cvv":
        value = repeatRandom(n || 3, "0123456789");
        break;
      case "oneof":
      case "pick": {
        /*
         * Pick one of the values written in the step. For data that must match
         * real app content - a product to search for, a store, a payment
         * method - there is nothing to invent: the value has to exist, so the
         * test supplies the candidates and the run varies between them.
         *
         *   Enter the {{oneOf:Nescafe Gold 200g|Jacobs Kronung 200g}} into …
         *
         * A single value makes it a plain named constant, which is handy for
         * keeping an environment-specific value in one place.
         */
        const options = arg
          .split("|")
          .map((o) => o.trim())
          .filter(Boolean);
        value = options.length ? pick(options) : token;
        break;
      }
      default:
        value = token; // unknown token - leave it visible rather than guessing
    }
    memo.set(token, value);
    return value;
  };

  const generated: GeneratedValue[] = [];
  const out = lines.map((line) =>
    (line ?? "").replace(
      /\{\{\s*([a-zA-Z]+)\s*(?::\s*([^}#]*?)\s*)?(?:#[^}]*)?\}\}/g,
      (token, kind: string, arg: string) => {
        const value = generate(token, kind, arg ?? "");
        if (value !== token && !generated.some((g) => g.token === token)) {
          generated.push({ token, kind: kind.toLowerCase(), arg: arg ?? "", value });
        }
        return value;
      },
    ),
  );
  return { lines: out, generated };
}

export interface ParsedStep {
  description: string;
  /**
   * The line before {{token}} expansion. Exporters use it to tell which tokens
   * belong to this step - matching on the generated value alone would let a
   * short value (e.g. a 2-digit number) hit an unrelated step by coincidence.
   */
  template?: string;
  /** Guard text from the enclosing `If …` (or an inline `If …, do X`). */
  condition?: string;
  /** Steps sharing a group are gated by one condition evaluation. */
  conditionGroup?: number;
  /** Skip instead of failing when the target element isn't present. */
  optional?: boolean;
}

const IF_BLOCK = /^if\b\s*(.+?)\s*:?\s*$/i;
const IF_INLINE = /^if\b\s*(.+?)\s*(?:,|:|\bthen\b)\s*(.+?)\s*$/i;
const END_BLOCK = /^(?:end\s*if|endif|end)\s*\.?\s*$/i;
const OPTIONAL = /^(?:optional|if\s+present|if\s+shown)\s*[:\-]\s*(.+?)\s*$/i;

/** Strip a trailing full stop so conditions read cleanly in logs. */
function tidy(text: string): string {
  return text.replace(/\s*\.\s*$/, "").trim();
}

export function parseStepScript(rawLines: string[]): ParsedStep[] {
  return parseStepScriptWithData(rawLines).steps;
}

export function parseStepScriptWithData(rawLines: string[]): {
  steps: ParsedStep[];
  generated: GeneratedValue[];
} {
  // Generate unique test data before anything else looks at the text, keeping
  // the raw line alongside so each step remembers its own tokens.
  const { lines, generated } = expandTokensWithData(rawLines);
  const rawByExpanded = new Map<number, string>();
  lines.forEach((line, i) => rawByExpanded.set(i, rawLines[i] ?? line));
  const out: ParsedStep[] = [];
  let openCondition: string | null = null;
  let group = 0;

  for (let li = 0; li < lines.length; li += 1) {
    const raw = lines[li];
    const template = (rawByExpanded.get(li) ?? raw ?? "").trim();
    const line = (raw ?? "").trim();
    if (!line) continue;

    if (END_BLOCK.test(line)) {
      openCondition = null;
      continue;
    }

    const optional = OPTIONAL.exec(line);
    if (optional) {
      out.push({ description: tidy(optional[1]), optional: true, template });
      continue;
    }

    // Inline form first: "If X, tap Y" is one guarded step, not a block.
    const inline = IF_INLINE.exec(line);
    if (inline && inline[2]) {
      group += 1;
      out.push({
        description: tidy(inline[2]),
        condition: tidy(inline[1]),
        conditionGroup: group,
        template,
      });
      continue;
    }

    const block = IF_BLOCK.exec(line);
    if (block) {
      group += 1;
      openCondition = tidy(block[1]);
      continue;
    }

    out.push(
      openCondition
        ? { description: tidy(line), condition: openCondition, conditionGroup: group, template }
        : { description: tidy(line), template },
    );
  }

  return { steps: out, generated };
}

/** True when the script uses any conditional syntax (for UI hints/logs). */
export function hasConditions(lines: string[]): boolean {
  return parseStepScript(lines).some((s) => s.condition || s.optional);
}
