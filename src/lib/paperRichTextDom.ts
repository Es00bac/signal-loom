import type { PaperParagraphBorderEdge, PaperParagraphBorders, PaperRichParagraph, PaperTextRun } from '../types/paper';
import { normalizePaperRichText } from './paperRichText';

const MM_TO_PX = 3.7795;

// Bridge between Paper's rich-text model and a contentEditable DOM. `richTextToEditorHtml` builds the initial
// editor markup (pure/testable); `serializeRichEditor` reads an edited contentEditable back into runs using
// computed styles (browser-only). The editor is UNCONTROLLED — set innerHTML once, serialise on commit — so
// React never fights the user's caret.

const PT_TO_PX = 1.333;

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Inline CSS for one run — only the properties it overrides (the editor container carries the defaults). */
export function runInlineCss(run: PaperTextRun, zoom: number): string {
  const parts: string[] = [];
  if (run.fontFamily) parts.push(`font-family:${run.fontFamily}`);
  if (run.fontWeight) parts.push(`font-weight:${run.fontWeight}`);
  if (run.fontStyle) parts.push(`font-style:${run.fontStyle}`);
  if (run.fontKerning) parts.push(`font-kerning:${run.fontKerning}`);
  if (run.color) parts.push(`color:${run.color}`);
  if (run.highlight) parts.push(`background-color:${run.highlight}`);
  if (run.tracking != null) parts.push(`letter-spacing:${run.tracking / 1000}em`);
  if (run.smallCaps) parts.push('font-variant-caps:small-caps');
  if (run.numericStyle === 'oldstyle') parts.push('font-variant-numeric:oldstyle-nums');
  if (run.numericStyle === 'lining') parts.push('font-variant-numeric:lining-nums');
  if (run.numericStyle === 'tabular') parts.push('font-variant-numeric:tabular-nums');
  if (run.textOrientation) parts.push(`text-orientation:${run.textOrientation}`);
  if (run.emphasis === 'dot') parts.push('text-emphasis:filled dot');
  if (run.emphasis === 'open-dot') parts.push('text-emphasis:open dot');
  if (run.emphasis === 'sesame') parts.push('text-emphasis:filled sesame');
  if (run.emphasis === 'circle') parts.push('text-emphasis:filled circle');
  if (run.emphasis === 'none') parts.push('text-emphasis:none');
  if (run.leadingPt != null) parts.push(`line-height:${(run.leadingPt * PT_TO_PX * zoom).toFixed(2)}px`);
  const decorations: string[] = [];
  if (run.underline) decorations.push('underline');
  if (run.strike) decorations.push('line-through');
  if (decorations.length) parts.push(`text-decoration:${decorations.join(' ')}`);
  if (run.vertAlign === 'super' || run.vertAlign === 'sub') {
    parts.push(`vertical-align:${run.vertAlign}`);
    parts.push(`font-size:${run.fontSizePt ? `${(run.fontSizePt * PT_TO_PX * zoom).toFixed(2)}px` : '0.7em'}`);
  } else if (run.fontSizePt) {
    parts.push(`font-size:${(run.fontSizePt * PT_TO_PX * zoom).toFixed(2)}px`);
  }
  return parts.join(';');
}

function borderEdgeCss(edge: PaperParagraphBorderEdge | undefined, zoom: number): string | undefined {
  return edge ? `${(edge.widthPt * PT_TO_PX * zoom).toFixed(2)}px solid ${edge.color}` : undefined;
}

