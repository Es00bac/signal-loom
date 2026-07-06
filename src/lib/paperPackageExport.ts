import type { SourceBinLibraryItem } from '../store/sourceBinStore';
import type { PaperDocument } from '../types/paper';
import { strToU8, zipSync } from 'fflate';
import { serializePaperDocument } from './paperDocument';
import {
  analyzePaperPreflight,
  collectPaperColorInventory,
  collectPaperFontInventory,
  collectPaperLinkedAssets,
  type PaperPreflightProfileId,
} from './paperPreflight';
import { buildPaperPrintProductionMetadata, type PaperPrintProductionMetadata } from './paperPrintProduction';

export interface PaperPackageManifest {
  app: 'Sloom Studio Paper';
  version: 1;
  title: string;
  createdAt: string;
  documentId: string;
  pageCount: number;
  files: Array<{ path: string; type: string; bytes: number }>;
  linkedAssets: ReturnType<typeof collectPaperLinkedAssets>;
  fonts: ReturnType<typeof collectPaperFontInventory>;
  colors: ReturnType<typeof collectPaperColorInventory>;
  production: PaperPrintProductionMetadata;
}

export interface PaperPackageExport {
  fileName: string;
  mimeType: 'application/json' | 'application/zip';
  manifest: PaperPackageManifest;
  blob: Blob;
  json: string;
  fallbackJsonFileName: string;
  entries: string[];
}

export function buildPaperPackageExport(
  document: PaperDocument,
  sourceItems: SourceBinLibraryItem[] = [],
  options: { profileId?: PaperPreflightProfileId } = {},
): PaperPackageExport {
  const documentJson = serializePaperDocument(document);
  const preflightReport = analyzePaperPreflight(document, sourceItems, options.profileId);
  const linkedAssets = collectPaperLinkedAssets(document, sourceItems);
  const fonts = collectPaperFontInventory(document);
  const colors = collectPaperColorInventory(document);
  const production = buildPaperPrintProductionMetadata(document);
  const assetFiles = linkedAssets.map((asset) => {
    const source = sourceItems.find((item) => item.id === asset.sourceId);
    return {
      path: `Links/${safePathPart(asset.sourceLabel)}.json`,
      type: 'linked-asset-metadata',
      bytes: jsonBytes(source ?? asset),
      source,
      asset,
      embeddedDataUrl: source?.assetUrl,
    };
  });
  const files = [
    { path: 'document.sloom-paper.json', type: 'document', bytes: byteLength(documentJson) },
    { path: 'preflight-report.json', type: 'preflight', bytes: jsonBytes(preflightReport) },
    { path: 'manifest.json', type: 'manifest', bytes: 0 },
    ...assetFiles.map(({ path, type, bytes }) => ({ path, type, bytes })),
  ];
  const manifest: PaperPackageManifest = {
    app: 'Sloom Studio Paper',
    version: 1,
    title: document.title,
    createdAt: new Date().toISOString(),
    documentId: document.id,
    pageCount: document.pages.length,
    files,
    linkedAssets,
    fonts,
    colors,
    production,
  };
  manifest.files = manifest.files.map((file) => file.path === 'manifest.json' ? { ...file, bytes: jsonBytes(manifest) } : file);
  const bundle = {
    manifest,
    document: JSON.parse(documentJson) as PaperDocument,
    preflightReport,
    linkedAssetInventory: linkedAssets,
    fontInventory: fonts,
    colorInventory: colors,
    production,
    assets: assetFiles.map(({ source, asset, embeddedDataUrl }) => ({ source, asset, embeddedDataUrl })),
  };
  const json = `${JSON.stringify(bundle, null, 2)}\n`;
  const fallbackJsonFileName = `${safePathPart(document.title || 'paper-document')}.sloom-paper-package.json`;
  const zipEntries: Record<string, Uint8Array> = {
    'document.sloom-paper.json': strToU8(documentJson),
    'preflight-report.json': strToU8(`${JSON.stringify(preflightReport, null, 2)}\n`),
    'manifest.json': strToU8(`${JSON.stringify(manifest, null, 2)}\n`),
  };
  for (const assetFile of assetFiles) {
    zipEntries[assetFile.path] = strToU8(`${JSON.stringify({ source: assetFile.source, asset: assetFile.asset, embeddedDataUrl: assetFile.embeddedDataUrl }, null, 2)}\n`);
  }
  try {
    const zipped = zipSync(zipEntries);
    return {
      fileName: `${safePathPart(document.title || 'paper-document')}.sloom-paper-package.zip`,
      mimeType: 'application/zip',
      manifest,
      blob: new Blob([zipped], { type: 'application/zip' }),
      json,
      fallbackJsonFileName,
      entries: Object.keys(zipEntries),
    };
  } catch {
    return {
      fileName: fallbackJsonFileName,
      mimeType: 'application/json',
      manifest,
      blob: new Blob([json], { type: 'application/json' }),
      json,
      fallbackJsonFileName,
      entries: [],
    };
  }

}

function safePathPart(value: string): string {
  return value.trim().replace(/[/\\?%*:|"<>]+/g, '-').replace(/\s+/g, '-').replace(/[^a-z0-9._-]+/gi, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '') || 'paper-document';
}

function jsonBytes(value: unknown): number {
  return byteLength(JSON.stringify(value));
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}
