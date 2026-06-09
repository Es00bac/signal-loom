export type NativeRenderExecutionBackend = 'cpu' | 'amd-vaapi';
export interface NativeSequencePresetMapping {
  videoCodecArgs: string[];
  notes: string[];
}

const CPU_THREAD_ARGS = ['-threads', '0', '-filter_threads', '0', '-filter_complex_threads', '0'] as const;
const VAAPI_DEVICE_PATH = '/dev/dri/renderD128';

export function getNativeRenderThreadArgs(): string[] {
  return [...CPU_THREAD_ARGS];
}

export function getNativeSequenceCommandPrefix(backend: NativeRenderExecutionBackend): string[] {
  if (backend === 'amd-vaapi') {
    return ['-vaapi_device', VAAPI_DEVICE_PATH, ...CPU_THREAD_ARGS];
  }

  return [...CPU_THREAD_ARGS];
}

export function getNativeSequenceOutputFilter(finalBaseLabel: string, backend: NativeRenderExecutionBackend): string {
  if (backend === 'amd-vaapi') {
    return `[${finalBaseLabel}]format=nv12,hwupload[vout]`;
  }

  return `[${finalBaseLabel}]format=yuv420p[vout]`;
}

export function getNativeSequenceEncoderArgs(
  backend: NativeRenderExecutionBackend,
  preset?: {
    crf?: number;
    audioCodecArgs?: string[];
    nativeMapping?: Partial<Record<NativeRenderExecutionBackend, { videoCodecArgs: string[] }>>;
  },
): string[] {
  const mappedArgs = preset?.nativeMapping?.[backend]?.videoCodecArgs;

  if (mappedArgs) {
    return [...mappedArgs];
  }

  if (backend === 'amd-vaapi') {
    const qp = preset?.crf != null ? Math.max(16, Math.min(30, Math.round(preset.crf + 1))) : 20;
    return ['-c:v', 'h264_vaapi', '-qp', String(qp)];
  }

  return ['-c:v', 'libx264', '-preset', 'medium', '-crf', String(preset?.crf ?? 23), '-pix_fmt', 'yuv420p'];
}

export function describeNativeSequencePresetMapping(
  backend: NativeRenderExecutionBackend,
  preset: {
    crf?: number;
    profile?: string;
    label?: string;
    nativeMapping?: Partial<Record<NativeRenderExecutionBackend, { videoCodecArgs: string[]; notes: string[] }>>;
  },
): NativeSequencePresetMapping {
  const mapped = preset.nativeMapping?.[backend];

  if (mapped) {
    return {
      videoCodecArgs: [...mapped.videoCodecArgs],
      notes: [...mapped.notes],
    };
  }

  if (backend === 'amd-vaapi') {
    return {
      videoCodecArgs: getNativeSequenceEncoderArgs(backend, preset),
      notes: [
        `${preset.label ?? 'Preset'} mapped to h264_vaapi hardware output.`,
        'CRF/profile are normalized to VAAPI QP because libx264 profile controls are not accepted by h264_vaapi.',
      ],
    };
  }

  return {
    videoCodecArgs: getNativeSequenceEncoderArgs(backend, preset),
    notes: [`${preset.label ?? 'Preset'} mapped to native CPU libx264 CRF output.`],
  };
}

export function getVaapiDevicePath(): string {
  return VAAPI_DEVICE_PATH;
}
