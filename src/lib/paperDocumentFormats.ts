import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type { SourceBinLibraryItem } from '../store/sourceBinStore';
import type { PaperDocument, PaperFrame, PaperPage } from '../types/paper';
import { addFrameToPaperPage, addPaperPage, createDefaultPaperDocument, parsePaperDocument } from './paperDocument';
import {
  buildFlattenedPaperPageSvgExportWithEmbeddedAssets,
  imageSourceToDataUrl,
  rasterizeFlattenedPaperPageToPng,
  type FlattenedPaperPageRasterExport,
  type FlattenedPaperPageSvgExport,
} from './paperPageFlattenExport';

export type PaperDocumentImportFormat = 'txt' | 'markdown' | 'rtf' | 'html' | 'docx' | 'pdf' | 'sloom-idml-json';
export type PaperStoryExportFormat = 'txt' | 'html' | 'rtf' | 'docx';

export interface ImportedPaperTextBlock {
  role: 'heading' | 'paragraph';
  text: string;
  level?: number;
}

export interface ImportedPaperTextDocument {
  title: string;
  format: PaperDocumentImportFormat;
  blocks: ImportedPaperTextBlock[];
}

export interface PaperIdmlInterchange {
  app: 'Signal Loom Paper';
  format: 'sloom-idml-json';
  version: 1;
  manifest: {
    title: string;
    documentId: string;
    pageCount: number;
    frameCount: number;
    linkCount: number;
    exportedAt: string;
  };
  document: Pick<PaperDocument, 'id' | 'title' | 'page' | 'layout' | 'background' | 'printProduction' | 'view' | 'parentPages' | 'styles' | 'pages' | 'createdAt' | 'updatedAt'>;
  spreads: Array<{ id: string; pageIds: string[] }>;
  links: Array<{ sourceBinItemId?: string; label: string; mimeType?: string; pageNumber: number; frameId: string }>;
  guides: Array<{ ownerId: string; ownerType: 'page' | 'parentPage'; id: string; orientation: string; positionMm: number; label?: string }>;
}

export interface PaperZipExport {
  fileName: string;
  mimeType: 'application/zip' | 'application/vnd.comicbook+zip' | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  blob: Blob;
  entries: string[];
}

export interface PaperCbzRasterExportOptions {
  includeBleed?: boolean;
  resolveImageSrc?: (src: string, context: { frameId: string; pageId: string }) => Promise<string | undefined> | string | undefined;
  rasterize?: (exported: FlattenedPaperPageSvgExport) => Promise<FlattenedPaperPageRasterExport> | FlattenedPaperPageRasterExport;
  onPageRasterized?: (progress: { pageNumber: number; pageIndex: number; pageCount: number }) => void;
}

export async function parsePaperDocumentImportFile(file: File): Promise<ImportedPaperTextDocument | PaperDocument> {
  const format = inferPaperDocumentImportFormat(file.name, file.type);
  if (format === 'sloom-idml-json') return importPaperIdmlInterchange(await file.text());
  if (format === 'pdf') throw new Error('Use Place PDF/document from the Source Library to place PDFs as linked document frames; editable PDF import is not implemented.');
  if (format === 'docx') return parseDocxTextDocument(await file.arrayBuffer(), file.name);
  const text = await file.text();

  switch (format) {
    case 'markdown':
      return { title: stripExtension(file.name), format, blocks: parseMarkdownBlocks(text) };
    case 'rtf':
      return { title: stripExtension(file.name), format, blocks: parsePlainTextBlocks(rtfToText(text)) };
    case 'html':
      return { title: stripExtension(file.name), format, blocks: parseHtmlBlocks(text) };
    case 'txt':
    default:
      return { title: stripExtension(file.name), format: 'txt', blocks: parsePlainTextBlocks(text) };
  }
}

