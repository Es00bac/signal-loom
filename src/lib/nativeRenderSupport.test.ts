import { describe, expect, it } from 'vitest';
import {
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

  it('uses libx264 for the native CPU sequence encoder path', () => {
    expect(getNativeSequenceEncoderArgs('cpu')).toEqual([
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
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
});
