// Pure folio / page-number marker resolution for Paper text. Replaces the page-number tokens a
// letterer types (typically in a master-page header/footer frame) with the live values at render
// time, so an inherited frame shows each page's own number. Framework-free and fully testable.

/** Tokens recognised in frame text. `{#}` mirrors the common InDesign "current page number" marker. */
const PAGE_TOKEN = /\{page\}|\{#\}/g;
const PAGES_TOKEN = /\{pages\}|\{##\}/g;

/** Replace page-number tokens in `text` with the current page number and total page count. */
export function resolvePaperFolioText(text: string, pageNumber: number, pageCount: number): string {
  if (!text || (!text.includes('{') )) return text;
  return text
    .replace(PAGES_TOKEN, String(Math.max(0, Math.round(pageCount))))
    .replace(PAGE_TOKEN, String(Math.max(0, Math.round(pageNumber))));
}

/** Whether the text carries any folio token (used to flag dynamic frames / skip needless work). */
export function hasPaperFolioToken(text: string | undefined): boolean {
  if (!text) return false;
  PAGE_TOKEN.lastIndex = 0;
  PAGES_TOKEN.lastIndex = 0;
  return PAGE_TOKEN.test(text) || PAGES_TOKEN.test(text);
}