function paragraphInlineCss(paragraph: PaperRichParagraph, zoom: number): string {
  const parts: string[] = [];
  if (paragraph.align) parts.push(`text-align:${paragraph.align}`);
  if (paragraph.alignLast) parts.push(`text-align-last:${paragraph.alignLast}`);
  if (paragraph.leadingPt != null) parts.push(`line-height:${(paragraph.leadingPt * PT_TO_PX * zoom).toFixed(2)}px`);
  if (paragraph.hyphenate != null) parts.push(`hyphens:${paragraph.hyphenate ? 'auto' : 'manual'}`);
  if (paragraph.lineBreak && paragraph.lineBreak !== 'auto') parts.push(`text-wrap-style:${paragraph.lineBreak}`);
  if (paragraph.lineBreakStrict != null) parts.push(`line-break:${paragraph.lineBreakStrict ? 'strict' : 'auto'}`);
  if (paragraph.spaceBeforeMm) parts.push(`margin-top:${(paragraph.spaceBeforeMm * MM_TO_PX * zoom).toFixed(2)}px`);
  if (paragraph.spaceAfterMm) parts.push(`margin-bottom:${(paragraph.spaceAfterMm * MM_TO_PX * zoom).toFixed(2)}px`);
  const leftPx = Math.max(0, paragraph.leftIndentMm ?? 0) * MM_TO_PX * zoom;
  const rightPx = Math.max(0, paragraph.rightIndentMm ?? 0) * MM_TO_PX * zoom;
  const hangPx = Math.max(0, paragraph.hangingIndentMm ?? 0) * MM_TO_PX * zoom;
  const borderPad = paragraph.borders?.paddingPt ? paragraph.borders.paddingPt * PT_TO_PX * zoom : paragraph.borders ? 2 * zoom : 0;
  if (paragraph.listMarker) {
    const pad = 4.5 * MM_TO_PX * zoom;
    parts.push(`padding-left:${(leftPx + pad + borderPad).toFixed(2)}px`, `text-indent:-${pad.toFixed(2)}px`);
  } else if (hangPx > 0) {
    parts.push(`padding-left:${(leftPx + borderPad).toFixed(2)}px`, `text-indent:-${hangPx.toFixed(2)}px`);
  } else {
    if (leftPx || borderPad) parts.push(`padding-left:${(leftPx + borderPad).toFixed(2)}px`);
    if (paragraph.firstLineIndentMm) parts.push(`text-indent:${(paragraph.firstLineIndentMm * MM_TO_PX * zoom).toFixed(2)}px each-line`);
  }
  if (borderPad || rightPx) parts.push(`padding-right:${(borderPad + rightPx).toFixed(2)}px`);
  if (borderPad) parts.push(`padding-top:${borderPad.toFixed(2)}px`, `padding-bottom:${borderPad.toFixed(2)}px`);
  if (paragraph.shading) parts.push(`background-color:${paragraph.shading}`);
  const b = paragraph.borders;
  if (b?.top) parts.push(`border-top:${borderEdgeCss(b.top, zoom)}`);
  if (b?.left) parts.push(`border-left:${borderEdgeCss(b.left, zoom)}`);
  if (b?.bottom) parts.push(`border-bottom:${borderEdgeCss(b.bottom, zoom)}`);
  if (b?.right) parts.push(`border-right:${borderEdgeCss(b.right, zoom)}`);
  return parts.join(';');
}

/** Paragraph-level attributes encoded as `data-*` on the block so an edit round-trips them (computed style
 * only carries run styling; align/indent/spacing/dropcap/shading/borders would otherwise be lost). */
function paragraphDataAttrs(paragraph: PaperRichParagraph): string {
  const attrs: string[] = [];
  const push = (key: string, value: string | number | undefined): void => {
    if (value !== undefined && value !== '') attrs.push(`data-${key}="${escapeHtml(String(value))}"`);
  };
  push('align', paragraph.align);
  push('al', paragraph.alignLast);
  push('lead', paragraph.leadingPt);
  if (paragraph.hyphenate != null) push('hyph', paragraph.hyphenate ? '1' : '0');
  push('lb', paragraph.lineBreak);
  if (paragraph.lineBreakStrict != null) push('lbs', paragraph.lineBreakStrict ? '1' : '0');
  push('sb', paragraph.spaceBeforeMm);
  push('sa', paragraph.spaceAfterMm);
  push('fi', paragraph.firstLineIndentMm);
  push('li', paragraph.leftIndentMm);
  push('ri', paragraph.rightIndentMm);
  push('hi', paragraph.hangingIndentMm);
  push('dc', paragraph.dropCapLines);
  push('shade', paragraph.shading);
  if (paragraph.borders) push('borders', JSON.stringify(paragraph.borders));
  return attrs.length ? ` ${attrs.join(' ')}` : '';
}

