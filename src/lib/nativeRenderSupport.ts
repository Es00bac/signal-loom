export type NativeRenderExecutionBackend = 'cpu' | 'amd-vaapi';

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

export function getNativeSequenceEncoderArgs(backend: NativeRenderExecutionBackend): string[] {
  if (backend === 'amd-vaapi') {
    return ['-c:v', 'h264_vaapi', '-qp', '20'];
  }

  return ['-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p'];
}

export function getVaapiDevicePath(): string {
  return VAAPI_DEVICE_PATH;
}
