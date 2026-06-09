import { describe, expect, it } from 'vitest';
import {
  describeNativeSequencePresetMapping,
  getNativeRenderThreadArgs,
  getNativeSequenceCommandPrefix,
  getNativeSequenceEncoderArgs,
  getNativeSequenceOutputFilter,
} from './nativeRenderSupport';

describe('nativeRenderSupport', () => {
  it('adds thread hints for native CPU rendering', () => {
    expect(getNativeRenderThreadArgs()).toEqual([
      '-threads',
      '0',
      '-filter_threads',
      '0',
      '-filter_complex_threads',
      '0',
    ]);
  });

  it('maps executable presets to native CPU libx264 options', () => {
    expect(getNativeSequenceEncoderArgs('cpu', { crf: 18 })).toEqual([
      '-c:v',
      'libx264',
      '-preset',
      'medium',
      '-crf',
      '18',
      '-pix_fmt',
      'yuv420p',
    ]);
  });

  it('uses VAAPI upload and encoder settings for AMD acceleration', () => {
    expect(getNativeSequenceCommandPrefix('amd-vaapi')).toContain('/dev/dri/renderD128');
    expect(getNativeSequenceOutputFilter('base4', 'amd-vaapi')).toBe('[base4]format=nv12,hwupload[vout]');
    expect(getNativeSequenceEncoderArgs('amd-vaapi')).toEqual([
      '-c:v',
      'h264_vaapi',
      '-qp',
      '20',
    ]);
  });

  it('normalizes VAAPI limitations instead of silently ignoring preset intent', () => {
    const mapping = describeNativeSequencePresetMapping('amd-vaapi', {
      label: 'Archive High Quality',
      crf: 18,
      profile: 'high',
    });

    expect(mapping.videoCodecArgs).toEqual(['-c:v', 'h264_vaapi', '-qp', '19']);
    expect(mapping.notes.join(' ')).toContain('normalized to VAAPI QP');
  });
});
