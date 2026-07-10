import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import {
  buildStreamFfmpegArgs,
  createRenderStreamSessionId,
  expectedFrameStreamBytes,
  findExpiredStreamSessions,
  sanitizeFileName,
  STREAM_SESSION_IDLE_TIMEOUT_MS,
  StreamTruncatedError,
  validateStreamMetadata,
  writeStreamChunkToFfmpegStdin,
} from './local-renderer-lib.mjs';

function buildValidMetadata(overrides = {}) {
  return {
    width: 1920,
    height: 1080,
    fps: 30,
    frameCount: 90,
    pixFmt: 'rgba',
    outputName: 'sequence-output.mp4',
    backend: 'cpu',
    commandPrefix: ['-threads', '0'],
    middleArgs: ['-map', '0:v:0', '-an', '-c:v', 'libx264'],
    audioInputs: [],
    ...overrides,
  };
}

describe('validateStreamMetadata', () => {
  it('accepts well-formed metadata', () => {
    expect(() => validateStreamMetadata(buildValidMetadata())).not.toThrow();
  });

  it('rejects a missing payload', () => {
    expect(() => validateStreamMetadata(undefined)).toThrow('missing');
  });

  for (const key of ['width', 'height', 'fps', 'frameCount']) {
    it(`rejects a non-positive "${key}"`, () => {
      expect(() => validateStreamMetadata(buildValidMetadata({ [key]: 0 }))).toThrow(key);
      expect(() => validateStreamMetadata(buildValidMetadata({ [key]: -1 }))).toThrow(key);
      expect(() => validateStreamMetadata(buildValidMetadata({ [key]: Number.NaN }))).toThrow(key);
    });
  }

  it('rejects a pixFmt other than rgba', () => {
    expect(() => validateStreamMetadata(buildValidMetadata({ pixFmt: 'yuv420p' }))).toThrow('rgba');
  });

  it('rejects a missing outputName', () => {
    expect(() => validateStreamMetadata(buildValidMetadata({ outputName: '' }))).toThrow('outputName');
  });

  it('rejects missing ffmpeg argument arrays', () => {
    expect(() => validateStreamMetadata(buildValidMetadata({ commandPrefix: undefined }))).toThrow();
    expect(() => validateStreamMetadata(buildValidMetadata({ middleArgs: undefined }))).toThrow();
  });

  it('rejects a missing audioInputs array', () => {
    expect(() => validateStreamMetadata(buildValidMetadata({ audioInputs: undefined }))).toThrow('audioInputs');
  });
});

describe('expectedFrameStreamBytes', () => {
  it('computes width * height * 4 bytes/px * frameCount', () => {
    expect(expectedFrameStreamBytes({ width: 10, height: 20, frameCount: 3 })).toBe(10 * 20 * 4 * 3);
  });
});

describe('buildStreamFfmpegArgs', () => {
  it('assembles the rawvideo input before audio inputs and the client-provided middle args', () => {
    const metadata = buildValidMetadata({
      commandPrefix: ['-vaapi_device', '/dev/dri/renderD128'],
      middleArgs: ['-map', '0:v:0', '-map', '[aout]', '-c:v', 'h264_vaapi'],
    });

    const args = buildStreamFfmpegArgs(metadata, ['audio-1.mp3', 'audio-2.mp3']);

    expect(args).toEqual([
      '-vaapi_device', '/dev/dri/renderD128',
      '-f', 'rawvideo',
      '-pix_fmt', 'rgba',
      '-s', '1920x1080',
      '-r', '30',
      '-i', 'pipe:0',
      '-i', 'audio-1.mp3',
      '-i', 'audio-2.mp3',
      '-map', '0:v:0', '-map', '[aout]', '-c:v', 'h264_vaapi',
      'sequence-output.mp4',
    ]);
  });

  it('omits audio -i args entirely when there are no audio inputs', () => {
    const args = buildStreamFfmpegArgs(buildValidMetadata(), []);
    const inputFlagCount = args.filter((arg) => arg === '-i').length;
    expect(inputFlagCount).toBe(1);
    expect(args[args.indexOf('-i') + 1]).toBe('pipe:0');
  });
});

