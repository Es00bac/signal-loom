import type { ImageDocument } from '../../types/imageEditor';
import {
  IMAGE_EXPORT_FORMATS,
  getImageExportFormat,
  imageDocumentToBlob,
  type ImageExportFormat,
} from './ImageDocumentExport';
import {
  IMAGE_PSD_EXTENSION,
  IMAGE_PSD_MIME_TYPE,
  imageDocumentToPsdBlob,
} from './ImagePsdInterop';
import {
  IMAGE_XCF_EXTENSION,
  IMAGE_XCF_MIME_TYPE,
  imageDocumentToXcfBlob,
} from './ImageXcfInterop';
import {
  readStringPreference,
  writeStringPreference,
} from '../../shared/storage/preferences';

export type ImageDocumentSaveKind = 'visible' | 'layered';
export const IMAGE_DOCUMENT_SAVE_MIME_STORAGE_KEY = 'signal-loom.image-editor.save-mime-type';

export interface ImageDocumentSaveFormat extends ImageExportFormat {
  kind: ImageDocumentSaveKind;
}

const LAYERED_IMAGE_SAVE_FORMATS: ImageDocumentSaveFormat[] = [
  {
    kind: 'layered',
    label: 'PSD',
    mimeType: IMAGE_PSD_MIME_TYPE,
    extension: IMAGE_PSD_EXTENSION,
  },
  {
    kind: 'layered',
    label: 'XCF',
    mimeType: IMAGE_XCF_MIME_TYPE,
    extension: IMAGE_XCF_EXTENSION,
  },
];

export const IMAGE_DOCUMENT_SAVE_FORMATS: ImageDocumentSaveFormat[] = [
  ...IMAGE_EXPORT_FORMATS.map((format) => ({ ...format, kind: 'visible' as const })),
  ...LAYERED_IMAGE_SAVE_FORMATS,
];

export function getVisibleImageSaveFormats(): ImageDocumentSaveFormat[] {
  return IMAGE_DOCUMENT_SAVE_FORMATS.filter((format) => format.kind === 'visible');
}

export function isVisibleImageSaveFormat(mimeType: string | undefined): boolean {
  return getVisibleImageSaveFormats().some((format) => format.mimeType === mimeType);
}

export function getImageDocumentSaveFormat(mimeType: string | undefined): ImageDocumentSaveFormat {
  return IMAGE_DOCUMENT_SAVE_FORMATS.find((format) => format.mimeType === mimeType)
    ?? { ...getImageExportFormat(mimeType), kind: 'visible' };
}

export function readStoredImageDocumentSaveMimeType(): string {
  return readStringPreference({
    key: IMAGE_DOCUMENT_SAVE_MIME_STORAGE_KEY,
    fallback: 'image/png',
    normalize: (value) => getImageDocumentSaveFormat(value).mimeType,
  });
}

export function writeStoredImageDocumentSaveMimeType(mimeType: string): void {
  writeStringPreference({
    key: IMAGE_DOCUMENT_SAVE_MIME_STORAGE_KEY,
    value: mimeType,
    fallback: 'image/png',
    normalize: (value) => getImageDocumentSaveFormat(value).mimeType,
  });
}

export async function imageDocumentToSaveBlob(
  doc: ImageDocument,
  mimeType: string | undefined,
): Promise<{ blob: Blob; format: ImageDocumentSaveFormat }> {
  const format = getImageDocumentSaveFormat(mimeType);

  if (format.mimeType === IMAGE_PSD_MIME_TYPE) {
    return { blob: await imageDocumentToPsdBlob(doc), format };
  }
  if (format.mimeType === IMAGE_XCF_MIME_TYPE) {
    return { blob: await imageDocumentToXcfBlob(doc), format };
  }

  return {
    blob: await imageDocumentToBlob(doc, format.mimeType),
    format,
  };
}
