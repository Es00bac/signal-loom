/**
 * Shared CSS `<family-name>` serializer.
 *
 * Canvas and CSS `font` shorthands reject unquoted family names that contain
 * whitespace, digits, or most punctuation (e.g. `M PLUS 1`, `Source Sans 3`).
 * Generic keyword families (`sans-serif`, `system-ui`, …) must stay unquoted so
 * the browser can resolve them. This helper quotes/escapes every non-generic
 * name and is safe for both single names and comma-separated fallback stacks.
 *
 * The parser is standards-conscious about family *identity*: it preserves the
 * distinction between quoted and unquoted names, preserves whitespace inside
 * quoted strings, and handles CSS escapes (hex, literal, and line continuations).
 */

const GENERIC_FONT_FAMILIES = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
  'ui-rounded',
  'emoji',
  'math',
  'fangsong',
]);

/**
 * CSS-wide keywords that are invalid as unquoted `<family-name>` values. They
 * must be quoted when used as actual font family names.
 */
const CSS_WIDE_KEYWORDS = new Set([
  'inherit',
  'initial',
  'unset',
  'revert',
  'revert-layer',
]);

const MIN_FONT_WEIGHT = 1;
const MAX_FONT_WEIGHT = 1000;
const DEFAULT_FONT_WEIGHT = 400;

type QuoteChar = '"' | "'";

interface ParsedFamily {
  /** Unescaped family identity. */
  raw: string;
  /** The original quote character, or `null` if the name was unquoted. */
  quoted: QuoteChar | null;
}

function isGenericFontFamily(name: string): boolean {
  return GENERIC_FONT_FAMILIES.has(name.toLowerCase());
}

function isCssWideKeyword(name: string): boolean {
  return CSS_WIDE_KEYWORDS.has(name.toLowerCase());
}

function isUnquotedIdentifier(name: string): boolean {
  // CSS identifiers allow many codepoints, but the conservative rule used here
  // covers every shipped bundled family and avoids quoting safe single-word
  // Latin/CJK names.
  return /^[a-zA-Z_][-\w]*$/u.test(name);
}

function escapeDoubleQuotedName(name: string): string {
  return name.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function codePointToChar(codePoint: number): string {
  if (codePoint === 0 || codePoint > 0x10ffff) {
    return '\uFFFD';
  }
  return String.fromCodePoint(codePoint);
}

/**
 * Consume a CSS escape sequence that starts at `index` (the backslash has
 * already been read). Returns the decoded character and the next index.
 */
function consumeCssEscape(stack: string, index: number): { char: string; nextIndex: number } {
  const length = stack.length;
  if (index >= length) {
    return { char: '\\', nextIndex: index };
  }

  const first = stack[index];

  // Hexadecimal escape: up to six hex digits. A trailing whitespace is consumed
  // only when exactly six hex digits were read and the next character is a
  // whitespace terminator.
  if (/^[0-9a-fA-F]$/.test(first)) {
    let hex = first;
    let next = index + 1;
    while (next < length && /^[0-9a-fA-F]$/.test(stack[next]) && hex.length < 6) {
      hex += stack[next];
      next += 1;
    }
    if (hex.length === 6 && next < length && (stack[next] === ' ' || stack[next] === '\t')) {
      next += 1;
    }
    return { char: codePointToChar(parseInt(hex, 16)), nextIndex: next };
  }

  // Line continuation: backslash followed by a newline is removed entirely.
  if (first === '\n') {
    return { char: '', nextIndex: index + 1 };
  }
  if (first === '\r') {
    const afterCr = index + 1;
    if (afterCr < length && stack[afterCr] === '\n') {
      return { char: '', nextIndex: afterCr + 1 };
    }
    return { char: '', nextIndex: afterCr };
  }

  // Literal escape: include the next character unchanged.
  return { char: first, nextIndex: index + 1 };
}

/**
 * Parse a comma-separated CSS font-family stack into individual family records.
 * Handles double-quoted and single-quoted strings, escaped characters,
 * commas inside quoted names, and empty entries.
 */
function parseFontFamilyStack(stack: string): ParsedFamily[] {
  const families: ParsedFamily[] = [];
  let index = 0;
  const length = stack.length;

  while (index < length) {
    // Skip whitespace and stray commas between families.
    while (index < length && /\s/.test(stack[index])) {
      index += 1;
    }
    if (index >= length) {
      break;
    }
    if (stack[index] === ',') {
      index += 1;
      continue;
    }

    let raw = '';
    let quoted: QuoteChar | null = null;

    if (stack[index] === '"' || stack[index] === "'") {
      quoted = stack[index] as QuoteChar;
      index += 1;
      while (index < length) {
        const char = stack[index];
        if (char === '\\') {
          const escaped = consumeCssEscape(stack, index + 1);
          raw += escaped.char;
          index = escaped.nextIndex;
          continue;
        }
        if (char === quoted) {
          index += 1;
          break;
        }
        raw += char;
        index += 1;
      }
    } else {
      while (index < length) {
        const char = stack[index];
        if (char === '\\') {
          const escaped = consumeCssEscape(stack, index + 1);
          raw += escaped.char;
          index = escaped.nextIndex;
          continue;
        }
        if (char === ',') {
          break;
        }
        raw += char;
        index += 1;
      }
      raw = raw.trim();
    }

    if (raw.length > 0) {
      families.push({ raw, quoted });
    }

    if (index < length && stack[index] === ',') {
      index += 1;
    }
  }

  return families;
}

function serializeFamilyName(family: ParsedFamily): string {
  if (family.quoted) {
    // Preserve the quoted status but normalize to double quotes for output. This
    // keeps quoted generic-looking names (e.g. "serif") distinct from the
    // unquoted generic keyword while producing a single canonical serialization.
    const escaped = escapeDoubleQuotedName(family.raw);
    return `"${escaped}"`;
  }

  // Unquoted names: keep generic keywords generic, quote wide keywords and any
  // name that is not a valid CSS identifier.
  if (isGenericFontFamily(family.raw)) {
    return family.raw;
  }
  if (isCssWideKeyword(family.raw) || !isUnquotedIdentifier(family.raw)) {
    return `"${escapeDoubleQuotedName(family.raw)}"`;
  }
  return family.raw;
}

export function formatSingleFontFamily(name: string): string {
  const parsed = parseFontFamilyStack(name);
  const first = parsed[0];
  if (!first) {
    return '""';
  }
  return serializeFamilyName(first);
}

export function formatFontFamily(stack: string): string {
  return parseFontFamilyStack(stack)
    .map((family) => serializeFamilyName(family))
    .join(', ');
}

/**
 * Clamp a persisted or user-supplied font weight to the valid CSS numeric
 * range (`1`–`1000`). Non-numeric or out-of-range values fall back to `400`.
 */
export function normalizeFontWeight(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_FONT_WEIGHT;
  }
  return Math.max(MIN_FONT_WEIGHT, Math.min(MAX_FONT_WEIGHT, Math.round(value)));
}