export function importTextDocumentIntoPaper(imported: ImportedPaperTextDocument): PaperDocument {
  let doc = createDefaultPaperDocument({ title: imported.title || 'Imported Document' });
  doc = { ...doc, pages: [{ ...doc.pages[0], frames: [] }], updatedAt: Date.now() };
  let pageId = doc.pages[0].id;
  let yMm = doc.layout.marginsMm.top;
  const xMm = doc.layout.marginsMm.left;
  const widthMm = Math.max(40, doc.page.widthMm - doc.layout.marginsMm.left - doc.layout.marginsMm.right);
  const bottomMm = doc.page.heightMm - doc.layout.marginsMm.bottom;

  for (const block of imported.blocks.length ? imported.blocks : [{ role: 'paragraph' as const, text: '' }]) {
    const heightMm = estimateTextFrameHeightMm(block.text, block.role === 'heading');
    if (yMm + heightMm > bottomMm && doc.pages.some((page) => page.id === pageId)) {
      doc = addPaperPage(doc);
      pageId = doc.pages[doc.pages.length - 1].id;
      yMm = doc.layout.marginsMm.top;
    }
    const added = addFrameToPaperPage(doc, pageId, {
      kind: 'text',
      label: block.role === 'heading' ? 'Imported Heading' : 'Imported Text',
      xMm,
      yMm,
      widthMm,
      heightMm,
      text: block.text,
      columns: 1,
      typography: block.role === 'heading'
        ? { fontSizePt: block.level && block.level > 2 ? 13 : 16, leadingPt: block.level && block.level > 2 ? 16 : 19, fontWeight: '700', hyphenate: false }
        : undefined,
      paragraphStyleId: block.role === 'heading' ? undefined : 'para-caption',
    });
    doc = added.document;
    yMm += heightMm + (block.role === 'heading' ? 3 : 2);
  }

  return doc;
}

export function placeDocumentSourceOnPaperPage(
  doc: PaperDocument,
  pageId: string,
  item: SourceBinLibraryItem,
  point = { xMm: doc.layout.marginsMm.left, yMm: doc.layout.marginsMm.top },
): { document: PaperDocument; frameId: string } {
  return addFrameToPaperPage(doc, pageId, {
    kind: 'document',
    label: item.label,
    xMm: point.xMm,
    yMm: point.yMm,
    widthMm: Math.min(120, Math.max(70, doc.page.widthMm - point.xMm - doc.layout.marginsMm.right)),
    heightMm: Math.min(150, Math.max(80, doc.page.heightMm - point.yMm - doc.layout.marginsMm.bottom)),
    asset: {
      sourceBinItemId: item.id,
      label: item.label,
      kind: item.kind,
      src: item.assetUrl,
      mimeType: item.mimeType,
      text: item.text,
      format: inferPaperDocumentImportFormat(item.label, item.mimeType),
    },
    fillColor: '#f8fafc',
    strokeColor: '#64748b',
    strokeWidthMm: 0.25,
  });
}

export function exportPaperIdmlInterchange(document: PaperDocument): string {
  const links = collectDocumentLinks(document);
  const interchange: PaperIdmlInterchange = {
    app: 'Signal Loom Paper',
    format: 'sloom-idml-json',
    version: 1,
    manifest: {
      title: document.title,
      documentId: document.id,
      pageCount: document.pages.length,
      frameCount: document.pages.reduce((sum, page) => sum + page.frames.length, 0),
      linkCount: links.length,
      exportedAt: new Date().toISOString(),
    },
    document,
    spreads: document.pages.map((page) => ({ id: `spread-${page.pageNumber}`, pageIds: [page.id] })),
    links,
    guides: [
      ...document.parentPages.flatMap((parent) => parent.guides.map((guide) => ({ ownerId: parent.id, ownerType: 'parentPage' as const, ...guide }))),
      ...document.pages.flatMap((page) => page.guides.map((guide) => ({ ownerId: page.id, ownerType: 'page' as const, ...guide }))),
    ],
  };
  return `${JSON.stringify(interchange, null, 2)}\n`;
}

export function importPaperIdmlInterchange(json: string): PaperDocument {
  const parsed = JSON.parse(json) as Partial<PaperIdmlInterchange>;
  if (parsed.format !== 'sloom-idml-json' || !parsed.document) {
    throw new Error('The selected file is not a Signal Loom Paper IDML-like interchange document.');
  }
  return parsePaperDocument(JSON.stringify(parsed.document));
}

