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

function isGenericFontFamily(name: string): boolean {
  return GENERIC_FONT_FAMILIES.has(name.toLowerCase());
}

function isUnquotedIdentifier(name: string): boolean {
  // CSS identifiers allow many codepoints, but the conservative rule used here
  // covers every shipped bundled family and avoids quoting safe single-word
  // Latin/CJK names.
  return /^[a-zA-Z_][-\w]*$/u.test(name);
}

export function formatSingleFontFamily(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return '""';
  }
  if (isGenericFontFamily(trimmed) || isUnquotedIdentifier(trimmed)) {
    return trimmed;
  }
  return `"${trimmed.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export function formatFontFamily(stack: string): string {
  return stack
    .split(',')
    .map((part) => formatSingleFontFamily(part))
    .join(', ');
}
