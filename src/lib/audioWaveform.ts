const MAX_BROWSER_WAVEFORM_DECODE_BYTES = 48 * 1024 * 1024;

export async function extractWaveformPeaks(
  url: string,
  sampleCount = 72,
): Promise<number[]> {
  const safeSampleCount = Math.max(16, Math.round(sampleCount));
  const AudioContextCtor = getAudioContextConstructor();

  if (!AudioContextCtor) {
    return buildFallbackWaveform(safeSampleCount);
  }

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch media for waveform generation (${response.status}).`);
    }

    const contentLength = Number(response.headers.get('Content-Length') ?? 0);

    if (contentLength > MAX_BROWSER_WAVEFORM_DECODE_BYTES) {
      return buildFallbackWaveform(safeSampleCount);
    }

    const blob = await response.blob();

    if (blob.size > MAX_BROWSER_WAVEFORM_DECODE_BYTES) {
      return buildFallbackWaveform(safeSampleCount);
    }

    const arrayBuffer = await blob.arrayBuffer();
    const audioContext = new AudioContextCtor();

    try {
      const decoded = await audioContext.decodeAudioData(arrayBuffer.slice(0));
      return buildPeaksFromAudioBuffer(decoded, safeSampleCount);
    } catch {
      return buildFallbackWaveform(safeSampleCount);
    } finally {
      await audioContext.close().catch(() => undefined);
    }
  } catch {
    return buildFallbackWaveform(safeSampleCount);
  }
}

function getAudioContextConstructor():
  | (new () => AudioContext)
  | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  const windowWithWebkit = window as Window & {
    webkitAudioContext?: typeof AudioContext;
  };

  return window.AudioContext ?? windowWithWebkit.webkitAudioContext;
}

function buildPeaksFromAudioBuffer(
  audioBuffer: AudioBuffer,
  sampleCount: number,
): number[] {
  const channels = Array.from({ length: audioBuffer.numberOfChannels }, (_, channelIndex) =>
    audioBuffer.getChannelData(channelIndex),
  );
  const blockSize = Math.max(1, Math.floor(audioBuffer.length / sampleCount));
  const peaks: number[] = [];

  for (let blockIndex = 0; blockIndex < sampleCount; blockIndex += 1) {
    const start = blockIndex * blockSize;
    const end = Math.min(audioBuffer.length, start + blockSize);
    let peak = 0;

    for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1) {
      for (const channel of channels) {
        peak = Math.max(peak, Math.abs(channel[sampleIndex] ?? 0));
      }
    }

    peaks.push(peak);
  }

  const maxPeak = Math.max(...peaks, 0.0001);
  return peaks.map((peak) => Math.max(0.04, Math.min(1, peak / maxPeak)));
}

function buildFallbackWaveform(sampleCount: number): number[] {
  return Array.from({ length: sampleCount }, (_, index) => {
    const phase = (index / Math.max(1, sampleCount - 1)) * Math.PI * 3;
    return 0.2 + Math.abs(Math.sin(phase)) * 0.55;
  });
}