describe('sanitizeFileName', () => {
  it('strips directory components and unsafe characters', () => {
    expect(sanitizeFileName('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFileName('a b/c*d?.mp4')).toBe('c_d_.mp4');
  });

  it('rejects a name that sanitizes to empty', () => {
    expect(() => sanitizeFileName('///')).toThrow('Invalid');
  });
});

describe('createRenderStreamSessionId', () => {
  it('returns a non-empty string', () => {
    const id = createRenderStreamSessionId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('does not collide across repeated calls', () => {
    const ids = new Set(Array.from({ length: 200 }, () => createRenderStreamSessionId()));
    expect(ids.size).toBe(200);
  });
});

describe('findExpiredStreamSessions', () => {
  it('returns sessions older than the idle timeout', () => {
    const now = 1_000_000;
    const sessions = new Map([
      ['fresh', { createdAt: now - 1000 }],
      ['stale', { createdAt: now - STREAM_SESSION_IDLE_TIMEOUT_MS - 1 }],
    ]);

    expect(findExpiredStreamSessions(sessions, now)).toEqual(['stale']);
  });

  it('returns an empty array when nothing is expired', () => {
    const now = 1_000_000;
    const sessions = new Map([['fresh', { createdAt: now - 1000 }]]);
    expect(findExpiredStreamSessions(sessions, now)).toEqual([]);
  });

  it('honors a custom idle timeout', () => {
    const now = 1_000_000;
    const sessions = new Map([['borderline', { createdAt: now - 5000 }]]);
    expect(findExpiredStreamSessions(sessions, now, 4000)).toEqual(['borderline']);
    expect(findExpiredStreamSessions(sessions, now, 6000)).toEqual([]);
  });
});

/** Minimal fake ffmpeg-stdin-like destination: a plain EventEmitter with `write`, so tests can script
 *  backpressure and errors deterministically without depending on real stream timing. */
function createFakeStdin({ writeReturns = [] } = {}) {
  const destination = new EventEmitter();
  const writes = [];
  let writeCallIndex = 0;

  destination.write = vi.fn((chunk) => {
    writes.push(chunk);
    const scripted = writeReturns[writeCallIndex];
    writeCallIndex += 1;
    return scripted === undefined ? true : scripted;
  });
  destination.writes = writes;

  return destination;
}

describe('writeStreamChunkToFfmpegStdin', () => {
  it('resolves immediately when write() reports no backpressure', async () => {
    const stdin = createFakeStdin({ writeReturns: [true] });
    const chunk = Buffer.from([1, 2, 3]);

    await expect(writeStreamChunkToFfmpegStdin(stdin, chunk)).resolves.toBeUndefined();
    expect(stdin.writes).toEqual([chunk]);
  });

  it('waits for drain when write() reports backpressure', async () => {
    const stdin = createFakeStdin({ writeReturns: [false] });
    const chunk = Buffer.from([4, 5, 6]);

    let resolved = false;
    const pending = writeStreamChunkToFfmpegStdin(stdin, chunk).then(() => {
      resolved = true;
    });

    await new Promise((resolve) => setImmediate(resolve));
    expect(resolved).toBe(false);

    stdin.emit('drain');
    await pending;
    expect(resolved).toBe(true);
  });

  it('rejects if stdin errors while the write is pending', async () => {
    const stdin = createFakeStdin({ writeReturns: [false] });
    const pending = writeStreamChunkToFfmpegStdin(stdin, Buffer.from([7]));
    const boom = new Error('EPIPE');

    stdin.emit('error', boom);

    await expect(pending).rejects.toBe(boom);
  });

  it('does not leak the error listener across successive successful writes', async () => {
    const stdin = createFakeStdin({ writeReturns: [true, true, true] });

    await writeStreamChunkToFfmpegStdin(stdin, Buffer.from([1]));
    await writeStreamChunkToFfmpegStdin(stdin, Buffer.from([2]));
    await writeStreamChunkToFfmpegStdin(stdin, Buffer.from([3]));

    expect(stdin.listenerCount('error')).toBe(0);
  });
});

describe('StreamTruncatedError', () => {
  it('is a distinguishable Error subclass', () => {
    const error = new StreamTruncatedError('short upload');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('StreamTruncatedError');
    expect(error.message).toBe('short upload');
  });
});