export function exportPaperStoryText(document: PaperDocument, format: PaperStoryExportFormat): { fileName: string; mimeType: string; text: string; blob: Blob } | PaperZipExport {
  const baseName = safePathPart(document.title || 'paper-stories');
  const stories = extractPaperStoryText(document);
  if (format === 'html') {
    const text = `<!doctype html>\n<html><head><meta charset="utf-8"><title>${escapeHtml(document.title)}</title></head><body>\n${stories.map((story) => `<section data-page="${story.pageNumber}" data-frame="${escapeHtml(story.frameId)}"><h2>Page ${story.pageNumber}: ${escapeHtml(story.label)}</h2><p>${escapeHtml(story.text).replaceAll('\n', '<br>')}</p></section>`).join('\n')}\n</body></html>\n`;
    return { fileName: `${baseName}.html`, mimeType: 'text/html', text, blob: new Blob([text], { type: 'text/html' }) };
  }
  if (format === 'rtf') {
    const text = `{\\rtf1\\ansi\n${stories.map((story) => `\\b Page ${story.pageNumber}: ${escapeRtf(story.label)}\\b0\\par\n${escapeRtf(story.text)}\\par`).join('\n')}}`;
    return { fileName: `${baseName}.rtf`, mimeType: 'application/rtf', text, blob: new Blob([text], { type: 'application/rtf' }) };
  }
  if (format === 'docx') {
    return buildDocxStoryExport(document, stories);
  }
  const text = stories.map((story) => `Page ${story.pageNumber}: ${story.label}\n${story.text}`).join('\n\n');
  return { fileName: `${baseName}.txt`, mimeType: 'text/plain', text: `${text}\n`, blob: new Blob([`${text}\n`], { type: 'text/plain' }) };
}

export async function buildPaperCbzRasterExport(
  document: PaperDocument,
  options: PaperCbzRasterExportOptions = {},
): Promise<PaperZipExport> {
  const pageCount = document.pages.length;
  const padLength = Math.max(3, String(pageCount).length);
  const entries: Record<string, Uint8Array> = {};
  const pages: Array<{ pageNumber: number; path: string; widthPx: number; heightPx: number; widthMm: number; heightMm: number; frameCount: number }> = [];
  const rasterize = options.rasterize ?? ((exported: FlattenedPaperPageSvgExport) => rasterizeFlattenedPaperPageToPng(exported));
  const resolveImageSrc = options.resolveImageSrc ?? ((src: string) => imageSourceToDataUrl(src));

  for (let index = 0; index < document.pages.length; index += 1) {
    const page = document.pages[index];
    const svgExport = await buildFlattenedPaperPageSvgExportWithEmbeddedAssets(document, page.id, {
      includeBleed: options.includeBleed,
      resolveImageSrc,
    });
    const rasterExport = await Promise.resolve(rasterize(svgExport));
    const path = `pages/page-${String(index + 1).padStart(padLength, '0')}.png`;
    entries[path] = dataUrlToU8(rasterExport.dataUrl, 'image/png');
    pages.push({
      pageNumber: page.pageNumber,
      path,
      widthPx: rasterExport.widthPx,
      heightPx: rasterExport.heightPx,
      widthMm: rasterExport.widthMm,
      heightMm: rasterExport.heightMm,
      frameCount: page.frames.length,
    });
    options.onPageRasterized?.({ pageNumber: page.pageNumber, pageIndex: index, pageCount });
  }

  const manifest = {
    app: 'Signal Loom Paper',
    format: 'sloom-cbz-raster',
    title: document.title,
    pageCount,
    pages,
    exportedAt: new Date().toISOString(),
  };
  entries['manifest.json'] = strToU8(`${JSON.stringify(manifest, null, 2)}\n`);
  entries['ComicInfo.xml'] = strToU8(buildComicInfoXml(document, pageCount));

  const zipped = zipSync(entries);
  return {
    fileName: `${safePathPart(document.title || 'paper-pages')}.cbz`,
    mimeType: 'application/vnd.comicbook+zip',
    blob: new Blob([zipped], { type: 'application/vnd.comicbook+zip' }),
    entries: Object.keys(entries),
  };
}

export function buildPaperCbzManifestExport(document: PaperDocument): PaperZipExport {
  const manifest = {
    app: 'Signal Loom Paper',
    format: 'sloom-cbz-manifest',
    title: document.title,
    pageCount: document.pages.length,
    pages: document.pages.map((page) => ({ pageNumber: page.pageNumber, path: `pages/page-${String(page.pageNumber).padStart(3, '0')}.svg`, frameCount: page.frames.length })),
  };
  const entries: Record<string, Uint8Array> = {
    'manifest.json': strToU8(`${JSON.stringify(manifest, null, 2)}\n`),
  };
  for (const page of document.pages) {
    entries[`pages/page-${String(page.pageNumber).padStart(3, '0')}.svg`] = strToU8(renderPageManifestSvg(document, page));
  }
  const zipped = zipSync(entries);
  return {
    fileName: `${safePathPart(document.title || 'paper-pages')}.cbz`,
    mimeType: 'application/vnd.comicbook+zip',
    blob: new Blob([zipped], { type: 'application/vnd.comicbook+zip' }),
    entries: Object.keys(entries),
  };
}