/** Read paragraph-level attributes back off a block element's `data-*` set (the inverse of paragraphDataAttrs). */
function paragraphAttrsFromElement(el: HTMLElement): Partial<PaperRichParagraph> {
  const d = el.dataset;
  const p: Partial<PaperRichParagraph> = {};
  const num = (value: string | undefined): number | undefined => {
    if (value == null) return undefined;
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : undefined;
  };
  if (d.align === 'left' || d.align === 'center' || d.align === 'right' || d.align === 'justify') p.align = d.align;
  if (d.al === 'auto' || d.al === 'left' || d.al === 'center' || d.al === 'right' || d.al === 'justify') p.alignLast = d.al;
  const lead = num(d.lead); if (lead != null) p.leadingPt = lead;
  if (d.hyph === '1' || d.hyph === '0') p.hyphenate = d.hyph === '1';
  if (d.lb === 'auto' || d.lb === 'balance' || d.lb === 'pretty') p.lineBreak = d.lb;
  if (d.lbs === '1' || d.lbs === '0') p.lineBreakStrict = d.lbs === '1';
  const sb = num(d.sb); if (sb != null) p.spaceBeforeMm = sb;
  const sa = num(d.sa); if (sa != null) p.spaceAfterMm = sa;
  const fi = num(d.fi); if (fi != null) p.firstLineIndentMm = fi;
  const li = num(d.li); if (li != null) p.leftIndentMm = li;
  const ri = num(d.ri); if (ri != null) p.rightIndentMm = ri;
  const hi = num(d.hi); if (hi != null) p.hangingIndentMm = hi;
  const dc = num(d.dc); if (dc != null) p.dropCapLines = dc;
  if (d.shade) p.shading = d.shade;
  if (d.borders) {
    try {
      const parsed = JSON.parse(d.borders) as PaperParagraphBorders;
      if (parsed && typeof parsed === 'object') p.borders = parsed;
    } catch {
      // ignore malformed borders JSON
    }
  }
  return p;
}

/** Build the contentEditable's initial HTML: one block per paragraph, one styled span per run. List markers
 * render as a non-editable prefix so they survive editing and round-trip back to `listMarker`. */
export function richTextToEditorHtml(paragraphs: PaperRichParagraph[], zoom: number): string {
  if (!paragraphs.length) return '<div><br></div>';
  return paragraphs
    .map((paragraph) => {
      const runsHtml = paragraph.runs.length && paragraph.runs.some((run) => run.text)
        ? paragraph.runs
            .map((run) => {
              const css = runInlineCss(run, zoom);
              const text = escapeHtml(run.text).replace(/ {2,}/g, (match) => '\u00a0'.repeat(match.length));
              const span = css ? `<span style="${css}">${text}</span>` : `<span>${text}</span>`;
              return run.link ? `<a href="${escapeHtml(run.link)}">${span}</a>` : span;
            })
            .join('')
        : '<br>';
      const marker = paragraph.listMarker
        ? `<span contenteditable="false" data-paper-marker="${escapeHtml(paragraph.listMarker)}">${escapeHtml(paragraph.listMarker)}\u2003</span>`
        : '';
      const css = paragraphInlineCss(paragraph, zoom);
      const data = paragraphDataAttrs(paragraph);
      return `<div${css ? ` style="${css}"` : ''}${data}>${marker}${runsHtml}</div>`;
    })
    .join('');
}

