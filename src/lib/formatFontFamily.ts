/**
 * Shared CSS `<family-name>` serializer.
 *
 * Canvas and CSS `font` shorthands reject unquoted family names that contain
 * whitespace, digits, or most punctuation (e.g. `M PLUS 1`, `Source Sans 3`).
 * Generic keyword families (`sans-serif`, `system-ui`, …) must stay unquoted so
 * the browser can resolve them. This helper quotes/escapes every non-generic
 * name and is safe for both single names and comma-separated fallback stacks.
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

function escapeFamilyName(name: string): string {
  return name.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Parse a comma-separated CSS font-family stack into individual family names.
 * Handles double-quoted and single-quoted strings, escaped characters, and
 * commas inside quoted names. Empty entries are omitted.
 */
function parseFontFamilyStack(stack: string): string[] {
  const families: string[] = [];
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

    let family = '';

    if (stack[index] === '"' || stack[index] === "'") {
      const quote = stack[index];
      index += 1;
      while (index < length) {
        const char = stack[index];
        if (char === '\\' && index + 1 < length) {
          family += stack[index + 1];
          index += 2;
          continue;
        }
        if (char === quote) {
          index += 1;
          break;
        }
        family += char;
        index += 1;
      }
    } else {
      while (index < length) {
        const char = stack[index];
        if (char === '\\' && index + 1 < length) {
          family += stack[index + 1];
          index += 2;
          continue;
        }
        if (char === ',') {
          break;
        }
        family += char;
        index += 1;
      }
      family = family.trim();
    }

    if (family.length > 0) {
      families.push(family);
    }

    if (index < length && stack[index] === ',') {
      index += 1;
    }
  }

  return families;
}

function serializeFamilyName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return '""';
  }

  const lower = trimmed.toLowerCase();
  if (isGenericFontFamily(lower)) {
    return lower;
  }
  if (isCssWideKeyword(lower) || !isUnquotedIdentifier(trimmed)) {
    return `"${escapeFamilyName(trimmed)}"`;
  }
  return trimmed;
}

export function formatSingleFontFamily(name: string): string {
  const parsed = parseFontFamilyStack(name);
  return serializeFamilyName(parsed[0] ?? '');
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
