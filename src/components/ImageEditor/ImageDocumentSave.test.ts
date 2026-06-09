import { describe, expect, it } from 'vitest';
import {
  IMAGE_DOCUMENT_SAVE_FORMATS,
  getImageDocumentSaveFormat,
  getVisibleImageSaveFormats,
  isVisibleImageSaveFormat,
} from './ImageDocumentSave';
import { IMAGE_PSD_MIME_TYPE } from './ImagePsdInterop';
import { IMAGE_XCF_MIME_TYPE } from './ImageXcfInterop';

describe('ImageDocumentSave', () => {
  it('offers standalone image-file saves and workflow-safe visible handoff formats separately', () => {
    expect(IMAGE_DOCUMENT_SAVE_FORMATS.map((format) => format.extension)).toEqual([
      'png',
      'jpg',
      'webp',
      'avif',
      'bmp',
      'gif',
      'tif',
      'svg',
      'psd',
      'xcf',
    ]);

    expect(getVisibleImageSaveFormats().map((format) => format.extension)).toEqual([
      'png',
      'jpg',
      'webp',
      'avif',
      'bmp',
      'gif',
      'tif',
      'svg',
    ]);
    expect(isVisibleImageSaveFormat('image/bmp')).toBe(true);
    expect(isVisibleImageSaveFormat(IMAGE_PSD_MIME_TYPE)).toBe(false);
    expect(isVisibleImageSaveFormat(IMAGE_XCF_MIME_TYPE)).toBe(false);
  });

  it('normalizes unknown save formats to PNG while preserving layered formats', () => {
    expect(getImageDocumentSaveFormat('image/bmp')).toMatchObject({ extension: 'bmp' });
    expect(getImageDocumentSaveFormat(IMAGE_PSD_MIME_TYPE)).toMatchObject({ extension: 'psd' });
    expect(getImageDocumentSaveFormat(IMAGE_XCF_MIME_TYPE)).toMatchObject({ extension: 'xcf' });
    expect(getImageDocumentSaveFormat('not/a-format')).toMatchObject({ extension: 'png' });
  });
});