/** rgb(a)/hex CSS colour → #rrggbb, or undefined if it can't be parsed. */
export function cssColorToHex(color: string | null | undefined): string | undefined {
  if (!color) return undefined;
  const trimmed = color.trim();
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed.toLowerCase();
  const rgb = /^rgba?\(([^)]+)\)/i.exec(trimmed);
  if (!rgb) return undefined;
  const channels = rgb[1].split(',').map((part) => parseFloat(part.trim()));
  const [r, g, b, a] = channels;
  if ([r, g, b].some((channel) => !Number.isFinite(channel))) return undefined;
  if (a === 0) return undefined; // fully transparent → no colour
  return `#${[r, g, b].map((channel) => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, '0')).join('')}`;
}

export interface RichEditorBase {
  colorHex: string;
  fontFamily: string;
  fontSizePx: number;
  leadingPx?: number;
  fontWeight?: string;
  fontStyle?: 'normal' | 'italic';
  fontKerning?: 'auto' | 'normal' | 'none';
  tracking?: number;
  smallCaps?: boolean;
  numericStyle?: 'normal' | 'oldstyle' | 'lining' | 'tabular';
  textOrientation?: 'mixed' | 'upright';
  emphasis?: 'none' | 'dot' | 'open-dot' | 'sesame' | 'circle';
  zoom: number;
}

