import type { VideoFrameSelection } from '../types/flow';

export interface FrameCaptureOptions {
  maxWidth?: number;
  maxHeight?: number;
  mimeType?: string;
  quality?: number;
}

export async function extractSelectedVideoFrame(
  videoUrl: string,
  selection: VideoFrameSelection,
): Promise<Blob> {
  const metadata = await loadVideoFrameSource(videoUrl);

  try {
    const duration = Number.isFinite(metadata.video.duration) ? metadata.video.duration : 0;
    const targetTime =
      selection === 'first'
        ? Math.min(duration, duration > 0 ? 0.01 : 0)
        : Math.max(duration - 0.05, 0);

    return captureVideoFrameAtTime(metadata.video, targetTime);
  } finally {
    releaseVideoFrameSource(metadata.video);
  }
}

export async function extractVideoFrameAtTime(
  videoUrl: string,
  targetTimeSeconds: number,
  options: FrameCaptureOptions = {},
): Promise<Blob> {
  const metadata = await loadVideoFrameSource(videoUrl);

  try {
    return captureVideoFrameAtTime(metadata.video, targetTimeSeconds, options);
  } finally {
    releaseVideoFrameSource(metadata.video);
  }
}

export async function extractVideoFramesAtTimes(
  videoUrl: string,
  targetTimeSeconds: number[],
  options: FrameCaptureOptions = {},
): Promise<Blob[]> {
  const metadata = await loadVideoFrameSource(videoUrl);

  try {
    const frames: Blob[] = [];

    for (const targetTime of targetTimeSeconds) {
      frames.push(await captureVideoFrameAtTime(metadata.video, targetTime, options));
    }

    return frames;
  } finally {
    releaseVideoFrameSource(metadata.video);
  }
}

async function loadVideoFrameSource(videoUrl: string): Promise<{ video: HTMLVideoElement }> {
  const video = document.createElement('video');
  video.preload = 'metadata';
  video.muted = true;
  video.playsInline = true;
  video.src = videoUrl;

  await waitForEvent(video, 'loadedmetadata');
  return { video };
}

async function captureVideoFrameAtTime(
  video: HTMLVideoElement,
  targetTimeSeconds: number,
  options: FrameCaptureOptions = {},
): Promise<Blob> {
  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  const boundedTime = Math.max(0, Math.min(duration, targetTimeSeconds));
  const seekTime = video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA && boundedTime === 0 && duration > 0
    ? Math.min(duration, 0.001)
    : boundedTime;

  if (Math.abs(video.currentTime - seekTime) > 0.001) {
    video.currentTime = seekTime;
    await waitForEvent(video, 'seeked');
  }

  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    await waitForEvent(video, 'loadeddata');
  }

  return captureFrameFromVideoElement(video, options);
}

export async function captureFrameFromVideoElement(
  video: HTMLVideoElement,
  options: FrameCaptureOptions = {},
): Promise<Blob> {
  const width = video.videoWidth;
  const height = video.videoHeight;

  if (!width || !height) {
    throw new Error('Video frame capture failed because the video has no decoded frame dimensions yet.');
  }

  const targetDimensions = fitFrameCaptureDimensions(width, height, options);
  const canvas = document.createElement('canvas');
  canvas.width = targetDimensions.width;
  canvas.height = targetDimensions.height;

  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Video frame capture failed because the browser could not create a 2D canvas context.');
  }

  context.drawImage(video, 0, 0, targetDimensions.width, targetDimensions.height);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Video frame capture failed while encoding the still image.'));
        return;
      }

      resolve(blob);
    }, options.mimeType ?? 'image/png', options.quality);
  });
}

export function fitFrameCaptureDimensions(
  width: number,
  height: number,
  options: Pick<FrameCaptureOptions, 'maxWidth' | 'maxHeight'> = {},
): { width: number; height: number } {
  const sourceWidth = Math.max(1, Math.round(width));
  const sourceHeight = Math.max(1, Math.round(height));
  const widthScale = options.maxWidth ? options.maxWidth / sourceWidth : 1;
  const heightScale = options.maxHeight ? options.maxHeight / sourceHeight : 1;
  const scale = Math.min(1, widthScale, heightScale);

  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
  };
}

function releaseVideoFrameSource(video: HTMLVideoElement): void {
  video.pause();
  video.removeAttribute('src');
  video.load();
}

function waitForEvent(
  target: HTMLVideoElement,
  eventName: 'loadedmetadata' | 'loadeddata' | 'seeked',
): Promise<void> {
  if (eventName === 'loadedmetadata' && target.readyState >= HTMLMediaElement.HAVE_METADATA) {
    return Promise.resolve();
  }

  if (eventName === 'loadeddata' && target.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error(`Video frame capture timed out while waiting for ${eventName}.`));
    }, 10_000);

    const cleanup = () => {
      window.clearTimeout(timeout);
      target.removeEventListener(eventName, handleSuccess);
      target.removeEventListener('error', handleError);
    };

    const handleSuccess = () => {
      cleanup();
      resolve();
    };

    const handleError = () => {
      cleanup();
      reject(target.error ?? new Error(`Video frame capture failed while waiting for ${eventName}.`));
    };

    target.addEventListener(eventName, handleSuccess, { once: true });
    target.addEventListener('error', handleError, { once: true });
  });
}