function buildComicInfoXml(document: PaperDocument, pageCount: number): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<ComicInfo>\n  <Title>${escapeXml(document.title || 'Paper Pages')}</Title>\n  <PageCount>${pageCount}</PageCount>\n  <Format>Signal Loom Paper raster CBZ</Format>\n</ComicInfo>\n`;
}

function dataUrlToU8(dataUrl: string, expectedMimeType: string): Uint8Array {
  const match = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(dataUrl);
  if (!match) {
    throw new Error('Paper CBZ rasterizer returned an invalid PNG data URL.');
  }
  if (match[1].toLowerCase() !== expectedMimeType) {
    throw new Error(`Paper CBZ rasterizer returned ${match[1]} instead of ${expectedMimeType}.`);
  }
  if (match[2]) {
    return Uint8Array.from(atob(match[3]), (char) => char.charCodeAt(0));
  }
  return strToU8(decodeURIComponent(match[3]));
}

export function inferPaperDocumentImportFormat(fileNameOrPath: string | undefined, mimeType?: string): PaperDocumentImportFormat {
  const lower = (fileNameOrPath ?? '').toLowerCase();
  const normalizedMime = mimeType?.split(';', 1)[0]?.toLowerCase();
  if (lower.endsWith('.sloom-idml.json')) return 'sloom-idml-json';
  if (lower.endsWith('.docx') || normalizedMime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
  if (lower.endsWith('.pdf') || normalizedMime === 'application/pdf') return 'pdf';
  if (lower.endsWith('.md') || lower.endsWith('.markdown') || normalizedMime === 'text/markdown') return 'markdown';
  if (lower.endsWith('.rtf') || normalizedMime === 'application/rtf' || normalizedMime === 'text/rtf') return 'rtf';
  if (lower.endsWith('.html') || lower.endsWith('.htm') || normalizedMime === 'text/html' || normalizedMime === 'application/xhtml+xml') return 'html';
  return 'txt';
}

function parseDocxTextDocument(buffer: ArrayBuffer, fileName: string): ImportedPaperTextDocument {
  const files = unzipSync(new Uint8Array(buffer));
  const xml = files['word/document.xml'];
  if (!xml) throw new Error('DOCX import could not find word/document.xml.');
  const blocks: ImportedPaperTextBlock[] = [];
  const documentXml = strFromU8(xml);
  const paragraphs = documentXml.match(/<w:p[\s\S]*?<\/w:p>/g) ?? [];
  for (const paragraph of paragraphs) {
    const text = [...paragraph.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
      .map((match) => decodeXml(match[1]))
      .join('')
      .trim();
    if (!text) continue;
    const heading = /<w:pStyle[^>]+w:val="Heading([1-6])"/.exec(paragraph);
    blocks.push({ role: heading ? 'heading' : 'paragraph', level: heading ? Number(heading[1]) : undefined, text });
  }
  return { title: stripExtension(fileName), format: 'docx', blocks };
}

function parseMarkdownBlocks(text: string): ImportedPaperTextBlock[] {
  return text.split(/\n{2,}/).flatMap<ImportedPaperTextBlock>((chunk) => {
    const trimmed = chunk.trim();
    if (!trimmed) return [];
    const heading = /^(#{1,6})\s+(.+)$/.exec(trimmed);
    if (heading) return [{ role: 'heading', level: heading[1].length, text: heading[2].trim() }];
    return [{ role: 'paragraph', text: trimmed.replace(/^[-*+]\s+/gm, '• ') }];
  });
}

function parsePlainTextBlocks(text: string): ImportedPaperTextBlock[] {
  return text.split(/\n{2,}/).flatMap<ImportedPaperTextBlock>((chunk) => {
    const trimmed = chunk.trim();
    return trimmed ? [{ role: 'paragraph', text: trimmed }] : [];
  });
}

function parseHtmlBlocks(html: string): ImportedPaperTextBlock[] {
  const normalized = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<(h[1-6])[^>]*>([\s\S]*?)<\/\1>/gi, (_, tag: string, inner: string) => `\n\n${'#'.repeat(Number(tag[1]))} ${htmlToText(inner)}\n\n`)
    .replace(/<(p|li|div|section|article)[^>]*>/gi, '\n\n')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  return parseMarkdownBlocks(decodeHtml(normalized));
}

function rtfToText(rtf: string): string {
  return rtf
    .replace(/\\par[d]?/g, '\n')
    .replace(/\\'[0-9a-f]{2}/gi, '')
    .replace(/\\[a-z]+-?\d* ?/gi, '')
    .replace(/[{}]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractPaperStoryText(document: PaperDocument): Array<{ pageNumber: number; frameId: string; label: string; text: string }> {
  return document.pages.flatMap((page) => page.frames.flatMap((frame) => {
    if (!['text', 'caption', 'speechBubble', 'thoughtBubble'].includes(frame.kind)) return [];
    const text = (frame.text ?? frame.asset?.text ?? '').trim();
    return text ? [{ pageNumber: page.pageNumber, frameId: frame.id, label: frame.label, text }] : [];
  }));
}

function buildDocxStoryExport(document: PaperDocument, stories: ReturnType<typeof extractPaperStoryText>): PaperZipExport {
  const paragraphs = stories.flatMap((story) => [
    `<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>${escapeXml(`Page ${story.pageNumber}: ${story.label}`)}</w:t></w:r></w:p>`,
    ...story.text.split(/\n+/).map((line) => `<w:p><w:r><w:t>${escapeXml(line)}</w:t></w:r></w:p>`),
  ]).join('');
  const entries: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
    '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
    'word/document.xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}<w:sectPr/></w:body></w:document>`),
  };
  const zipped = zipSync(entries);
  return {
    fileName: `${safePathPart(document.title || 'paper-stories')}.docx`,
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    blob: new Blob([zipped], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }),
    entries: Object.keys(entries),
  };
}