function normalizedFontFamily(value: string): string {
  return value.split(',').map((part) => part.trim().replace(/^['"]|['"]$/g, '')).join(', ');
}

function numericStyleFromCss(value: string): RichEditorBase['numericStyle'] {
  if (value.includes('oldstyle-nums')) return 'oldstyle';
  if (value.includes('lining-nums')) return 'lining';
  if (value.includes('tabular-nums')) return 'tabular';
  return 'normal';
}

function emphasisFromCss(value: string): RichEditorBase['emphasis'] {
  if (!value || value === 'none') return 'none';
  if (value.includes('sesame')) return 'sesame';
  if (value.includes('circle')) return 'circle';
  if (value.includes('open') && value.includes('dot')) return 'open-dot';
  if (value.includes('dot')) return 'dot';
  return 'none';
}

/** Turn one text node's effective computed style into a run carrying only what differs from the base. */
function runFromComputedStyle(text: string, style: CSSStyleDeclaration, base: RichEditorBase): PaperTextRun {
  const run: PaperTextRun = { text };
  const weight = /^\d+$/.test(style.fontWeight) ? style.fontWeight : style.fontWeight === 'bold' ? '700' : '400';
  if (weight !== (base.fontWeight ?? '400')) run.fontWeight = weight;
  const fontStyle = style.fontStyle === 'italic' || style.fontStyle === 'oblique' ? 'italic' : 'normal';
  if (fontStyle !== (base.fontStyle ?? 'normal')) run.fontStyle = fontStyle;
  const fontKerning = style.fontKerning === 'none' || style.fontKerning === 'normal' ? style.fontKerning : 'auto';
  if (fontKerning !== (base.fontKerning ?? 'auto')) run.fontKerning = fontKerning;
  const decoration = style.textDecorationLine || style.textDecoration || '';
  if (decoration.includes('underline')) run.underline = true;
  if (decoration.includes('line-through')) run.strike = true;
  if (style.verticalAlign === 'super') run.vertAlign = 'super';
  else if (style.verticalAlign === 'sub') run.vertAlign = 'sub';
  const smallCaps = style.fontVariantCaps === 'small-caps';
  if (smallCaps !== Boolean(base.smallCaps)) run.smallCaps = smallCaps;
  const hex = cssColorToHex(style.color);
  if (hex && hex !== base.colorHex.toLowerCase()) run.color = hex;
  const highlight = cssColorToHex(style.backgroundColor);
  if (highlight) run.highlight = highlight;
  if (style.fontFamily && normalizedFontFamily(style.fontFamily) !== normalizedFontFamily(base.fontFamily)) {
    run.fontFamily = normalizedFontFamily(style.fontFamily);
  }
  const px = parseFloat(style.fontSize);
  if (Number.isFinite(px) && Math.abs(px - base.fontSizePx) > 0.5 && run.vertAlign == null) {
    run.fontSizePt = px / (PT_TO_PX * (base.zoom || 1));
  }
  const lineHeightPx = parseFloat(style.lineHeight);
  if (Number.isFinite(lineHeightPx) && (base.leadingPx == null || Math.abs(lineHeightPx - base.leadingPx) > 0.5)) {
    run.leadingPt = lineHeightPx / (PT_TO_PX * (base.zoom || 1));
  }
  const letterSpacing = style.letterSpacing.trim();
  let tracking = 0;
  if (letterSpacing && letterSpacing !== 'normal') {
    const amount = parseFloat(letterSpacing);
    if (Number.isFinite(amount)) tracking = letterSpacing.endsWith('em') ? amount * 1000 : (amount / Math.max(1, px)) * 1000;
  }
  if (Math.abs(tracking - (base.tracking ?? 0)) > 0.5) run.tracking = Math.round(tracking);
  const numericStyle = numericStyleFromCss(style.fontVariantNumeric);
  if (numericStyle !== (base.numericStyle ?? 'normal')) run.numericStyle = numericStyle;
  const textOrientation = style.textOrientation === 'upright' ? 'upright' : 'mixed';
  if (textOrientation !== (base.textOrientation ?? 'mixed')) run.textOrientation = textOrientation;
  const emphasis = emphasisFromCss(style.getPropertyValue('text-emphasis') || style.getPropertyValue('-webkit-text-emphasis'));
  if (emphasis !== (base.emphasis ?? 'none')) run.emphasis = emphasis;
  return run;
}

/**
 * Read an edited contentEditable back into rich paragraphs. Block children (DIV/P/LI) are paragraphs, `<br>`
 * splits a paragraph, list items carry a marker, and every text node's run style comes from its computed
 * style (so it captures execCommand's bold/italic/underline AND our inline spans identically).
 */
export function serializeRichEditor(root: HTMLElement, base: RichEditorBase): PaperRichParagraph[] {
  const paragraphs: PaperRichParagraph[] = [];
  let current: PaperTextRun[] | null = null;
  const startParagraph = (attrs?: Partial<PaperRichParagraph>): void => {
    current = [];
    paragraphs.push({ ...(attrs ?? {}), runs: current });
  };
  const addTextNode = (node: Text): void => {
    const text = node.textContent ?? '';
    if (!text) return;
    if (!current) startParagraph();
    const parent = node.parentElement;
    const style = parent ? getComputedStyle(parent) : null;
    const run: PaperTextRun = style ? runFromComputedStyle(text, style, base) : { text };
    const link = parent?.closest('a[href]')?.getAttribute('href');
    if (link) run.link = link;
    current!.push(run);
  };
  const walkInline = (node: Node): void => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) addTextNode(child as Text);
      else if (child.nodeName === 'BR') startParagraph();
      else if (child.nodeType === Node.ELEMENT_NODE) {
        if ((child as HTMLElement).dataset?.paperMarker != null) return; // skip the non-editable list marker
        walkInline(child);
      }
    });
  };
  const walkBlocks = (node: Node): void => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) addTextNode(child as Text);
      else if (child.nodeName === 'BR') startParagraph();
      else if (child.nodeName === 'DIV' || child.nodeName === 'P') {
        const el = child as HTMLElement;
        const attrs = paragraphAttrsFromElement(el);
        const marker = el.querySelector(':scope > [data-paper-marker]')?.getAttribute('data-paper-marker') ?? undefined;
        if (marker) attrs.listMarker = marker;
        startParagraph(attrs);
        walkInline(el);
      } else if (child.nodeName === 'UL' || child.nodeName === 'OL') {
        (child as HTMLElement).querySelectorAll(':scope > li').forEach((li, index) => {
          startParagraph({ listMarker: child.nodeName === 'OL' ? `${index + 1}.` : '•' });
          walkInline(li);
        });
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        if (!current) startParagraph();
        walkInline(child);
      }
    });
  };
  walkBlocks(root);
  return normalizePaperRichText(paragraphs) ?? [{ runs: [{ text: root.textContent ?? '' }] }];
}