function collectDocumentLinks(document: PaperDocument): PaperIdmlInterchange['links'] {
  return document.pages.flatMap((page) => page.frames.flatMap((frame) => frame.asset ? [{ sourceBinItemId: frame.asset.sourceBinItemId, label: frame.asset.label, mimeType: frame.asset.mimeType, pageNumber: page.pageNumber, frameId: frame.id }] : []));
}

function renderPageManifestSvg(document: PaperDocument, page: PaperPage): string {
  const width = document.page.widthMm;
  const height = document.page.heightMm;
  const frames = page.frames.map((frame) => renderFrameSvg(frame)).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="white"/>${frames}</svg>`;
}

function renderFrameSvg(frame: PaperFrame): string {
  const fill = frame.fillColor === 'transparent' ? 'none' : frame.fillColor;
  const text = escapeXml((frame.text ?? frame.asset?.label ?? frame.label).slice(0, 500));
  return `<g transform="translate(${frame.xMm} ${frame.yMm}) rotate(${frame.rotationDeg})"><rect width="${frame.widthMm}" height="${frame.heightMm}" fill="${fill}" stroke="${frame.strokeColor}" stroke-width="${Math.max(0.1, frame.strokeWidthMm)}"/><text x="2" y="6" font-size="4" fill="${frame.typography.color}">${text}</text></g>`;
}

function estimateTextFrameHeightMm(text: string, heading: boolean): number {
  const charsPerLine = heading ? 45 : 82;
  const lineHeight = heading ? 7 : 5.2;
  return Math.max(heading ? 14 : 18, Math.ceil(Math.max(1, text.length) / charsPerLine) * lineHeight + 6);
}

function stripExtension(name: string): string {
  return name.replace(/\.[^.]+$/, '').replace(/\.sloom-idml$/, '') || 'Imported Document';
}

function safePathPart(value: string): string {
  return value.trim().replace(/[/\\?%*:|"<>]+/g, '-').replace(/\s+/g, '-').replace(/[^a-z0-9._-]+/gi, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '') || 'paper-document';
}

function htmlToText(value: string): string {
  return decodeHtml(value.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function decodeHtml(value: string): string {
  return value.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function decodeXml(value: string): string {
  return decodeHtml(value);
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function escapeXml(value: string): string {
  return escapeHtml(value);
}

function escapeRtf(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/{/g, '\\{').replace(/}/g, '\\}').replace(/\n/g, '\\par\n');
}
